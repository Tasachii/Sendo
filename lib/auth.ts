import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "อีเมล", type: "email" },
        password: { label: "รหัสผ่าน", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });
        if (!user) return null;
        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;
        // shape returned here flows into the jwt() callback as `user`
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          companyId: user.companyId,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    // persist tenant + role into the token on sign-in
    async jwt({ token, user }) {
      if (user) {
        token.companyId = (user as { companyId: string }).companyId;
        token.role = (user as { role: "OWNER" | "STAFF" | "VIEWER" }).role;
      }
      return token;
    },
    // expose tenant + role on the session for server-side guards
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.companyId = token.companyId as string;
        session.user.role = token.role as "OWNER" | "STAFF" | "VIEWER";
      }
      return session;
    },
  },
};
