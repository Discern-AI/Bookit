import { BookDiscussions } from "@/components/community/BookDiscussions";
export default function Page({ params }: { params: { threadId: string } }) {
  return <BookDiscussions threadId={params.threadId} />;
}
