import Link from "next/link";
import { AccountLinkRequest } from "@/components/community/AccountLinkRequest";
export default function Page() {
  return (
    <div className="space-y-4">
      <AccountLinkRequest action="reset" />
      <Link className="underline" href="/login">
        Back to login
      </Link>
    </div>
  );
}
