# The Dreamer

An Expo SDK 57 dream journal with local-first capture and a Cloudflare backend at `https://api.thedreamer.app`, managed as a Bun monorepo.

## Workspaces

| Location | Package | Purpose |
| --- | --- | --- |
| Repository root | `dreamsai` | Workspace configuration, shared tooling and repository commands |
| `apps/mobile/` | `@thedreamer/mobile` | Expo mobile/web app, assets, native projects and EAS config |
| `apps/api/` | `thedreamer-api` | Cloudflare Worker API, D1 migrations and tests |
| `apps/landing/` | `thedreamer-landing` | Static marketing site and its Cloudflare Worker |
| `packages/shared/` | `@thedreamer/shared` | Platform-independent mobile/API contracts |

```text
apps/
  mobile/          # Expo app, native projects, assets and store metadata
  api/             # Cloudflare API and D1 migrations
  landing/         # Marketing site and its Worker
packages/
  shared/          # Mobile/API contracts and unit tests
docs/              # Architecture and maintenance guides
reports/           # Historical validation and release evidence
archive/
  supabase/        # Preserved legacy local tooling; unused by current apps
```

All packages share the root `bun.lock`. Install from the repository root; do not
create separate workspace lockfiles. Each app owns its source, assets and runtime
configuration. Bun uses hoisted installs, configured in `bunfig.toml`.

## Run

```sh
nvm use
bun install --frozen-lockfile
bun run dev:mobile      # Expo
bun run dev:api         # Local API
bun run dev:landing     # Landing site on localhost:8788
bun run check           # All typechecks, lint, tests and landing checks
```

Use Bun 1.4.2 (pinned in `.bun-version` and `packageManager`) and Node 24. Bun
manages dependencies and scripts; Expo, Jest and Cloudflare tooling retain their
Node/Workers runtimes. CI installs every workspace with the same frozen lockfile.
If your local Bun is older, run `bun upgrade` before installing dependencies.
Dependency updates and compatibility holds are documented in
[docs/expo-upgrade.md](docs/expo-upgrade.md).

Run focused checks with `bun run typecheck:app`, `bun run typecheck:shared`,
`bun run typecheck:backend`, `bun run test:app`, `bun run test:shared`, `bun run test:backend`,
`bun run lint` or `bun run check:landing`. Use `bun run test:watch` for app test
watch mode. Existing `start`, `ios`, `android` and `web` commands remain available.

To add a dependency to a workspace, run `bun add <package>` from its directory.
Shared contracts are imported through `@thedreamer/shared/dream-contract`; the
app and API declare this package using `workspace:*`.

Journal entries and capture drafts are saved on the device before network operations. Text and voice recording work without an account. Better Auth creates a private guest session for sync; Settings offers passwordless email recovery and moves the guest journal to the verified account.

An expired email session requires email recovery; it never transfers that account's
cached journal or draft to a new guest. Signing into a different email keeps each
account's device data separate. A live guest-to-email link moves guest data. An
expired guest remains accessible locally; explicit email recovery copies retained
entries using fresh IDs and copies recordings available on the device. Recovery
reports unavailable recordings, and keeps the original local cache intact.
Unreadable draft/journal storage is retained and can be retried before editing.

The device journal uses per-entry storage with a resumable migration from the old
single snapshot. Sync uses owner-scoped change cursors and deletion tombstones;
an older backend falls back to paginated reads without treating absent rows as
deletions. Recording caches include their audio version and are reusable offline.
Shared mobile/API limits and DTO validation live in `packages/shared/dream-contract.ts`.

Original recording playback uses one app-owned native player. It continues across navigation and backgrounding, with in-app and lock-screen controls. Recording a new clip stops playback; microphone capture does not continue in the background. Turning a recording into text is a separate, optional action and preserves its audio.

## Cloudflare backend

See [apps/api/README.md](apps/api/README.md) for D1 migrations, private R2, server-side Luna summaries and Cloudflare Whisper transcription, Email Sending and deployment. Never add provider secrets to Expo public environment variables. The only mobile configuration is the API URL, store-specific RevenueCat public SDK keys and the entitlement identifier.

Apply backend migrations through `0004_sync_sources_storage.sql` before deploying
the API version that supports incremental sync and recording quotas. Merging code
does not apply these migrations or publish the mobile app. Free insight retries are
bound to the same source content; changing that content uses another preview.

Keep local mobile environment files in `apps/mobile/`, where Expo loads them.
Run EAS commands from `apps/mobile/`; its `app.json` and `eas.json` live there.
See [Expo’s monorepo build guide](https://docs.expo.dev/build-reference/build-with-monorepos/).

```sh
EXPO_PUBLIC_API_URL=https://api.thedreamer.app
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT=pro
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=<public App Store SDK key>
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=<public Play Store SDK key>
```

## Compatibility

The API is versioned under `/v1`. Drafts use stable UUIDs so retrying an interrupted save cannot create a second entry. The old `/summary` route still accepts legacy typed text and offers local saving. Old audio URIs are deliberately never attached to a new draft. Existing Supabase services are no longer used by this app; no remote legacy data or account was deleted. A server-side, owner-verified import is required if historical Supabase entries need to be brought into this fresh system.
