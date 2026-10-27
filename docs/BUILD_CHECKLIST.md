# Consolidated build checklist

Updated 27 October 2026. The implementation baseline is the latest committed `master`; see BUILD_STATUS.md for per-feature evidence.

This is the current planning checklist. [BUILD_STATUS.md](BUILD_STATUS.md) is the chronological implementation and validation history; its older future-work statements describe the state at the time and are superseded here. Scope follows section 16 of the [implementation brief](specifications/Folio_Implementation_Brief.txt), with the [blueprint](specifications/Folio_Blueprint.txt) as supporting detail and the accepted [bookshelf/journal requirements](BOOKSHELF_AND_JOURNAL.md) applying throughout. Reference documents are requirements, not permission to deploy, connect accounts or publish content.

## Status meanings

- Checked: the described bounded implementation exists locally. This does not mean production deployment or live-provider verification.
- Unchecked **Partial**: a foundation exists, but the stated remainder is unfinished.
- Unchecked **Not built**: outstanding product capability.
- Unchecked **Deferred**: deliberately waiting for credentials or external setup.
- Unchecked **Release gate**: required operational verification before public launch.

No overall completion percentage is assigned: an integration, marketplace or release gate can be much larger than an individual UI feature.

## 1. Foundation and accounts

- [x] Next.js app shell, responsive navigation, shared UI, PostgreSQL/Prisma and migrations.
- [x] Email/password signup and login; account editing, password changes, device sign-out and account deletion.
- [x] Password-reset and verified email-change flows, expiring single-use tokens and local delivery tests.
- [ ] **Deferred:** configure a real email delivery service and verify delivery, failures and monitoring.
- [x] Library shelves, custom shelves, catalogue/ISBN search, exact-edition addition, ratings and private notes.
- [x] Goodreads CSV import, durable batches, ambiguous-edition review and private JSON export.
- [ ] **Partial:** imports resume when the app opens; a separate background worker and external metadata enrichment are not implemented.
- [x] Chat UI, streaming integration, retry/cancel, library-context assembly and persisted private chat.
- [ ] **Deferred:** live Claude chat and recommendation verification after the user supplies the API key. No live Claude calls are required for the next local build step.
- [ ] **Partial:** chat reading logs use a conservative local parser and confirmation; broader natural-language actions remain unfinished.

## 2. Bookshelf and private book journals ? applies to every phase

- [x] Physical horizontal shelf above Chat: finished-book timeline, rereads/current reads and optional individually selected Up next books.
- [x] Private work-level journal accessible from shelf and Library, collecting original notes, reading sessions, chats and supported feature links across editions.
- [x] Direct book notes, manual external links, saved chat association/refiling and preservation when AI is unavailable.
- [x] Source-linked integration for articles/reviews, paths/gifts, clubs/challenges, discussions, saved card projects, video plans and curated shops.
- [x] Existing integration checks cover ownership, source changes/deletion and private export; public activity does not expose the journal.
- [ ] **Ongoing requirement:** every future book-related feature must use canonical Work IDs, retain source provenance, respect privacy/deletion/export and avoid silently changing shelves or pins.
- [ ] **Partial:** journal/chat records are access controlled, not covered by the new personal-context encryption. Any expansion of encryption needs a deliberate migration, key management and export/recovery design.

## 3. Core reading and discovery

- [x] Direct and chat-confirmed session logging; page progress, session notes/timing, diary statistics and yearly goals.
- [x] Session edits/deletion, reread cycles/history, finish/start-date correction, clearing unknown finish dates, empty-reread cancellation and reopening the current reading.
- [x] Book detail drawer, private notes, sessions and edition comparison; public catalogue book pages.
- [x] Open Library edition lookup, recorded languages/translator credits and controlled-provider integration tests.
- [ ] **Deferred:** successful real-provider verification of the edition metadata flow (earlier live calls timed out).
- [ ] **Partial:** edition credits exist; canonical translation/translator identities and fuller translation hierarchy remain outstanding.
- [x] Browse catalogue search, Continue reading and author catalogue searches.
- [ ] **Not built:** followed-author new-release feed.
- [x] Manual reading-path creation, ordering, publishing and following.
- [ ] **Partial:** AI path generation, expert verification and automatic path progress.
- [x] External bookshop/library search links.
- [ ] **Partial:** live borrowing availability, retail stock/prices and location-aware acquisition. Search links are not availability claims.
- [ ] **Partial:** paginate/optimise larger reading-session histories; the new personal-context diary pagination does not resolve this separate reading-diary backlog.

## 4. Gifts and community

- [x] Private gift contacts, occasions, GBP budgets, book ideas/statuses and in-app upcoming reminders.
- [x] Explicit shared gift links, revocation and authenticated gift claims/releases.
- [x] AI gift expansion implementation with bounded input/output and privacy controls.
- [ ] **Deferred:** live AI gift quality/provider verification.
- [ ] **Partial:** delivered birthday notifications/chat reminders, additional currencies and exact-edition gift selection.
- [x] Opt-in public profiles, separate public reviews, reader follows/feed and explicitly shared shelves.
- [x] Review discussions/reactions, reporting/moderation and review appeals; private review management.
- [x] Book clubs, invitations, schedules and spoiler-aware discussions; private two-person Reading Together.
- [x] Personal book-count challenges, themed bingo, community rule sharing/joining and private charity pledge/receipt tracking.
- [x] Book-linked discussion boards, curated genre/topic spaces and catalogue-name author communities.
- [ ] **Partial:** verified author identities/author-managed pages, reader-created spaces and general discussions without a book.
- [ ] **Partial:** challenge definition editing, participant leaderboards/discussions and subscriptions/notification delivery.
- [ ] **Partial:** review-comment editing/threading, block/mute and broader moderation/account-sanction operations.
- [ ] **Not built:** explicitly publishing imported reviews; imports currently preserve review text privately.

## 5. Creator and social media

- [x] Article editor, public articles/blog, images/book cards, drafts/recovery, review conversion, reports and appeals.
- [x] Downloadable book/quote cards, reading-year recaps and shelfies; saved editable card projects.
- [ ] **Partial:** photo/cover-based shelfies, project duplication, broader draft recovery and saved recap snapshots.
- [x] Private work-linked video plans, scripts/status, one bounded private upload, playback/download and camera/microphone recording.
- [x] Manual WebVTT captions, posting-file ZIP downloads and manually recorded external platform links.
- [ ] **Partial:** scalable media storage/quotas, media processing/transcoding and scanning; current bounded clips are stored in PostgreSQL.
- [ ] **Not built:** public video publication/feed and associated moderation.
- [ ] **Not built:** TikTok/Instagram/YouTube account connections, automated cross-posting and verified publication states. Recording a URL or downloading files does not publish a video.
- [ ] **Not built:** automatic transcription and multiple caption-language tracks.
- [x] Optional curated shops, ordered book recommendations, retailer links, affiliate disclosure and explicit publication.
- [ ] **Partial:** live retailer/affiliate integration. Existing shops do not verify stock/prices or enrol users in affiliate programmes.

## 6. Personal context and Reading Life

- [x] Private context profile and reading-time preferences, encrypted with a dedicated server-managed key.
- [x] Individually encrypted private diary entries with editing, confirmed deletion, pagination, conflict/replay protection and account cleanup.
- [x] Dedicated saved-profile/diary plaintext export, separate from library export; complete-export failure on unreadable records.
- [x] Per-request opt-in AI context controls: saved profile and up to three selected diary entries, exact preview, explicit confirmation, removal, default-off state and consent clearing on request dispatch. Server checks ownership/revisions and decrypts only selections. Local privacy/prompt and browser tests pass; no live Claude calls.
- [ ] **Deferred:** end-to-end live verification of opted-in context after API-key setup.
- [ ] **Not built:** Reading Life marketplace MVP for Reading Objects and Books. Define catalogue/listing behavior and book-journal associations before transactional scope.
- [ ] **Not built:** sensory reading-kit generation.
- [ ] **Not built:** reading-afternoon planning combining weather, places and reading pace.
- [ ] **Not built:** nearby bookshops screen and saved book-related outcomes.
- [ ] **Not built:** nice-editions finder beyond the existing edition comparison/search foundation.

## 7. Public-launch gates

These are outstanding release work, not claims that the local build is already ready for production.

- [ ] **Release gate:** refresh the dependency audit, resolve/test required framework/toolchain upgrades. The historical audit recorded nine high-severity dependency entries; that is not a new audit or nine independent application exploits.
- [ ] **Release gate:** production hosting/database, migration procedure, secret provisioning and consistent encryption keys across instances.
- [ ] **Release gate:** separately protected database/key backups, tested restore and documented retention/recovery. Automated key rotation is not implemented.
- [ ] **Release gate:** cross-instance/edge abuse limits, monitoring, error reporting and operational email delivery checks.
- [ ] **Release gate:** trusted moderator assignment, response process and public-content safety operations before opening public features.
- [ ] **Release gate:** broader integrated regression, accessibility/mobile/browser checks and realistic load/performance testing after remaining work.
- [ ] **Release gate:** complete real-provider checks for enabled integrations; label unavailable integrations honestly.
- [ ] **Release gate:** final deployment review and launch. Nothing has been deployed by the completed local work.

## Scope boundaries and build order

Checkout, payment processing, affiliate payouts and charity payments are not implemented or included in the current bounded shop/pledge features. A transactional marketplace needs an explicit scope decision; it must not be inferred from the existence of recommendations or recorded pledges. Existing downloads and externally posted content cannot be erased by account deletion.

Recommended sequence:

1. Complete this checklist consolidation before further feature code.
2. Completed: explicit AI context-sharing controls and local tests; live verification remains deferred.
3. Next: complete discovery foundations: author releases, acquisition/nearby shops and nice editions.
4. Build the Reading Life marketplace foundation, kits and afternoon planner with book-journal integration.
5. Complete public video/social and delivery integrations as provider access becomes available.
6. Finish release gates and live-provider acceptance checks before launch. Security/operational preparation can proceed alongside feature work.

Future continuations should update this checklist and append evidence to BUILD_STATUS.md. Do not mark a live integration complete because fixture tests pass. Validation is recorded per continuation in BUILD_STATUS.md; targeted regression runs are not a fresh full-product regression.
