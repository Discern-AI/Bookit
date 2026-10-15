import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { shopData, shopInclude } from "@/lib/curator-shop";
import { ShopEditor } from "@/components/shops/ShopEditor";
export default async function Page() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const [shop, user] = await Promise.all([
    prisma.curatorShop.findUnique({
      where: { userId: session.user.id },
      include: shopInclude,
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { username: true, profilePublic: true },
    }),
  ]);
  return (
    <ShopEditor
      initial={
        shop
          ? shopData(shop)
          : {
              version: 0,
              title: "My book recommendations",
              introduction: "",
              isPublic: false,
              entries: [],
            }
      }
      username={user?.username || ""}
      profilePublic={!!user?.profilePublic}
    />
  );
}
