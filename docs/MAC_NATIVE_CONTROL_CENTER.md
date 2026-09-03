# Mac native control center

Version 0.3.0 removes the per-interview copy-and-paste handoff as the primary workflow.

## Sign-in

The Mac app starts a short-lived device authorization and opens the hosted approval page in the system browser. After the signed-in user approves the device, the Mac polls with an unguessable secret and receives a 30-day account-scoped credential. The credential is stored in macOS Keychain, never in the webview or D1, and can access only the explicit native product API allowlist. Billing and account deletion remain excluded.

The browser is used only for identity confirmation. Interview preparation and live sessions no longer require returning to the web dashboard.

## Native workflow

The control center provides:

- saved or new role and company setup;
- behavioral, technical, coding, system-design, case, mock, and meeting modes;
- all five launch languages;
- resume, job-description, and supporting-document upload;
- explicit review and verification of extracted resume claims;
- per-session source selection and consent;
- Professional Memory claim confirmation, rejection, and privacy controls;
- saved reports;
- communication-profile preferences;
- native session creation followed by ScreenCaptureKit system audio, optional microphone capture, automatic question detection, and progressive grounded suggestions.

## Security and retention

Device and user authorization codes are stored only as SHA-256 hashes. Raw audio remains ephemeral. The native account token is never an OpenAI key and is restricted on both the Mac and the server. A saved session persists the transcript and report; Discard removes transcript context.

## Distribution status

The local Apple Silicon build can be installed for internal testing. Public distribution still requires Developer ID signing, notarization, a real updater key and endpoint, staged rollout, crash reporting, and the native reliability matrix. Ad-hoc internal builds may require system-audio permission to be granted again after replacement because their designated code requirement changes between builds.
