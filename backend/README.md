# The Dreamer Cloudflare API

Worker API for the Expo app at **https://api.thedreamer.app**. Journal data lives in Cloudflare D1; audio is in a private R2 bucket. The Worker uses Cloudflare Workers AI `@cf/openai/whisper-large-v3-turbo` for saved recordings and OpenAI `gpt-6-luna` for titles, summaries, tags, keywords and mood. Supabase and client-side AI credentials are not used.

## Local validation

```sh
npm ci
npm run typecheck
npm test
npm run migrate:local
```

Tests run in the Workers runtime with real local D1 and R2. No remote database, AI inference, email or payment calls occur in the tests.

## Deployment

The Wrangler configuration specifies the provisioned `dreamer-journal` D1 database and `dreamer-audio` private bucket. Confirm the account and resources before deployment. Keep R2 public access and r2.dev access disabled.

1. Provision a random, stable authentication secret through `wrangler secret put BETTER_AUTH_SECRET`. At least 32 random bytes; never change it casually because it signs sessions.
2. Set `REVENUECAT_SECRET_KEY` with `wrangler secret put REVENUECAT_SECRET_KEY`; use a V2 secret key scoped only to **Customer Information → Customers → Read** (`customer_information:customers:read`), not the mobile iOS public SDK key. The configured project `50f990d7` and entitlement ID `entl647fbfef6e` use the authoritative V2 active-entitlements endpoint. V1 remains supported when `REVENUECAT_PROJECT_ID` is omitted. Set `REVENUECAT_ENTITLEMENT` to the exact entitlement identifier. The identifier `pro` has been verified in RevenueCat. Purchases must use the Better Auth user ID as RevenueCat appUserID.
Apply migrations `0002_billing_identities.sql`, `0003_audio_cleanup_leases.sql`, and `0004_sync_sources_storage.sql` before deploying this version to an existing `0001` database. Deploy the backend before a mobile version requiring incremental sync. Migration files use LF line endings and avoid nested CASE expressions inside triggers because the D1 statement splitter can misread their END token.
3. Enable Cloudflare Email **Sending** for the account, onboard `thedreamer.app`, verify the required sender DNS records, and verify `hello@thedreamer.app`. Email Routing alone does not enable transactional delivery. This uses the structured `EMAIL.send({to,from,subject,text})` Workers binding.
4. Apply migrations: `npm run migrate:remote`.
5. Deploy: `npm run deploy`. The custom domain creates the Worker route for `api.thedreamer.app`; the existing apex site is untouched.
6. Verify `/health`, anonymous sign-in, session-protected journal CRUD and authenticated audio download. Test a real email OTP to an explicitly authorized address and purchase/restore on an iOS development or TestFlight build.

Before deploying OpenAI processing, provision `OPENAI_API_KEY` through `wrangler secret put OPENAI_API_KEY` using a secure input channel. Keep the key in the ignored `backend/.dev.vars` file for local development only; it must never appear in Expo variables or tracked files. Existing authentication and billing secrets stay in place. The Workers AI `AI` binding handles transcription; the OpenAI key is used only for Luna summaries.

Private secrets belong in Worker bindings, never `.env` files committed to Git or Expo public environment variables. For local development, use an ignored `.dev.vars` file containing `BETTER_AUTH_SECRET`. Use a local HTTP `AUTH_BASE_URL` while running Wrangler locally. No email OTP is logged by this application; the local email simulator may log delivered content, so do not use real addresses or codes in shared logs.

## Mobile contract

Better Auth base path `/api/auth`, plugins `expo`, `anonymous`, `emailOTP`, `bearer`. The app scheme is `dreamai://`. The Expo plugin stores cookies in SecureStore; custom API requests send `authClient.getCookie()` as the `Cookie` header with `credentials: "omit"`. Signed bearer tokens from the `set-auth-token` response header are also accepted. Do not use the unsigned JSON session token as a bearer token.

- `POST /api/auth/sign-in/anonymous`: create a guest session; no account screen needed.
- `POST /api/auth/email-otp/send-verification-otp` with `{email,type:"sign-in"}`.
- `POST /api/auth/sign-in/email-otp` with `{email,otp}` and the existing guest cookie. Existing guest records, audio associations, free insight usage and reserved jobs merge to the verified account in one D1 transaction. Old guest sessions are deleted by Better Auth. Server-created billing identity records preserve any paid entitlement attached to the old guest ID; clients cannot supply these aliases. Up to 20 recovered billing identities can be linked to one account, with the limit enforced atomically in D1.
- `GET /v1/dreams?cursor=<sequence>&until=<watermark>&limit=100` → `{dreams: DreamDTO[],next_cursor:string|null,sync_cursor:string}`. Owner-scoped, ascending sync sequence, at most 100 active entries per page. Follow `next_cursor` and pass the first page's `sync_cursor` as `until` until the cursor is null; sort the completed journal by dream date on the device. Pagination is explicit, including for the legacy list route.
- `GET /v1/dreams/sync?since=<completed-sequence>&cursor=<page-sequence>&until=<watermark>&limit=100` → `{dreams: DreamDTO[],deleted:[{id,user_id,deleted_at,sync_version}],next_cursor:string|null,sync_cursor:string}`. Omit `since` for the initial owner snapshot. The first page fixes an upper watermark; use that `sync_cursor` as `until` on every following page, keeping `since` unchanged. Persist an owner-specific completed cursor only after all pages are durably merged. A page's count applies to the combined dream/deletion stream. Never treat missing entries on one page as deletions. Subsequent requests use the previous completed `sync_cursor` as `since`. Malformed, unsafe, oversized or future cursor windows fail with `INVALID_SYNC_CURSOR` (400).
- `GET /v1/dreams/:uuid` → `{dream}`.
- `PUT /v1/dreams/:uuid` → `{dream}`. Idempotent upsert. Requires `dream_date` (`YYYY-MM-DD`); supports title, transcript, original_text, summary, tags, keywords, mood, created_at, updated_at, is_starred, audio_length, reflection. `id`, if present, must match the route. Owner, audio key, sync version and processing fields are controlled by the server. ISO timestamps are canonicalized to UTC before comparison. Delayed writes older than the stored `updated_at` are ignored; timestamps over five minutes ahead of the server fail with `FUTURE_TIMESTAMP` (400). Deleted entries cannot be resurrected by an old outbox operation. New active entries are capped at 10,000 per owner; existing entries remain editable and deletable when at the cap.
- `DELETE /v1/dreams/:uuid` → `{deleted:true}`. Redacts entry content and records a tombstone, queues private audio deletion. Retries are safe.
- `PUT /v1/dreams/:uuid/audio`: raw M4A (`audio/mp4` or `audio/m4a`), WAV, or WebM bytes, max 25 MiB. Entry must already exist. Validates file headers and atomically reserves bytes against cumulative owner/service storage budgets. Returns `{audio_key}`. Keys include entry UUID and content checksum; retrying the same audio is idempotent and does not invalidate a completed analysis. Replacing previously transcribed audio clears its derived transcript and transcribes the replacement while preserving original capture text. Audio is never shared between entries.
- `GET /v1/dreams/:uuid/audio`: authenticated private bytes with range support. Native playback must send the current session cookie. There is no public bucket URL.
- `POST /v1/dreams/:uuid/process`: optional `{restart:true}`. Returns `{dream}` with `processing_status` `processing`, `complete`, or `error`. A completed revision is reused; a live lease is returned without another inference; an expired lease or error restarts. Raw `original_text` is preserved across later transcript edits. Transcription is saved before summarisation so a summarisation retry can reuse it.
- `GET /v1/entitlement` → `{premium:boolean}`, freshly verified against RevenueCat.
- `DELETE /v1/account` → `{deleted:true}`. Deletes all D1 account/session/journal data and queues audio cleanup.
- `GET /health` → `{ok:true,service:"thedreamer-api"}`.

Errors use `{error:{code,message}}` and appropriate HTTP status. Important codes: `SESSION_REQUIRED` (401), `PREMIUM_REQUIRED` (402), `DREAM_NOT_FOUND` (404), `DREAM_DELETED` / `PROCESSING_BUSY` (409), `PAYLOAD_TOO_LARGE` (413), `INVALID_AUDIO` (415), `RATE_LIMITED` (429), `PURCHASE_CHECK_UNAVAILABLE` (503). Never display a failed transcription as dream content.

## Processing reliability and security

Every draft UUID is stable. The app should save locally before contacting the API, persist its outbox and durable audio file, and upload before requesting analysis. A D1 lease locks inference for a revision. Writes that change the source or analysis fields invalidate the lease; late responses cannot overwrite a newer revision. Interrupted processing becomes restartable after the three-minute lease expires, and an hourly maintenance task marks abandoned jobs with a clear error. The server does not depend on the client connection continuing forever.

Analysis uses OpenAI's Responses API with strict Structured Outputs and local schema validation. Requests use `store:false`, `reasoning.effort:none` and a 1,200-token output cap. Luna and Whisper requests have abortable 75-second deadlines; there are no automatic billable retries. Refused, incomplete and malformed responses are never stored as insights. Recordings are sent as base64-encoded original bytes through the private Workers AI binding, with `task:transcribe` to preserve the spoken language. The existing 25 MiB upload limit remains. No recording is sent to the OpenAI transcription API. A successful transcript is persisted before analysis, so retrying a summary does not transcribe the same recording again. Provider error bodies, keys, dream text and audio are not logged or returned to the client. `store:false` disables Responses application-state storage; provider retention policies still apply.

Free basic saving and recording storage do not require subscription. Three insight previews per owner are configurable with `FREE_AI_LIMIT`. V2 active entitlement membership is authoritative, including iOS grace periods; the V1 compatibility path explicitly honours the grace expiry. Reservations are keyed by entry plus a SHA-256 fingerprint of the actual text or recording. Identical-source retries, including a successful transcription followed by a failed summary, reuse their preview. Changing source text or recording consumes another preview; reusing the same entry UUID cannot bypass the allowance. Whitespace-only text changes retain the same fingerprint. Paid AI access is validated server-side using RevenueCat; the client cannot grant itself premium. Missing or unavailable RevenueCat configuration never grants paid access. Entitlement checks query the current user and only their stored verified guest billing identities. No RevenueCat alias mutation or elevated secret permission is required. Owner, network and authentication rate limits restrict abuse; counters use hashed network identifiers after normalizing IPv6 addresses to their /64 subnet. Authentication uses Cloudflare's trusted `CF-Connecting-IP` header.

Recording budgets default to **1 GiB per owner** and **100 GiB for the service**, configurable using positive integer byte limits `MAX_AUDIO_BYTES_PER_OWNER` and `MAX_AUDIO_BYTES_GLOBAL`. The limits include pending uploads, old recordings awaiting replacement cleanup, and orphaned objects. Reservations and counters update atomically in D1, including concurrent different-owner requests. Byte charges are released only after R2 deletion succeeds. Account deletion anonymizes pending object ownership and retains the service-wide charge until cleanup completes. Verified guest linking transfers existing owner charges without rejecting or deleting an already over-budget merged journal; new reservations are blocked until it falls below the limit. `STORAGE_LIMIT` (413) leaves the recording on the device. `STORAGE_BUSY` (409) means a deletion currently owns that content-addressed object key; retry after cleanup.

Migration `0004` preserves all existing journal/media pointers and tombstones. Because a SQL migration cannot read R2 metadata, it conservatively charges each existing active or cleanup-pending object at the former 25 MiB upload maximum. Authenticated reads/replacements refine those charges using authoritative R2 object sizes. Existing media stays accessible even if the conservative total exceeds a new budget. Existing preview reservations are preserved for their source version and promoted to fingerprints on their first unchanged-source retry. Existing timestamps are normalized to UTC; grossly future `updated_at` values are reset to migration time without altering journal content. Back up D1 and review estimated media totals before applying the migration; configure higher budgets if appropriate for the existing service.

Media deletion is a durable D1 cleanup outbox. Uploads reserve a ten-minute delayed cleanup marker before writing R2, so an attachment failure or D1 outage cannot silently orphan an object. Successful attachment clears the marker. Cleanup rechecks that delay while claiming an object and holds an hour-long deletion lease; uploads cannot renew or rewrite a key during that deletion. Failed deletes retain their byte charge and outbox record, and release the lease for retry. A worker interrupted before releasing its lease becomes retryable after expiry. Single byte ranges, suffix ranges and open-ended ranges are validated; unsupported or unsatisfiable ranges return 416 with the recording size. Hourly scheduled retries finish any failed R2 deletion. Tombstones prevent delayed mobile saves from recreating deleted content. Guest-to-account linking changes D1 ownership without copying media, so recordings keep their association. Any active inference lease is released during linking so recovered entries can be restarted immediately.

Every insertion or public-field update, including server analysis, audio changes, deletions and verified ownership transfer, receives a monotonic D1 sync sequence. Pagination fixes an upper watermark instead of relying on offsets: changes occurring after that watermark move into the next refresh. Tombstones remain owner-scoped and are returned without redacted content. Account deletion removes the owner's records and sessions rather than leaving readable journal tombstones.

Diagnostics log only fixed operation names, application error codes/statuses and generic error categories. They never log error messages, request URLs/bodies, account IDs, recording keys, provider responses, OTPs or credentials. Worker console logs are enabled with automatic invocation logs and traces disabled. Expected validation/rate/quota failures do not produce outer API error logs; provider/processing and unexpected database failures remain diagnosable. Tests cover concurrent source quotas, owner/global byte reservations, cleanup-selection races, account deletion and guest recovery, existing-data migrations, ISO offsets and watermark/tombstone pagination.

## Backward compatibility

This is a fresh backend. It preserves the journal field names used by the mobile app but UUID IDs and string user IDs are canonical. Local legacy imports must allocate stable new UUIDs before syncing numeric Supabase IDs. Do not accept a legacy `user_id`, public `audio_url`, or old Supabase token as ownership proof. Existing Supabase data is not remotely imported, deleted or reauthenticated by this Worker. The former provider can remain read-only for an explicit export/import migration; the new app must never silently claim an unrelated previous user's data.

## References checked during implementation

- https://better-auth.com/docs/integrations/expo
- https://better-auth.com/docs/plugins/anonymous
- https://better-auth.com/docs/plugins/email-otp
- https://better-auth.com/docs/plugins/bearer
- https://better-auth.com/docs/adapters/other-relational-databases
- https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/models/gpt-transcribe
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/guides/speech-to-text
- https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/
- https://www.revenuecat.com/docs/api-v2/customer/resources
