# Torvi mobile release prerequisites

The native Expo app has a Notes home, microphone recording, Chat/Transcript live session, save/discard, history, title editing, and native text sharing. It requires a development client; Expo Go does not include its WebRTC native module.

## Configure public build settings

Set these in the selected EAS environment or an ignored local environment file:

- `EXPO_PUBLIC_API_URL`: existing Torvi service origin.
- `EXPO_PUBLIC_AUTH0_DOMAIN`: Auth0 tenant host without a URL scheme.
- `EXPO_PUBLIC_AUTH0_CLIENT_ID`: an Auth0 **Native** application client ID, not the web confidential client.
- `EXPO_PUBLIC_AUTH0_AUDIENCE`: the same audience validated by the backend.
- `EXPO_PUBLIC_EAS_PROJECT_ID`: your Expo project ID.
- Optional RevenueCat public SDK keys: `EXPO_PUBLIC_REVENUECAT_APPLE_KEY` and `EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY`. Never use server or secret keys here.

Configure the native Auth0 client callback as `interviewcopilot://auth`, allow the intended logout callback, enable PKCE and refresh-token rotation, and verify the API permits this native client. The backend must already have the corresponding issuer and audience. Do not reuse the web client's secret. Secrets such as `OPENAI_API_KEY` stay on the server.

`app.config.ts` reads these public settings. EAS preview and production profiles fail with a useful message if required values are missing, rather than shipping a nonfunctional login screen. Existing `app.json` placeholders remain intentionally unconfigured until the account owner supplies real settings.

## Device acceptance checklist

Use EAS preview/development builds on a real iPhone and Android device. Cloud builds and store submission require the owner's Expo and Apple/Google accounts; they have not been initiated automatically.

1. Sign in and refresh an expired token; check account/quota.
2. Start recording, allow microphone access, speak a nonsensitive test sentence, and verify transcript and speech activity.
3. Pause/resume: timer preserves accumulated recording time. Backgrounding releases the microphone; returning requires Resume.
4. Ask Assist in Points and Paragraph styles. End and save; reopen the meeting and verify transcript, notes and AI chat.
5. Interrupt the network, retry, and verify no duplicate saved AI answers. Failed saves remain in memory while the app stays open; an encrypted offline outbox is not implemented.
6. Check keyboard-open layout, large text, VoiceOver/TalkBack, long titles/transcripts, and the system share sheet.
7. Verify discard removes server-held session content. Do not use real confidential meetings for acceptance testing.

Raw audio is not persisted. Mobile captures foreground room microphone audio, not other apps' call/system audio. Native microphone/device QA is still required; type checks do not replace it.
