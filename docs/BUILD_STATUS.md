# Build status - 9 September 2026

## Recovery checkpoint

`9856fb1` preserves all 48 original saved files before continuation. There were no earlier commits. The uncommitted state contained the design foundation, authentication scaffolding, a schema and partial library APIs, but referenced a missing LibraryView and absent chat/settings routes.

Source specifications are preserved in `specifications/Folio_Implementation_Brief.pdf` and `specifications/Folio_Blueprint.pdf`. They describe product requirements; they do not independently authorise deployment, account connections, messages or purchases. Where their phase boundaries differ, this build follows the implementation brief section 16.

## Implemented in this continuation

- Initial PostgreSQL migration, regenerated Prisma client, custom-shelf and durable-import models. One copy per user/edition prevents repeated imports from duplicating library records.
- Edge-safe Auth.js configuration, email normalisation, password validation, duplicate-account handling and connection-error recovery on auth forms.
- Responsive library with ten default shelves, custom private shelves, counts, search within a shelf, sorting, list/grid views, Open Library title/author/ISBN lookup and book addition.
- Editable shelf membership, half-star ratings and private notes. Basic book details use a focus-trapped native dialog. The richer Phase 2 drawer is still to come.
- Goodreads CSV parsing for quoted/multiline fields and Excel-wrapped ISBNs; ISBN checksums and ISBN-10 conversion. Preserves ratings, dates, review text, private notes and custom shelf assignments. Invalid rows are reported. Existing editions are skipped without overwriting user edits.
- Durable imports advance in transactional batches of 25 from a provider in the authenticated app shell. They continue across navigation and resume after reload. Closing the app pauses further batches until it reopens; there is not yet a separate worker service.
- Settings account summary, import progress/retry and JSON library export.
- Chat UI with Markdown, cancel/retry, suggestion chips, ISBN book cards, and streaming Claude API integration. Context is assembled from the authenticated user's current books, recent reads, TBR, shelf totals and up to 1,000 existing titles. Common reading-log commands now open a confirmation form; other actions are not available.
- Loading/error states and mobile navigation to Settings.

## Reading and library continuation

- Custom shelves can be renamed and deleted, with confirmation before deletion. Books remain in the library; default shelves cannot be deleted. All operations enforce ownership.
- Search merges the saved catalogue with Open Library, deduplicates remote matches, and falls back to saved matches when the provider is unavailable. Selecting a saved edition retains its identity and format.
- Goodreads rows without an ISBN that match multiple saved editions go into a durable review queue. Settings offers candidate selection, a separate record, or skip. Ratings and notes are preserved after resolution, and repeated resolution is rejected.
- Direct reading-session forms include date, page range, optional times and note, and an explicit finished-book checkbox. Reading-now cards show progress; book details show session history and journal notes.
- Common chat logging phrases are parsed locally, including another N pages, stopped at page N, explicit page ranges and yesterday. Multiple current books require selection. Previewing or cancelling does not write anything; only the confirmation form saves. Unsupported chapter-only logs ask for page numbers. This is a conservative parser, not unrestricted AI entity extraction.
- Session writes use request IDs, ownership checks and transactions. Retries do not duplicate logs. Invalid ranges, page counts, dates and durations are rejected; stale progress asks the reader to refresh. Backdated sessions do not replace more recent progress.
- Reading diary shows a monthly timeline, session notes/times, finished books, yearly page/book totals, seven-day pages, reading streaks and average session size. Optional yearly goals persist. Completion estimates use recent calendar-day pace and need at least two reading days.

## Book detail continuation

- Desktop book details now open in a 480px right-hand drawer, with a full-width mobile layout and sticky close header. Details, Notes, Sessions and Editions tabs support arrow, Home and End keys.
- Details show recorded publisher, language, year, page count, format, ISBN, description and genres. Missing metadata is labelled rather than inferred.
- Private notes save on blur, retain their draft after a failed request, and must save before closing or choosing another edition. Ratings and custom shelves remain editable.
- Editions lists other saved editions of the same work, including recorded translation language. Readers can add a separate edition to Want to read or open an existing copy. Notes and reading sessions remain attached to the original copy. The authenticated endpoint enforces book ownership.
- Find another edition opens catalogue/ISBN search. The later metadata continuation below extends the saved list with remote edition browsing and recorded translator credits.

## Browse and public book continuation

- Browse replaces its placeholder with Continue reading (including page logging), title/author/ISBN search, author exploration from the reader's finished books, and up to 24 recently catalogued works. Search has loading, retry, clear and empty states and cancels stale requests.
- Public server-rendered `/book/[workId]` pages show catalogue descriptions, genres and editions with page metadata. An explicit database field selection excludes user associations, notes, ratings, reviews, shelves and reading sessions. Only this public route bypasses the existing page login guard.
- Signed-in readers choose an exact edition and shelf, then land in that copy's library drawer. Existing editions remain deduplicated by the existing add endpoint. Signed-out readers can view catalogue pages and are offered sign-in to add books.
- Book pages and library details provide external search links to WorldCat, Bookshop.org UK and Open Library, using ISBN when known. These are searches, not stock, price or borrowing availability claims.
- Catalogue search results include work IDs for public-page navigation. Remote results can be added through the existing flow; their public page becomes available after cataloguing.
- Followed-author new-release feeds, nearby shops, community lists, canonical translator profiles and live availability are still outstanding. The Browse author controls are catalogue searches, not a new-release feed.

## Reading paths continuation

- Added ReadingPath, ordered ReadingPathEntry and ReadingPathFollow models through an additive migration. User deletion cascades to owned paths/follows; deleting a path does not delete books or library records.
- Readers create and edit paths from saved catalogue works, reorder books with labelled buttons, remove steps and add a rationale for each book. Paths support up to 100 unique works. Missing catalogue books can be found and added in a separate Browse tab.
- Paths start private. An explicit publish checkbox explains that the title, description, step notes and display name become public on saving. Published paths appear in Browse, a paginated path directory and relevant book pages. Unpublishing removes them from discovery and makes the share URL inaccessible to other readers.
- `/path/[pathId]` renders published paths for signed-out readers and private paths only for their owner. Owner edit/delete APIs enforce ownership; private path titles/notes are not returned in public-page responses.
- Public paths can be followed/unfollowed and revisited from Following. Follows are idempotent and do not alter the reader's library. Book links lead to edition selection on the existing public book page.
- Creation retries reuse a client request ID. Version checks reject stale edits/deletes; the editor retains the unsaved draft and links to the saved copy. Deletion and discarding edits require explicit UI confirmation. Form validation and network errors preserve edits.
- AI path generation, expert verification and automatic progress through a path remain outstanding. No Claude key is needed for authoring or following paths.

## Edition metadata continuation

- Added source edition IDs, translated edition titles, language arrays, translator credit arrays and a metadata timestamp through an additive migration. Credits remain edition-level source data; canonical translator profiles and grouped translation entities are not inferred.
- Book pages and the private Editions tab can explicitly load Open Library editions, 20 per page, and filter loaded records by language or text. Missing formats remain unknown. Source links accompany imported credits. Search and library cards support saved edition titles.
- The server resolves a work through its Open Library ID or a checksum-valid ISBN with one unambiguous work reference. Selection fetches the exact source edition again and validates identifiers and work membership; client-supplied metadata is not trusted.
- Importing catalogue metadata is separate from choosing a private library shelf. Existing source/ISBN matches are reused; conflicting identifiers or work associations are rejected. Enrichment fills missing publisher/language/credit fields but preserves existing titles, formats, page counts, notes, shelves and sessions.
- The provider integration uses the documented [Open Library edition endpoints](https://openlibrary.org/dev/docs/restful_api). Requests are cached for one hour and time out after eight seconds. Live provider calls timed out during this continuation; successful integration was verified with controlled provider responses, not live data.
- `npm run test:metadata` starts isolated local provider/app servers and closes them after the test. It does not change `.env` or the normal running app's provider configuration.

## Private gift planning continuation

- Added private GiftContact and GiftItem models with an additive migration. The Library sidebar links to paginated Gift lists, a recipient editor and a detail page. Recipient names, preferences, occasions, budgets and gift notes are restricted to the signed-in owner.
- Readers record up to 20 occasions and 100 unique book ideas per person. Annual dates recur; 29 February uses 28 February in non-leap years. The Gift lists page shows upcoming reminders for the people displayed on that page. Dismissal persists for that occurrence and does not suppress next year's reminder.
- Gift ideas use saved catalogue works and link to public edition comparisons and external shop searches. Each idea has planned/bought/given status, Perfect fit/Might like/Wildcard, an optional private note and a manually entered GBP price estimate. Budgets and estimates use integer pence; no live-price claims are made.
- Recipient pages flag estimates over budget. Reminders show up to three planned ideas whose recorded estimates fit the budget. These statuses are planning records; no purchase, message or notification is sent.
- Creation retries reuse a client request ID. Mutations and reminder dismissals enforce ownership. Version checks prevent stale edits/deletes; unsaved drafts survive failures. Deleting a recipient requires UI confirmation and leaves library/catalogue books untouched.
- AI suggestions, chat reminders, multiple currencies and selecting a specific edition directly on a gift item remain outstanding. Gift sharing and claims are covered by the continuation below.

## Gift sharing and claims continuation

- Owners explicitly create, replace or disable a random 256-bit shared link. The shared `/gift/[token]` page is excluded from Browse, uses no-store/no-referrer headers and requests no indexing. Revocation and replacement invalidate the old URL; existing claims remain available to the owner.
- The shared page uses a separate explicit data selection. It reveals only recipient name, book titles/authors, availability and claim state. It omits preferences, occasions, budget, estimates, fit, private notes, contact/owner IDs and other claimants' names/IDs. The owner can see claimant display names on their private page.
- Claims require sign-in. Login/signup preserve a strictly validated local shared-list return URL. No external redirect target is accepted by this flow.
- Claim/release operations lock the contact transactionally and recheck the current share token. One simultaneous claimant wins; repeat requests are idempotent. Only the claimant or list owner can release a claim. Item versions reject stale actions; bought/given gifts cannot be newly claimed.
- Gift edits now update existing book ideas in place, preserving claims and item identity. Removing a claimed idea is rejected until the claim is released. Status changes update claim versions. Contact versions also change when claims or sharing change, protecting open editors against stale saves.
- Owners can release claims after sharing is disabled. Deleting the recipient removes the link and gift claims while retaining library books. Links are copied or opened only by explicit user action; no messages are sent.

## Public profiles and community reviews continuation

- Added opt-in profiles at `/profile/[username]`, with a unique normalized username, separate public display name and bio. Existing accounts remain private. Settings links to the profile editor; anonymous visitors cannot view unpublished profiles.
- Added one separate review per reader/work, with private drafts, an optional public rating and explicit publishing. A book must be in the writer's library; publishing also requires a public profile. Private library ratings, imported reviews and notes are never copied or aggregated into community data.
- Community, book pages and profiles show only published reviews from currently public profiles, with 20-row pagination. Unpublishing a review removes it from those views. Hiding a profile hides its reviews; republishing restores them, as explained before saving.
- Profile version checks and transactionally serialized review updates reject stale saves. Duplicate usernames are handled without losing form input. Failed saves retain the draft. The migration is additive and preserves existing data.
- This is the initial profile/review slice. Profile shelf/path tabs, avatars, review deletion and a private draft index remain outstanding. Reviews can currently be withdrawn using the publishing checkbox.

## Reader follows and following feed continuation

- Signed-in readers can follow/unfollow public profiles; self-follow is rejected. Requests are idempotent, scoped to the authenticated follower, and serialized against target profile visibility changes. Existing follows can be removed after a profile becomes private.
- Community has All reviews and Following views. The following feed keeps the same explicit review/profile publication filters and preserves its filter through 20-row pagination. Drafts, hidden profiles and unfollowed readers are excluded.
- The private `/community/following` page lists followed public readers and anonymous placeholders for hidden profiles, with unfollow controls and pagination. Hidden names, usernames and bios are not rendered. Other readers cannot manage or read this list.
- Public profiles show follow controls (or an owner edit link) and counts limited to currently public profiles. Private follower identities and their contribution to public counts are excluded. Following lists are not public. Hiding a profile preserves relationships; republishing allows its published reviews to reappear for existing followers.
- Added an additive ReaderFollow table with a composite primary key, indexes and cascading account cleanup. No library, review or profile records were migrated into public state.

## Review discussions and moderation continuation

- Review cards link to public `/review/[reviewId]` discussions. Signed-in readers can like/unlike reviews; reactions are unique per reader/review and reveal counts only. Discussion mutations reject drafts, hidden reviews and private review authors. Own reactions can still be removed through the API after hiding.
- Comments require a public profile, explicit posting and 1-2,000 characters. Stable request IDs prevent retry duplicates; failed form submissions preserve text. Public comments paginate by 20 and exclude hidden comments and private commenter profiles. Profile publishing copy explains comment visibility.
- Authors can confirm removal of their own comments. `/community/comments` provides private, paginated access to their comments even when the review is no longer public. Removal hides the comment; any report snapshot remains available to moderators. Comment editing, threaded replies and notification delivery are not implemented.
- Readers can privately report a review or comment using a reason and optional details. Reports are unique per reporter/target; retries do not create more reports or reopen resolved reports. The recorded content snapshot survives later edits. Neither report details nor reporter identities are shown publicly.
- Server-controlled `User.isModerator` gates the private pending/resolved report queue and mutation API. Moderators can dismiss reports or confirm hiding the target. Resolutions record action, time and moderator ID. Already-resolved reports reject stale actions. Hiding a review also hides its discussion and removes it from all review feeds; author edits cannot clear the moderation flag.
- The migration adds tables/fields without publishing existing content. No existing account was promoted to moderator. Operational use requires a trusted moderator assigned through database administration; reports are stored locally, with no notification or guaranteed response. Automated anti-abuse limits, block/mute, appeals/restoration and a staffed moderation process remain release work.

## Validation

- Review discussion continuation: production build (including lint/type checks) and unit tests pass. All 14 existing regular browser scenarios passed in the full run; both new discussion scenarios passed on a focused rerun (11.5 seconds) after correcting a premature text assertion and an exact-label selector. The metadata fixture remains separately skipped. Coverage includes like/unlike retries, comment validation/privacy, saved-draft retry, duplicate comment suppression, pagination, removal ownership, hidden-profile/review denial, private reports, report deduplication, rejected self-promotion, moderator-only actions, dismiss/hide, resolution audit fields and author edits unable to override hiding. The mobile moderation page was inspected.

- Reader follows continuation: production build (including lint/type checks), unit tests and three targeted browser scenarios pass (16 seconds): existing profile/review publishing, the new reader-follow scenario and public-book discovery. New checks cover anonymous/self/private-target denial, failed-request retry, concurrent duplicate follows, private/public follower counts, account isolation, filtered feed pagination, hidden-profile content exclusion and unfollow after hiding. The mobile following page was inspected. The unrelated full regression suite and separate metadata fixture were not rerun for this increment.

- Public profiles/reviews continuation: production build (including lint and type checks), unit tests and all 13 regular browser scenarios pass (2.2 minutes). The metadata fixture scenario remains intentionally separate. New coverage verifies opt-in publishing, anonymous private-profile denial, private account/library/imported-review exclusion, separate public ratings, community/book/profile rendering, duplicate usernames, account isolation, review withdrawal, profile hiding and stale-save draft retention. The mobile profile editor was inspected.

- Gift sharing continuation: production build (including lint/type checks), unit tests and all 12 regular browser scenarios pass (1.2 minutes). The metadata fixture scenario remains intentionally separate. New checks verify explicit sharing, private-field/claimant exclusion, no-store/no-referrer/noindex responses, return after signup, stable item identity, claims surviving edits, blocked removal of claimed items, link rotation/revocation, owner release after revocation, simultaneous claim exclusion, idempotent claims/releases and stale-action rejection. The mobile shared page was inspected.

- Gift planning continuation: production build (including lint/type checks) and unit tests pass. Nine regular browser scenarios passed in the full run; both gift scenarios passed on a focused rerun after replacing an HTTP-status-only assertion with rendered access-denial and private-data checks (Next.js can stream a 200 shell before rendering not-found). The separate metadata fixture scenario remains intentionally skipped in the regular suite. Gift coverage includes preferences, integer-pence estimates, annual dates, persisted reminder dismissal, budget filtering, bought/given status, account isolation, invalid input, idempotent creation, stale drafts and deletion that preserves library books. The mobile gift page was inspected.

- Edition metadata continuation: production build (including lint/type checks), unit tests and all eight regular integration scenarios pass. The fixture-only metadata scenario is skipped by the regular suite and passed separately via `npm run test:metadata` (9.6 seconds). Coverage includes provider failure/retry, ISBN work resolution, pagination, language filtering, translator-role filtering, exact-ID imports, forged payloads, source/ISBN conflicts and unchanged saved reading progress. The mobile drawer screenshot was inspected. Live Open Library calls timed out and remain unverified.

- Reading-path continuation: production build, TypeScript, lint and unit tests pass. Seven integration scenarios passed in the full production run; the eighth (stale-edit protection) passed on a focused rerun after fixing an ambiguous test selector. Coverage includes ordered private saves, explicit publishing, anonymous/other-account isolation, follows, unpublishing, library-preserving deletion, idempotent creation, invalid inputs and stale-edit draft retention. The mobile path screenshot was inspected.

- Browse/public-page continuation: all six production browser scenarios passed in 36.5 seconds. The added scenario verifies public SSR metadata, absence of private notes/user-book IDs, protected private routes/APIs, missing-work 404s, Browse logging, search retry, exact-edition addition and mobile width. The mobile screenshot was inspected. Production build (including lint/type checks) and unit tests pass.

- Drawer continuation: production build (including TypeScript and lint) and unit tests pass. All five browser scenarios pass across the final suite and focused rerun; the new scenario covers keyboard tabs, failed-note retry, desktop/mobile sizing, edition addition without changing history, and cross-account protection.

- ISBN/CSV parser tests pass, including invalid checksums, multiline quotes, invalid dates and malformed rows.
- TypeScript, ESLint and production build pass. A clean build may emit Auth.js/jose Edge warnings for CompressionStream/DecompressionStream; exercised login and protected routes work locally.
- Chromium integration tests cover signup/login, import, custom shelves, ratings, notes persistence, search-result addition, mobile width, private API isolation, chat unavailable state and controlled streaming rendering.
- A 500-book import was paused after one batch, resumed on opening the app, and completed within the brief's two-minute target. Reimport skipped all 500 without duplication. The latest production import/reimport test ran in about 14 seconds against the local database.
- All four production browser scenarios passed in 37 seconds on 8 September. New browser tests cover direct and chat-confirmed logging, cancel without mutation, duplicate/conflicting requests, backdated progress, invalid input, cross-account protection, diary goals, shelf deletion, ambiguous edition review and exact-edition addition.
- A real Open Library ISBN lookup returned Fantastic Mr. Fox and a cover.
- Real Claude API responses are not verified: `ANTHROPIC_API_KEY` is currently empty. Successful browser streaming uses a fixture, not a live model.

## Release dependency check

A verified npm audit reported nine high-severity dependency entries in the retained Next.js 14 / Prisma toolchain (including transitive entries, not nine independent app exploits). npm proposes major-version changes. Plan and test that upgrade before public deployment; this continuation keeps the brief's framework version and remains local. Audit details are generated locally rather than committed.

## Remaining work

Live personalised Claude chat still requires `ANTHROPIC_API_KEY` and real-provider verification. Import matching uses the local canonical catalogue without external metadata enrichment. Shelf sharing, imported public reviews, editing/deleting existing sessions and separate reread cycles are not implemented. Chat history and unconfirmed log proposals remain in the open page only.

Next Phase 2 work: live acquisition/availability integrations, plus a successful live-provider check of the edition metadata flow. Reading paths now support manual creation, publishing and following. Browse and public book pages now have their first functional implementation. The new diary currently loads the user's session history together; pagination and larger-library optimisation can follow as usage grows.

Next community work: review deletion and private draft management. Later phases include AI gift expansion, creator publishing, encrypted private context and marketplace. Public profiles and community reviews now have their initial implementation. No deployment or remote push has been performed.
