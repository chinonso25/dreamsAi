# App Store website setup

Prepared 8 October 2026 for The Dreamer / Dream Journal: Dream AI (App Store ID 6740153274), published by LEVITES TECH LTD.

## URLs for App Store Connect and paywall configuration

| Field or use | URL |
| --- | --- |
| Privacy Policy URL | https://thedreamer.app/privacy |
| Support URL | https://thedreamer.app/support |
| Marketing URL | https://thedreamer.app/ |
| Terms / service information | https://thedreamer.app/terms |
| Standard iOS app EULA | https://www.apple.com/legal/internet-services/itunes/dev/stdeula/ |
| Account and data deletion information | https://thedreamer.app/delete-account |
| Purchase and cancellation help | https://thedreamer.app/subscriptions |
| Publisher contact | https://thedreamer.app/contact |

Use the privacy and terms URLs in RevenueCat's hosted paywall legal links. Apple’s standard EULA remains the app license; publishing /terms does not register a custom EULA with Apple. Support pages show the publisher address and published corporate support email founder@levites.app. Cloudflare inbound routing for hello@thedreamer.app was disabled during inspection, so it is not used as the support destination.

The old App Store description links to faith-tech.io/privacy-policy, a page identifying a different app (Yada - Bible Trivia). Replace that link with the Dreamer-specific policy in the next metadata update. Retain an Apple standard EULA link if using the standard license. This task did not modify App Store Connect or RevenueCat dashboard fields or release an iOS build.

## Completed locally and on the website

Six public pages: privacy, terms, support, subscriptions, account/data deletion, and contact. They are included in the XML sitemap and website footer. Common /privacy-policy, /terms-of-use, /terms-and-conditions, /help, and /account-deletion paths redirect to the canonical pages.

The current app source includes Settings links to privacy, terms, support, subscription help, and deletion information, and onboarding-offer links to privacy and terms. Those mobile changes take effect only in a newly distributed build.

## Remaining review work identified from the source

These pages are not proof that the binary passes review:

- Apple guideline 5.1.2(i) requires clear disclosure and explicit permission before sharing personal information with third-party AI. The inspected Dream detail action sends an AI processing request; an explicit provider/data-sharing consent control was not verified or added in this page task. Review and implement the required consent before submitting the new build, including retries.
- Sentry initialises in production. Amplitude and its journal-save event have been removed from the current app source. Older released binaries can still contain it. Confirm the lawful basis and any required consent, SDK configuration, privacy manifests, and App Privacy answers against the actual submitted binary.
- Current in-app deletion is limited to email accounts. Apple also expects deletion support for automatically created guest accounts. The public deletion page truthfully describes the existing guest support path; that path does not substitute for the required in-app guest deletion flow. Confirm and complete guest account deletion before submission.
- Review supplier data-processing agreements, analytics/diagnostic retention settings, international-transfer safeguards, legacy Supabase/OpenAI records, and privacy-request handling with the operator. The public policy states retention criteria and does not invent exact provider expiry periods or promise every provider record is instantly erased.
- App Privacy disclosures must reflect the release, including journal/audio user content, account email/IDs, purchase data, usage/device identifiers, and diagnostics as applicable. This task did not certify the existing App Store privacy labels.
- Test email-account deletion, guest deletion once implemented, restoration/cancellation, legal links, cloud processing consent, and account recovery on the build being submitted. A source typecheck is not device proof.

## Primary references

- Privacy and AI consent: https://developer.apple.com/app-store/review/guidelines/ (5.1.1 and 5.1.2).
- Account deletion: https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion.
- Required support URL and contact information: https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/.
- Privacy notice information: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/.
- Controller registration: https://find-and-update.company-information.service.gov.uk/company/17059524.
