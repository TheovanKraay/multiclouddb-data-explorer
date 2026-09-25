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
            // starts making calls. Any failure is recorded into shared state and
            // surfaced to the UI (rather than crashing or failing silently).
            let handle = app.handle().clone();
            let state = app.state::<SidecarState>();
            sidecar::spawn_and_record(&handle, &state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sidecar::sidecar_info,
            sidecar::sidecar_request
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
