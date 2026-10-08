# Dream AI pricing strategy

8 October 2026. Priority: growth and repeat use, as confirmed by the owner.

## Recommendation

Test a useful Free journal and one Premium plan at **£3/week or £29.99/year**. Weekly billing and the £3 weekly price follow the owner's chosen direction. The annual price remains the earlier proposal and needs a separate decision. Keep both billing periods easy to choose. Let users save their dream and experience enhanced entries before an upgrade request. The stronger long-term subscription promise is a journal that helps users notice what recurs across their dreams.

£3/week is the owner-selected UK launch price; its willingness to pay and retention impact remain unvalidated. The annual amount is a proposal. Neither amount was configured or verified in the stores. Target country, live prices, conversion, revenue, churn, and actual operating costs were not supplied. The working assumptions are a consumer mobile product, individual buyers, self-serve acquisition, and no established retention baseline. Other markets should receive deliberately chosen local store prices, displayed using the store's localized price strings.

## What the current product earns money from

The current source supports written dreams, saved entries, editing, sharing, favorites, audio capture/playback, voice transcription, and per-entry AI structure. `util/processDream.ts` asks GPT-4o mini for a title, cleaned transcript, tags, mood, summary, and keywords. It does not implement a substantive interpretation or analysis across historical entries.

The editor opens a paywall when an unsubscribed user continues with text, and gates opening the recorder. The summary route can also present a paywall during audio processing. Prices and products come from RevenueCat offerings; no live offering or checkout price was verified.

The current onboarding offer presents voice recording, transcription, and AI summaries. It can show a lower-priced offering after declining or cancelling if suitable RevenueCat metadata and products exist. That is a conditional capability, not evidence that a live discount is configured. The subscription provider has changed during this assessment; older findings about its listener lifecycle should not be treated as current. The editor and audio processing callers still inspect subscription state captured before presenting the paywall.

Saved details currently omit the AI summary. There is no implemented recurring-themes or historical-comparison screen in the inspected source. Selling those outcomes requires building them first.

**Commercial judgment:** titles and summaries are useful conveniences, but weak recurring differentiation by themselves. Faster capture can win the first session; a useful personal history is the stronger reason to keep subscribing.

## Alternatives and current market evidence

Checked primary product pages and developer store descriptions on 8 October 2026. Listed features are vendor claims; this assessment did not purchase or test competitors.

| Alternative | Published offer | Implication for Dream AI |
| --- | --- | --- |
| [Dreamlore](https://play.google.com/store/apps/details?id=com.mlazaro.dreamlore) | Developer lists $4.99/month or $29.99/year, unlimited free voice/text capture, 3 free interpretations/month, and paid weekly reports | A close substitute advertises more than summaries at a modest price. These are published USD figures, not a verified localized checkout. |
| [Oniri](https://www.oniri.io/faq) | Free core journal; Premium adds interpretation, lucid-dreaming tools, and richer statistics. Active pricing varies by region and period. | Core journaling is already available free. Its [UK App Store listing](https://apps.apple.com/gb/app/oniri-dream-journal-meanings/id968737914) contains multiple purchase prices without enough detail to establish the active monthly/annual offer. |
| [Dreams Journal](https://dreamsjournal.co/) | Pricing section lists unlimited saved dreams and 2 AI interpretations/month free; Dreamer at $72/year with analysis and historical insights | Recurring value is framed around interpretation and history. The page has inconsistent free-preview wording elsewhere; use its pricing table as a provisional benchmark. |

A notes app, voice recorder, and a general AI assistant are also practical substitutes. Dream AI needs to reduce capture effort and make revisiting a personal history useful enough to justify keeping another subscription.

## Proposed packaging

The following is a product proposal; several items need implementation. It does not describe existing entitlements.

| | Free | Premium |
| --- | --- | --- |
| Price | £0 | £3/week or £29.99/year |
| Person | Curious or occasional dreamer building a habit | Regular dreamer who wants easier capture and structured entries |
| Written journal | Unlimited text entries, editing, favorites, and access to existing entries | Same |
| Raw voice capture | On-device recording and playback, without requiring transcription | Same |
| Enhanced entries | 3 successful AI titles/summaries/tagging jobs per month | 15 successful jobs per week |
| Cloud voice transcription | 6 minutes per month | 30 minutes per week |
| Reminders and ownership | Basic reminders, account recovery, deletion, basic export | Same |
| Later differentiation | Basic browsing and user-entered tags | Weekly reviews, related dreams, and historical comparisons once shipped |

An enhanced entry is one successful AI structuring job, whether the original input was text or voice. Transcription has a separate minutes allowance because audio duration drives cost. Display both allowances clearly; do not call either unlimited. The proposed counts are generous starting budgets to measure, not discovered user requirements. Failed requests and technical retries should not consume another allowance. Deliberate regeneration can count as a new successful job.

Both weekly and annual Premium receive the same weekly allowances. Reset them every seven days from the initial Premium activation, with no rollover; changing billing period must not grant an extra allowance. Annual buyers receive weekly replenishment rather than the entire year's allowance upfront. Free allowances continue to reset monthly.

Free raw voice capture requires persisted local audio and a flow that works without transcription. It cannot be enabled by simply removing the existing recorder gate. Cloud storage allowances and retention also need separate sizing; unlimited text entries must not imply unlimited cloud audio storage.

Keep the journal usable when an allowance runs out or Premium expires. Preserve existing text, recordings, and generated results. Gate additional processing rather than access to the user's history. Privacy protections and account recovery belong in the basic product. A polished PDF book could become a paid feature later; basic data portability should remain available.

Use a flat individual subscription, with processing allowances as cost controls. Charging per seat has no fit here. Selling every dream as a consumable at launch would add friction to the habit being built. Two plans are enough; there is no evidence of a separate power-user or enterprise segment yet.

## Annual price and trials

£3/week totals **£156 over 52 weekly payments**. The unchanged £29.99 annual proposal equals about £0.58/week and saves **80.8%** against those payments. This is a substantial pricing gap: retain the annual figure here as the previous proposal, not an approved live price. Review it separately before configuring the offer. Show “£3 billed every week” and the full annual charge prominently. Validate both choices against retained paying users and net revenue.

Start with the free processing allowance as the preview, without card details or a countdown. Dreams are intermittent: a short time-based trial can expire before someone has enough material to judge value. Test a seven-day store trial later if users want more Premium exposure and trial-to-paid retention supports it. Do not advertise a trial until the store products and eligibility support it.

Use weekly and annual billing as the two paid choices. Avoid lifetime access to ongoing cloud AI at launch. Delay automatic discount-after-decline offers while measuring the base offer. A second paywall before the first saved entry adds friction and makes the main price harder to evaluate. This is a strategy recommendation; the conditional offer code was not changed.

## Where the upgrade belongs

1. Save the original dream locally and show that it is saved.
2. Offer an optional enhanced entry or transcription using the free allowance.
3. Let the user review and correct the result, and make it visible when revisiting the dream.
4. At the processing limit, explain the additional allowance Premium supplies and show weekly and annual options.
5. Allow continuing with the basic journal immediately.

Keep a voluntary Premium entry in Settings. An onboarding offer can be tested later, but it should not be necessary to complete a first saved entry. Measure paywall placement separately from price.

Example current-feature offer:

> Speak your dream. Keep it clearly.
>
> Turn recordings into text, with AI titles, summaries, and keywords you can review.
>
> £3 billed every week · or £29.99 billed yearly
>
> Continue with Premium / Keep using Free

After historical insights ship, test a stronger promise: “Notice the themes that keep returning.” Each observation should link to the entries behind it. Do not sell definitive meanings, improved sleep, or lucid-dreaming results that the app has not established.

## Cost model

The inspected code uses GPT-4o mini for structuring and Whisper for transcription. Current official rates are [$0.15 input / $0.60 output per million tokens](https://developers.openai.com/api/docs/models/gpt-4o-mini) and [$0.006 per audio minute](https://developers.openai.com/api/docs/models/whisper-1).

Illustrative assumption per enhanced entry: 2,000 total input tokens, including the prompt, and 750 output tokens. That costs $0.00075. Actual prompt length and dream length must be measured.

| Fully used allowance | Illustrative direct AI cost |
| --- | --- |
| Free: 3 jobs + 6 audio minutes per month | $0.03825/month |
| Premium: 15 jobs + 30 audio minutes per week | $0.19125/week |
| Premium: monthly equivalent using 52 weeks / 12 months | $0.82875/month |

These USD amounts exclude retries, storage, bandwidth, support, store commissions, taxes, refunds, and future historical-insight processing. They are not total unit economics or margins. UK receipts and USD costs require a current exchange rate in the operating model.

Even a small free allowance has a growth cost: 10,000 free users fully consuming it would cost about $382.50/month in direct AI alone. At 2% paid conversion among equally active users, each paying user effectively supports about 49 free users; combined maximum direct AI cost is approximately $2.70 per paying user per month before the other costs. This is a sensitivity example, not a conversion forecast. Annual pricing must remain viable at the observed usage mix.

Before rolling out quotas, move AI calls behind authenticated backend jobs, enforce allowances there, deduplicate retries, and rate-limit abuse. Client-embedded server keys and client-only subscription gates cannot protect this cost model. Bound input length and audio duration; show limits before processing and preserve the original entry regardless of eligibility.

## Validation for a growth objective

First establish reliable capture and purchase unlocks. Then ship the free preview and measure behavior before changing several commercial variables together.

Track successful first save, successful first enhanced entry, distinct journaling days over 14 days, day-7/day-28 return-to-journaling rates, allowance usage, paywall views, completed purchases, refunds, purchase-to-unlock failures, and weekly paid renewals. Track first renewal and continued paid retention after four weeks separately; annual subscribers are a separate cohort and cannot demonstrate renewal within four weeks. Instrument successful events rather than button presses. Keep dream content out of analytics.

Suggested primary habit measure: the proportion of activated users saving dreams on at least three distinct days in their first 14 days. Report entry counts separately so a single burst is not mistaken for a recurring habit. Track paid retention separately from journal engagement.

Interview 10–15 users who have saved several dreams. Include free repeat users, subscribers, and people who viewed an upgrade and declined. Ask which result they would miss, which alternative they use, how often they recall dreams, and whether a concrete Premium bundle is worth £3/week, and what outcome would justify renewing at that price. This is qualitative direction, not a statistically reliable price estimate. A later Van Westendorp survey should show the exact package and billing period and include enough qualified respondents to examine separate occasional/regular segments.

Once traffic supports it, compare the chosen £3/week against a lower £2/week hypothesis while holding the package, paywall placement, and annual offer constant. Decide sample size and minimum worthwhile effect using the observed baseline; do not declare a winner after an arbitrary small install count. Judge retained paying users and net revenue after costs alongside day-28 journaling. Report migration to the annual choice as part of the result: a higher weekly price also changes the annual discount's appeal. A higher immediate conversion rate alone is insufficient.

Add weekly reviews and related dreams when the journal has enough entries to support them, then test whether those features improve repeat use and renewal. Use that evidence to assess whether £3/week earns sustained renewals and to set a coherent annual price for new customers. Keep existing buyers on their agreed terms while deciding any future migration.

## Scope of this assessment

Read the current app source, the local audit, the invoked pricing skill and its packaging/research references, and current primary competitor/model sources. Created this report only. No application code, store prices, RevenueCat offerings, live accounts, or provider settings were changed. No live usage metrics or purchase/device behavior were verified.
