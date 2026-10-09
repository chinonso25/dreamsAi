# The Dreamer mobile app

Expo SDK 57 app for iOS, Android and web. Install dependencies from the repository
root with `bun install --frozen-lockfile`.

From the repository root:

```sh
bun run dev:mobile
bun run ios
bun run android
bun run web
bun run typecheck:app
bun run test:app
bun run lint:app
```

Source routes live in `app/`; app assets, components and local persistence stay
inside this workspace. Shared contracts come from `@thedreamer/shared/dream-contract`.
Mobile environment files (`.env`, `.env.local`) belong in this directory and stay
ignored. Keep provider secrets in the API workspace, never Expo public variables.

Run EAS CLI commands from this directory. `app.json`, `eas.json`, native projects
and `fastlane/` store metadata belong to the mobile app. Ignored native projects
were moved intact; reinstall CocoaPods after changing dependency paths.

See the [repository README](../../README.md) for architecture and
[Expo upgrade notes](../../docs/expo-upgrade.md) for compatibility holds.
