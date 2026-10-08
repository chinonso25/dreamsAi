# Usability and readability review — 9 October 2026

The core journeys now use plain instructions, visible action labels, larger text, and controls that reflow at enlarged text sizes. Home leads with Add a dream; Journal contains saved dreams and Favorites; Search opens with one field, Calendar and Filters. Theme, full dream-text, date and favorite search remain available.

## Repairs

- Actions such as Settings, Add dream, Back, Close, Favorite and Play have visible labels. Decorative icon glyphs are excluded from accessibility labels, and the reminder switch is separately accessible.
- Main action and body text is generally 16–17 points; secondary metadata is generally 14 points. The navigation grows with system text size. Dense calendar dates, navigation labels, large headings and pinned capture actions allow up to twice the default size; other text continues to scale with the system.
- At larger sizes, filters and Journal selectors stack, calendar rows grow, decorative capture art is hidden, and recording actions remain outside the scrolling content. Content insets account for the taller navigation and playback bar.
- Purple text on white now has a calculated contrast ratio of 5.91:1; purple on the selected pale background is 4.89:1. Muted text on the page background is 4.64:1.
- Date selection previews changes until Done. Cancel discards the preview; Android dismissal does not commit a date.
- Sorting presents explicit Newest first and Oldest first choices. Selecting a calendar date returns directly to dream results.
- Leaving a changed dream edit offers Keep editing or Leave. The edit form starts at its top and explains that Save changes is required. Cancel restores the saved dream.
- Settings sheets scroll and respond to the keyboard. Existing account, billing, export, reminder, recording ownership and persistence behavior is retained.
- Existing restrained animation, Reduce Motion behavior and haptics remain in place.

## Verification

Inspected native renders on iPhone 17 Pro / iOS 26.5 with normal, extra-extra-extra-large, accessibility-large and the largest accessibility text setting. Checked Home, Journal, Search, search scope, matching dream text, calendar date selection, date ordering, new dream capture, date cancellation, recording entry, dream reading, unsaved-edit protection and Settings/account sheet. Restored the simulator's original `large` text setting afterward.

Native date cancellation was checked by previewing 6 October and canceling: the saved draft date stayed 8 October. An unsaved title preview was discarded through the leave confirmation; the existing Eating Chicken title remained unchanged. No new recording was captured, no dream was saved/deleted, and no account code, purchase, export or notification action was submitted.

66 focused tests pass across date selection, explicit sorting on native and web, motion, haptics, recorder, audio playback, drafts, journal persistence and search. Typecheck and targeted ESLint pass. This is a simulator review, not a user study with an older adult or a complete VoiceOver audit. Physical haptic feel still needs a real iPhone check.

Screenshots are local native captures. The floating gray gear is the Expo development client, not part of the production UI.

Reference: [Apple accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility) and [Larger Text evaluation criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/larger-text-evaluation-criteria).

## Screenshots

- [Home](home.png)
- [Journal](journal.png)
- [Search](search.png)
- [Search with enlarged text](search-large.png)
- [Add a dream](capture.png)
- [Account sheet with enlarged text](account-large.png)
