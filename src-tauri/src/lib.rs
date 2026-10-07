// Keeps the WebView2 window's native theme in sync with the app's own
// data-theme toggle. Without this, the webview's native theme stays
// whatever tauri.conf.json set it to (or the OS default) even after the
// user switches the app's own light/dark toggle, and a mismatch between
// the OS/webview theme and the page's CSS theme is what was causing typed
// text to render inverted — CSS `color-scheme` alone doesn't cover it,
// since WebView2 applies its own native-control theming independently.
#[tauri::command]
fn set_window_theme(window: tauri::WebviewWindow, theme: String) -> Result<(), String> {
  let parsed = match theme.as_str() {
    "light" => Some(tauri::Theme::Light),
    "dark" => Some(tauri::Theme::Dark),
    _ => None,
  };
  window.set_theme(parsed).map_err(|e| e.to_string())
}

// Apps launched from Finder or the Dock inherit launchd's bare PATH
// (/usr/bin:/bin:/usr/sbin:/sbin), so spawning `claude` fails with
// "No such file or directory" even though it works from a terminal. Ask the
// user's login shell for its PATH instead, the way terminals see it. The
// markers fence off anything the shell's rc files print.
#[cfg(unix)]
fn inherit_login_shell_path() {
  const START: &str = "__GUMPTION_PATH_START__";
  const END: &str = "__GUMPTION_PATH_END__";
  let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
  let Ok(output) = std::process::Command::new(shell)
    .args(["-ilc", &format!("printf '{START}%s{END}' \"$PATH\"")])
    .stdin(std::process::Stdio::null())
    .output()
  else {
    return;
  };
  let stdout = String::from_utf8_lossy(&output.stdout);
  let path = stdout
    .split_once(START)
    .and_then(|(_, rest)| rest.split_once(END))
    .map(|(path, _)| path);
  if let Some(path) = path.filter(|path| !path.is_empty()) {
    std::env::set_var("PATH", path);
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[cfg(unix)]
  inherit_login_shell_path();

  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![set_window_theme])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
