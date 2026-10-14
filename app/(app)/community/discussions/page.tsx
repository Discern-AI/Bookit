import { BookDiscussions } from "@/components/community/BookDiscussions";
export default function Page({
  searchParams,
}: {
  searchParams: { work?: string };
}) {
  return <BookDiscussions workId={searchParams.work} />;
}
