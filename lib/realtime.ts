export const LIVE_TRANSCRIPTION_MODEL = 'gpt-live-transcribe';
export const DEFAULT_VAD_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';

export function selectRealtimeTranscriptionModel(
  configuredModel: string,
  clientTurnDetection: boolean,
  vadModel = DEFAULT_VAD_TRANSCRIPTION_MODEL,
) {
  return configuredModel === LIVE_TRANSCRIPTION_MODEL && !clientTurnDetection
    ? vadModel
    : configuredModel;
}

export function requiresClientTurnDetection(model: string, requestedByClient: boolean) {
  return requestedByClient || model === LIVE_TRANSCRIPTION_MODEL;
}
