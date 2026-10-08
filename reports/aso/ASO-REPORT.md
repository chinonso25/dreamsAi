# The Dreamer ASO — four English markets

Client date: 8 October 2026. App Store ID: **6740153274**. Scope: the existing **1.0.4 draft**, US/UK/Canada/Australia English metadata, keyword research, and screenshot copy. **Saved and verified:** all four locales have the exact prepared fields in App Store Connect; version 1.0.4 remains PREPARE_FOR_SUBMISSION. The owner chose the name/subtitle pairing below. The live 1.0.3 listing and binary are separate release surfaces.

## New positioning

Capture the dream before it fades; return to your own words and voice later. This is a dream journal with optional AI transcription and summaries. The inspected backend summarises recorded content and extracts mood/tags; it does not implement a dream dictionary, substantive symbolic interpretation, lucid-dream training, sleep tracking, or automatic reports across entries. Those are excluded from the new listing.

| Field | Before | Improved | Count |
| --- | --- | --- | --- |
| Name | Dream Journal: Dream AI | Dream Journal: The Dreamer | 26/30 |
| Subtitle | Transcribe dreams using AI | Voice Diary & AI Summaries | 26/30 |
| Keywords | Repeated dream/journal phrases, comma spaces, generic dream analysis | dream recorder,dream recall,audio journal,night notes,mood log,reflection,transcription,memories | 96/100 bytes |
| Promotional text | Use AI to decipher your dreams!appl (live); empty in draft | Keep the dream before it fades. Write or record it, choose voice-to-text and AI summaries, then revisit your words, moods, and themes. | 134/170 |
| Description | Long question, “ultimate” claim and “unlocking the secrets” | Clear opening, capture/voice/summary/search benefits, realistic subscription and cloud-processing explanation | 1,847 US/CA; 1,849 UK/AU / 4,000 |
| Privacy URL | faith-tech.io/privacy-policy | https://thedreamer.app/privacy | HTTP 200 |
| Support URL | faith-tech.io | https://thedreamer.app/support | HTTP 200 |
| Marketing URL | Empty | https://thedreamer.app/ | HTTP 200 |

All descriptions retain the Apple standard EULA URL. US/Canadian copy uses organize/favorites/canceled; UK/Australian copy uses organise/favourites/cancelled. Both pairs share the same concepts. No local prices, discounts, trial claims or unlimited AI allowance are introduced.

## Keyword decision and evidence

The app already had “dream journal” in its title, so this is an improvement to differentiation, accuracy, and conversion copy, not evidence of a new ranking opportunity.

| Candidate | Assigned surface | Intent and decision | Popularity / difficulty |
| --- | --- | --- | --- |
| dream journal | Name | Strongest product fit; common title vocabulary across the four storefronts. Retain it and align the brand with the app/site. | Unmeasured |
| voice diary | Subtitle | Captures the voice workflow and communicates what the app does. A positioning hypothesis, not a measured-volume winner. | Unmeasured |
| AI summaries | Subtitle | Accurately names the implemented AI result. | Unmeasured |
| dream recorder; dream recall | Keyword field | Recording and keeping dreams are the core use case. | Unmeasured |
| audio journal; night notes | Keyword field | Alternative ways to describe recorded/night-time entries. | Unmeasured |
| mood log; reflection | Keyword field | Mood, tags and revisiting entries support this intent. | Unmeasured |
| transcription; memories | Keyword field | Secondary feature/use-case candidates to validate. | Unmeasured |
| dream interpretation; dream dictionary | Excluded | Searchers expect functionality not implemented here. | Not used |
| lucid dreaming; sleep tracker; sleep talk recorder | Excluded | The app does not provide training, sleep measurements or unattended night recording. | Not used |

No Astro or other keyword-volume service was available. Twelve Apple Search API queries cover dream journal, dream diary and voice dream journal in US, GB, CA and AU. Oniri, DreamKeeper, Dreams and Dream Journal Ultimate appear across the category queries; voice results also include dedicated voice-journal products. Listings and descriptions are evidence of vocabulary and competing product positioning, not verified usage or effectiveness. API order is not an on-device ranking measurement; results are neither a popularity estimate nor a difficulty score. No Apple autocomplete ordering is claimed.

The invoked skill asks for readable keyword phrases. The 96-byte field follows that convention, with no duplicate complete phrase across fields. Some component words overlap the name/subtitle; Apple's general guidance recommends avoiding duplicated words. A compact token alternative may cover more combinations, but no controlled ranking evidence here establishes which encoding performs better. The phrase form is an explicit skill-led choice rather than a proven indexing advantage.

## Files and checks

- `fastlane/metadata/en-US`, `en-GB`, `en-CA`, `en-AU`: name, subtitle, keywords, promo, description, release notes, privacy/support/marketing URLs.
- `field-validation.json`: limits and byte counts for every text field in each locale.
- `evidence/`: before-state App Store Connect/public data, four-market search snapshots, URL checks, and skill provenance. No authentication secrets are included.
- `asc-verification.json`: successful saves are only claimed when each exact value is returned by a subsequent GET. The version must remain PREPARE_FOR_SUBMISSION.
- `screenshots/headings.json` and `screenshots/README.md`: six frames of English copy, recommended order, colour direction and exact app screens required.

Apple automatically created an empty version-localisation record after the new en-US app-info localisation was added. An attempted version-localisation creation returned HTTP 409. The save process was corrected to refresh the records before every update, then update the automatically created entity and read it back. The intermediate partial-verification record is retained as evidence, not reported as completion.

## Screenshot work and remaining release steps

Four inherited 1320 × 2868 iPhone images were present in the draft before this task. Their replacement was not uploaded. Existing desktop QA screenshots have simulator controls/cursor overlays and show an older layout. A fresh simulator capture showed the new journal home, but included a settings pointer overlay and non-marketing entry content; it is not a finished store asset. Use clean, current app captures with deliberate synthetic entries to build the six-frame campaign.

Before releasing 1.0.4, pair this text with the appropriate binary, verify the advertised capture/transcription/search/export behaviour on that build, and replace screenshots to match its UI. Check the release's privacy and review information against that binary. The description/release notes reflect inspected source capabilities, not proof of the publicly downloadable 1.0.3 app.

No app price, territory pricing, subscription product, availability, category, review contact, rating questionnaire, privacy survey, app binary, or submission/release setting was changed. Lifestyle / Productivity categories were read from the draft and retained. App Store Connect access and fastlane 2.239.0 were available; the screenshot renderer's dependencies were not installed because no clean final screenshot backgrounds were ready. The app's UI is already English, so no in-app translation or localisation build was needed for this market set.

## Measure the result

Use a comparable pre/post window in App Store Connect for each storefront: search impressions, product-page views, first-time downloads and conversion, separating App Store Search from other traffic. Track keyword ranks with a real ASO service before considering a keyword-led name change. Do not interpret a metadata save as improved rankings or conversion. A release that changes both the product and the store creative is not a controlled metadata-only experiment.

## Primary references

- Invoked skill: https://github.com/Kronop/vibe-aso/blob/main/skills/vibe-aso/SKILL.md (commit fdc1b0bbd4712509aa623d98c51953aa016a34a7)
- Apple product-page guidance: https://developer.apple.com/app-store/product-page/
- Apple field reference: https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/
- Public listing at inspection: https://apps.apple.com/gb/app/dream-journal-dream-ai/id6740153274

The skill's claims about positional indexing weight and exact popularity/difficulty thresholds were not treated as established Apple facts. This work uses product relevance and live field verification, and states the limitations of the available keyword evidence.
