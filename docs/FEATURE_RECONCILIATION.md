# Feature reconciliation — Mac product repair

Date: 2026-08-24

This matrix reconciles the current repository with the product brief. “Works” means a user-reachable vertical slice exists. Backend-only code is not counted as a completed product feature.

| Feature | Exists | Works | Partial | Missing | UI exists | Backend exists | Action required |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Native account sign-in | Yes | Yes | No | No | Yes | Yes | Preserve 30-day Keychain credential and browser approval |
| Native interview setup | Yes | Partial | Yes | No | Thin form | Yes | Rebuild as guided setup with opportunity, round, interviewer, objective, sources, preflight, and consent |
| Persistent native workspace | No | No | No | Yes | No | N/A | Stop replacing the control center when a session is restored; keep Workspace and Live as explicit surfaces |
| Home | No | No | No | Yes | No | Yes | Add focal start actions, active opportunity, readiness, and recent sessions |
| Opportunities | Backend-only | No | Yes | No | No | Yes | Add opportunity workspace, role/preparation/documents/round views |
| Interview Journey / rounds | Backend-only | No | Yes | No | No | Yes | Render process timeline and round details |
| Concern Ledger | Backend-only | No | Yes | No | No | Yes | Render proposed/confirmed concerns and wire confirm/edit/dismiss |
| Next Round Brief | Backend-only | No | Yes | No | No | Yes | Fetch and present prior discussion, evidence gaps, unused stories, and preparation |
| Career Memory | Yes | Partial | Yes | No | Basic rows | Yes | Add experience cards, tags, evidence, source excerpts, verify/edit/reject/private/delete, manual add, and coverage |
| Verified claim extraction | Yes | Yes | No | No | Review is thin | Yes | Preserve; expose claim-level verification rather than only resume-level confirmation |
| Evidence coverage | Backend-only | No | Yes | No | No | Yes | Add visible coverage strengths/gaps to Career Memory and opportunity preparation |
| Question-to-experience retrieval | Yes | Partial | Yes | No | Source experience hidden | Yes | Load the session brain and show the selected verified experience in Live |
| Truthful grounding policy | Yes | Yes | No | No | Lightweight indicator | Yes | Preserve; improve provenance and missing-evidence UX |
| 5/20/60 answer layers | Yes | Partial | Yes | No | Collapsible blocks | Yes | Replace with instant layer switcher and keyboard navigation |
| Deep Dive | No | No | No | Yes | No | Provider supports detailed mode | Generate detailed response on demand and show evidence/trade-offs |
| Follow-up predictor | Yes | Partial | Yes | No | One collapsed item | Yes | Render up to three selectable follow-ups and answer them immediately |
| Live transcription | Yes | Yes | No | No | Hidden from user | Yes | Add compact/expanded/hidden transcript states with speaker labels |
| Automatic question detection | Yes | Yes | No | No | Yes | Yes | Preserve and surface detection/recovery state |
| Manual Ask AI | Yes | Yes | No | No | Yes | Yes | Preserve with editable question and shortcut |
| Separate system/mic channels | Yes | Yes on Mac | No | No | Meters exist | Yes | Preserve ScreenCaptureKit + microphone paths |
| Pre-interview system check | Backend-only | No | Yes | No | No | Partial | Add real mic, native system-audio, network/backend, storage, and AI checks; never mark untested transcription ready |
| Reconnect / recovery | Yes | Partial | Yes | No | Status only | Partial | Retry failed channels, react to network/device changes, preserve active UI and transcript |
| Practice / mock interviews | Web-only | No in Mac | Yes | No | No | Yes | Add native Practice surface using real mock sessions and quota |
| Meeting Mode | Yes | Partial | Yes | No | Same interview overlay | Yes | Give meeting mode distinct hierarchy and wire note/decision/action/question capture |
| Session reports | Yes | Partial | Yes | No | Summary cards | Yes | Add real report details, strengths, improvements, actions, and follow-up draft |
| Sessions history | Backend-only in Mac | No | Yes | No | Reports only | Yes | Add interviews/meetings history and link reports |
| Career Tools | Web-only | No in Mac | Yes | No | No | Yes | Expose resume builder/review, cover letter, job fit, career plan, saved artifacts |
| Job tracker | Web-only | No in Mac | Yes | No | No | Yes | Expose all required stages with create/update/delete |
| Answer style learning controls | Yes | Partial | Yes | No | Four fields | Yes | Add vocabulary, bullet/explanation preferences, and clearer grounding boundary |
| Provider abstraction | Yes | Yes | No | No | No | Yes | Show current provider and future-provider architecture without fake enablement |
| Compact / Docked / Expanded | Yes | No | Yes | No | Width-only variants | N/A | Implement genuinely different information hierarchies and native window sizes |
| Stealth/privacy workspace | Partial | Partial | Yes | No | Hide only | Native support partial | Add compact focus mode, opacity, click-through with recovery shortcut, and privacy explanation |
| Screen analysis | Web-only | No in Mac | Yes | No | No | Yes | Add explicit transient image action; never retain the image |
| Hide / Quit / window dragging | Yes | Yes | No | No | Yes | Yes | Preserve working behavior and native selectors |
| Raw-audio privacy | Yes | Yes | No | No | Disclosed | Yes | Preserve; continue storing no audio or screenshots |
| Mac production signing/notarization/updater | Config only | No | Yes | No | N/A | N/A | Remains externally blocked by owner Apple release credentials |
| Windows native capture | Placeholder | No | Yes | No | Shared shell | Partial | P2 after Mac hardening |
| Mobile companion | Partial | No production release | Yes | No | Expo slice | Partial | P2 after Mac P0/P1 workflows are stable |

## Confirmed product failure

`apps/desktop/src/main.tsx` selected the live overlay whenever `restore_desktop_connection` returned a context. That conditional unmounted the native control center and made new product features unreachable. The live overlay retained the earlier visual hierarchy, so the installed rebuild correctly appeared unchanged to the user.

## Repair strategy

The current application remains the implementation base. Native audio, account authorization, grounding, retrieval, persistence, reports, lifecycle controls, and privacy behavior are preserved. The repair adds a persistent desktop shell, exposes existing backend capabilities, fills the missing API/native bridges, and replaces the active-session DOM and layout rather than applying a cosmetic restyle.
