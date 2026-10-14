// Stable identifiers are persisted on original discussion records.
export const discussionCommunities = [
  {
    id: "crime",
    name: "Crime and mystery",
    kind: "Genre",
    description: "Detectives, mysteries and crime fiction.",
  },
  {
    id: "science-fiction",
    name: "Science fiction",
    kind: "Genre",
    description: "Speculative worlds, technology and possible futures.",
  },
  {
    id: "fantasy",
    name: "Fantasy",
    kind: "Genre",
    description: "Magic, mythology and imagined worlds.",
  },
  {
    id: "literary-fiction",
    name: "Literary fiction",
    kind: "Genre",
    description: "Character, language and literary storytelling.",
  },
  {
    id: "nonfiction",
    name: "Nonfiction",
    kind: "Genre",
    description: "History, memoir, science and ideas.",
  },
  {
    id: "translation",
    name: "Reading in translation",
    kind: "Topic",
    description: "Translations, editions and reading across languages.",
  },
  {
    id: "adaptations",
    name: "Book adaptations",
    kind: "Topic",
    description: "Discuss books alongside their screen and stage adaptations.",
  },
  {
    id: "reading-craft",
    name: "The craft of writing",
    kind: "Topic",
    description: "Explore voice, structure and storytelling through books.",
  },
] as const;
export function discussionCommunity(id: string) {
  return discussionCommunities.find((community) => community.id === id);
}
