import { ClubView } from "@/components/community/ClubView";
export default async function Page(props: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ reading?: string }>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  return (
    <ClubView
      key={`${params.clubId}:${searchParams.reading ?? ""}`}
      clubId={params.clubId}
      initialReading={searchParams.reading}
    />
  );
}
