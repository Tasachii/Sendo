import "next-auth";
import "next-auth/jwt";

// augment NextAuth types so companyId + role are typed on session/user/jwt
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      companyId: string;
      role: "OWNER" | "STAFF" | "VIEWER";
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
  interface User {
    companyId: string;
    role: "OWNER" | "STAFF" | "VIEWER";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    companyId: string;
    role: "OWNER" | "STAFF" | "VIEWER";
  }
}
