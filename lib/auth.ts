import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { loginThrottle } from "@/lib/rate-limit";

// A valid bcrypt hash (cost 10, matching registration) of a throwaway string.
// When the email doesn't exist we still run one bcrypt.compare against this so a
// missing user costs the same time as a wrong password — closes the timing
// side-channel that would otherwise let an attacker enumerate registered emails.
const DUMMY_HASH = bcrypt.hashSync("sendo-nonexistent-user", 10);

// Best-effort client IP from the proxy chain; falls back to a constant so the
// throttle still counts per-email when no IP is available.
function clientIp(req?: { headers?: Record<string, string | undefined> | unknown }): string {
  const headers = (req?.headers ?? {}) as Record<string, string | undefined>;
  const fwd = headers["x-forwarded-for"] ?? headers["x-real-ip"];
  return fwd?.split(",")[0]?.trim() || "unknown";
}

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
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.toLowerCase().trim();
        const ip = clientIp(req);

        // Reject early when this email+IP is locked out (D10 — brute-force guard).
        if (!loginThrottle.check(email, ip).allowed) return null;

        const user = await db.user.findUnique({ where: { email } });
        if (!user) {
          // Constant-time: spend the same bcrypt work as a real (wrong) password
          // so response time can't distinguish a missing email from a valid one.
          await bcrypt.compare(credentials.password, DUMMY_HASH);
          loginThrottle.recordFailure(email, ip);
          return null;
        }
        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) {
          loginThrottle.recordFailure(email, ip);
          return null;
        }
        loginThrottle.recordSuccess(email, ip); // reset the counter on success
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
