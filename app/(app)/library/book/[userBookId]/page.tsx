import { BookJournal } from "@/components/library/BookJournal";
export default function Page({ params }: { params: { userBookId: string } }) {
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8">
      <BookJournal key={params.userBookId} bookId={params.userBookId} />
    </div>
  );
}
