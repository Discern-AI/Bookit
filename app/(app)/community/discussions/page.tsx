import { BookDiscussions } from "@/components/community/BookDiscussions";
export default function Page({
  searchParams,
}: {
  searchParams: { work?: string; community?: string };
}) {
  return (
    <BookDiscussions
      key={`${searchParams.work || ""}:${searchParams.community || ""}`}
      workId={searchParams.work}
      communityId={searchParams.community}
    />
  );
}
