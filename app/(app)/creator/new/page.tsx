import { randomUUID } from "node:crypto";
import { ArticleEditor } from "@/components/articles/ArticleEditor";
import { emptyArticle } from "@/lib/articles";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <ArticleEditor
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
