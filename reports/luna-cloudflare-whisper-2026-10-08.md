# Luna and Cloudflare Whisper Turbo

8 October 2026.

## Current setup

The deployed API at https://api.thedreamer.app uses OpenAI `gpt-6-luna` for titles, summaries, tags, keywords and mood, and Cloudflare Workers AI `@cf/openai/whisper-large-v3-turbo` for recording transcription. Backend version: `23a045b1-5539-448a-a7e9-542c2521d5bb`.

Original private recording bytes are base64-encoded and sent through the Workers AI binding with `task: transcribe`. The spoken language is retained through automatic language detection. Recordings stay in private R2; OpenAI receives the resulting transcript for analysis. The existing server-side OpenAI key is retained for Luna; no new key is needed.

Both inference calls have abortable 75-second deadlines and no automatic retries or provider fallback. Successful transcripts are persisted before summaries, so a failed summary can retry without another transcription or preview charge. Strict summary schema validation, revision protection, leases and saved original text remain in place. Missing provider configuration is checked before reserving a preview. Provider error bodies and recording contents are not logged or exposed.

The privacy disclosure now identifies Cloudflare transcription and OpenAI Luna summaries. Only the generated privacy page changed.

## Monthly AI estimate for 4,000 active users

Assumptions: one analysis per dream, 1,000 input tokens including instructions and 500 output tokens; half of dreams have two-minute recordings. Standard uncached rates, no additional reasoning or retries. These are usage scenarios, not measured invoices. Hosting, database, storage, taxes and account-wide Cloudflare allowances are excluded.

| Dreams per user per month | Dreams / audio minutes | Original GPT-4o mini + Whisper-1 | Previous Llama + Cloudflare Whisper | Luna + GPT-Transcribe | Current Luna + Cloudflare Whisper |
|---|---:|---:|---:|---:|---:|
| 1 | 4,000 | $25.80 | $7.73 | $19.40 | $3.45 |
| 10 | 40,000 | $258.00 | $77.30 | $194.00 | $34.52 |
| 30 | 120,000 | $774.00 | $231.90 | $582.00 | $103.56 |

At ten dreams per user per month, Luna costs $14 and Cloudflare transcription costs $20.52. Total: **$34.52/month**, or about **$0.00863 per active user per month**.

This saves **$159.48/month (82.2%)** from the Luna + GPT-Transcribe deployment, **$223.48/month (86.6%)** from the original client-side OpenAI setup, and **$42.78/month (55.3%)** from the prior fully Cloudflare setup.

Current standard prices: Luna $0.10/million input tokens and $0.50/million output tokens; Cloudflare Whisper $0.000513/audio minute. Sources: [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [Cloudflare Whisper Turbo](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/). Earlier provider rates and sources are recorded in the superseded OpenAI model-switch report.

## Validation

Backend TypeScript and all 38 Workers-runtime tests pass. They verify original recording bytes, correct provider routing, deadline cancellation, empty transcripts, safe provider errors, missing configuration before quota reservation, and transcript reuse after a failed summary. Website validation passes for ten pages and 220 links/assets.

Live deployed checks passed for text summaries and both WAV and M4A recording transcription followed by Luna summaries. Original text and transcripts were preserved, completed results were reused, and the synthetic account was deleted. Both published privacy URLs match the generated page. Landing version: `06962575-36e4-41ed-bb53-09d40b166240`. Synthetic speech can prove the integration works; it does not establish equal accuracy across real accents, background noise or user recordings. No mobile release is required for this server-side switch; no new device benchmark was performed.
