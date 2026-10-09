# Expo SDK 57 upgrade

Updated on 8 October 2026 from SDK 52 to the current stable release,
`expo@57.0.27`, with React Native `0.86.3` and React `19.2.3`.
SDK 58 is currently on the `next` distribution tag.

The upgrade aligns Expo modules, migrates Router imports, updates MMKV storage,
and adds Reanimated's Worklets dependency.
The MMKV storage IDs stay the same to retain existing sessions and preferences.
AsyncStorage remains on Expo’s recommended version. The obsolete analytics-only
override has been removed.
Audio recording now awaits preparation and completion. Voice files are retained
in document storage and uploaded privately to Cloudflare R2 through the Worker.
Supabase has been removed from the app and its dependencies.
RevenueCat's native SDK and paywall UI are aligned at `10.12.2` to support the
current Xcode toolchain; the previous SDK failed to compile with Xcode 27.

The URL scheme is now `dreamai` to satisfy the URL scheme schema.
ESLint uses the current flat configuration, and the React Compiler uses its stable plugin.

## Native projects

The ignored SDK 52 native projects were preserved locally in
`apps/mobile/.expo/native-backup-sdk52-jORT3K/`. Both native projects were regenerated from
the app configuration using `expo prebuild --no-install`.

The `expo-build-properties` plugin enables UIKit scene support for Xcode 27 and
iOS 27. SDK 57 requires iOS 16.4 or newer.

A fresh native build is required to run the upgraded app. Use Node 24 (also
required by the upgraded backend test runner). For local development:

```sh
nvm use
bun install --frozen-lockfile
bun run ios
# Or, with the Android SDK installed:
bun run android
```

## Validation

```sh
cd apps/mobile
bunx expo install --check
cd ../..
bun run typecheck:app
bun run test:app
bun run lint
cd apps/mobile
bunx expo-doctor@latest
```

Dependency alignment and TypeScript pass. See [the rebuild report](../reports/cloudflare-rebuild-2026-10-08.md) for final tests and native verification.

Expo Doctor passes all 21 checks after Amplitude removal. React Native Directory
validation remains enabled.

## Dependency cleanup

The 8 October follow-up upgrades Amplitude to `1.12.1`, Outfit fonts to `0.4.3`,
Zustand to `5.0.15`, and both RevenueCat packages to `10.12.2`. Other dependencies
were refreshed to their latest compatible versions in the lockfile. The backend
uses Kysely `0.29.6` and Vitest `5.0.3`.

Removed unused Action Sheet, FlashList, Lodash, WebView, Expo Insights, and React
Query. The journal's Zustand store already owns saved entries, so its obsolete
query provider and invalidation call were removed. The React Compiler plugin is
now a development dependency; the compiler stays enabled.

Expo's recommended React and native module versions remain aligned with SDK 57.
Babel 8, Jest 30, ESLint 10, and TypeScript 7 are held back because the current
Babel plugins, Jest Expo preset, ESLint plugins, and TypeScript ESLint parser
depend on the preceding compatible major versions.

## Amplitude removal

Amplitude was removed after the dependency refresh. App initialization, its client
key, and the journal-save event were removed along with the SDK and its obsolete
AsyncStorage override. The website privacy source distinguishes the current app
from older releases, which may still contain the SDK.
