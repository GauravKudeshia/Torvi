//! Native macOS microphone PCM transport. Audio goes only to the live webview;
//! diagnostics contain lifecycle metadata, never audio or transcripts.
use serde_json::Value;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Mutex};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::{Emitter, Manager};

static CAPTURE: Mutex<Option<Child>> = Mutex::new(None);
static GENERATION: AtomicU64 = AtomicU64::new(0);

pub fn start(app: tauri::AppHandle) -> Result<(), String> {
    let mut capture = CAPTURE.lock().map_err(|_| "Microphone state is unavailable.")?;
    if capture.is_some() { return Err("Microphone capture is already running.".into()); }
    let helper = app.path().resource_dir().map_err(|error| error.to_string())?.join("ic-screencapturekit");
    let mut child = Command::new(helper).arg("--microphone")
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null())
        .spawn().map_err(|error| format!("Native microphone could not start: {error}"))?;
    let Some(stdout) = child.stdout.take() else {
        let _ = child.kill(); let _ = child.wait();
        return Err("Native microphone pipe is unavailable.".into());
    };
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    *capture = Some(child);
    drop(capture);
    let (ready_sender, ready_receiver) = mpsc::sync_channel::<Result<(), String>>(1);
    std::thread::spawn(move || {
        let mut ready = false;
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if GENERATION.load(Ordering::SeqCst) != generation { break; }
            let Ok(payload) = serde_json::from_str::<Value>(&line) else { continue; };
            match payload.get("event").and_then(Value::as_str) {
                Some("ready") if !ready => {
                    ready = true;
                    let _ = ready_sender.try_send(Ok(()));
                }
                Some("error") => {
                    let message = payload.get("message").and_then(Value::as_str)
                        .unwrap_or("Native microphone stopped. Retry audio.").to_string();
                    if ready { let _ = app.emit("native-microphone-error", &message); }
                    else { let _ = ready_sender.try_send(Err(message)); }
                    break;
                }
                None if payload.get("data").is_some() => { let _ = app.emit("native-microphone-chunk", payload); }
                _ => {}
            }
        }
        if ready && GENERATION.load(Ordering::SeqCst) == generation {
            let _ = app.emit("native-microphone-ended", ());
        }
    });
    match ready_receiver.recv_timeout(Duration::from_secs(30)) {
        Ok(Ok(())) if GENERATION.load(Ordering::SeqCst) == generation => Ok(()),
        outcome => {
            // A late result from a cancelled run cannot terminate its successor.
            stop_generation(Some(generation))?;
            Err(match outcome {
                Ok(Err(error)) => error,
                Err(mpsc::RecvTimeoutError::Timeout) => "Microphone initialization timed out. Check the input device and any macOS permission prompt, then retry audio.".into(),
                _ => "Microphone capture stopped before it became ready.".into(),
            })
        }
    }
}

fn stop_generation(expected: Option<u64>) -> Result<(), String> {
    let mut capture = CAPTURE.lock().map_err(|_| "Microphone state is unavailable.")?;
    if expected.is_some_and(|value| GENERATION.load(Ordering::SeqCst) != value) { return Ok(()); }
    GENERATION.fetch_add(1, Ordering::SeqCst);
    if let Some(mut child) = capture.take() { let _ = child.kill(); let _ = child.wait(); }
    Ok(())
}

pub fn stop() -> Result<(), String> { stop_generation(None) }
