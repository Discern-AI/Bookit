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

Browse now includes catalogue search, current reads and author exploration. Saved catalogue titles link to public `/book/[workId]` pages with descriptions, editions and external library/shop searches. Adding an edition opens its private library drawer. Public pages contain catalogue metadata only.

Reading paths are available from Browse. Create an ordered path from saved catalogue books, add notes, and save it privately or publish it. Published paths have shareable `/path/[pathId]` pages, appear on their book pages, and can be followed. Publishing exposes only the path content and your display name; library notes remain private.

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
```

Browser tests expect a running server on localhost:3000 and a migrated development database. They create and remove temporary test accounts/books. Search and successful chat UI responses use fixtures; the missing-key response uses the real API. The chat test currently expects an empty `ANTHROPIC_API_KEY` in the test server. Use a development database, not live user data.

## Specifications and current scope

Both original PDFs are saved in [docs/specifications](docs/specifications). The current implementation covers the library foundation and the first reading features. See [docs/BUILD_STATUS.md](docs/BUILD_STATUS.md) for what is implemented, validation, limitations, and the next phase.
