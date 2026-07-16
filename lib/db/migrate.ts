import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "./client";

export function runMigrations(): void {
  try {
    migrate(getDb(), { migrationsFolder: "./drizzle" });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[sift] Database migration failed — refusing to start.", err);
    process.exit(1);
  }
}

// Allow `npm run db:migrate` to invoke this directly.
if (process.argv[1]?.endsWith("migrate.ts")) {
  runMigrations();
  // eslint-disable-next-line no-console
  console.log(`[sift] Migrations applied to ${process.env.SIFT_DB_PATH ?? "data/sift.db"}`);
}
