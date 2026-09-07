# Build status - 7 September 2026

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
- Chat UI with Markdown, cancel/retry, suggestion chips, ISBN book cards, and streaming Claude API integration. Context is assembled from the authenticated user's current books, recent reads, TBR, shelf totals and up to 1,000 existing titles. Chat cannot yet log sessions or perform other actions and is explicitly instructed not to claim it has done so.
- Loading/error states and mobile navigation to Settings.

## Validation

- ISBN/CSV parser tests pass, including invalid checksums, multiline quotes, invalid dates and malformed rows.
- TypeScript, ESLint and production build pass. Build emits Auth.js/jose Edge warnings for CompressionStream/DecompressionStream; exercised login and protected routes work locally.
- Chromium integration tests cover signup/login, import, custom shelves, ratings, notes persistence, search-result addition, mobile width, private API isolation, chat unavailable state and controlled streaming rendering.
- A 500-book import was paused after one batch, resumed on opening the app, and completed within the brief's two-minute target. Reimport skipped all 500 without duplication. The full import/reimport test ran in about 21 seconds against the local database.
- A real Open Library ISBN lookup returned Fantastic Mr. Fox and a cover.
- Real Claude API responses are not verified: `ANTHROPIC_API_KEY` is currently empty. Successful browser streaming uses a fixture, not a live model.

## Release dependency check

A verified npm audit reported nine high-severity dependency entries in the retained Next.js 14 / Prisma toolchain (including transitive entries, not nine independent app exploits). npm proposes major-version changes. Plan and test that upgrade before public deployment; this continuation keeps the brief's framework version and remains local. Audit details are generated locally rather than committed.

## Remaining work

Before signing off Phase 1: configure a Claude API key and exercise real personalised chat, and review the foundation with the user. Search currently uses Open Library; Goodreads import resolves ISBN/title-author against the local canonical database without external enrichment. Ambiguous title-only imports use a deterministic title/author match rather than a human review queue. Custom shelves are private; renaming/deleting and sharing controls are not implemented. Imported review text is retained and exported but has no public review UI yet.

Phase 2 in the implementation brief: direct/NLP reading-session logging with confirmation, reading diary and statistics, edition/translation UI, full book detail drawer, acquisition/availability links, Browse discovery, public book pages.

Later phases: gifts, community, public profiles, creator publishing, social connections, encrypted private context and marketplace. Browse and Community remain explicit placeholders. No deployment or remote push has been performed.
