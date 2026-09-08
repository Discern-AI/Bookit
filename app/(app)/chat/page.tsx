import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ChatView } from "@/components/chat/ChatView";
export default async function ChatPage() {
  const session = await auth();
  if (!session?.user) return null;
  const book = await prisma.userBook.findFirst({
    where: { userId: session.user.id, shelf: "reading_now" },
    include: {
      edition: { include: { work: true } },
      readingSessions: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 1 },
    },
    orderBy: { dateAdded: "desc" },
  });
  return (
    <ChatView
      currentBook={
        book
          ? {
              title: book.edition.work.title,
              author: book.edition.work.authorName,
              page: book.readingSessions[0]?.pageEnd ?? 0,
            }
          : null
      }
    />
  );
}
