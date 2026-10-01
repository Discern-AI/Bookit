import { ClubView } from "@/components/community/ClubView";
export default function Page({
  params,
  searchParams,
}: {
  params: { clubId: string };
  searchParams: { reading?: string };
}) {
  return (
    <ClubView
      key={`${params.clubId}:${searchParams.reading ?? ""}`}
      clubId={params.clubId}
      initialReading={searchParams.reading}
    />
  );
}
