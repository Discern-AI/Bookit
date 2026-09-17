# Reread implementation plan

The current library row stores one start/finish pair. Restarting a completed book must preserve its earlier finish and history while resetting current-cycle progress. Changing the shelf alone cannot represent this reliably.

1. Add an owner-scoped ReadingCycle related to UserBook, with start/finish dates and a version, and attach sessions to cycles. Keep at most one active cycle per library book using a database constraint. Retain session request identities and deletion markers.
2. Backfill one legacy cycle per existing library book, preserving stored dates and assigning existing sessions. Do not infer extra completed cycles from repeated finished-session flags: legacy data does not reliably identify rereads. Preserve unknown dates as unknown.
3. Add an explicit Start reread action for a completed book, with a confirmation describing preserved history and reset progress. Use the existing per-user logging lock, a request identity and expected cycle version to prevent duplicate or stale starts. Keep ratings, reviews, shelf memberships and private notes unchanged.
4. Scope library/chat current progress and logging concurrency tokens to the active cycle. New reading logs belong to that cycle; backdated corrections retain their original cycle. Finishing updates that cycle, without overwriting earlier cycle dates. Session deletion continues to leave an explicit completion record unchanged.
5. Show completed cycles in the diary and define the yearly metric as reads finished, including rereads. Update recap wording accordingly; count cycle finishes, avoiding double counting the legacy UserBook finish field. Keep pages and reading-day counts based on undeleted sessions across cycles.
6. Include cycles in private exports and delete them with their library book/account. Test legacy/undated migration, repeated start requests, stale log forms, cross-account access, two completed cycles in one year, earlier-cycle corrections and preserved public reviews.

This is a plan only; the cycle model, migration and reread controls have not been implemented. A future start-reread action needs a user-selected start date; cancellation must leave the current book and all history unchanged.
