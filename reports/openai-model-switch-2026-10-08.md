# OpenAI model switch and 4,000-user costs

8 October 2026.

Superseded later the same day by the requested [Luna + Cloudflare Whisper Turbo deployment](luna-cloudflare-whisper-2026-10-08.md). This report records the earlier full OpenAI deployment and its costs.

## Deployed result

The live API at https://api.thedreamer.app now uses `gpt-6-luna` for dream titles, summaries, tags, keywords and mood, and `gpt-transcribe` for saved recordings. Backend Worker version: `22ba8bef-8260-4e33-a5da-b48059a1d758`.

A new OpenAI project key was created through the OpenAI Developers secure connector. It is stored only in the ignored, mode-0600 `backend/.dev.vars` file and the Worker's encrypted `OPENAI_API_KEY` binding. Authentication and RevenueCat secrets remain configured. No key is added to the mobile app or tracked source.

Analysis uses Responses with strict JSON Schema, local Zod validation, `reasoning.effort: none`, `store: false`, and a 1,200-token output cap. Each request is aborted after 75 seconds; provider redirects are rejected using `redirect: manual`. This redirect setting was verified in the live Workers runtime. No automatic billable retries or fallback model calls are added. `store: false` disables Responses application-state storage; provider retention policies still apply.

Recordings use multipart uploads with their original content type and an extension-bearing filename. The OpenAI 25 MB transcription limit is checked before sending. Transcripts are saved before analysis; summary retries reuse the transcript. Saved entries, quotas, revision protection, leases and manual-edit preservation remain in place.

The privacy provider disclosure is updated at https://thedreamer.app/privacy and https://www.thedreamer.app/privacy. Only `privacy.html` changed in the generated website assets. Landing Worker version: `40e1713e-8833-4130-b4f4-678998ed1b9c`.

## Validation

- Backend TypeScript and all 35 tests pass.
- Direct live OpenAI requests confirmed access to both models, valid Luna Structured Outputs, and faithful transcription of synthetic audio.
- Deployed API checks passed: health, anonymous access, saved text analysis, unchanged completed-result reuse, private WAV upload, transcription and summary on the same entry, original capture preservation and synthetic account cleanup.
- Tests cover refusal, incomplete/malformed output, invalid moods, provider errors, redirects, deadlines, missing credentials, empty transcripts, transcript reuse after failed analysis and unchanged free-preview charging on retry.
- Website validation passed for 10 pages and 220 links/assets; the published privacy page matches the generated file on both domains.
- No mobile release or device quality benchmark was performed. Live voice verification used synthetic speech, not real user recordings.

## Published unit prices

Standard USD rates checked against official documentation on 8 October 2026. Text rates are per million tokens.

| Implementation | Text input | Text output | Audio minute |
|---|---:|---:|---:|
| Original OpenAI: GPT-4o mini + Whisper-1 | $0.15 | $0.60 | $0.006 |
| Previous Cloudflare: Llama 3.3 70B + Whisper Large v3 Turbo | $0.293 | $2.253 | $0.000513 |
| Newly deployed OpenAI: GPT-6 Luna + GPT-Transcribe | $0.10 | $0.50 | $0.0045 |

Sources: [GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini), [Whisper-1](https://developers.openai.com/api/docs/models/whisper-1), [Llama 3.3](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/), [Cloudflare Whisper Turbo](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/), [OpenAI pricing](https://developers.openai.com/api/docs/pricing), [GPT-Transcribe](https://developers.openai.com/api/docs/models/gpt-transcribe).

## Estimated monthly cost for 4,000 active users

Assumptions: one analysis per dream; 1,000 input tokens including instructions and 500 output tokens per analysis; half of entries use two-minute recordings; no extra reasoning tokens or retries. These are scenarios, not measured user activity or invoices. All values exclude hosting, database, storage, taxes, and cache or batch discounts. Cloudflare figures are before its account-wide daily free allowance.

Formula: `dreams × (1,000 × input rate + 500 × output rate) / 1,000,000 + audio minutes × audio rate`.

| Dreams per user per month | Total dreams | Audio minutes | Original OpenAI | Previous Cloudflare | Newly deployed OpenAI |
|---|---:|---:|---:|---:|---:|
| 1 | 4,000 | 4,000 | $25.80 | $7.73 | $19.40 |
| 10 | 40,000 | 40,000 | $258.00 | $77.30 | $194.00 |
| 30 | 120,000 | 120,000 | $774.00 | $231.90 | $582.00 |

At 10 dreams per user, the new $194 estimate comprises $14 for analysis and $180 for transcription: $0.0485 per active user per month. This saves $64 per month (24.8%) against the original OpenAI setup and adds $116.70 per month (151.0%) compared with the previous Cloudflare setup. GPT-Transcribe is 25% cheaper per minute than Whisper-1 and about 8.8 times the Cloudflare Whisper Turbo rate.

Cloudflare includes 10,000 neurons daily, worth approximately $0.11 at its published overage rate. If otherwise unused and fully consumed each day, this can reduce its estimate by up to $3.30 over a 30-day month. [Cloudflare allowance](https://developers.cloudflare.com/workers-ai/platform/pricing/).

The requested full OpenAI switch is deployed. For comparison only, Luna analysis with Cloudflare transcription would cost approximately $34.52 per month at the same 10-dream usage; that hybrid is not the deployed configuration.
