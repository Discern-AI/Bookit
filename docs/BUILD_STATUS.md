# Build status - 8 September 2026

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
- Find another edition opens catalogue/ISBN search. Remote edition enumeration, translator credits and translation enrichment remain to be built; the edition list currently uses saved catalogue records.

## Validation

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

Next Phase 2 work: remote edition/translation enrichment, acquisition/availability links, Browse discovery and public book pages. The new diary currently loads the user's session history together; pagination and larger-library optimisation can follow as usage grows.

Later phases: gifts, community, public profiles, creator publishing, social connections, encrypted private context and marketplace. Browse and Community remain explicit placeholders. No deployment or remote push has been performed.
