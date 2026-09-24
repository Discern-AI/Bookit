export type ShelfVolume = {
  key: string;
  bookId: string;
  workId: string;
  title: string;
  author: string;
  coverUrl: string | null;
  date: string | null;
  cycle: number;
  section: "read" | "current" | "next";
};
export type ShelfChoice = {
  id: string;
  workId: string;
  title: string;
  shelf: string;
  pinned: boolean;
};
export type BookshelfData = {
  volumes: ShelfVolume[];
  choices: ShelfChoice[];
  showUpNext: boolean;
};
