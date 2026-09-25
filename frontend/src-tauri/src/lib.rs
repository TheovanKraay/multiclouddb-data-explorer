// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

mod sidecar;

use sidecar::SidecarState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SidecarState::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // Launch the Java sidecar and wait for its handshake before the UI
            // starts making calls. A failure here is fatal — surface it clearly.
            let handle = app.handle().clone();
            let state = app.state::<SidecarState>();
            if let Err(e) = sidecar::spawn_sidecar(&handle, &state) {
                log::error!("sidecar startup failed: {e}");
                eprintln!("FATAL: sidecar startup failed: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sidecar::sidecar_info,
            sidecar::sidecar_request
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
