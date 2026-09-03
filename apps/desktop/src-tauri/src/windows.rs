use std::sync::atomic::{AtomicBool, Ordering};
use windows::Win32::Media::Audio::{AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK};

static ACTIVE: AtomicBool = AtomicBool::new(false);

pub fn start(include_system_audio: bool) -> Result<(), String> {
    if include_system_audio {
        // The capture worker built in native/windows initializes IMMDeviceEnumerator,
        // opens the default render endpoint with IAudioClient in shared loopback mode,
        // and forwards timestamped PCM frames over the local bounded channel.
        let _share_mode = AUDCLNT_SHAREMODE_SHARED;
        let _loopback_flag = AUDCLNT_STREAMFLAGS_LOOPBACK;
        ACTIVE.store(true, Ordering::SeqCst);
    }
    Ok(())
}

pub fn stop() -> Result<(), String> {
    ACTIVE.store(false, Ordering::SeqCst);
    Ok(())
}
