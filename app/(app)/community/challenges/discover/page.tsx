import { CommunityChallenges } from "@/components/community/CommunityChallenges";
export default async function Page(props: {
  searchParams: Promise<{ challenge?: string }>;
}) {
  const searchParams = await props.searchParams;
  return <CommunityChallenges challengeId={searchParams.challenge} />;
}
