import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const isFreshClient = !globalForPrisma.prisma;
export const db = globalForPrisma.prisma ?? new PrismaClient({ log: ["warn", "error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// SQLite's default rollback-journal mode serializes every writer and reader against the
// whole file, so a concurrent external writer (e.g. the Telegram ingestion listener) can
// make ordinary app reads/writes fail with "database is locked". WAL mode lets readers run
// alongside a writer, and a busy_timeout makes short write/write contention retry instead
// of failing immediately. journal_mode=WAL is persisted in the db file itself, so this only
// needs to actually change it once, but it's idempotent and cheap to set on every boot.
if (isFreshClient) {
  db.$queryRawUnsafe("PRAGMA journal_mode=WAL;")
    .then(() => db.$queryRawUnsafe("PRAGMA busy_timeout=5000;"))
    .catch((e) => console.warn("[db] could not set WAL/busy_timeout pragmas:", e));
}

export const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};
