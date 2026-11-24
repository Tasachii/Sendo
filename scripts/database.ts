import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { access, copyFile, link, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultDatabasePath = path.resolve("prisma/dev.db");

async function exists(filePath: string) {
  return access(filePath).then(() => true, () => false);
}

function sqliteUrl(filePath: string) {
  return `file:${filePath}`;
}

export async function backupDatabase(source: string, destination: string) {
  const sourcePath = path.resolve(source);
  const destinationPath = path.resolve(destination);
  if (sourcePath === destinationPath) throw new Error("Backup destination must differ from the live database");
  if (!(await exists(sourcePath))) throw new Error(`Database not found: ${sourcePath}`);
  if (await exists(destinationPath)) throw new Error(`Backup already exists: ${destinationPath}`);

  await mkdir(path.dirname(destinationPath), { recursive: true });
  const temporaryPath = `${destinationPath}.backup-${process.pid}-${randomUUID()}.tmp`;
  const db = new PrismaClient({ datasourceUrl: sqliteUrl(sourcePath) });
  try {
    try {
      const escapedDestination = temporaryPath.replaceAll("'", "''");
      await db.$executeRawUnsafe(`VACUUM INTO '${escapedDestination}'`);
    } finally {
      await db.$disconnect();
    }
    await link(temporaryPath, destinationPath);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

export async function restoreDatabase(backup: string, destination: string) {
  const backupPath = path.resolve(backup);
  const destinationPath = path.resolve(destination);
  if (backupPath === destinationPath) throw new Error("Backup and restore destination must differ");
  if (!(await exists(backupPath))) throw new Error(`Backup not found: ${backupPath}`);
  if (await exists(destinationPath)) throw new Error(`Database already exists: ${destinationPath}`);
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    if (await exists(`${destinationPath}${suffix}`)) throw new Error(`Refusing restore with orphan SQLite sidecar: ${destinationPath}${suffix}`);
  }

  const checkDb = new PrismaClient({ datasourceUrl: sqliteUrl(backupPath) });
  try {
    const result = await checkDb.$queryRawUnsafe<Array<{ integrity_check: string }>>("PRAGMA integrity_check");
    if (result[0]?.integrity_check !== "ok") throw new Error("Backup failed SQLite integrity_check");
  } finally {
    await checkDb.$disconnect();
  }

  await mkdir(path.dirname(destinationPath), { recursive: true });
  const temporaryPath = `${destinationPath}.restore-${process.pid}-${randomUUID()}.tmp`;
  try {
    await copyFile(backupPath, temporaryPath);
    await link(temporaryPath, destinationPath);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

async function main() {
  const [command, file] = process.argv.slice(2);
  if (command === "backup" && file) {
    await backupDatabase(defaultDatabasePath, file);
    console.log(`Backup written to ${path.resolve(file)}`);
    return;
  }
  if (command === "restore" && file) {
    await restoreDatabase(file, defaultDatabasePath);
    console.log(`Database restored from ${path.resolve(file)}`);
    return;
  }
  throw new Error("Usage: npm run db:backup -- <dump-file> | npm run db:restore -- <dump-file>");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
