# Dream AI onboarding

Implemented on 8 October 2026 from the supplied onboarding-structure reference. The attached keychain warning belongs to a different application and was not treated as an onboarding requirement.

The flow contains 19 screens: welcome, six single-question quiz screens, an answer-based recall snapshot, two dream-journaling challenges, a side-by-side routine comparison, a review/reflection screen, three feature previews, an animated routine reveal, the personalized routine, optional permissions, and a subscription introduction. A twentieth screen offers a configured lower-priced subscription after declining the first offer.

The quiz answers and current step persist locally. The resulting routine uses the selected goal, cadence, input preference, obstacle, and recurring-dream preference, and remains visible on the journal home screen. Back navigation retains answers. Existing onboarding links redirect into the new flow. Existing completed users keep access to the app.

## Artwork

Three transparent PNG illustrations were generated with the built-in imagegen tool and visually inspected: a crescent moon, an open dream journal, and a microphone. They use a shared lilac, ivory, and periwinkle 3D style. The illustrations float gently; reduced-motion settings disable that motion. Short screens use smaller artwork and typography.

Assets and full prompts: [artwork manifest](../assets/images/onboarding/README.md).

## Genuine reviews and store offers

- Add verified, permission-cleared quotes with their rating, author, and source URL to `constants/OnboardingReviews.ts`. The array is intentionally empty. Until reviews are supplied, this stage shows optional reflection prompts. A native rating prompt appears only when the user taps the optional rating action.
- Prices and billing periods come from RevenueCat products. Checkout uses the native RevenueCat paywall, including store-specific trial eligibility and purchase terms. The local introduction never advertises a made-up trial, charge date, or price.
- To enable the decline offer, set `onboarding_discount_offering_id` in the current offering's RevenueCat metadata to an existing offering identifier. Every package in that offering must be cheaper than a current package with the same currency and subscription period. A shown offer is tracked locally so it is offered once. No provider settings were changed.
- iOS preserves the existing app key and permits an `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` override. Android requires its own `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`. Web preview has no native billing initialization.
- Users can continue without Premium, including while store options load or are unavailable. Purchase, cancellation, restore, and errors remain distinct outcomes. Entitlement state uses fresh CustomerInfo and removes listeners on cleanup.

## Permissions

The microphone and a daily 8 AM reminder are optional. Startup restores saved notification preferences without asking for permission. The scheduler replaces only Dream AI reminder notifications, respects opt-outs and permission denial, and preserves unrelated notifications. Settings uses that same scheduler.

## Validation

- TypeScript passed (`npx tsc --noEmit`).
- Focused onboarding and supporting-module ESLint passed without warnings.
- All 23 tests in five suites passed, including routine personalization, malformed saved answers, discount comparisons, current entitlement updates, purchase cancellation/restoration, and reminder opt-outs.
- Browser walkthrough completed the full React Native web flow at 390 × 844, verified persisted answers after reload, optional-permission unavailability, and completion without a purchase. Welcome layout was also inspected at 320 × 568 and desktop size. No horizontal overflow was observed at 320 px.
- Saved screenshots are in `reports/onboarding/`.

The local-only development route is `/onboarding-preview`. It skips authentication, notification scheduling, and billing initialization; it cannot create an account or charge a store purchase. It redirects to regular onboarding outside development.

Native microphone access, native store UI, and real transactions have not been device-tested. No native builds or deployments were performed. Pre-existing workspace changes were preserved.
