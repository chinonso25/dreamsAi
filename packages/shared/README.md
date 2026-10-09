# Shared dream contracts

Platform-independent TypeScript contracts and validation used by the mobile app
and Cloudflare API. Both consumers declare `@thedreamer/shared` as `workspace:*`.

```ts
import { DREAM_LIMITS, parseDreamDTO } from '@thedreamer/shared/dream-contract';
```

Source is exported directly; Expo and Wrangler compile it as part of their apps.
No separate package build is required. From the repository root:

```sh
bun run typecheck:shared
bun run test:shared
bun run lint:shared
```
