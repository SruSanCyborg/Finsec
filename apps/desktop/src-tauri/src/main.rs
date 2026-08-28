// Prevents an extra terminal window from opening on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sirius_desktop_lib::run();
}
