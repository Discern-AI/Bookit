"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogSession } from "@/components/library/LogSession";
import { LibraryBook } from "@/lib/book-data";
import { localDate, ReadingIntent } from "@/lib/reading";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { BookCard } from "@/components/ui/BookCard";
import { normalizeIsbn } from "@/lib/isbn";
import type { OpenLibrarySearchResult } from "@/lib/openLibrary";
type Message = {
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
}: {
  currentBook: { title: string; author: string; page: number } | null;
}) {
  const router = useRouter();
  const [proposal, setProposal] = useState<{
    books: LibraryBook[];
    intent: ReadingIntent;
    date: string;
  } | null>(null);
  const [proposalBook, setProposalBook] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages]);
  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    if (!input.trim() || busy || proposal) return;
    const text = input.trim();
    const next: Message[] = [
      ...messages.filter((m) => m.complete !== false),
      { role: "user", content: text },
    ];
    setMessages([...next, { role: "assistant", content: "", complete: false }]);
    setInput("");
    setError("");
    setBusy(true);
    controller.current = new AbortController();
    try {
      const preview = await fetch("/api/chat/log-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.current.signal,
        body: JSON.stringify({ message: text, today: localDate() }),
      });
      const parsed = await preview.json();
      if (!preview.ok)
        throw new Error(
          parsed.error ?? "The message could not be checked. Try again.",
        );
      if (parsed.handled) {
        setMessages([
          ...next,
          {
            role: "assistant",
            content:
              parsed.message ??
              "Check the book and pages below. Nothing is saved until you confirm.",
            complete: true,
          },
        ]);
        if (parsed.books) {
          setProposal(parsed);
          setProposalBook(parsed.books.length === 1 ? parsed.books[0].id : "");
        }
        return;
      }
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.current.signal,
        body: JSON.stringify({
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
      setMessages([
        ...next,
        { role: "assistant", content: reply, complete: true },
      ]);
    } catch (e) {
      if (!controller.current?.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "The reply didn't arrive. Try again.",
        );
      setMessages(next.slice(0, -1));
      setInput(text);
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }
  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
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
          disabled={busy || !!proposal || !messages.length}
          onClick={() => {
            setMessages([]);
            setError("");
          }}
        >
          New chat
        </Button>
      </header>
      <div
        className="flex-1 overflow-y-auto px-4 py-6 space-y-6"
        role="log"
        aria-label="Conversation"
        aria-busy={busy}
      >
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
            key={i}
            className={
              m.role === "user"
                ? "max-w-message ml-auto bg-shelf-700 text-white rounded-lg rounded-br-sm px-4 py-2.5 whitespace-pre-wrap break-words"
                : "max-w-message mr-auto text-ink-950 break-words"
            }
          >
            {m.role === "user" ? (
              m.content
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
                onSaved={(book, pages) => {
                  setProposal(null);
                  setMessages((current) => [
                    ...current,
                    {
                      role: "assistant",
                      content: `${pages} pages logged for ${book.title}. You are on page ${book.currentPage}.`,
                      complete: true,
                    },
                  ]);
                  router.refresh();
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
        {error && (
          <p role="alert" className="text-sm text-rose-600 mb-3">
            {error}
          </p>
        )}
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
            disabled={!input.trim() || busy || !!proposal}
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
