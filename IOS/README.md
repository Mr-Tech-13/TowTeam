# TowTeam Mobile

Native iOS SwiftUI client for TowTeam. This folder is self-contained and does not
modify the web application or server.

## Open and run

1. Finish installing Xcode, open `TowTeamMobile.xcodeproj`, and select an iPhone simulator.
2. Press Run.
3. On first launch, add a named workspace with the HTTPS address of its TowTeam server, then sign in.

For local simulator development, `http://127.0.0.1:8080` is accepted by the app's
development transport settings. Use HTTPS for physical devices and production.

From Terminal, after Xcode is installed:

```bash
./xcode-build.sh
```

The app supports multiple named workspaces and switching between their server URLs.
Each workspace keeps a separate bearer session in Keychain. It also implements Active and History
lists, manual tow setup, tow detail/workflow, summary sharing, and a durable offline
workflow queue. The native tow-paper editor mirrors the shared paper state with all
25 checklist answers, exception comments, tow-detail fields, risk selections,
autofill (when permitted), revision-aware saving, reset, and PDF access.

After the first successful sign-in, the current user, Active/History lists, opened tow
details, and opened tow-paper PDFs are cached per workspace. Offline tow creation and
workflow timestamps update immediately and sync automatically when connectivity returns.
Tow-paper draft edits are also stored locally and coalesced into a pending save. If the
server revision changed while the device was offline, server and local fields are merged
before the queued draft is saved.
The Active screen shows a green connected dot, red offline dot, or yellow dot while
changes are waiting to sync.
