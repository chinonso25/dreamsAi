# App Store pages — 8 October 2026

Cloudflare deployment `b24d507a-ab89-4bdc-9401-8d4c600ddd76` published the new app-specific privacy, terms, support, subscriptions, deletion and contact pages.

All six public pages returned HTTP 200 through normal DNS and HTTPS and matched the generated HTML exactly. All five compatibility aliases returned HTTP 301 to the right canonical paths while preserving query strings. The live sitemap includes all ten pages. The site checker passed 220 local links/assets, structured data, FAQ parity and image/metadata checks. TypeScript and ESLint checks passed for the app Settings and onboarding legal-link changes; git diff --check passed.

Live support was visually inspected at desktop and iPhone sizes. Support-to-privacy navigation and the privacy table of contents worked. At 390px, document width remained 390px; the 500px data table scrolls inside its own container. Saved screenshots are support-live-desktop.jpg, support-live-mobile.jpg and privacy-live-mobile.jpg.

The old privacy URL described another app and was replaced on the site. Cloudflare inbound Email Routing for the Dreamer domain was disabled, so contact/support links now use the publisher’s publicly listed founder@levites.app address. No support/test email was sent, no new inbox was created and no provider access was expanded.

The app source now links to the live pages from Settings and the onboarding offer. This task did not distribute an iOS build or update App Store Connect/RevenueCat configuration. APP_STORE_SETUP.md records exact URLs and remaining explicit AI-sharing permission, optional analytics controls/disclosures, guest deletion and binary/device verification work. Website creation is not a full compliance certification.
