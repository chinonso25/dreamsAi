# Cloud reads and offline journals

TanStack Query manages the journal's cloud reconciliation and backend entitlement reads. The local journal remains the durable source for screens, edits, recordings, pending uploads, and deletion tombstones.

`CloudQueryProvider` owns the shared QueryClient, Expo network reachability, and native app focus. `CloudJournalSync` keeps a single journal query observed across navigation. Queries pause offline and resume when connectivity returns. Saves and edits still persist locally before capture clears its draft, and queued writes flush before cloud changes are reconciled.

Keys are scoped as `['account', ownerId, 'journal']` and `['account', ownerId, 'entitlement']`. Identity transitions cancel obsolete reads, invalidate current reconciliation state, and remove other owners' cached results. Account deletion cancels and clears that owner's queries. Transport passes both the expected owner and Query's abort signal; reconciliation checks ownership and request generation before applying responses.

Journal reads use a 60-second freshness window. Explicit refresh bypasses freshness while sharing an in-flight request. Local writes mark reconciliation stale without starting redundant fetches. The existing sync protocol consumes pages and deletion deltas and publishes its checkpoint after the final page. Query caches only reconciliation metadata; cached snapshots cannot overwrite offline edits.

Transient cloud failures receive at most two retries with bounded exponential delay. Authentication, account changes, and malformed data do not retry. Pull-to-refresh observes both pending writes and the complete cloud-read lifecycle. Offline messaging follows reachability and clears automatically after reconnecting.

Backend entitlement reads use a 30-second freshness window and no automatic retries. Explicit purchase and restore checks request fresh data, sharing overlapping reads. Native RevenueCat identity, fresh SDK results, and backend enforcement remain in place. Entitlement data is not persisted as an indefinite offline grant.

The journal's existing record persistence supplies cold-start offline access. A second persisted Query cache or persisted mutation queue would duplicate the same entries and writes. Local journal operations therefore continue through the durable outbox, rather than a second `useMutation` queue. Summaries and uncached remote recordings require connectivity.

Regression tests cover request deduplication, freshness, complete fetch indicators, offline saves and reconnect uploads, preservation of offline edits, query errors, account cancellation, native focus/reachability, and entitlement isolation. Test clients disable garbage-collection timers with `gcTime: Infinity`; the app retains a five-minute collection window.
