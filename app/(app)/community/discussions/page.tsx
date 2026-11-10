import { BookDiscussions } from "@/components/community/BookDiscussions";
export default async function Page(props: {
  searchParams: Promise<{ work?: string; community?: string }>;
}) {
  const searchParams = await props.searchParams;
  return (
    <BookDiscussions
      key={`${searchParams.work || ""}:${searchParams.community || ""}`}
      workId={searchParams.work}
      communityId={searchParams.community}
    />
  );
}
