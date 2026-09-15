import { Node } from "@tiptap/core";
export const ArticleImageNode = Node.create({
  name: "articleImage",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      imageId: { default: "" },
      alt: { default: "" },
      caption: { default: "" },
    };
  },
  parseHTML() {
    return [];
  },
  renderHTML({ node }) {
    return [
      "figure",
      {
        "data-article-image": node.attrs.imageId,
        class: "my-4 rounded border border-ink-200 p-3",
      },
      [
        "img",
        {
          src: `/api/article-images/${encodeURIComponent(node.attrs.imageId)}`,
          alt: node.attrs.alt,
          class: "max-h-96 max-w-full mx-auto rounded",
          loading: "lazy",
        },
      ],
      [
        "figcaption",
        { class: "text-sm text-ink-500 mt-2" },
        String(node.attrs.caption),
      ],
    ];
  },
});
export const BookCardNode = Node.create({
  name: "bookCard",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      editionId: { default: "" },
      workId: { default: "" },
      title: { default: "" },
      authorName: { default: "" },
      coverUrl: { default: "" },
    };
  },
  parseHTML() {
    return [];
  },
  renderHTML({ node }) {
    return [
      "div",
      {
        "data-book-card": node.attrs.editionId,
        class: "my-4 rounded border border-ink-200 p-4",
      },
      ["p", { class: "font-display text-xl" }, String(node.attrs.title)],
      ["p", {}, String(node.attrs.authorName)],
    ];
  },
});
