import { BookJournal } from "@/components/library/BookJournal";
export default async function Page(props: {
  params: Promise<{ userBookId: string }>;
}) {
  const params = await props.params;
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8">
      <BookJournal key={params.userBookId} bookId={params.userBookId} />
    </div>
  );
}
