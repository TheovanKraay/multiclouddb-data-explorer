// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

//! Manages the Java sidecar process that wraps the MultiCloudDB SDK.
//!
//! On startup we launch `java -jar <sidecar> --port 0`, read the
//! `SIDECAR_READY <port> <token>` handshake line from its stdout, and keep the
//! child handle alive for the lifetime of the app. The frontend never sees the
//! bearer token: it calls the `sidecar_request` Tauri command, and this module
//! attaches the token and forwards to the loopback HTTP bridge.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

/// Live sidecar coordinates, populated once the handshake line is read.
#[derive(Default)]
pub struct SidecarState {
    inner: Mutex<Option<SidecarHandle>>,
    /// Last startup error, if the sidecar failed to launch. Surfaced to the UI.
    error: Mutex<Option<String>>,
}

struct SidecarHandle {
    port: u16,
    token: String,
    #[allow(dead_code)]
    child: Child,
    http: reqwest::Client,
}

#[derive(Serialize)]
pub struct SidecarInfo {
    port: u16,
    ready: bool,
    /// Populated when the sidecar failed to start, so the UI can explain why.
    error: Option<String>,
}

#[derive(Deserialize)]
pub struct SidecarRequest {
    /// Path on the bridge, e.g. "/connect", "/query".
    path: String,
    /// JSON body forwarded verbatim.
    body: serde_json::Value,
}

/// Resolve the Java executable to run the sidecar with. Preference order:
///  1. `MULTICLOUDDB_JAVA` env override.
///  2. A JRE bundled next to the app resources (`<resources>/runtime/bin/java`).
///     This removes the need for the user to have Java installed and avoids the
///     GUI-app PATH problem (launchers often don't inherit the shell PATH).
///  3. Bare `java` on PATH as a last resort.
fn locate_java(app: &tauri::AppHandle) -> String {
    if let Ok(java) = std::env::var("MULTICLOUDDB_JAVA") {
        return java;
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        let exe = if cfg!(windows) { "java.exe" } else { "java" };
        let bundled = resource_dir.join("runtime").join("bin").join(exe);
        if bundled.exists() {
            return bundled.to_string_lossy().into_owned();
        }
    }
    "java".to_string()
}

/// Locate the bundled sidecar jar. In dev we resolve it relative to the repo;
/// in a packaged app it ships as a resource under the app's resource dir.
fn locate_sidecar(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // 1. Packaged resource: <resources>/sidecar/multiclouddb-explorer-sidecar.jar
    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidate = resource_dir
            .join("sidecar")
            .join("multiclouddb-explorer-sidecar.jar");
        if candidate.exists() {
            return Ok(candidate);
        }
    }
    // 2. Dev fallback: ../../sidecar/target/multiclouddb-explorer-sidecar.jar
    //    relative to the src-tauri crate dir.
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("sidecar")
        .join("target")
        .join("multiclouddb-explorer-sidecar.jar");
    if dev.exists() {
        return Ok(dev);
    }
    Err(format!(
        "Could not locate sidecar jar (looked in resources and {})",
        dev.display()
    ))
}

/// Spawn the Java sidecar and block until the handshake line arrives.
pub fn spawn_sidecar(app: &tauri::AppHandle, state: &SidecarState) -> Result<(), String> {
    let jar = locate_sidecar(app)?;
    let java = locate_java(app);

    let mut child = Command::new(&java)
        .arg("-jar")
        .arg(&jar)
        .arg("--port")
        .arg("0")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                format!(
                    "Java runtime not found (tried '{java}'). Install Java 17+ \
                     (https://adoptium.net/) or reinstall the app with the bundled runtime."
                )
            } else {
                format!("Failed to launch Java sidecar ({java}): {e}")
            }
        })?;

    // Drain stderr on a background thread so we can report the crash reason if
    // the process dies before the handshake (e.g. a missing JRE module).
    let stderr = child.stderr.take();
    let stderr_buf = std::sync::Arc::new(Mutex::new(String::new()));
    if let Some(err) = stderr {
        let buf = stderr_buf.clone();
        std::thread::spawn(move || {
            let mut reader = BufReader::new(err);
            let mut line = String::new();
            while reader.read_line(&mut line).unwrap_or(0) > 0 {
                let mut g = buf.lock().unwrap();
                if g.len() < 4000 {
                    g.push_str(&line);
                }
                line.clear();
            }
        });
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "sidecar produced no stdout".to_string())?;

    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    // Read lines until we see the handshake (bounded to avoid hanging forever).
    for _ in 0..50 {
        line.clear();
        let n = reader
            .read_line(&mut line)
            .map_err(|e| format!("reading sidecar stdout: {e}"))?;
        if n == 0 {
            // Give the stderr drainer a moment, then surface what it captured.
            std::thread::sleep(std::time::Duration::from_millis(200));
            let captured = stderr_buf.lock().unwrap().trim().to_string();
            let detail = captured
                .lines()
                .rev()
                .take(6)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("\n");
            return Err(if detail.is_empty() {
                "sidecar exited before handshake (no output captured)".to_string()
            } else {
                format!("sidecar exited before handshake:\n{detail}")
            });
        }
        if let Some(rest) = line.trim().strip_prefix("SIDECAR_READY ") {
            let mut parts = rest.split_whitespace();
            let port: u16 = parts
                .next()
                .and_then(|p| p.parse().ok())
                .ok_or_else(|| "bad port in handshake".to_string())?;
            let token = parts
                .next()
                .ok_or_else(|| "missing token in handshake".to_string())?
                .to_string();

            *state.inner.lock().unwrap() = Some(SidecarHandle {
                port,
                token,
                child,
                http: reqwest::Client::new(),
            });
            return Ok(());
        }
    }
    Err("did not observe SIDECAR_READY handshake".to_string())
}

/// Spawn the sidecar and record any failure into shared state for the UI.
pub fn spawn_and_record(app: &tauri::AppHandle, state: &SidecarState) {
    match spawn_sidecar(app, state) {
        Ok(()) => {
            *state.error.lock().unwrap() = None;
        }
        Err(e) => {
            eprintln!("sidecar startup failed: {e}");
            *state.error.lock().unwrap() = Some(e);
        }
    }
}

#[tauri::command]
pub fn sidecar_info(state: State<'_, SidecarState>) -> SidecarInfo {
    match &*state.inner.lock().unwrap() {
        Some(h) => SidecarInfo {
            port: h.port,
            ready: true,
            error: None,
        },
        None => SidecarInfo {
            port: 0,
            ready: false,
            error: state.error.lock().unwrap().clone(),
        },
    }
}

/// Proxy a JSON request to the sidecar, attaching the bearer token server-side.
#[tauri::command]
pub async fn sidecar_request(
    state: State<'_, SidecarState>,
    req: SidecarRequest,
) -> Result<serde_json::Value, String> {
    let (port, token, http) = {
        let guard = state.inner.lock().unwrap();
        let h = guard
            .as_ref()
            .ok_or_else(|| "sidecar not ready".to_string())?;
        (h.port, h.token.clone(), h.http.clone())
    };

    let url = format!("http://127.0.0.1:{port}{}", req.path);
    let resp = http
        .post(&url)
        .bearer_auth(token)
        .json(&req.body)
        .send()
        .await
        .map_err(|e| format!("sidecar request failed: {e}"))?;

    let status = resp.status();
    let value: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("invalid JSON from sidecar: {e}"))?;

    if status.is_success() {
        Ok(value)
    } else {
        // Surface the structured error body to the UI with the status code.
        Err(serde_json::to_string(&serde_json::json!({
            "status": status.as_u16(),
            "error": value,
        }))
        .unwrap_or_else(|_| format!("sidecar error {status}")))
    }
}
