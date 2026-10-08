# The Dreamer landing site — 8 October 2026

Deployed to https://thedreamer.app using Cloudflare Worker `thedreamer-landing`.
Final deployed version: `1165c224-fc8e-4e3a-8d9b-d6b2a409bc01`.

## Implemented

- Responsive lavender landing page using existing app art and local Outfit fonts, with an illustrative journal preview and verified App Store links.
- About page establishing The Dreamer / Dream Journal: Dream AI identity and publisher LEVITES TECH LTD.
- Two original, helpful journaling guides, seven accessible native FAQ disclosures, and clear subscription information without unverified store prices or ratings.
- Static HTML, unique titles/descriptions, canonical URLs, social cards, Apple Smart App Banner, descriptive image alt text, reduced-motion support, and versioned stylesheet URLs.
- Organization, WebSite, WebPage, MobileApplication, Article, BreadcrumbList, and visible-content-matching FAQ JSON-LD as appropriate.
- XML sitemap, permissive robots.txt, optional llms.txt, proper 404 responses, security headers, and a permanent www-to-apex redirect preserving path/query.

## Verification

- Build and check passed: four indexable pages and 52 local links/assets, JSON-LD parsing, visible FAQ/schema parity, image dimensions/alt attributes, sitemap and robots.
- Desktop visual inspection at the default 1280px viewport, iPhone at 390px, and small phone at 320px. Final mobile document width equals viewport width at both 390px and 320px.
- Mobile FAQ expansion and internal guide navigation worked. All page images loaded.
- Public DNS via Cloudflare (1.1.1.1), Google (8.8.8.8) and Google DNS-over-HTTPS resolved the domain.
- HTTPS requests with the public DNS answer pinned via curl --resolve passed certificate verification. Homepage, about, both guides, robots, sitemap, llms and social card returned 200. Missing page returned 404; /download returned the correct App Store 302.
- Final public HTML for all four pages matched the generated build byte-for-byte.
- www returned a 301 preserving the full path and query.
- Requests with Googlebot, OAI-SearchBot, PerplexityBot and Claude-SearchBot user agents returned 200 and complete HTML. This is not verification from vendor IP ranges.
- Existing linked privacy policy returned 200. App Store identity and ID were verified using Apple’s lookup API in GB and US.
- git diff --check passed. Existing mobile and backend edits were preserved.

## Limits / next step

The computer's default resolver and in-app browser retained a negative DNS lookup at the end of verification; public DNS and the HTTPS origin checks succeeded. Saved screenshots show the locally served build, whose HTML matches production. No public browser screenshot or performance score is claimed.

Search Console / Bing domain verification, sitemap submission, real crawler logs, indexing, rankings, AI citations, conversion measurements and real-user Core Web Vitals remain unverified. Instructions are in landing/README.md. llms.txt is an optional discovery convenience, not a ranking guarantee or Google requirement.
