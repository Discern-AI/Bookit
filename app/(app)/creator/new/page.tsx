import { auth } from "@/auth";
import { randomUUID } from "node:crypto";
import { ArticleEditor } from "@/components/articles/ArticleEditor";
import { emptyArticle } from "@/lib/articles";
export const dynamic = "force-dynamic";
export default async function Page() {
  const session = await auth();
  return (
    <ArticleEditor
      userId={session!.user.id}
      initial={{
        id: randomUUID(),
        title: "",
        excerpt: "",
        content: emptyArticle,
        version: 0,
        isPublic: false,
        publishedVersion: null,
      }}
    />
  );
}
