import { libraryInclude, serializeBook } from "@/lib/book-data";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ChatView } from "@/components/chat/ChatView";
export default async function ChatPage() {
  const session = await auth();
  if (!session?.user) return null;
  const book = await prisma.userBook.findFirst({
    where: { userId: session.user.id, shelf: "reading_now" },
    include: libraryInclude,
    orderBy: { dateAdded: "desc" },
  });
  return (
    <ChatView
      currentBook={
        book
          ? {
              title: book.edition.work.title,
              author: book.edition.work.authorName,
              page: serializeBook(book).currentPage,
            }
          : null
      }
    />
  );
}
