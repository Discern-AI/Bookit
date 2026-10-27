"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogSession } from "@/components/library/LogSession";
import { LibraryBook } from "@/lib/book-data";
import { localDate, ReadingIntent, parseReadingIntent } from "@/lib/reading";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { BookCard } from "@/components/ui/BookCard";
import { normalizeIsbn } from "@/lib/isbn";
import { ContextSharing } from "@/components/context/ContextSharing";
import type { ContextSelection } from "@/lib/context-sharing";
import { Bookshelf } from "./Bookshelf";
import { mentionedWork } from "@/lib/book-journal";
import type { JournalEntry } from "@/lib/book-journal";
import type { BookshelfData } from "@/lib/bookshelf";
import type { OpenLibrarySearchResult } from "@/lib/openLibrary";
type Message = {
  id?: string;
  workId?: string | null;
  version?: number;
  createdAt?: string;
  role: "user" | "assistant";
  content: string;
  complete?: boolean;
};
function Recommendations({ text }: { text: string }) {
  const [books, setBooks] = useState<OpenLibrarySearchResult[]>([]);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const isbns = Array.from(
      new Set(
        (text.match(/\b97[89][\d -]{10,20}\d\b/g) ?? [])
          .map(normalizeIsbn)
          .filter((s): s is string => !!s),
      ),
    ).slice(0, 9);
    Promise.all(
      isbns.map((isbn) =>
        fetch(`/api/books/${isbn}`, { signal: controller.signal })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    ).then((results) => {
      if (!controller.signal.aborted)
        setBooks(results.flatMap((r) => (r?.book ? [r.book] : [])));
    });
    return () => controller.abort();
  }, [text]);
  if (!books.length) return null;
  return (
    <div className="space-y-2 mt-4">
      {books.slice(0, expanded ? 9 : 3).map((b) => (
        <BookCard key={b.isbn13} book={b} />
      ))}
      {books.length > 3 && !expanded && (
        <Button variant="ghost" size="sm" onClick={() => setExpanded(true)}>
          Show more
        </Button>
      )}
      <Link href="/library" className="text-sm text-shelf-700 hover:underline">
        Find and shelve a book
      </Link>
    </div>
  );
}
export function ChatView({
  currentBook,
  initialBookId,
  initialConversation,
}: {
  initialBookId?: string;
  initialConversation?: string;
  currentBook: { title: string; author: string; page: number } | null;
}) {
  const router = useRouter();
  const [shelf, setShelf] = useState<BookshelfData | null>(null);
  const [shelfError, setShelfError] = useState("");
  const [shelfAttempt, setShelfAttempt] = useState(0);
  const [selectedWork, setSelectedWork] = useState("");
  const selectedInitialized = useRef(false);
  const [conversationId, setConversationId] = useState<string>("");
  const [conversations, setConversations] = useState<
    { conversationId: string; _max: { createdAt: string } }[]
  >([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [historyMore, setHistoryMore] = useState(false);
  const [moreConversations, setMoreConversations] = useState(false);
  const [conversationPage, setConversationPage] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const pendingMessage = useRef<{
    id: string;
    text: string;
    workId: string | null;
  } | null>(null);
  const noteRequest = useRef<{
    id: string;
    text: string;
    workId: string;
  } | null>(null);
  const [savedNotice, setSavedNotice] = useState("");
  const unsavedReply = useRef<{
    id: string;
    text: string;
    workId: string | null;
  } | null>(null);
  const refreshShelf = () => setShelfAttempt((n) => n + 1);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/bookshelf", { signal: abort.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (abort.signal.aborted) return;
        setShelf(d);
        setShelfError("");
        if (!selectedInitialized.current && initialBookId) {
          setSelectedWork(
            d.choices.find((b: { id: string }) => b.id === initialBookId)
              ?.workId ?? "",
          );
          selectedInitialized.current = true;
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setShelfError(e.message);
      });
    return () => abort.abort();
  }, [shelfAttempt, initialBookId]);
  async function loadHistory(id?: string, older = false) {
    setHistoryError("");
    setHistoryLoading(true);
    if (!older) setHistoryReady(false);
    try {
      const params = new URLSearchParams();
      if (id) params.set("conversation", id);
      if (older && messages[0]?.createdAt) {
        params.set("before", messages[0].createdAt);
        if (messages[0].id) params.set("beforeId", messages[0].id);
      }
      const r = await fetch(`/api/chat/history?${params}`);
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setConversations(d.conversations);
      setMoreConversations(d.moreConversations);
      setConversationPage(0);
      setConversationId(d.conversationId ?? crypto.randomUUID());
      setHistoryMore(d.hasMore);
      const rows = d.messages.map((m: JournalEntry) => ({
        ...m,
        role: m.role as "user" | "assistant",
        content: m.text,
        complete: true,
      }));
      setMessages((old) =>
        older
          ? [...rows, ...old].filter(
              (m, index, all) => all.findIndex((a) => a.id === m.id) === index,
            )
          : rows,
      );
      if (!older && !initialBookId) setSelectedWork(rows.at(-1)?.workId ?? "");
      setHistoryReady(true);
      pendingMessage.current = null;
    } catch (e) {
      setHistoryError(
        e instanceof Error ? e.message : "Could not load conversations.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }
  useEffect(() => {
    void loadHistory(
      initialConversation,
    ); /* history is loaded once per navigation */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConversation]);
  async function saveChat(
    id: string,
    text: string,
    role: "user" | "assistant",
    workId: string | null,
  ) {
    const r = await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        kind: "chat",
        conversationId,
        role,
        text,
        workId,
      }),
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "Could not save this message.");
    setConversations((old) => [
      { conversationId, _max: { createdAt: d.entry.createdAt } },
      ...old.filter((c) => c.conversationId !== conversationId),
    ]);
    return d.entry as JournalEntry;
  }

  const [proposal, setProposal] = useState<{
    books: LibraryBook[];
    intent: ReadingIntent;
    date: string;
  } | null>(null);
  const [proposalBook, setProposalBook] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [personalContext, setPersonalContext] =
    useState<ContextSelection | null>(null);
  useEffect(() => setPersonalContext(null), [conversationId]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (busy) end.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);
  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    if (
      !input.trim() ||
      busy ||
      proposal ||
      !historyReady ||
      unsavedReply.current
    )
      return;
    const text = input.trim();
    const namedWork = mentionedWork(
      text,
      (shelf?.choices ?? []).map((b) => ({ id: b.workId, title: b.title })),
    );
    const currentWorks = [
      ...new Set(
        (shelf?.choices ?? [])
          .filter((b) => b.shelf === "reading_now")
          .map((b) => b.workId),
      ),
    ];
    const workId =
      selectedWork ||
      namedWork ||
      (parseReadingIntent(text) && currentWorks.length === 1
        ? currentWorks[0]
        : null);
    const existing =
      pendingMessage.current?.text === text &&
      pendingMessage.current.workId === workId
        ? pendingMessage.current
        : null;
    const messageId = existing?.id ?? crypto.randomUUID();
    pendingMessage.current = { id: messageId, text, workId };
    const next: Message[] = [
      ...messages.filter((m) => m.complete !== false && m.id !== messageId),
      { id: messageId, workId, version: 0, role: "user", content: text },
    ];
    setMessages([...next, { role: "assistant", content: "", complete: false }]);
    setInput("");
    setError("");
    setBusy(true);
    controller.current = new AbortController();
    let userSaved = false;
    try {
      await saveChat(messageId, text, "user", workId);
      userSaved = true;
      if (workId) setSelectedWork(workId);
      setSavedNotice(
        workId
          ? "Saved in this book’s journal."
          : "Conversation saved. Choose a book to file it in a journal.",
      );
      const preview = await fetch("/api/chat/log-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.current.signal,
        body: JSON.stringify({
          message: text,
          today: localDate(),
          ...(selectedWork ? { workId: selectedWork } : {}),
        }),
      });
      const parsed = await preview.json();
      if (!preview.ok)
        throw new Error(
          parsed.error ?? "The message could not be checked. Try again.",
        );
      if (parsed.handled) {
        const content =
          parsed.message ??
          "Check the book and pages below. Nothing is logged until you confirm.";
        const assistantId = crypto.randomUUID();
        const linkedWork = workId;
        await saveChat(assistantId, content, "assistant", linkedWork);
        setMessages([
          ...next,
          {
            id: assistantId,
            workId: linkedWork,
            version: 0,
            role: "assistant",
            content,
            complete: true,
          },
        ]);
        pendingMessage.current = null;
        if (parsed.books) {
          setProposal(parsed);
          setProposalBook(parsed.books.length === 1 ? parsed.books[0].id : "");
        }
        return;
      }
      const sharing = personalContext;
      setPersonalContext(null);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.current.signal,
        body: JSON.stringify({
          workId,
          ...(sharing ? { personalContext: sharing } : {}),
          messages: next
            .slice(-40)
            .map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "The reply didn't arrive. Try again.");
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("The reply didn't arrive.");
      const decoder = new TextDecoder();
      let pending = "";
      let reply = "";
      let done = false;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        pending += decoder.decode(chunk.value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.error) throw new Error(event.error);
          if (event.text) {
            reply += event.text;
            setMessages([
              ...next,
              { role: "assistant", content: reply, complete: false },
            ]);
          }
          if (event.done) done = true;
        }
      }
      if (!done)
        throw new Error("The reply was interrupted. Please try again.");
      const replyId = crypto.randomUUID();
      try {
        await saveChat(replyId, reply, "assistant", workId);
        setMessages([
          ...next,
          {
            id: replyId,
            workId,
            version: 0,
            role: "assistant",
            content: reply,
            complete: true,
          },
        ]);
      } catch {
        unsavedReply.current = { id: replyId, text: reply, workId };
        setMessages([
          ...next,
          {
            id: replyId,
            workId,
            version: 0,
            role: "assistant",
            content: reply,
            complete: true,
          },
        ]);
        setError(
          "The reply arrived but could not be saved. Retry saving before leaving this page.",
        );
      }
      pendingMessage.current = null;
    } catch (e) {
      if (!controller.current?.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "The reply didn't arrive. Try again.",
        );
      setMessages(userSaved ? next : next.slice(0, -1));
      setInput(text);
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }
  return (
    <div className="flex flex-col min-h-full max-w-5xl mx-auto">
      <header className="min-h-12 border-b border-ink-200 px-4 py-2 flex justify-between gap-3 items-center">
        <h1 className="font-display text-lg">Chat</h1>
        {currentBook && (
          <Link href="/library" className="text-xs text-ink-500 truncate">
            {currentBook.title} &middot; p.{currentBook.page}
          </Link>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={
            busy ||
            !!proposal ||
            !historyReady ||
            !!unsavedReply.current ||
            !messages.length
          }
          onClick={() => {
            setMessages([]);
            setConversationId(crypto.randomUUID());
            setHistoryMore(false);
            pendingMessage.current = null;
            setSavedNotice("");
            setError("");
          }}
        >
          New chat
        </Button>
      </header>
      <div className="px-4 py-2 flex flex-wrap gap-4 text-sm text-shelf-700">
        <Link href="/library">Library</Link>
        <Link href="/library/diary">Reading diary</Link>
        <Link href="/creator">Your writing</Link>
      </div>
      {shelf ? (
        <Bookshelf data={shelf} onRefresh={refreshShelf} />
      ) : (
        <p className="p-4" role="status">
          {shelfError || "Loading your reading shelf..."}{" "}
          {shelfError && (
            <Button variant="secondary" onClick={refreshShelf}>
              Retry bookshelf
            </Button>
          )}
        </p>
      )}
      <div className="px-4 py-2 flex flex-wrap items-end gap-3 border-b border-ink-200">
        <label className="text-sm flex-1 min-w-0">
          Talking about
          <select
            aria-label="Book for this conversation"
            className="block w-full border p-2 rounded bg-paper-50"
            value={selectedWork}
            disabled={busy || !!proposal}
            onChange={(e) => setSelectedWork(e.target.value)}
          >
            <option value="">General chat / detect named book</option>
            {Array.from(
              new Map(
                (shelf?.choices ?? []).map((b) => [b.workId, b]),
              ).values(),
            ).map((b) => (
              <option key={b.workId} value={b.workId}>
                {b.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Saved conversations
          <select
            aria-label="Saved conversations"
            className="block max-w-48 border p-2 rounded"
            value={conversationId}
            disabled={
              busy || historyLoading || !!proposal || !!unsavedReply.current
            }
            onChange={(e) => void loadHistory(e.target.value)}
          >
            <option value={conversationId}>Current conversation</option>
            {conversations
              .filter((c) => c.conversationId !== conversationId)
              .map((c) => (
                <option key={c.conversationId} value={c.conversationId}>
                  {c._max.createdAt.slice(0, 16).replace("T", " ")}
                </option>
              ))}
          </select>
        </label>
      </div>
      {moreConversations && (
        <Button
          variant="ghost"
          disabled={busy || historyLoading}
          onClick={async () => {
            setHistoryLoading(true);
            setHistoryError("");
            try {
              const r = await fetch(
                `/api/chat/history?listPage=${conversationPage + 1}`,
              );
              const d = await r.json();
              if (!r.ok) throw Error(d.error);
              setConversations((old) =>
                [...old, ...d.conversations].filter(
                  (c, i, all) =>
                    all.findIndex(
                      (a) => a.conversationId === c.conversationId,
                    ) === i,
                ),
              );
              setConversationPage((p) => p + 1);
              setMoreConversations(d.moreConversations);
            } catch (e) {
              setHistoryError(
                e instanceof Error
                  ? e.message
                  : "Could not load older conversations.",
              );
            } finally {
              setHistoryLoading(false);
            }
          }}
        >
          Load older conversations
        </Button>
      )}
      {historyError && (
        <p role="alert" className="p-4">
          {historyError}{" "}
          <Button onClick={() => void loadHistory(initialConversation)}>
            Retry conversation history
          </Button>
        </p>
      )}
      <div
        className="flex-1 overflow-y-auto px-4 py-6 space-y-6"
        role="log"
        aria-label="Conversation"
        aria-busy={busy}
      >
        {historyMore && (
          <Button
            variant="secondary"
            disabled={historyLoading || busy}
            onClick={() => void loadHistory(conversationId, true)}
          >
            Load earlier messages
          </Button>
        )}
        {!messages.length && (
          <div className="py-12">
            <p className="text-sm text-ink-500 mb-3">
              A little space for your reading life
            </p>
            <h2 className="font-display text-4xl mb-4">
              What are you reading?
            </h2>
            <p className="text-ink-500 max-w-prose">
              Ask about your library, find your next book, or talk through the
              one you can&rsquo;t put down.
            </p>
            {currentBook ? (
              <div className="mt-8 p-4 bg-paper-100 rounded-md">
                <p className="text-xs text-ink-500 mb-1">
                  On your bedside table
                </p>
                <p className="font-display text-xl">{currentBook.title}</p>
                <p className="text-sm text-ink-500">{currentBook.author}</p>
              </div>
            ) : (
              <Link
                href="/library"
                className="inline-block mt-6 text-shelf-700 hover:underline"
              >
                Start with a book in your library
              </Link>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={m.id ?? i}
            className={
              m.role === "user"
                ? "max-w-message ml-auto bg-shelf-700 text-white rounded-lg rounded-br-sm px-4 py-2.5 whitespace-pre-wrap break-words"
                : "max-w-message mr-auto text-ink-950 break-words"
            }
          >
            {m.role === "user" ? (
              <span>{m.content}</span>
            ) : (
              <>
                {m.content ? (
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => (
                        <p className="mb-3 last:mb-0">{children}</p>
                      ),
                      ul: ({ children }) => (
                        <ul className="list-disc pl-5 mb-3">{children}</ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="list-decimal pl-5 mb-3">{children}</ol>
                      ),
                      a: ({ children, href }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-shelf-700 underline"
                        >
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                ) : (
                  <span role="status" className="text-sm text-ink-500">
                    Thinking about your books...
                  </span>
                )}
                {m.complete && <Recommendations text={m.content} />}
              </>
            )}
            {m.id && m.complete !== false && (
              <label className="block text-xs mt-3">
                Filed under
                <select
                  aria-label={`Book for message ${i + 1}`}
                  className="block w-full max-w-xs rounded border p-1 text-ink-950 bg-paper-50"
                  value={m.workId ?? ""}
                  disabled={busy}
                  onChange={async (e) => {
                    const workId = e.target.value || null;
                    setError("");
                    try {
                      const r = await fetch(`/api/journal/${m.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          version: m.version ?? 0,
                          workId,
                        }),
                      });
                      const d = await r.json();
                      if (!r.ok) throw Error(d.error);
                      setMessages((old) =>
                        old.map((row) =>
                          row.id === m.id
                            ? { ...row, workId, version: d.entry.version }
                            : row,
                        ),
                      );
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Could not file message.",
                      );
                    }
                  }}
                >
                  <option value="">General chat (not in a book journal)</option>
                  {Array.from(
                    new Map(
                      (shelf?.choices ?? []).map((b) => [b.workId, b]),
                    ).values(),
                  ).map((b) => (
                    <option key={b.workId} value={b.workId}>
                      {b.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        ))}
        {proposal && (
          <section
            className="bg-paper-100 rounded-md p-4 space-y-4"
            aria-label="Confirm reading session"
          >
            <label className="block text-sm">
              Which book?
              <select
                value={proposalBook}
                onChange={(e) => setProposalBook(e.target.value)}
                className="block w-full p-2 bg-paper-50 border border-ink-200 rounded mt-1"
              >
                <option value="">Choose your current read</option>
                {proposal.books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title} (page {b.currentPage})
                  </option>
                ))}
              </select>
            </label>
            {proposal.books.find((b) => b.id === proposalBook) ? (
              <LogSession
                key={proposalBook}
                book={proposal.books.find((b) => b.id === proposalBook)!}
                intent={proposal.intent}
                defaultDate={proposal.date}
                onCancel={() => setProposal(null)}
                onSaved={async (book, pages) => {
                  setProposal(null);
                  refreshShelf();
                  router.refresh();
                  const content = `${pages} pages logged for ${book.title}. You are on page ${book.currentPage}.`;
                  const id = crypto.randomUUID(),
                    workId = book.workId ?? null;
                  setMessages((current) => [
                    ...current,
                    {
                      id,
                      workId,
                      version: 0,
                      role: "assistant",
                      content,
                      complete: true,
                    },
                  ]);
                  try {
                    const userMessage = messages
                      .filter((m) => m.role === "user")
                      .at(-1);
                    if (userMessage?.id && !userMessage.workId && workId) {
                      const r = await fetch(`/api/journal/${userMessage.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          version: userMessage.version ?? 0,
                          workId,
                        }),
                      });
                      const d = await r.json();
                      if (!r.ok) throw Error(d.error);
                      setMessages((old) =>
                        old.map((m) =>
                          m.id === userMessage.id
                            ? { ...m, workId, version: d.entry.version }
                            : m,
                        ),
                      );
                    }
                    await saveChat(id, content, "assistant", workId);
                  } catch {
                    unsavedReply.current = { id, text: content, workId };
                    setError(
                      "The session is saved, but its chat confirmation needs saving. Retry below.",
                    );
                  }
                }}
              />
            ) : (
              <Button variant="ghost" onClick={() => setProposal(null)}>
                Cancel logging
              </Button>
            )}
          </section>
        )}
        <div ref={end} />
      </div>
      <div className="border-t border-ink-200 px-4 py-3">
        <p className="text-xs text-ink-500 mb-2">
          Your conversations are saved privately. Book-linked messages also
          appear in that book’s journal.
        </p>
        {savedNotice && (
          <p role="status" className="text-sm mb-2">
            {savedNotice}
          </p>
        )}
        {unsavedReply.current && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              const reply = unsavedReply.current;
              if (!reply) return;
              setBusy(true);
              try {
                await saveChat(reply.id, reply.text, "assistant", reply.workId);
                unsavedReply.current = null;
                setError("");
              } catch {
                setError("Could not save reply. Try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Retry saving reply
          </Button>
        )}

        {error && (
          <p role="alert" className="text-sm text-rose-600 mb-3">
            {error}
          </p>
        )}
        <ContextSharing
          key={conversationId}
          value={personalContext}
          onChange={setPersonalContext}
          disabled={busy}
        />
        <form onSubmit={send} className="flex gap-2 items-end">
          <Textarea
            ref={textarea}
            aria-label="Message your reading companion"
            rows={2}
            maxLength={12000}
            className="resize-none bg-paper-100"
            placeholder="Ask anything about your books..."
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 168)}px`;
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button
            type="submit"
            size="sm"
            disabled={
              !input.trim() ||
              busy ||
              !!proposal ||
              !historyReady ||
              !!unsavedReply.current
            }
          >
            Send
          </Button>
          {busy && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => controller.current?.abort()}
            >
              Stop
            </Button>
          )}
        </form>
        {selectedWork && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy || !input.trim() || !!proposal}
            onClick={async () => {
              setBusy(true);
              setError("");
              const text = input.trim();
              const id =
                noteRequest.current?.text === text
                  ? noteRequest.current.id
                  : crypto.randomUUID();
              noteRequest.current = { id, text, workId: selectedWork };
              try {
                const r = await fetch("/api/journal", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    id,
                    kind: "note",
                    workId: selectedWork,
                    text,
                  }),
                });
                const d = await r.json();
                if (!r.ok) throw Error(d.error);
                setInput("");
                noteRequest.current = null;
                setSavedNotice("Note saved to the book journal.");
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Could not save note.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Save as book note
          </Button>
        )}
        {!messages.length && (
          <div className="flex gap-2 overflow-x-auto pt-3">
            {[
              "What should I read next?",
              "Help me choose from my shelves",
              "Let's talk about my current book",
            ].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setInput(s);
                  textarea.current?.focus();
                }}
                className="shrink-0 bg-paper-100 border border-ink-200 rounded-full px-3 py-1.5 text-sm hover:bg-paper-200"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
