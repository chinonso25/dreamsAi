# The Dreamer

An Expo SDK 57 dream journal with local-first capture and a Cloudflare backend at `https://api.thedreamer.app`.

## Run

```sh
nvm use
bun install --frozen-lockfile
bunx expo start
bunx tsc --noEmit
bunx jest --watchAll=false --runInBand
bun run lint
```

Use Node 24 for the app and backend. Dependency updates and compatibility holds
are documented in [EXPO_UPGRADE.md](EXPO_UPGRADE.md).

Journal entries and capture drafts are saved on the device before network operations. Text and voice recording work without an account. Better Auth creates a private guest session for sync; Settings offers passwordless email recovery and moves the guest journal to the verified account.

Original recording playback uses one app-owned native player. It continues across navigation and backgrounding, with in-app and lock-screen controls. Recording a new clip stops playback; microphone capture does not continue in the background. Turning a recording into text is a separate, optional action and preserves its audio.

## Cloudflare backend

See [backend/README.md](backend/README.md) for D1 migrations, private R2, server-side Luna summaries and Cloudflare Whisper transcription, Email Sending and deployment. Never add provider secrets to Expo public environment variables. The only mobile configuration is the API URL, store-specific RevenueCat public SDK keys and the entitlement identifier.

```sh
EXPO_PUBLIC_API_URL=https://api.thedreamer.app
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT=pro
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=<public App Store SDK key>
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=<public Play Store SDK key>
```

## Compatibility

The API is versioned under `/v1`. Drafts use stable UUIDs so retrying an interrupted save cannot create a second entry. The old `/summary` route still accepts legacy typed text and offers local saving. Old audio URIs are deliberately never attached to a new draft. Existing Supabase services are no longer used by this app; no remote legacy data or account was deleted. A server-side, owner-verified import is required if historical Supabase entries need to be brought into this fresh system.
