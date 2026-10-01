import { CommunityChallenges } from "@/components/community/CommunityChallenges";
export default function Page({
  searchParams,
}: {
  searchParams: { challenge?: string };
}) {
  return <CommunityChallenges challengeId={searchParams.challenge} />;
}
