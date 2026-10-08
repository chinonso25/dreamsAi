# Home, Journal, and Search

Implemented and checked on 8 October 2026.

| Before | After | Purpose |
| --- | --- | --- |
| Journal combined recording, statistics, search, calendar, and filters | Home, Journal, and Search have separate navigation tabs | Each screen has one clear purpose |
| Dreams / this month / favorites statistics | Removed from the main screens | More room for actual dreams |
| Recording banner on the journal timeline | Home capture card and Journal header add button | Journal opens straight into entries |
| General search only | Everything, Themes, and Transcripts | Find saved dream text or focus on specific fields |
| Calendar selected individual dates | Matching dots, month browsing, and month/year jump | Browse both a month and an individual day |
| Only newest order | Newest/oldest order, grouped by dream month | Chronological browsing uses dream date before capture date |
| Large settings account banner and full legal list | Compact grouped settings and expandable legal links | Less visual clutter |

Search includes title, transcript, original capture, summary, themes/tags/keywords, mood, location, and readable dream date. Query terms are combined, case and accent insensitive. Theme filters deduplicate spelling case, and combine with favorites and date bounds. Transcript results show an excerpt around a match. Audio needs saved transcription to be searchable as words.

Design references: [Day One filters](https://dayoneapp.com/guides/getting-started-with-day-one/filters/) and [Apple Journal search and sorting](https://support.apple.com/en-gw/guide/iphone/iph6257be047/ios).

Validation:

- TypeScript: `tsc --noEmit` passed.
- ESLint on changed screens/components passed.
- 24 tests passed across journal discovery and existing journal persistence/sync tests.
- iPhone 17 Pro simulator: visually inspected populated Home, Journal, Search, and Settings; tested transcript search for chicken, theme chip filtering, Home theme-to-Search navigation, favorite empty state, oldest sort, calendar date selection, empty dates, month browsing, year/month jump, and Settings Back returning to Search.
- Browser: inspected Home at 393 × 852 with an empty journal.
- Existing saved dreams were used for native checks; no test dream was created.

Screenshots: [Home](home.png), [Journal](journal.png), [Search](search.png), [Calendar](search-calendar.png). The floating gear in native captures is the development client's overlay.

Work is local. Android and physical-device checks were not performed.
