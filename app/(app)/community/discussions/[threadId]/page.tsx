import { BookDiscussions } from "@/components/community/BookDiscussions";
export default async function Page(props: {
  params: Promise<{ threadId: string }>;
}) {
  const params = await props.params;
  return <BookDiscussions threadId={params.threadId} />;
}
