use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{Emitter, Manager, State};

fn unix_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Default)]
struct CaptureState {
    active: AtomicBool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScreenContextImage {
    bytes: Vec<u8>,
    content_type: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioCapabilities {
    system_audio: bool,
    microphone: bool,
    backend: &'static str,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)] // unknown/checking/starting are shared with the frontend state machine.
pub(crate) enum SystemAudioState {
    Unknown,
    Checking,
    PermissionRequired,
    RestartRequired,
    Authorized,
    Starting,
    Running,
    CaptureFailed,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SystemAudioDiagnostics {
    pub bundle_identifier: String,
    pub app_version: String,
    pub executable_path: String,
    pub macos_version: String,
    pub preflight_granted: bool,
    pub request_initiated: bool,
    pub signing_identity: String,
    pub team_identifier: Option<String>,
    pub cd_hash: Option<String>,
    pub designated_requirement: Option<String>,
    pub signing_stable: bool,
    pub last_stage: String,
    pub log_path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SystemAudioStatus {
    pub state: SystemAudioState,
    pub permission_granted: bool,
    pub capture_active: bool,
    pub reason: String,
    pub diagnostics: Option<SystemAudioDiagnostics>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SystemAudioFailure {
    pub state: SystemAudioState,
    pub category: String,
    pub message: String,
    pub stage: String,
    pub domain: Option<String>,
    pub code: Option<i64>,
}

impl SystemAudioFailure {
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    fn unsupported(message: impl Into<String>) -> Self {
        Self {
            state: SystemAudioState::CaptureFailed,
            category: "unsupported".into(),
            message: message.into(),
            stage: "capability-check".into(),
            domain: None,
            code: None,
        }
    }

    fn capture(message: impl Into<String>, stage: impl Into<String>) -> Self {
        Self {
            state: SystemAudioState::CaptureFailed,
            category: "capture".into(),
            message: message.into(),
            stage: stage.into(),
            domain: None,
            code: None,
        }
    }
}

#[tauri::command]
fn audio_capabilities() -> AudioCapabilities {
    #[cfg(target_os = "macos")]
    return AudioCapabilities {
        system_audio: true,
        microphone: true,
        backend: "ScreenCaptureKit",
    };
    #[cfg(target_os = "windows")]
    return AudioCapabilities {
        system_audio: true,
        microphone: true,
        backend: "WASAPI loopback",
    };
    #[allow(unreachable_code)]
    AudioCapabilities {
        system_audio: false,
        microphone: true,
        backend: "microphone",
    }
}

#[tauri::command]
fn system_audio_status(
    app: tauri::AppHandle,
    state: State<'_, Arc<CaptureState>>,
) -> SystemAudioStatus {
    native_audio::status(app, state.active.load(Ordering::SeqCst))
}

#[tauri::command]
fn request_system_audio_permission(app: tauri::AppHandle) -> SystemAudioStatus {
    native_audio::request_permission(app)
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn repair_system_audio_permission(app: tauri::AppHandle) -> Result<SystemAudioStatus, String> {
    macos::repair_permission(&app)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn repair_system_audio_permission(app: tauri::AppHandle) -> Result<SystemAudioStatus, String> {
    Ok(native_audio::request_permission(app))
}

#[tauri::command]
async fn start_microphone_capture(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { tauri::async_runtime::spawn_blocking(move || microphone::start(app)).await.map_err(|error| error.to_string())? }
    #[cfg(not(target_os = "macos"))]
    { let _ = app; Err("Native microphone capture is currently macOS-only.".into()) }
}

#[tauri::command]
fn stop_microphone_capture() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { microphone::stop() }
    #[cfg(not(target_os = "macos"))]
    { Ok(()) }
}

#[tauri::command]
async fn start_audio_capture(
    app: tauri::AppHandle,
    state: State<'_, Arc<CaptureState>>,
    include_system_audio: bool,
) -> Result<SystemAudioStatus, SystemAudioFailure> {
    if state.active.swap(true, Ordering::SeqCst) {
        return Ok(native_audio::status(app, true));
    }
    let status = match native_audio::start(app.clone(), include_system_audio) {
        Ok(status) => status,
        Err(error) => { state.active.store(false, Ordering::SeqCst); return Err(error); }
    };
    state.active.store(true, Ordering::SeqCst);
    app.emit(
        "capture-state",
        serde_json::json!({
            "active": true,
            "systemAudio": include_system_audio,
            "rawAudioRetained": false
        }),
    )
    .map_err(|error| SystemAudioFailure::capture(error.to_string(), "ui-event"))?;
    Ok(status)
}

#[tauri::command]
fn stop_audio_capture(
    app: tauri::AppHandle,
    state: State<'_, Arc<CaptureState>>,
) -> Result<(), String> {
    native_audio::stop()?;
    state.active.store(false, Ordering::SeqCst);
    app.emit("capture-state", serde_json::json!({ "active": false }))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn configure_share_safe_overlay(window: tauri::Window, enabled: bool) -> Result<(), String> {
    // Supported operating systems exclude protected windows from common capture
    // paths. This is best-effort and never presented as an anti-detection feature.
    window
        .set_content_protected(enabled)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_privacy_settings(permission: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let pane = match permission.as_str() {
            "microphone" => "Privacy_Microphone",
            "screen" => "Privacy_ScreenCapture",
            _ => return Err("Unsupported permission settings page.".into()),
        };
        let status = std::process::Command::new("/usr/bin/open")
            .arg(format!("x-apple.systempreferences:com.apple.preference.security?{pane}"))
            .status().map_err(|error| error.to_string())?;
        if !status.success() { return Err("Could not open macOS Privacy settings.".into()); }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = permission; Err("Open your operating system's Privacy settings.".into()) }
}

#[tauri::command]
fn configure_focus_mode(
    window: tauri::Window,
    enabled: bool,
    click_through: bool,
) -> Result<(), String> {
    window.set_decorations(!enabled).map_err(|error| error.to_string())?;
    #[cfg(target_os = "macos")]
    window.set_effects(if enabled { Some(tauri::window::EffectsBuilder::new()
        .effect(tauri::window::Effect::Popover).state(tauri::window::EffectState::Active)
        .radius(14.0).build()) } else { None }).map_err(|error| error.to_string())?;
    window.set_visible_on_all_workspaces(enabled).map_err(|error| error.to_string())?;
    window
        .set_always_on_top(enabled)
        .map_err(|error| error.to_string())?;
    window
        .set_ignore_cursor_events(enabled && click_through)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn capture_primary_screen(
    window: tauri::Window,
    restore_protected: bool,
) -> Result<ScreenContextImage, String> {
    #[cfg(target_os = "macos")]
    {
        let _ = restore_protected; // No privacy toggling or files during capture.
        let app = window.app_handle().clone();
        return tauri::async_runtime::spawn_blocking(move || macos::capture_screen(&app, None)).await.map_err(|error| error.to_string())?;

    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, restore_protected);
        Err("One-click screen context is not available on this platform yet.".into())
    }
}

#[tauri::command]
fn quit_desktop(app: tauri::AppHandle, state: State<'_, Arc<CaptureState>>) {
    state.active.store(false, Ordering::SeqCst);
    // Do not make the webview wait for AudioContext or WebRTC teardown before
    // honoring an explicit Quit. Stop the helper on a native thread, request a
    // normal Tauri exit, then enforce termination if the event loop stalls.
    std::thread::spawn(move || {
        let _ = native_audio::stop();
        app.exit(0);
        std::thread::sleep(std::time::Duration::from_millis(750));
        std::process::exit(0);
    });
}

#[tauri::command]
fn relaunch_desktop(app: tauri::AppHandle, state: State<'_, Arc<CaptureState>>) {
    state.active.store(false, Ordering::SeqCst);
    // A permission change must be observed by a new process. Keep this
    // separate from Quit so the existing explicit Quit behavior is unchanged.
    let _ = native_audio::stop();
    app.restart();
}

mod native_audio {
    #[cfg(target_os = "macos")]
    mod platform {
        use crate::{SystemAudioFailure, SystemAudioStatus};

        pub fn status(app: tauri::AppHandle, active: bool) -> SystemAudioStatus {
            super::super::macos::status(&app, active)
        }
        pub fn request_permission(app: tauri::AppHandle) -> SystemAudioStatus {
            super::super::macos::request_permission(&app)
        }
        pub fn start(
            app: tauri::AppHandle,
            include_system_audio: bool,
        ) -> Result<SystemAudioStatus, SystemAudioFailure> {
            super::super::macos::start(app, include_system_audio)
        }
        pub fn stop() -> Result<(), String> {
            super::super::microphone::stop()?;
            super::super::macos::stop()
        }
    }
    #[cfg(target_os = "windows")]
    mod platform {
        use crate::{SystemAudioFailure, SystemAudioState, SystemAudioStatus};

        pub fn status(_app: tauri::AppHandle, active: bool) -> SystemAudioStatus {
            SystemAudioStatus {
                state: if active {
                    SystemAudioState::Running
                } else {
                    SystemAudioState::Authorized
                },
                permission_granted: true,
                capture_active: active,
                reason: if active {
                    "WASAPI loopback is running."
                } else {
                    "WASAPI loopback is ready."
                }
                .into(),
                diagnostics: None,
            }
        }
        pub fn request_permission(app: tauri::AppHandle) -> SystemAudioStatus {
            status(app, false)
        }
        pub fn start(
            app: tauri::AppHandle,
            include_system_audio: bool,
        ) -> Result<SystemAudioStatus, SystemAudioFailure> {
            super::super::windows::start(include_system_audio)
                .map_err(|error| SystemAudioFailure::capture(error, "wasapi-start"))?;
            Ok(status(app, true))
        }
        pub fn stop() -> Result<(), String> {
            super::super::windows::stop()
        }
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    mod platform {
        use crate::{SystemAudioFailure, SystemAudioState, SystemAudioStatus};

        pub fn status(_app: tauri::AppHandle, _active: bool) -> SystemAudioStatus {
            SystemAudioStatus {
                state: SystemAudioState::CaptureFailed,
                permission_granted: false,
                capture_active: false,
                reason: "System audio capture is supported only on macOS and Windows.".into(),
                diagnostics: None,
            }
        }
        pub fn request_permission(app: tauri::AppHandle) -> SystemAudioStatus {
            status(app, false)
        }
        pub fn start(
            _app: tauri::AppHandle,
            include_system_audio: bool,
        ) -> Result<SystemAudioStatus, SystemAudioFailure> {
            if include_system_audio {
                Err(SystemAudioFailure::unsupported(
                    "System audio capture is supported only on macOS and Windows.",
                ))
            } else {
                Ok(SystemAudioStatus {
                    state: SystemAudioState::Running,
                    permission_granted: true,
                    capture_active: true,
                    reason: "Microphone-only capture is running.".into(),
                    diagnostics: None,
                })
            }
        }
        pub fn stop() -> Result<(), String> {
            Ok(())
        }
    }
    pub use platform::{request_permission, start, status, stop};
}

mod desktop_api;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
mod microphone;
#[cfg(target_os = "windows")]
mod windows;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(Arc::new(CaptureState::default()))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show(); let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let show = tauri::menu::MenuItem::with_id(app, "show", "Show Torvi", true, None::<&str>)?;
            let quit = tauri::menu::MenuItem::with_id(app, "quit", "Quit Torvi", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&show, &quit])?;
            tauri::tray::TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Torvi 0.7.0")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "quit" { let _ = native_audio::stop(); app.exit(0); }
                    if event.id.as_ref() == "show" {
                        if let Some(window) = app.get_webview_window("main") { let _ = window.show(); let _ = window.set_focus(); }
                    }
                }).build(app)?;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_content_protected(false);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            audio_capabilities,
            system_audio_status,
            request_system_audio_permission,
            repair_system_audio_permission,
            start_audio_capture,
            stop_audio_capture,
            start_microphone_capture,
            stop_microphone_capture,
            configure_share_safe_overlay,
            open_privacy_settings,
            configure_focus_mode,
            capture_primary_screen,
            quit_desktop,
            relaunch_desktop,
            desktop_api::begin_desktop_authorization,
            desktop_api::poll_desktop_authorization,
            desktop_api::desktop_account_status,
            desktop_api::desktop_api_request,
            desktop_api::desktop_upload_document,
            desktop_api::desktop_start_session,
            desktop_api::connect_desktop,
            desktop_api::restore_desktop_connection,
            desktop_api::desktop_session_context,
            desktop_api::desktop_realtime,
            desktop_api::desktop_suggest,
            desktop_api::cancel_desktop_suggestion,
            desktop_api::desktop_screen_context,
            desktop_api::desktop_finish,
            desktop_api::disconnect_desktop
        ])
        .build(tauri::generate_context!())
        .expect("error while building Torvi");
    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen {
            has_visible_windows,
            ..
        } = &event
        {
            if !*has_visible_windows {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        }
        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        ) {
            let _ = native_audio::stop();
        }
    });
}
