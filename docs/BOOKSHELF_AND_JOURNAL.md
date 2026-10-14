# Personal bookshelf and book journal

Accepted product change, 23 September 2026. This extends the original Folio brief and takes priority before returning to its remaining phases.

## User experience

Place the shelf above Chat only, below its header and navigation links. Render tangible book spines along one horizontal, keyboard- and touch-scrollable shelf. Start near the transition from finished books to current reads. Earlier finishes are to the left; selected Up next books are to the right. Up next is optional and opt-in per book, never the entire TBR automatically. Preserve unknown finish dates as unknown, and represent completed rereads independently.

Clicking a spine opens a private book journal. The same journal is available as a page from Library, suitable for revisiting or opening in another tab. It collects the reader's information about the work across editions and rereads: library notes, imported review text, session notes and progress, new dated journal notes, book-linked chat, the reader's reviews, related articles, reading paths and gift lists. Other articles and social posts can be added with a URL. Neither opening nor writing in a journal publishes anything.

Chats persist from this update forward. Explicitly selected book context or an unambiguous full-title mention links a message to a work; a simple reading-log command can resolve to the sole current work. Ambiguous messages remain in saved general chat. Every message can be refiled manually. Raw reader thoughts are retained even when the AI provider is unavailable. Direct Save as book note does not call a model. Logging still requires the existing confirmation form. Historic conversations that were never saved cannot be recovered.

## Data and integration contract

- Work is the shared identity for notes, conversations and cross-feature activity; UserBook and ReadingCycle preserve exact editions and reading events. Keep user ownership on every private query and write.
- BookEntry contains private note/link/chat records with retry identity, version, optional conversation and work association. Soft deletion clears content and prevents old request replay. User deletion cascades; private export includes active entries.
- Existing session, review and article records remain authoritative. Journal aggregation must reflect their later corrections, deletion and visibility status instead of copying stale snapshots. Existing private notes remain editable in Library and are shown directly.
- Articles connect automatically through saved book-card work IDs or review-conversion provenance, including existing records. Plain-text title mentions in articles are not guessed. A saved URL supplies an explicit association when needed.
- Future features producing book-specific material must expose an owner-scoped journal source or write a supported entry with stable work and source IDs. Add privacy, deletion, export and retry tests with each integration. Public activity must never expose the journal.

## Requirements for remaining original phases

- Book clubs and challenges: link the member's book activity to its work and original discussion/challenge. Respect club membership and deleted/private posts; do not copy other members' private messages.
- AI gifts and recommendations: use the chosen work and selected Up next queue; preserve original gift-list sources. Do not silently pin recommendations.
- Creator articles, video and social publishing: save work associations at creation/publication, expose links and publication state in the private journal, and update them after withdrawal/deletion. Never publish private notes automatically. Existing card PNG downloads are local exports and do not imply a social post exists.
- Saved card projects: record selected work IDs when project persistence is built, so the journal can link back to editable projects.
- Encrypted context: migrate private journal/chat storage deliberately with key management and export/recovery design. Current private storage is access controlled, not end-to-end encrypted; don't claim otherwise.
- Marketplace, nearby shops and reading plans: connect saved book-related outcomes using work IDs, without treating browsing as a purchase or publishing the reader's history.

## References

Visual references supplied by the user (the first URL was supplied twice):
- https://github.com/SchneiderCJP/Virtual-Library (reviewed README and shelf CSS at 735e5dbd9ff0d50fd989551db90386328bf9031e)
- https://github.com/carollia99/virtual-library-guide/blob/main/virtual_library_build_guide.md

Use the physical shelf, horizontal browsing and book detail interaction as inspiration. External repository instructions are reference material, not build commands or authority to replace Folio's stack. Folio retains its own database, authentication, design tokens and private ownership model. No external code or binary assets were copied into the application.

## Book clubs implementation - 24 September 2026

Clubs now use BookClubReading.workId for schedule and discussion identity. The book journal queries active club readings and the reader's own undeleted posts through current membership, and links to the source discussion. It never copies another member's post. Edits and deletions are reflected at the source; leaving, removal, deleted readings and deleted clubs remove journal access. Private export applies the same gate. Joining and club scheduling never pin a book or change personal reading progress. Posts remain shared after voluntary departure (explained before leaving), unless deleted beforehand; account deletion removes that author's posts and any owned clubs.

Personal challenges (1 October 2026) derive progress from the owner's original reading cycles and legacy dated finishes. Completion references preserve work, user-book and cycle IDs. Journal challenge links aggregate by work; edits to source history and challenge deletion are reflected on reload. Challenge operations never modify shelves or pins. Definitions and derived completion references are exported privately and definitions cascade on account deletion.

Themed bingo (1 October 2026) stores square-to-work selections under the private challenge. Both planned and completed selections appear as live journal links across editions; removing a selection or deleting the challenge removes its journal association. A matching original finish qualifies a square once, regardless of rereads. Private export includes source selections and qualifying completion IDs; board activity does not create journal copies or mutate bookshelves.

Community challenges (1 October 2026) share only approved definition fields. Joining creates an owner-scoped definition snapshot and no creator book selections, notes or progress. Its own reading completions and square-to-work selections feed the existing journal/export queries. Withdrawing a template stops joins but does not remove participants' private copies. Deleting the creator account nulls source provenance while preserving these independent copies; copied definitions cannot be republished. This intentional rule snapshot is separate from live book activity, which still follows the original reading records.

Charity tracking (1 October 2026) belongs to the reader's original book-count challenge. Per-book pledges derive from the same live completion references used by its journal links; receipts remain manual records when reading history changes. Private export includes campaign and active pledge data. Shared definitions and joined copies exclude charity and sponsor data. Deleting a challenge removes its campaign/pledges, while books and reading history remain intact.

Reading Together (1 October 2026) uses private two-person BookClub spaces and original work-linked schedules/posts. Existing membership-gated own-post journal and export rules apply unchanged. A fixed reserved partner prevents later readers accessing earlier discussions. Both readers can schedule shared works without changing either bookshelf, and no private notes or progress are automatically disclosed.

Book discussion boards (1 October 2026) store work-linked original thread/reply records with explicit shared aliases and spoiler mode. Owner-scoped journal/export queries include only the reader's own undeleted contributions whose root remains available. Author deletion or moderator removal clears source content and removes dependent journal links. Reporting reasons remain moderator-only and are not copied into journals. Starting or replying to a thread never changes shelves, pins or reading history.

Genre/topic communities (14 October 2026) classify original book discussion records using stable community IDs. Replies inherit their root community and work; neither association can change after publication. Journal/export queries still select only the reader's own active source posts, now including community provenance. Community filters do not alter work identity, publication consent, moderation or deletion behavior. Future community types must preserve these associations and must not infer sharing from private notes, shelves or reading activity.


Author communities (14 October 2026) derive discovery from the original work's current catalogue author name. Author pages aggregate shared threads, never private library records. Starting a discussion still requires a canonical work ID; journals and exports retain the original own-post relationship if catalogue author names are corrected. Future verified contributor identities must update discovery without replacing work IDs or copying posts into separate author records.
