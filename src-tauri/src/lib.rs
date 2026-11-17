use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Stdio;

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

// The whiteboard spawns `claude` by name so the shell plugin's scoped
// commands stay fixed, but the first `claude` on PATH is not always one
// that starts: an npm install can be missing its native binary while a
// working copy sits in the VS Code extension, or in ~/.local/bin from the
// native installer. Whichever copy actually starts goes first on PATH.
const CLAUDE_BINARY_NAME: &str = if cfg!(windows) { "claude.exe" } else { "claude" };
const VERSION_FLAG: &str = "--version";
const NATIVE_INSTALL_DIRECTORIES: [&str; 2] = [".local/bin", ".claude/local"];
// Where editors unpack the Claude Code extension: one folder per build,
// named like anthropic.claude-code-2.1.305-darwin-arm64.
const EXTENSION_DIRECTORIES: [&str; 4] = [".vscode/extensions", ".vscode-insiders/extensions", ".cursor/extensions", ".windsurf/extensions"];
const EXTENSION_FOLDER_PREFIX: &str = "anthropic.claude-code-";
const EXTENSION_BINARY_DIRECTORY: &str = "resources/native-binary";

fn home_directory() -> Option<PathBuf> {
  std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from)
}

fn claude_starts(program: &OsStr) -> bool {
  std::process::Command::new(program)
    .arg(VERSION_FLAG)
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .status()
    .map(|status| status.success())
    .unwrap_or(false)
}

fn extension_build_number(folder_name: &str) -> Vec<u32> {
  folder_name
    .strip_prefix(EXTENSION_FOLDER_PREFIX)
    .and_then(|rest| rest.split('-').next())
    .unwrap_or_default()
    .split('.')
    .filter_map(|part| part.parse().ok())
    .collect()
}

// Every extension build's binary, newest build first.
fn extension_claude_binaries(home: &Path) -> Vec<PathBuf> {
  let mut builds: Vec<(Vec<u32>, PathBuf)> = EXTENSION_DIRECTORIES
    .iter()
    .filter_map(|directory| std::fs::read_dir(home.join(directory)).ok())
    .flatten()
    .filter_map(Result::ok)
    .filter_map(|entry| {
      let folder_name = entry.file_name().to_string_lossy().into_owned();
      folder_name
        .starts_with(EXTENSION_FOLDER_PREFIX)
        .then(|| (extension_build_number(&folder_name), entry.path()))
    })
    .collect();
  builds.sort_by(|first, second| second.0.cmp(&first.0));
  builds
    .into_iter()
    .map(|(_, folder)| folder.join(EXTENSION_BINARY_DIRECTORY).join(CLAUDE_BINARY_NAME))
    .collect()
}

fn candidate_claude_binaries() -> Vec<PathBuf> {
  let Some(home) = home_directory() else {
    return Vec::new();
  };
  NATIVE_INSTALL_DIRECTORIES
    .iter()
    .map(|directory| home.join(directory).join(CLAUDE_BINARY_NAME))
    .chain(extension_claude_binaries(&home))
    .filter(|path| path.is_file())
    .collect()
}

fn put_working_claude_on_path() {
  if claude_starts(OsStr::new(CLAUDE_BINARY_NAME)) {
    return;
  }
  let Some(binary) = candidate_claude_binaries().into_iter().find(|path| claude_starts(path.as_os_str())) else {
    return;
  };
  let Some(directory) = binary.parent() else {
    return;
  };
  let mut paths = vec![directory.to_path_buf()];
  paths.extend(std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()));
  if let Ok(joined) = std::env::join_paths(paths) {
    std::env::set_var("PATH", joined);
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[cfg(unix)]
  inherit_login_shell_path();
  put_working_claude_on_path();

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
