import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export async function createTestSchema(label: string) {
  const suffix = `${label}-${process.pid}-${randomUUID()}`;
  const prismaDirectory = path.join(process.cwd(), "prisma");
  const databasePath = path.join(prismaDirectory, `${suffix}.db`);
  const schemaPath = path.join(prismaDirectory, `${suffix}.prisma`);
  const schema = await readFile(path.join(prismaDirectory, "schema.prisma"), "utf8");
  await writeFile(schemaPath, schema.replace('url      = "file:./dev.db"', `url      = "file:./${suffix}.db"`));

  return {
    databasePath,
    schemaPath,
    databaseUrl: `file:${databasePath}`,
    migrate() {
      execFileSync(process.execPath, [path.join(process.cwd(), "node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", schemaPath], {
        cwd: process.cwd(),
        stdio: "pipe",
      });
    },
    async cleanup() {
      await Promise.all([databasePath, schemaPath].map((file) => unlink(file).catch(() => undefined)));
    },
  };
}

export async function createCommandWrappers() {
  const directory = path.join(process.cwd(), "prisma", `entrypoint-bin-${process.pid}-${randomUUID()}`);
  await mkdir(directory);
  const npxPath = path.join(directory, "npx");
  const npmPath = path.join(directory, "npm");
  await writeFile(npxPath, '#!/bin/sh\nexec "$SENDO_TEST_NODE" "$SENDO_TEST_PRISMA" migrate deploy --schema "$SENDO_TEST_SCHEMA"\n');
  await writeFile(npmPath, '#!/bin/sh\nif [ "$1" = "run" ] && [ "$2" = "start" ]; then exit 0; fi\nexec "$SENDO_TEST_NODE" "$SENDO_TEST_NPM" "$@"\n');
  await Promise.all([chmod(npxPath, 0o755), chmod(npmPath, 0o755)]);
  return directory;
}
