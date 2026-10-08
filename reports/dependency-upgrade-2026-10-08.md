# Dependency refresh — 8 October 2026

All remaining direct dependencies were checked against the npm registry and
refreshed to the latest versions compatible with Expo SDK 57. No preview SDK
or incompatible toolchain major was introduced.

## Upgraded packages

| Package | Before this refresh | Installed |
| --- | --- | --- |
| `@amplitude/analytics-react-native` | 1.4.11 | 1.12.1 |
| `@expo-google-fonts/outfit` | 0.2.3 | 0.4.3 |
| `zustand` | 5.0.2 | 5.0.15 |
| `react-native-purchases` | 10.12.1 | 10.12.2 |
| `react-native-purchases-ui` | 10.12.1 | 10.12.2 |
| Backend `kysely` | 0.28.17 | 0.29.6 |
| Backend `vitest` | 4.1.11 | 5.0.3 |

The app lockfile was refreshed with `bun update`; the backend npm lockfile was
updated with `npm install`. Other current packages remain installed, with
manifest ranges refreshed where appropriate. Backend Zod and Cloudflare types
now declare the current version ranges, instead of an old lower bound and an
unbounded `latest` range. The React Compiler plugin moved to devDependencies.

## Removed dependencies

- `@expo/react-native-action-sheet`
- `@shopify/flash-list`
- `@tanstack/react-query`
- `lodash`
- `react-native-webview`
- `expo-insights`

The query provider and the editor's obsolete query invalidation were removed.
Saved entries already flow through the journal store; no active fetch or cache
was removed. The other five packages had no source or configuration usage.
Packages still needed indirectly are allowed to remain in the resolved tree.

Retained packages that have no direct import but are required include Expo
Linking (Router), Nitro Modules (MMKV), Worklets (Reanimated), the development
client, React DOM and React Native Web (web rendering), and Expo System UI
(automatic native appearance).

## Compatibility holds

Expo's `bundledNativeModules.json` and `expo install --check` determine the
recommended versions of React, React Native, Sentry, AsyncStorage, DateTimePicker,
Reanimated, Worklets, Gesture Handler, Screens, and Safe Area Context. Newer
registry versions remain available outside this supported combination.

- Babel stays on 7.29.7: installed Babel plugins require Babel 7.
- Jest stays on 29.7.0: Jest Expo 57 still uses Jest 29 internals and Babel Jest 29.
- ESLint stays on 9.39.5: the installed React and Import plugins exclude ESLint 10.
- TypeScript stays on 6.0.3: the current TypeScript ESLint parser supports versions
  below 6.1. The backend uses the same supported compiler version.
- React types and React Test Renderer stay aligned with React 19.2 and the native
  Jest preset stays aligned with React Native 0.86.3.

Node 24 is declared in both package manifests and the root `.nvmrc`. Backend
Vitest 5 excludes odd-numbered Node 25. Validation ran on Node 24.21.0.

## Validation

- Expo dependency alignment: passed.
- App TypeScript: passed.
- App Jest: 88 tests, 10 suites, 1 snapshot passed.
- App lint: passed.
- Backend TypeScript: passed.
- Backend Vitest on Node 24: 35 tests, 3 suites passed.
- Backend complete npm audit: zero known vulnerabilities.
- Cloudflare Worker production bundle (`wrangler deploy --dry-run`): passed.
- Frozen Bun lockfile install: passed.
- Production exports: iOS, Android, and web passed; 15 static routes generated.
- iOS simulator native build on Xcode 27: passed (`BUILD SUCCEEDED`). CocoaPods
  resolved RevenueCat/RevenueCatUI 5.94.0, both React Native billing bridges
  10.12.2, and Amplitude 1.12.1. Pod installation used Ruby 3.4.1 rather than the
  machine's legacy system Ruby, which cannot read Expo's precompiled module config.
- Website: 10 pages built; 220 links and assets and structured data checks passed.
- Expo Doctor: 20/21 checks passed. The remaining React Native Directory metadata
  warning flags Amplitude as untested on the New Architecture. It remains enabled.

This is a dependency change in the workspace. Store purchase/restore transactions
and an Android native build are not verified by these checks. Native dependency
changes require a rebuilt application binary.

References: [Expo SDK upgrades](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/),
[RevenueCat 10.12.2](https://github.com/RevenueCat/react-native-purchases/releases/tag/10.12.2).

## Follow-up: Amplitude removed

Removed the Amplitude SDK, app initialization, client key, and journal-save event
after the upgrade above. Removed the old AsyncStorage override used only by that
SDK. The Bun dependency tree and regenerated iOS Podfile.lock contain no Amplitude
packages. Current privacy source now describes diagnostic use of Sentry and
discloses Amplitude only for older app releases.

Expo Doctor now passes all 21 checks. The frozen lockfile install and website
build/check pass. App TypeScript and all 88 Jest tests pass. Focused lint passes
for the changed app files. The rebuilt iOS simulator application passes on Xcode
27 (`BUILD SUCCEEDED`) after native Amplitude removal. A concurrently added search-screen effect at
`app/(tabs)/search.tsx:31` currently fails the full lint check with
`react-hooks/set-state-in-effect`; it is separate from the SDK removal. An invalid
Ionicons name in the new home screen was corrected to restore TypeScript validation.
Historical results above describe the earlier dependency upgrade.
