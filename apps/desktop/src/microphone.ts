// Bound the permission wait. If a user grants after timeout, stop those late
// tracks immediately instead of leaving an invisible microphone session.
export function requestMicrophone(
  acquire = () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }),
  timeoutMs = 30_000,
): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error('Microphone initialization timed out. Check the input device and any permission prompt, then retry audio.'));
    }, timeoutMs);
    Promise.resolve().then(acquire).then(stream => {
      if (settled) { stream.getTracks().forEach(track => track.stop()); return; }
      settled = true; clearTimeout(timer); resolve(stream);
    }, error => {
      if (settled) return;
      settled = true; clearTimeout(timer); reject(error);
    });
  });
}
