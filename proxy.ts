import { withAuth } from "next-auth/middleware";

// Next.js 16 renamed "middleware" -> "proxy" (same functionality).
// withAuth gates the matched routes and redirects unauthenticated users to /login.
export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: ["/dashboard/:path*", "/invoices/:path*", "/customers/:path*", "/services/:path*", "/settings/:path*", "/reports/:path*", "/audit/:path*", "/team/:path*"],
};
