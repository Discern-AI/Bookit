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

For a production build on a machine with limited available memory, opt into one build worker:

```powershell
$env:FOLIO_LOW_MEMORY_BUILD = "1"
$env:NODE_OPTIONS = "--max-old-space-size=768"
npm run build
Remove-Item Env:FOLIO_LOW_MEMORY_BUILD
Remove-Item Env:NODE_OPTIONS
```

This reduces build concurrency; ordinary builds retain Next.js defaults. It does not free memory used by other applications.

Set `DATABASE_URL`, a random `NEXTAUTH_SECRET`, and `NEXTAUTH_URL` in `.env` before starting. `AUTH_TRUST_HOST=true` is configured for the local server; hosted environments must supply the correct public origin and trusted proxy configuration. Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

Open http://localhost:3000 and create an account. Settings contains Goodreads import, edition-match reviews and library export. In Library, choose Reading diary for your timeline and goal, or Log pages on a current read. Chat also accepts commands such as "Read another 30 pages" and asks you to confirm before saving. These logging commands work without a Claude API key.

Browse now includes catalogue search, current reads and author exploration. Saved catalogue titles link to public `/book/[workId]` pages with descriptions, editions and external library/shop searches. Adding an edition opens its private library drawer. Public book pages contain catalogue metadata, published paths and explicitly published community reviews.

Reading paths are available from Browse. Create an ordered path from saved catalogue books, add notes, and save it privately or publish it. Published paths have shareable `/path/[pathId]` pages, appear on their book pages, and can be followed. Publishing exposes only the path content and your display name; library notes remain private.

Book pages and the library Editions tab can load Open Library editions in pages of 20, filter loaded records by language or text, and import an exact edition. Recorded translator credits and language metadata include source links. A saved copy keeps its existing page count and reading history. Source lookup needs an Open Library work ID or a matching ISBN; provider failures leave saved data available.

Library now links to private Gift lists. Record recipient preferences, a GBP budget, occasions and candidate books. Track planned/bought/given status, fit and your own price estimates. Annual occasions recur, and upcoming dates have dismissible in-app reminders. Gift ideas link to edition comparisons and external shop searches.

Saved gift lists now offer AI expansion from the editor. Review suggestions, add chosen books to the draft, then save. This sends the displayed reading preferences/budget and a bounded catalogue shortlist to Claude; recipient names, private book notes and chat history are excluded. Accepted explanations remain private gift notes, and prices need checking. Without `ANTHROPIC_API_KEY`, manual gift planning remains available and AI requests show a clear unavailable message. Live provider behavior has not yet been verified.

Gift-list owners can create a revocable shared link. The shared view shows the recipient name, books, availability and claim state; preferences, occasions, budgets, price estimates and notes remain private. Signed-in gift-givers can claim and release their own gifts. Owners can release any claim and replace or disable the link. A shared-link sign-in or signup returns to that list.

Community now shows published book reviews. In Settings > Manage public profile, choose a username, public display name and bio, then explicitly publish your profile. Open a library book's public page to write a separate review and optional rating. Reviews start as private drafts; publishing adds them to Community, your profile and the book page. Hiding your profile also hides its published reviews; republishing restores their visibility. Existing library ratings, imported reviews and notes are never automatically published.

Follow a reader from their public profile, then choose Following in Community to see their published reviews. Readers you follow is a private management page, including an unfollow control for profiles that become private. Public profile counts include public accounts only. Hiding a profile hides its reviews from following feeds without deleting existing follows.

Open Discuss this review to like a review, post a public comment or report a review/comment privately. Comments require a public profile and can be removed from Your comments even if the discussion becomes private. Reports are stored for moderator review; they do not automatically hide content or promise an immediate response.

Moderator accounts see a private Moderation reports queue with pending/resolved views, original reported-text snapshots, dismissal and confirmed content hiding. The server-controlled `User.isModerator` database flag defaults to false; signup and profile settings cannot grant it. No existing account was granted moderator access by this build. Assign a trusted moderator through database administration before relying on the queue operationally.

Your reviews in Community is a private dashboard with draft/published/moderator-hidden filters, title/author search and pagination. Resume a saved draft or confirm deletion there. Deletion clears the review text and rating, removes likes and closes the public discussion, while preserving report snapshots for moderators and comment authors' private management access. Your library stays unchanged. Writing again starts a fresh discussion; moderation restrictions still apply.

Settings > Manage shelf sharing publishes selected custom shelves after confirmation. A public profile is required. Shared `/shelf/[shelfId]` pages show only the shelf name and catalogue/edition details; private ratings, notes and reading history stay private. Published shelves are live: renames and membership changes appear publicly. Unsharing or hiding the profile removes public access; republishing a profile restores still-shared shelves. Profile pages now have Reviews, Shelves and Reading paths tabs, each paginated. Independently published reading paths retain their existing public URLs and publishing controls.

Hidden reviews can be appealed from Your reviews. Your appeals shows private requests and moderator responses. Moderators have a separate appeal queue with current-review checks, rejection and confirmed lifting of restrictions. Restoration honours publication/profile visibility and cannot recreate deleted reviews. Appeals for comments are not implemented yet.

Settings now has Account security: verify your current password to change it or sign out all devices. Both actions invalidate all existing sessions, including the current browser, and require signing in again. Server-side authentication checks session versions against the database; requests already running may finish. Password recovery and changing the login email are not implemented.

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

Community > Your articles opens the TipTap editor: save private drafts, preview, and explicitly publish a saved version. Enable your optional blog and make your profile public before publishing. Further draft edits stay private until republished. Published articles appear in reader article feeds, the profile Blog tab and RSS. Unpublishing, disabling the blog or hiding the profile removes public access. Articles now support private image uploads with descriptions/captions and book cards selected from your collection. Readers can privately report published articles; moderators can hide them, dismiss reports or lift restrictions.

Save an article once, then use Insert image to upload a still JPEG, PNG or WebP (up to 5 MB / 20 megapixels). Images are resized to fit 1600 pixels, converted to WebP with metadata removed and stored in the local database. Add an accessible description and optional caption. Existing uploads can be reused; unused uploads can be removed once absent from both saved and published versions. Deleting an article clears its image data. Insert book card searches your collection and includes only catalogue title, author and an approved catalogue cover. Save and publish to share these additions.

Article reports appear under Community > Moderation reports > Article reports for designated moderators. Reports preserve the published text/structure and explanations privately. Hiding blocks public article pages, feeds, RSS and image access, and prevents author republishing. Lifting a restriction leaves the article unpublished for the author to review and publish again. Deleting an article retains report text but clears image files. Authors can appeal article restrictions privately from the editor or Your articles.

The article editor offers optional browser recovery for unsaved changes, including a new article not yet saved. Copies are unencrypted and scoped to your account in the UI. They expire after seven days and are cleaned up on a later editor visit. Restore explicitly; if a newer saved version exists, download the copy for comparison instead. Saving clears that recovery copy; disabling recovery clears this account's copies and stops other tabs from writing them. This is local recovery, not account autosave or cross-device sync.

Your reviews > Turn into article copies the saved review text into a private article draft after confirmation. Repeating the action for the same review version reopens the existing article. Notes, ratings and reading history are excluded; hidden/deleted reviews cannot be converted. The article is an independent copy and still requires explicit publication. Paragraph boundaries are retained, with single line breaks flattened to spaces; markup is copied as literal text.

Your article appeals shows private requests and responses. Moderators have an Article appeals queue for approval/rejection with required responses and current-version checks. Appeals include only the hidden published snapshot, never unpublished draft edits. A newer restriction supersedes pending appeals; deletion withdraws them. Approval or direct lifting of the restriction leaves the article unpublished. No notification emails are sent.

Your articles > Make shareable cards opens the book/quote card studio. Choose a book from your collection, add a caption or quote/reference, select Paper or Night and Square (1080 x 1080) or Portrait (1080 x 1350), then download the preview as a PNG. A public username byline is optional and off by default. Cards currently use typography rather than cover images. Book, quote and shelfie cards can now be saved as private named projects and reopened from Creator > Saved card projects. Saved selections link from their book journals. Unsaved text stays in the open page; downloads do not publish profiles, shelves or articles.

Creator > Your reading-year recap provides year selection and a PNG of books finished, pages logged and reading days. Books use dated entries on the Read shelf; session totals use saved UTC dates, with current-year totals through today (UTC). Empty years show zero. The existing layouts, themes and optional public byline are available, without publishing any library or profile data.

Choose Shelfie card in Creator > Make shareable cards to select up to six books, reorder or remove them, and add a heading. Downloads show illustrated book spines with catalogue titles/authors. Save a named project to retain selections and order; no shelf is published or changed.

Settings now supports private account-name edits and permanent account deletion. Deletion requires the current password and typed DELETE confirmation, removes owned database content and article images, releases gift claims, and invalidates existing sessions. Shared catalogue records and other accounts remain. Browser recovery copies are cleared for the deleted account on the current browser where storage is available; downloads and copies on other devices are outside this flow.

Password recovery is available from Login > Forgot your password; Settings > Change login email requests verification at a new address. Links expire after 30 minutes, work once and revoke all sessions when used. Configure `NEXTAUTH_URL` to the app's canonical origin and connect an HTTPS mail service through `FOLIO_MAIL_WEBHOOK` and `FOLIO_MAIL_SECRET`. The service must accept POST JSON `{to, subject, text}` with a Bearer secret and return a successful status only after accepting delivery. Redirects are rejected and requests time out after 10 seconds. No specific mail provider is bundled.

For local testing only, start the server with `FOLIO_MAIL_MODE=local` and a localhost/127.0.0.1 `NEXTAUTH_URL`; messages are written under ignored `.local/mail/`. Run `tests/e2e/account-links.spec.ts` with the same mode. Outbox files contain live links: keep them private and never deploy this mode. With neither a delivery service nor local mode configured, the forms report that email is unavailable. Reset requests use a generic response for unknown accounts and delivery failures; delivery operations should be monitored by the configured service. Live delivery remains unverified. Configure request-rate protection at the deployment edge before public release; this implementation applies a one-minute per-account/action delivery cooldown.

Reading diary entries now have Edit session and Delete session controls. Edit the date, page range, private note and optional start/end timestamps. Times use the device timezone, can cross midnight, and must span no more than 24 hours. Clear both to remove timing; untouched timestamps retain their exact values. Totals and current progress use the revised history, while book shelf/start/finish dates and ratings remain separate. Deletion clears session content and retains a private deletion marker so old log retries cannot recreate it.

Completed library books now offer Start reread in their detail drawer. Confirm a start date to begin at page zero while preserving earlier finishes, sessions, ratings, reviews and notes. Diary and recap totals now say Reads finished and include dated rereads. Current library/chat progress uses the current reading only; private exports include cycle records. Changing shelves does not erase prior finishes, and completed readings require an explicit reread before logging more pages.

A book's Sessions tab now includes Reading history: each reading's start/finish dates and session/page totals. Correct a known finish date or add a missing date to a completed reading. Corrections update yearly totals while preserving sessions, shelf status, ratings and notes; dates cannot precede that reading's start/sessions or extend past the next reread start.

An unfinished reread with no sessions can be cancelled from Reading history in the book's Sessions tab. Confirming restores the prior reading, dates and progress and moves the book to Read. Rereads with any session records (including deleted ones) cannot be cancelled. Cancellation markers remain in private exports to prevent old requests recreating them, so reading numbers can have gaps.

Reading history in the book drawer Sessions tab supports correcting start dates, including unknown imported dates. Corrections preserve sessions and finished-read totals; conflicting dates and stale edits are rejected while keeping the draft.

Reading history also offers Clear finish date with confirmation. This marks the date unknown and removes the reading from dated annual totals while preserving sessions and shelf membership. Current readings must be on Read; it is not a reopen action. A known date can be restored through Correct finish date.

Use Reopen reading in reading history when the current book was marked finished by mistake. Confirmation moves it to Reading now and removes its dated completion while keeping the same cycle, start date, page progress and sessions. Earlier readings cannot be reopened.

Chat now includes your personal reading bookshelf: finished reads to the left, current books in the middle and explicitly pinned Up next books to the right. Choose Up next to select books or hide that section. Click a spine for its private journal, or open the journal from Library. Notes, saved book-related chat, reading sessions, reviews and book-linked articles collect there across editions and rereads. Add a note or an external post URL directly.

Chat conversations are saved privately from this update onward. Use Talking about to select a book, or let an unambiguous full-title mention identify it; use each message's Filed under selector to correct associations. Save as book note works without the Claude key. Library export includes journal and chat records. Previously unsaved chats cannot be reconstructed.

The [bookshelf and journal integration requirements](docs/BOOKSHELF_AND_JOURNAL.md) extend the original brief and apply to future clubs, challenges, creator/video/social features and reading plans.

Book clubs are available from Community. Create a private club or explicitly list an open one, choose a club display name, schedule books and discuss them with members. Owners can generate/revoke invitation codes, remove members and manage discussions. Spoiler-marked posts are collapsed until opened. Club scheduling never changes personal shelves or Up next pins.

Your book journal links to club readings and collects only your own posts while you remain a member. Edits/deletions update at their source; leaving or losing access removes journal links. Private export follows the same membership gate. AI club facilitation and notifications are not included in this first version.

Personal reading challenges are available under Community. Set a private book target, date range and optional genre; progress follows original reading history and links to bookshelf journals. Rereads count separately. Private themed bingo boards also support nine custom prompts, one library book per square and automatic dated-finish progress. Readers can preview and share challenge rules, discover community challenges and join with a private copy. Book choices and progress stay private; withdrawal stops new joins while existing copies remain. Book-count challenges can also track private charity fundraising in GBP: flat/per-book pledges, optional caps and recorded receipts. No payments are processed or sponsor messages sent.

Reading Together is available under Community for private two-person reading spaces. Invite one fixed partner, plan books together and share spoiler-aware posts. Only your own posts appear in your bookshelf journal; leaving never opens the pair to a replacement reader.

Book discussion boards are available from Community and individual book pages. Readers explicitly publish threads/replies under a chosen display name, with fixed spoiler controls. Your own contributions link into your bookshelf journal. Reporting and moderator removal are included; private notes and progress are never automatically published.


Creator > Video plans provides private scripts, production notes, platform/status tracking and ordered book links. Save and reopen plans, download the current script as text, or record a video URL after posting it elsewhere. Linked book journals show the original plan and any recorded posted link. This is planning and record keeping; native uploads, video playback and automatic cross-posting are not implemented yet. No Claude key is required.
