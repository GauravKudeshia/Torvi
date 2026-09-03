use crate::{SystemAudioDiagnostics, SystemAudioFailure, SystemAudioState, SystemAudioStatus};
use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager};

static CAPTURE: Mutex<Option<Child>> = Mutex::new(None);
static LAST_STAGE: Mutex<String> = Mutex::new(String::new());
static LAST_FAILURE: Mutex<Option<SystemAudioFailure>> = Mutex::new(None);
static REQUEST_INITIATED: AtomicBool = AtomicBool::new(false);
static RESTART_REQUIRED: AtomicBool = AtomicBool::new(false);

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

fn preflight_granted() -> bool {
    // This check never opens a macOS prompt. Permission requests are only made
    // by request_permission after the user presses the visible Grant button.
    unsafe { CGPreflightScreenCaptureAccess() }
}

fn command_output(program: &str, arguments: &[&str]) -> String {
    Command::new(program)
        .args(arguments)
        .output()
        .map(|output| {
            let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
            combined.push_str(&String::from_utf8_lossy(&output.stderr));
            combined.trim().to_string()
        })
        .unwrap_or_default()
}

fn line_value(output: &str, prefix: &str) -> Option<String> {
    output
        .lines()
        .map(str::trim)
        .find_map(|line| line.strip_prefix(prefix).map(str::to_string))
        .filter(|value| !value.is_empty() && value != "not set")
}

fn diagnostic_log_path(app: &tauri::AppHandle) -> String {
    app.path()
        .app_log_dir()
        .map(|directory| directory.join("system-audio-diagnostics.log"))
        .unwrap_or_else(|_| std::env::temp_dir().join("interview-copilot-system-audio.log"))
        .to_string_lossy()
        .into_owned()
}

fn set_stage(stage: &str) {
    if let Ok(mut current) = LAST_STAGE.lock() {
        *current = stage.to_string();
    }
}

fn log_event(app: &tauri::AppHandle, event: &str, details: Value) {
    let path = diagnostic_log_path(app);
    let Some(parent) = std::path::Path::new(&path).parent() else {
        return;
    };
    if fs::create_dir_all(parent).is_err() {
        return;
    }
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };
    let record = json!({
        "atMs": crate::unix_time_ms(),
        "event": event,
        "details": details,
    });
    let _ = writeln!(file, "{record}");
}

fn diagnostics(app: &tauri::AppHandle, granted: bool) -> SystemAudioDiagnostics {
    let executable = std::env::current_exe().unwrap_or_default();
    let executable_path = executable.to_string_lossy().into_owned();
    let signature = if executable_path.is_empty() {
        String::new()
    } else {
        command_output("/usr/bin/codesign", &["-dvvv", &executable_path])
    };
    let requirement_output = if executable_path.is_empty() {
        String::new()
    } else {
        command_output("/usr/bin/codesign", &["-dr", "-", &executable_path])
    };
    let designated_requirement = requirement_output
        .lines()
        .map(str::trim)
        .find(|line| line.starts_with("designated =>"))
        .map(str::to_string);
    let signing_identity = line_value(&signature, "Authority=")
        .or_else(|| line_value(&signature, "Signature="))
        .unwrap_or_else(|| "unsigned or unavailable".into());
    let signing_stable = designated_requirement
        .as_deref()
        .map(|requirement| !requirement.contains("cdhash"))
        .unwrap_or(false)
        && signing_identity != "adhoc";
    let product_version = command_output("/usr/bin/sw_vers", &["-productVersion"]);
    let build_version = command_output("/usr/bin/sw_vers", &["-buildVersion"]);
    let macos_version = match (product_version.is_empty(), build_version.is_empty()) {
        (false, false) => format!("{product_version} ({build_version})"),
        (false, true) => product_version,
        _ => "unknown".into(),
    };

    SystemAudioDiagnostics {
        bundle_identifier: app.config().identifier.clone(),
        app_version: app.package_info().version.to_string(),
        executable_path,
        macos_version,
        preflight_granted: granted,
        request_initiated: REQUEST_INITIATED.load(Ordering::SeqCst),
        signing_identity,
        team_identifier: line_value(&signature, "TeamIdentifier="),
        cd_hash: line_value(&signature, "CDHash="),
        designated_requirement,
        signing_stable,
        last_stage: LAST_STAGE
            .lock()
            .map(|stage| stage.clone())
            .unwrap_or_default(),
        log_path: diagnostic_log_path(app),
    }
}

pub fn status(app: &tauri::AppHandle, active: bool) -> SystemAudioStatus {
    let granted = preflight_granted();
    let has_capture_failure = LAST_FAILURE
        .lock()
        .ok()
        .and_then(|failure| failure.clone())
        .is_some();
    let state = if active {
        SystemAudioState::Running
    } else if RESTART_REQUIRED.load(Ordering::SeqCst) {
        SystemAudioState::RestartRequired
    } else if !granted {
        SystemAudioState::PermissionRequired
    } else if has_capture_failure {
        SystemAudioState::CaptureFailed
    } else {
        SystemAudioState::Authorized
    };
    let diagnostic = diagnostics(app, granted);
    let installed_in_applications = diagnostic.executable_path.starts_with("/Applications/");
    let reason = match state {
        SystemAudioState::Running => "ScreenCaptureKit system audio is running.",
        SystemAudioState::RestartRequired if !diagnostic.signing_stable => "The permission request is complete. Quit this exact Torvi copy and reopen it once. Keep the app in /Applications and do not rename or replace it while testing this development build.",
        SystemAudioState::RestartRequired => "The permission request is complete. Restart Torvi once so macOS can verify Screen & System Audio Recording access.",
        SystemAudioState::Authorized if !diagnostic.signing_stable => "Access is currently granted, but this ad-hoc build has a build-specific identity. Install a stably signed build before testing permission persistence across updates.",
        SystemAudioState::Authorized => "Screen & System Audio Recording access is ready.",
        SystemAudioState::CaptureFailed => "Permission was checked, but ScreenCaptureKit failed at a later capture stage. See the local diagnostic log.",
        SystemAudioState::PermissionRequired if !diagnostic.signing_stable && !installed_in_applications => "Move this exact Torvi.app into /Applications before granting access. macOS cannot reliably preserve Screen Recording permission for an ad-hoc build launched from a project or Downloads folder.",
        SystemAudioState::PermissionRequired if !diagnostic.signing_stable => "Grant Screen & System Audio Recording access to this exact Torvi copy. Do not replace the app between granting access and reopening it.",
        _ => "Grant Screen & System Audio Recording access, then quit and reopen Torvi.",
    }.to_string();
    log_event(
        app,
        "permission-status",
        json!({
            "state": state,
            "preflightGranted": granted,
            "requestInitiated": diagnostic.request_initiated,
            "bundleIdentifier": diagnostic.bundle_identifier,
            "appVersion": diagnostic.app_version,
            "executablePath": diagnostic.executable_path,
            "macOSVersion": diagnostic.macos_version,
            "signingIdentity": diagnostic.signing_identity,
            "teamIdentifier": diagnostic.team_identifier,
            "cdHash": diagnostic.cd_hash,
            "designatedRequirement": diagnostic.designated_requirement,
            "signingStable": diagnostic.signing_stable,
            "lastStage": diagnostic.last_stage,
        }),
    );
    SystemAudioStatus {
        state,
        permission_granted: granted,
        capture_active: active,
        reason,
        diagnostics: Some(diagnostic),
    }
}

pub fn request_permission(app: &tauri::AppHandle) -> SystemAudioStatus {
    if preflight_granted() {
        set_stage("permission-already-authorized");
        log_event(
            app,
            "permission-request-skipped",
            json!({ "reason": "already-authorized" }),
        );
        return status(app, false);
    }
    REQUEST_INITIATED.store(true, Ordering::SeqCst);
    set_stage("permission-requested");
    log_event(
        app,
        "permission-request-started",
        json!({ "initiatedBy": "explicit-user-action" }),
    );
    let granted = unsafe { CGRequestScreenCaptureAccess() };
    // CGRequestScreenCaptureAccess can remain false in the process that was
    // already running when the user enabled the toggle in System Settings.
    // A fresh process is the only reliable verification step, so never leave
    // the UI in a loop that keeps offering the Grant action.
    RESTART_REQUIRED.store(true, Ordering::SeqCst);
    if granted {
        set_stage("permission-granted-restart-required");
    } else {
        set_stage("permission-change-restart-required");
    }
    log_event(
        app,
        "permission-request-finished",
        json!({ "grantedInCurrentProcess": granted, "restartRequired": true }),
    );
    status(app, false)
}

pub fn repair_permission(app: &tauri::AppHandle) -> Result<SystemAudioStatus, String> {
    if preflight_granted() {
        set_stage("permission-repair-skipped-authorized");
        log_event(
            app,
            "permission-repair-skipped",
            json!({ "reason": "already-authorized" }),
        );
        return Ok(status(app, false));
    }

    let bundle_identifier = app.config().identifier.clone();
    set_stage("resetting-stale-permission-record");
    log_event(
        app,
        "permission-repair-started",
        json!({
            "bundleIdentifier": bundle_identifier,
            "service": "ScreenCapture",
        }),
    );
    let output = Command::new("/usr/bin/tccutil")
        .args(["reset", "ScreenCapture", bundle_identifier.as_str()])
        .output()
        .map_err(|error| format!("macOS could not start its permission repair tool: {error}"))?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        set_stage("permission-repair-failed");
        log_event(
            app,
            "permission-repair-failed",
            json!({
                "bundleIdentifier": bundle_identifier,
                "exitCode": output.status.code(),
                "message": message,
            }),
        );
        return Err(if message.is_empty() {
            "macOS could not remove Torvi's obsolete Screen Recording permission record.".into()
        } else {
            format!("macOS could not repair Screen Recording access: {message}")
        });
    }

    REQUEST_INITIATED.store(false, Ordering::SeqCst);
    RESTART_REQUIRED.store(false, Ordering::SeqCst);
    set_stage("stale-permission-record-reset");
    log_event(
        app,
        "permission-repair-finished",
        json!({
            "bundleIdentifier": bundle_identifier,
            "service": "ScreenCapture",
            "scope": "bundle-identifier",
            "warning": "This reset affects every installed build that shares this bundle identifier.",
        }),
    );
    Ok(request_permission(app))
}

fn failure(
    state: SystemAudioState,
    category: &str,
    message: impl Into<String>,
    stage: impl Into<String>,
    domain: Option<String>,
    code: Option<i64>,
) -> SystemAudioFailure {
    SystemAudioFailure {
        state,
        category: category.into(),
        message: message.into(),
        stage: stage.into(),
        domain,
        code,
    }
}

fn helper_failure(payload: &Value) -> SystemAudioFailure {
    let message = payload
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("ScreenCaptureKit stopped unexpectedly.")
        .to_string();
    let stage = payload
        .get("stage")
        .and_then(Value::as_str)
        .unwrap_or("screen-capture-kit")
        .to_string();
    let domain = payload
        .get("domain")
        .and_then(Value::as_str)
        .map(str::to_string);
    let code = payload.get("code").and_then(Value::as_i64);

    match code {
        Some(-3801) => failure(
            SystemAudioState::PermissionRequired,
            "permission",
            "ScreenCaptureKit reports that Screen & System Audio Recording access was declined. Grant access and relaunch this same signed app.",
            stage,
            domain,
            code,
        ),
        Some(-3803) => failure(
            SystemAudioState::CaptureFailed,
            "signing-or-entitlement",
            "ScreenCaptureKit reports missing entitlements. Verify the app and nested helper signatures.",
            stage,
            domain,
            code,
        ),
        Some(-3818) => failure(
            SystemAudioState::CaptureFailed,
            "audio-pipeline",
            "ScreenCaptureKit could not start its audio pipeline. Check the selected output device and retry.",
            stage,
            domain,
            code,
        ),
        _ => failure(SystemAudioState::CaptureFailed, "capture", message, stage, domain, code),
    }
}

pub fn start(
    app: tauri::AppHandle,
    include_system_audio: bool,
) -> Result<SystemAudioStatus, SystemAudioFailure> {
    if !include_system_audio {
        return Ok(SystemAudioStatus {
            state: SystemAudioState::Running,
            permission_granted: true,
            capture_active: true,
            reason: "Microphone-only capture is running.".into(),
            diagnostics: Some(diagnostics(&app, preflight_granted())),
        });
    }
    if !preflight_granted() {
        set_stage("permission-required");
        let error = failure(
            SystemAudioState::PermissionRequired,
            "permission",
            "Screen & System Audio Recording access is required. Use Grant system audio; Start will never prompt repeatedly.",
            "permission-check",
            None,
            None,
        );
        log_event(
            &app,
            "capture-start-blocked",
            serde_json::to_value(&error).unwrap_or_default(),
        );
        return Err(error);
    }
    RESTART_REQUIRED.store(false, Ordering::SeqCst);
    if let Ok(mut last_failure) = LAST_FAILURE.lock() {
        *last_failure = None;
    }
    set_stage("locating-helper");
    log_event(
        &app,
        "capture-starting",
        json!({ "backend": "ScreenCaptureKit" }),
    );
    let helper = app
        .path()
        .resource_dir()
        .map_err(|error| {
            failure(
                SystemAudioState::CaptureFailed,
                "packaging",
                error.to_string(),
                "resource-directory",
                None,
                None,
            )
        })?
        .join("ic-screencapturekit");
    if !helper.exists() {
        return Err(failure(
            SystemAudioState::CaptureFailed,
            "packaging",
            "The signed ScreenCaptureKit helper is missing from this build.",
            "locating-helper",
            None,
            None,
        ));
    }
    set_stage("launching-helper");
    let mut child = Command::new(&helper)
        .arg("--audio-only")
        .arg("--sample-rate=24000")
        .arg("--channels=1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            failure(
                SystemAudioState::CaptureFailed,
                "helper-launch",
                error.to_string(),
                "launching-helper",
                None,
                None,
            )
        })?;
    log_event(
        &app,
        "helper-launched",
        json!({ "helperPath": helper, "pid": child.id() }),
    );
    let stdout = child.stdout.take().ok_or_else(|| {
        failure(
            SystemAudioState::CaptureFailed,
            "helper-pipe",
            "The ScreenCaptureKit audio pipe could not be opened.",
            "opening-audio-pipe",
            None,
            None,
        )
    })?;
    let stderr = child.stderr.take().ok_or_else(|| {
        failure(
            SystemAudioState::CaptureFailed,
            "helper-pipe",
            "The ScreenCaptureKit error pipe could not be opened.",
            "opening-error-pipe",
            None,
            None,
        )
    })?;
    let audio_app = app.clone();
    let (ready_sender, ready_receiver) = mpsc::sync_channel::<Result<(), SystemAudioFailure>>(1);
    std::thread::spawn(move || {
        let first_audio = AtomicBool::new(false);
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(payload) = serde_json::from_str::<Value>(&line) {
                match payload.get("event").and_then(Value::as_str) {
                    Some("ready") => {
                        set_stage("stream-running");
                        log_event(&audio_app, "helper-ready", payload.clone());
                        let _ = ready_sender.send(Ok(()));
                        let _ = audio_app.emit(
                            "native-audio-ready",
                            json!({ "backend": "ScreenCaptureKit" }),
                        );
                    }
                    Some("error") => {
                        let error = helper_failure(&payload);
                        set_stage(&error.stage);
                        if let Ok(mut last_failure) = LAST_FAILURE.lock() {
                            *last_failure = Some(error.clone());
                        }
                        log_event(
                            &audio_app,
                            "helper-error",
                            serde_json::to_value(&error).unwrap_or_default(),
                        );
                        let _ = ready_sender.send(Err(error.clone()));
                        let _ = audio_app.emit("native-audio-error", &error);
                    }
                    Some(event) => {
                        let stage = payload
                            .get("stage")
                            .and_then(Value::as_str)
                            .unwrap_or(event);
                        set_stage(stage);
                        log_event(&audio_app, "helper-stage", payload.clone());
                    }
                    None if payload.get("data").is_some() => {
                        if !first_audio.swap(true, Ordering::SeqCst) {
                            set_stage("first-audio-chunk");
                            log_event(
                                &audio_app,
                                "first-audio-chunk",
                                json!({
                                    "sampleRate": payload.get("sampleRate"),
                                    "channels": payload.get("channels"),
                                    "frames": payload.get("frames"),
                                    "audioRetained": false,
                                }),
                            );
                        }
                        let _ = audio_app.emit("native-audio-chunk", payload);
                    }
                    _ => {}
                }
            }
        }
        log_event(
            &audio_app,
            "helper-pipe-ended",
            json!({ "reason": "capture-pipe-closed" }),
        );
        let _ = audio_app.emit(
            "native-audio-ended",
            json!({ "reason": "capture-pipe-closed" }),
        );
    });
    let error_app = app.clone();
    std::thread::spawn(move || {
        let mut message = String::new();
        let mut reader = BufReader::new(stderr);
        if reader.read_to_string(&mut message).is_ok() && !message.trim().is_empty() {
            log_event(
                &error_app,
                "helper-stderr",
                json!({ "message": message.trim() }),
            );
        }
    });
    *CAPTURE.lock().map_err(|_| {
        failure(
            SystemAudioState::CaptureFailed,
            "internal-state",
            "Capture state is unavailable.",
            "storing-helper-process",
            None,
            None,
        )
    })? = Some(child);
    match ready_receiver.recv_timeout(Duration::from_secs(12)) {
        Ok(Ok(())) => {
            let mut running = status(&app, true);
            running.state = SystemAudioState::Running;
            running.capture_active = true;
            running.reason = "ScreenCaptureKit system audio is running. Play audio and watch for Sound detected.".into();
            Ok(running)
        }
        Ok(Err(error)) => {
            let _ = stop();
            Err(error)
        }
        Err(mpsc::RecvTimeoutError::Timeout) => {
            let _ = stop();
            let error = failure(
                SystemAudioState::CaptureFailed,
                "capture-timeout",
                "ScreenCaptureKit did not become ready within 12 seconds. Permission was granted, so this is a capture initialization failure.",
                "waiting-for-stream-ready",
                None,
                None,
            );
            log_event(
                &app,
                "capture-timeout",
                serde_json::to_value(&error).unwrap_or_default(),
            );
            Err(error)
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            let _ = stop();
            Err(failure(
                SystemAudioState::CaptureFailed,
                "helper-exit",
                "The ScreenCaptureKit helper exited before reporting readiness.",
                "waiting-for-stream-ready",
                None,
                None,
            ))
        }
    }
}

pub fn stop() -> Result<(), String> {
    if let Some(mut child) = CAPTURE
        .lock()
        .map_err(|_| "Capture state is unavailable.")?
        .take()
    {
        child.kill().map_err(|error| error.to_string())?;
    }
    set_stage("stopped");
    Ok(())
}
