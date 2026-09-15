import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import authConfig from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.authVersion = (
          user as typeof user & { authVersion: number }
        ).authVersion;
      }
      if (typeof token.id !== "string") return null;
      const current = await prisma.user.findUnique({
        where: { id: token.id },
        select: { authVersion: true },
      });
      if (
        !current ||
        current.authVersion !==
          (typeof token.authVersion === "number" ? token.authVersion : 0)
      )
        return null;
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
        session.user.authVersion =
          typeof token.authVersion === "number" ? token.authVersion : 0;
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : undefined;
        const password =
          typeof credentials?.password === "string"
            ? credentials.password
            : undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.password) return null;

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return null;

        return {
          id: user.id,
          authVersion: user.authVersion,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
});
