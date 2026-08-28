//! SIRIUS desktop shell.
//!
//! The window renders `apps/desktop`'s built frontend; this crate's only job
//! is to give it a real daemon to talk to. `sirius serve` is a Node process —
//! this app does not reimplement the engine, it launches the same one the
//! terminal uses and hands the frontend its address.
//!
//! Locating and killing that process is the whole surface area here. There is
//! no Tauri command exposed for scanning, fixing, or anything else the daemon
//! already does over HTTP — the frontend talks to `sirius serve` directly,
//! the same as it would talking to any other local server. Routing that
//! through Rust IPC as well would be a second copy of the wire contract with
//! nothing to keep it in sync with the first.

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Serialize, Deserialize)]
struct DaemonConfig {
    url: String,
    ws_url: String,
    token: String,
    root: String,
    version: String,
}

#[derive(Default)]
struct DaemonState(Mutex<Option<DaemonConfig>>);

/// Holds the child so it can be killed on exit. A `sirius serve` left running
/// after the window closes is exactly the kind of stray background process
/// that outlives the thing that started it and confuses the next `pnpm mock`
/// or `sirius serve` run with a port already in use.
struct DaemonProcess(Mutex<Option<Child>>);

/// Finds `packages/cli/dist/cli.js` in the sibling `clifintech` checkout.
///
/// `SIRIUS_CLI_PATH` overrides this outright, for anyone whose two repos
/// don't live side by side. Otherwise this resolves relative to
/// `CARGO_MANIFEST_DIR` — this crate's own directory at compile time — up to
/// `personal/`, then into `clifintech/packages/cli/dist/cli.js`. That layout
/// is specific to this machine's checkout, which is the correct scope: this
/// app is a hackathon submission built and demoed from one developer's two
/// local repos, not something installed on a machine that doesn't have both.
fn locate_cli_entry() -> PathBuf {
    if let Ok(path) = std::env::var("SIRIUS_CLI_PATH") {
        return PathBuf::from(path);
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    // src-tauri -> desktop -> apps -> finsec-gui -> personal
    manifest_dir
        .join("../../../../clifintech/packages/cli/dist/cli.js")
        .components()
        .collect::<PathBuf>()
}

/// The project directory `sirius serve` opens on launch.
///
/// `SIRIUS_PROJECT_ROOT` overrides it; absent that, the pinned demo fixture —
/// the same one `sirius scan`, `sirius brief`, and the terminal rehearsals
/// all use, so the desktop app's first launch shows the numbers already
/// verified elsewhere (`contract/fixtures/chaos-repo` is pinned at 6 findings
/// / ₹89,30,000 / 60/100) rather than an arbitrary or empty directory.
fn locate_project_root() -> PathBuf {
    if let Ok(path) = std::env::var("SIRIUS_PROJECT_ROOT") {
        return PathBuf::from(path);
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .join("../../../../clifintech/contract/fixtures/chaos-repo")
        .components()
        .collect::<PathBuf>()
}

/// Starts `sirius serve` and, once it prints its one line of JSON config,
/// stores it and tells the frontend.
///
/// Runs on a background thread: reading the child's stdout blocks until the
/// daemon has actually bound its port, and doing that on Tauri's setup thread
/// would hold up the window opening for however long that takes.
fn spawn_daemon(app: AppHandle) {
    std::thread::spawn(move || {
        let cli_entry = locate_cli_entry();
        let root = locate_project_root();

        if !cli_entry.exists() {
            eprintln!(
                "sirius-desktop: no CLI build at {} — run `npm run build` in packages/cli first, \
                 or set SIRIUS_CLI_PATH.",
                cli_entry.display()
            );
            return;
        }

        let mut child = match Command::new("node")
            .arg(&cli_entry)
            .arg("serve")
            .arg("--root")
            .arg(&root)
            .arg("--print-config")
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
        {
            Ok(child) => child,
            Err(err) => {
                eprintln!("sirius-desktop: failed to launch `node {}`: {err}", cli_entry.display());
                return;
            }
        };

        let stdout = match child.stdout.take() {
            Some(s) => s,
            None => {
                eprintln!("sirius-desktop: daemon process has no stdout pipe");
                return;
            }
        };

        // `--print-config` writes exactly one JSON line, then the daemon keeps
        // running and printing nothing further on stdout — so the first line
        // is the whole handshake, not the start of a stream to keep reading.
        let mut lines = BufReader::new(stdout).lines();
        let config_line = match lines.next() {
            Some(Ok(line)) => line,
            _ => {
                eprintln!("sirius-desktop: daemon exited before printing its config");
                return;
            }
        };

        let config: DaemonConfig = match serde_json::from_str(&config_line) {
            Ok(c) => c,
            Err(err) => {
                eprintln!("sirius-desktop: could not parse daemon config line: {err}\n  saw: {config_line}");
                return;
            }
        };

        if let Some(state) = app.try_state::<DaemonState>() {
            *state.0.lock().unwrap() = Some(config.clone());
        }
        if let Some(state) = app.try_state::<DaemonProcess>() {
            *state.0.lock().unwrap() = Some(child);
        }

        let _ = app.emit("daemon-ready", config);
    });
}

/// The frontend's fast path: if the daemon had already reported in by the
/// time this is called, this returns it with no event round-trip needed.
#[tauri::command]
fn get_daemon_config(state: State<DaemonState>) -> Option<DaemonConfig> {
    state.0.lock().unwrap().clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DaemonState::default())
        .manage(DaemonProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![get_daemon_config])
        .setup(|app| {
            spawn_daemon(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            // The daemon is scoped to this window's lifetime — closing SIRIUS
            // should not leave a `sirius serve` bound to a port for whoever
            // tries to start the next one.
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = window.try_state::<DaemonProcess>() {
                    if let Some(mut child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running sirius-desktop");
}
