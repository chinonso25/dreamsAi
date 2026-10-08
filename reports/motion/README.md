# Motion and simplified Search verification

Verified on the iPhone 17 Pro iOS 26.5 development simulator on 8 October 2026.

Search now opens with one input, Calendar and Filters, and the chronological dream list. Search scope, period, favorites, ordering and optional theme browsing are in one sheet. Native checks covered searching `chicken`, transcript-only results, resetting filters without clearing the query, theme expansion, calendar selection, and capture/recorder opening and dismissal. Existing saved dreams and the empty draft were preserved.

Reanimated 4 supplies 120 ms press responses, 150 ms selections, 250 ms container reveals, paused decorative artwork and recording loops, and progress transforms. Native navigation stays native; peer tabs do not slide. Expo Haptics distinguishes selection, action, successful persistence and errors. Tests cover cancellation, disabled actions, unsupported haptics, live Reduce Motion changes, background/unfocused loop suspension and recording preparation/retention boundaries.

TypeScript and targeted ESLint pass. Seven focused suites pass (60 tests). The simulator verifies rendering and interactions; release-build animation feel and haptic strength/timing still need a physical iPhone and Android check.

- `search.png`: final simplified Search.
- `native-motion-simplified.mp4`: native Home, Search, calendar and filter interactions after simplification.
- `native-motion.mp4` and `calendar.png`: earlier motion checks before the Search simplification.

The grey gear visible in screenshots is the Expo development-client overlay.
