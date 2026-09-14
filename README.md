# Folio / Bookit

A personal reading library and AI reading companion. The repository folder is `bookit`; the product name in the supplied specifications is Folio.

## Run locally

Requirements: Node.js 20.19+ (tested with Node 24), PostgreSQL, and npm.

```powershell
npm install
Copy-Item .env.example .env # only on a fresh checkout; keep an existing .env
npm run db:generate
npm run db:migrate
npm run dev
```

Set `DATABASE_URL`, a random `NEXTAUTH_SECRET`, and `NEXTAUTH_URL` in `.env` before starting. `AUTH_TRUST_HOST=true` is configured for the local server; hosted environments must supply the correct public origin and trusted proxy configuration. Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

Open http://localhost:3000 and create an account. Settings contains Goodreads import, edition-match reviews and library export. In Library, choose Reading diary for your timeline and goal, or Log pages on a current read. Chat also accepts commands such as "Read another 30 pages" and asks you to confirm before saving. These logging commands work without a Claude API key.

Browse now includes catalogue search, current reads and author exploration. Saved catalogue titles link to public `/book/[workId]` pages with descriptions, editions and external library/shop searches. Adding an edition opens its private library drawer. Public book pages contain catalogue metadata, published paths and explicitly published community reviews.

Reading paths are available from Browse. Create an ordered path from saved catalogue books, add notes, and save it privately or publish it. Published paths have shareable `/path/[pathId]` pages, appear on their book pages, and can be followed. Publishing exposes only the path content and your display name; library notes remain private.

Book pages and the library Editions tab can load Open Library editions in pages of 20, filter loaded records by language or text, and import an exact edition. Recorded translator credits and language metadata include source links. A saved copy keeps its existing page count and reading history. Source lookup needs an Open Library work ID or a matching ISBN; provider failures leave saved data available.

Library now links to private Gift lists. Record recipient preferences, a GBP budget, occasions and candidate books. Track planned/bought/given status, fit and your own price estimates. Annual occasions recur, and upcoming dates have dismissible in-app reminders. Gift ideas link to edition comparisons and external shop searches.

Gift-list owners can create a revocable shared link. The shared view shows the recipient name, books, availability and claim state; preferences, occasions, budgets, price estimates and notes remain private. Signed-in gift-givers can claim and release their own gifts. Owners can release any claim and replace or disable the link. A shared-link sign-in or signup returns to that list.

Community now shows published book reviews. In Settings > Manage public profile, choose a username, public display name and bio, then explicitly publish your profile. Open a library book's public page to write a separate review and optional rating. Reviews start as private drafts; publishing adds them to Community, your profile and the book page. Hiding your profile also hides its published reviews; republishing restores their visibility. Existing library ratings, imported reviews and notes are never automatically published.

Follow a reader from their public profile, then choose Following in Community to see their published reviews. Readers you follow is a private management page, including an unfollow control for profiles that become private. Public profile counts include public accounts only. Hiding a profile hides its reviews from following feeds without deleting existing follows.

Open Discuss this review to like a review, post a public comment or report a review/comment privately. Comments require a public profile and can be removed from Your comments even if the discussion becomes private. Reports are stored for moderator review; they do not automatically hide content or promise an immediate response.

Moderator accounts see a private Moderation reports queue with pending/resolved views, original reported-text snapshots, dismissal and confirmed content hiding. The server-controlled `User.isModerator` database flag defaults to false; signup and profile settings cannot grant it. No existing account was granted moderator access by this build. Assign a trusted moderator through database administration before relying on the queue operationally.

`ANTHROPIC_API_KEY` enables real chat replies. `ANTHROPIC_MODEL` defaults to the brief's `claude-sonnet-4-6`. Keys stay server-side. Without a key, the library still works and chat shows a connection message. Chat history is currently held in the open page, not persisted across reloads.

### Database on this Windows machine

The existing PostgreSQL 18 installation is used with a separate development cluster at `bookit/.local/pgdata`. It listens only on 127.0.0.1:5432, uses local development trust authentication, and contains the `folio` database. This is not a production database configuration. Its files are ignored by Git. Restart it after a reboot with:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' -D "$PWD\.local\pgdata" -l "$PWD\.local\postgres.log" -o '-h 127.0.0.1 -p 5432' -w start
```

Alternatively, on a machine with Docker, use `docker compose up -d db` and the example connection string. Choose one database instance for port 5432.

## Checks

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:metadata
```

Browser tests expect a running server on localhost:3000 and a migrated development database. They create and remove temporary test accounts/books. Search and successful chat UI responses use fixtures; the missing-key response uses the real API. The chat test currently expects an empty `ANTHROPIC_API_KEY` in the test server. Use a development database, not live user data.

`npm run test:metadata` runs a separate production server and local provider fixture on temporary ports, then closes both. It verifies provider failure/retry, pagination, language filters, translator roles, source identity conflicts, idempotent import and preserved reading progress. Build first. The ordinary browser suite skips this fixture-only scenario; live Open Library responses are a separate verification.

## Specifications and current scope

Both original PDFs are saved in [docs/specifications](docs/specifications). The current implementation covers the library foundation and the first reading features. See [docs/BUILD_STATUS.md](docs/BUILD_STATUS.md) for what is implemented, validation, limitations, and the next phase.
