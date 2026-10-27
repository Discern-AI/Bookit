import { prisma } from "./prisma";
import { contextKey, decryptContext } from "./context-encryption";
import { contextProfileSchema } from "./reading-context";
import { diaryBinding, diaryText } from "./context-diary";
import type { ContextSelection } from "./context-sharing";
export async function sharedContext(
  userId: string,
  selection?: ContextSelection,
) {
  if (!selection) return null;
  return prisma.$transaction(
    async (tx) => {
      const context = await tx.readingContext.findUnique({ where: { userId } });
      if ((context?.version || 0) !== selection.contextVersion)
        throw Error("stale");
      const entries = await tx.contextDiaryEntry.findMany({
        where: {
          userId,
          id: { in: selection.diaryIds },
          encryptedData: { not: null },
        },
      });
      if (entries.length !== selection.diaryIds.length) throw Error("missing");
      const key = contextKey();
      if (selection.profile && !context?.encryptedData) throw Error("missing");
      return {
        profile: selection.profile
          ? contextProfileSchema.parse(
              JSON.parse(decryptContext(context!.encryptedData!, userId, key)),
            )
          : null,
        diary: selection.diaryIds.map((id) => {
          const e = entries.find((row) => row.id === id)!;
          return {
            createdAt: e.createdAt,
            text: diaryText.parse(
              decryptContext(e.encryptedData!, diaryBinding(userId, id), key),
            ),
          };
        }),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
