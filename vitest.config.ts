import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // mirror tsconfig paths: "@/*" -> project root
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["lib/**", "app/actions/**", "app/api/**"],
      exclude: ["**/*.d.ts", "components/pdf/**/*.tsx"],
      // Gate floored just below the current run so CI catches regressions without
      // being unreachable. P2 added the customers/services/team/taxSettings action
      // suites, both PDF route handlers, and the login-throttle, lifting the floor.
      // Actual run: lines 81.4 / funcs 74.7 / branches 82.2 / stmts 81.4.
      // Remaining headroom is the still-untested surface (lib/auth.ts session/jwt
      // callbacks, [...nextauth] route, lib/overdue.ts, lib/reports CSV branch).
      thresholds: { lines: 78, functions: 72, branches: 78, statements: 78 },
    },
  },
});
