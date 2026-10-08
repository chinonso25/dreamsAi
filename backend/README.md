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
Apply migration `0002_billing_identities.sql` and `0003_audio_cleanup_leases.sql` before deploying this version to an existing `0001` database. Migration files use LF line endings and avoid nested CASE expressions inside triggers because the remote D1 statement splitter can misread their END token.
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
- `GET /v1/dreams` → `{dreams: Journal[]}`, newest dream date first, scoped to current user.
- `GET /v1/dreams/:uuid` → `{dream}`.
- `PUT /v1/dreams/:uuid` → `{dream}`. Idempotent upsert. Requires `dream_date` (`YYYY-MM-DD`); supports title, transcript, original_text, summary, tags, keywords, mood, created_at, updated_at, is_starred, audio_length, reflection. `id`, if present, must match the route. Owner, audio key and processing fields are controlled by the server. Delayed writes older than the stored `updated_at` are ignored. Deleted entries cannot be resurrected by an old outbox operation.
- `DELETE /v1/dreams/:uuid` → `{deleted:true}`. Redacts entry content and records a tombstone, queues private audio deletion. Retries are safe.
- `PUT /v1/dreams/:uuid/audio`: raw M4A (`audio/mp4` or `audio/m4a`), WAV, or WebM bytes, max 25 MiB. Entry must already exist. Validates file headers. Returns `{audio_key}`. Keys include entry UUID and content checksum; retrying the same audio is idempotent and does not invalidate a completed analysis. Audio is never shared between entries.
- `GET /v1/dreams/:uuid/audio`: authenticated private bytes with range support. Native playback must send the current session cookie. There is no public bucket URL.
- `POST /v1/dreams/:uuid/process`: optional `{restart:true}`. Returns `{dream}` with `processing_status` `processing`, `complete`, or `error`. A completed revision is reused; a live lease is returned without another inference; an expired lease or error restarts. Raw `original_text` is preserved across later transcript edits. Transcription is saved before summarisation so a summarisation retry can reuse it.
- `GET /v1/entitlement` → `{premium:boolean}`, freshly verified against RevenueCat.
- `DELETE /v1/account` → `{deleted:true}`. Deletes all D1 account/session/journal data and queues audio cleanup.
- `GET /health` → `{ok:true,service:"thedreamer-api"}`.

Errors use `{error:{code,message}}` and appropriate HTTP status. Important codes: `SESSION_REQUIRED` (401), `PREMIUM_REQUIRED` (402), `DREAM_NOT_FOUND` (404), `DREAM_DELETED` / `PROCESSING_BUSY` (409), `PAYLOAD_TOO_LARGE` (413), `INVALID_AUDIO` (415), `RATE_LIMITED` (429), `PURCHASE_CHECK_UNAVAILABLE` (503). Never display a failed transcription as dream content.

## Processing reliability and security

Every draft UUID is stable. The app should save locally before contacting the API, persist its outbox and durable audio file, and upload before requesting analysis. A D1 lease locks inference for a revision. Writes that change the source or analysis fields invalidate the lease; late responses cannot overwrite a newer revision. Interrupted processing becomes restartable after the three-minute lease expires, and an hourly maintenance task marks abandoned jobs with a clear error. The server does not depend on the client connection continuing forever.

Analysis uses OpenAI's Responses API with strict Structured Outputs and local schema validation. Requests use `store:false`, `reasoning.effort:none` and a 1,200-token output cap. Luna and Whisper requests have abortable 75-second deadlines; there are no automatic billable retries. Refused, incomplete and malformed responses are never stored as insights. Recordings are sent as base64-encoded original bytes through the private Workers AI binding, with `task:transcribe` to preserve the spoken language. The existing 25 MiB upload limit remains. No recording is sent to the OpenAI transcription API. A successful transcript is persisted before analysis, so retrying a summary does not transcribe the same recording again. Provider error bodies, keys, dream text and audio are not logged or returned to the client. `store:false` disables Responses application-state storage; provider retention policies still apply.

Free basic saving and recording storage do not require subscription. Three insight previews per owner are configurable with `FREE_AI_LIMIT`. V2 active entitlement membership is authoritative, including iOS grace periods; the V1 compatibility path explicitly honours the grace expiry. A reserved entry can retry an interrupted job without spending another preview. Paid AI access is validated server-side using RevenueCat; the client cannot grant itself premium. Missing or unavailable RevenueCat configuration never grants paid access. Entitlement checks query the current user and only their stored verified guest billing identities. No RevenueCat alias mutation or elevated secret permission is required. Owner, network and authentication rate limits restrict abuse; counters use hashed network identifiers. The worker does not log dream text, audio, OTPs or tokens.

Media deletion is a durable D1 cleanup outbox. Uploads reserve a ten-minute delayed cleanup marker before writing R2, so an attachment failure or D1 outage cannot silently orphan an object. Successful attachment clears the marker. Single byte ranges, suffix ranges and open-ended ranges are validated; unsupported or unsatisfiable ranges return 416 with the recording size. Hourly scheduled retries finish any failed R2 deletion. Tombstones prevent delayed mobile saves from recreating deleted content. Guest-to-account linking changes D1 ownership without copying media, so recordings keep their association. Any active inference lease is released during linking so recovered entries can be restarted immediately.

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
