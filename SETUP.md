# Setup

## Prerequisites

- Node.js 22.13+ and pnpm
- macOS desktop: Xcode Command Line Tools, Rust stable, Tauri prerequisites
- Windows desktop: Visual Studio 2022 Build Tools with Desktop development with C++, WebView2, Rust stable MSVC
- iOS store build: full Xcode, Apple Developer membership, Expo/EAS account
- Android store build: JDK 17, Android Studio/SDK, Google Play Console account, Expo/EAS account
- Service configuration: Auth0, OpenAI, Paddle Billing, RevenueCat, Sites/Cloudflare bindings, signing identities, and a production domain

## Environment

Copy public/non-secret names from `config.example.env` into an ignored `.env.local`. `OPENAI_API_KEY` is server-only and must never use a public/client-prefixed variable. Desktop and mobile receive only the public API origin and OIDC client configuration.

The current development key is already stored locally as `OPENAI_API_KEY`; do not print it, move it into client config, or commit it.

## Install and validate

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm desktop:build
pnpm mobile:typecheck
```

## Web development

```bash
pnpm dev
```

The web client can capture microphone audio. To capture another tab/window in a browser, the user must explicitly select a tab/window/screen and enable audio sharing. Browser permissions cannot provide universal, silent system-audio loopback.

## Paddle Billing

1. Create separate Paddle sandbox and production products with monthly and yearly recurring prices.
2. Create a server API key with transaction and customer-portal permissions plus a Paddle.js client-side token for each environment.
3. Put the matching API key, client token, and price IDs in the server environment. Sandbox and live IDs cannot be mixed.
4. Set the approved default payment-link domain to the web app origin. `localhost` can be used for sandbox development.
5. Add `/api/v1/webhooks/paddle` as a notification destination and subscribe to `transaction.completed` plus all subscription lifecycle events.
6. Store that destination's endpoint secret as `PADDLE_WEBHOOK_SECRET`. The handler verifies the exact raw body and `Paddle-Signature` header before changing entitlements.
7. Run a Paddle webhook simulation and a sandbox monthly purchase, cancellation, and duplicate-delivery test before switching `PADDLE_ENVIRONMENT` to `production`.

The API key and webhook secret are server-only. The client-side token is intentionally publishable and has limited Paddle.js permissions; it is never interchangeable with the API key.

## macOS desktop development

```bash
pnpm --filter @interview-copilot/desktop native:prepare
pnpm --filter @interview-copilot/desktop tauri:dev
```

Grant Microphone and Screen & System Audio Recording permissions when macOS prompts. Re-test after changing the signed bundle identity because permissions are identity-scoped. The native helper emits transient 24 kHz mono PCM frames and never writes them to disk. Set `DESKTOP_TOKEN_SIGNING_SECRET` to a high-entropy server-only value; the deployed Mac handoff cannot run without it.

For the internal-alpha flow, create a fully prepared live session in the web app, select **Connect Mac app**, and enter the one-time code in the Mac overlay. The credential is limited to that session and stored in macOS Keychain.

Create an unsigned local bundle only for developer testing:

```bash
pnpm --filter @interview-copilot/desktop tauri:build -- --bundles app,dmg
```

Do not distribute this output as a production build. Public release requires the owner-provided Developer ID identity, notarization credentials, an updater signing key, production Auth0 values, and a non-placeholder release endpoint.

## Windows desktop development

Run on a Windows 11 x64 builder:

```powershell
pnpm install
pnpm --filter @interview-copilot/desktop tauri:dev
pnpm --filter @interview-copilot/desktop tauri:build -- --bundles nsis,msi
```

The production gate requires verified WASAPI render-loopback and microphone capture, default-device changes, Bluetooth switching, sleep/resume, and signed NSIS/MSI/updater artifacts. The current Windows capture adapter is not yet complete.

## Mobile

Replace placeholder values in `apps/mobile/app.json` and `apps/mobile/eas.json` with owner-controlled Auth0, RevenueCat, Expo, Apple, Google, and API configuration. Then use EAS development builds; `react-native-webrtc` and RevenueCat require native builds and are not an Expo Go-only path.

Mobile audio is foreground microphone/room coaching only. Do not describe it as phone-call or arbitrary app-audio capture.

## Production secrets

- Use a separate OpenAI production project key stored only in hosted secret management.
- Use separate Auth0 public clients for web, desktop, iOS, and Android with exact redirect URIs and PKCE.
- Store refresh credentials only in macOS Keychain, Windows Credential Manager, iOS Keychain, or Android Keystore-backed SecureStore.
- Configure Paddle and RevenueCat webhook verification secrets only on the server.
- Generate Tauri updater signing keys offline; publish only the public updater key in app configuration.
