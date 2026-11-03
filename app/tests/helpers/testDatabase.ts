import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type Row = Record<string, unknown>;

// Resolved from the app directory so the same helper works for tests and for
// the local dev API fallback (both run with `app/` as the working directory).
const migrationsDir = join(process.cwd(), 'worker', 'migrations');

/**
 * Minimal D1-compatible facade over node:sqlite so Worker handlers can be
 * exercised without a Cloudflare account. Only the methods this project uses
 * are implemented, on purpose.
 */
export class TestDatabase {
  private readonly db: DatabaseSync;

  constructor(options: { file?: string } = {}) {
    this.db = new DatabaseSync(options.file ?? ':memory:');
  }

  prepare(query: string) {
    const db = this.db;
    let values: unknown[] = [];

    const statement = {
      bind(...next: unknown[]) {
        values = next;
        return statement;
      },
      async all<T = Row>(): Promise<{ results: T[] }> {
        return { results: db.prepare(query).all(...(values as never[])) as T[] };
      },
      async first<T = Row>(): Promise<T | null> {
        const row = db.prepare(query).get(...(values as never[]));
        return (row as T | undefined) ?? null;
      },
      async run(): Promise<{ meta: { changes: number }; success: boolean }> {
        const result = db.prepare(query).run(...(values as never[]));
        return { meta: { changes: Number(result.changes) }, success: true };
      },
    };

    return statement;
  }

  async exec(query: string): Promise<{ success: boolean }> {
    this.db.exec(query);
    return { success: true };
  }

  /** Stands in for D1's batch: every statement runs, in order, in one transaction. */
  async batch(statements: Array<{ run(): Promise<unknown> }>): Promise<unknown[]> {
    const results: unknown[] = [];
    this.db.exec('BEGIN');
    try {
      for (const statement of statements) results.push(await statement.run());
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return results;
  }

  private tableExists(name: string): boolean {
    const row = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name);
    return Boolean(row);
  }

  private columns(table: string): string[] {
    return this.db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((row) => String((row as Row).name));
  }

  /**
   * Whether a migration's effect is already present. Databases created before
   * migration tracking existed are recognised here instead of replaying SQL
   * that cannot run twice (0003 renames a column).
   */
  private migrationAlreadyApplied(file: string): boolean {
    if (file.startsWith('0001_')) return this.tableExists('staff');
    if (file.startsWith('0002_')) return this.tableExists('recovery_codes');
    if (file.startsWith('0003_')) {
      const columns = this.columns('staff');
      return columns.includes('username') && !columns.includes('email');
    }
    return false;
  }

  private recordMigration(file: string): void {
    this.db.prepare('INSERT OR IGNORE INTO d1_migrations (name) VALUES (?)').run(file);
  }

  /**
   * Applies pending migrations once, mirroring `wrangler d1 migrations apply`.
   * Safe to call on every start: applied files are tracked in `d1_migrations`.
   */
  migrate(): void {
    const files = readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort();

    this.db.exec(
      `CREATE TABLE IF NOT EXISTS d1_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    );

    const applied = new Set(
      this.db.prepare('SELECT name FROM d1_migrations').all().map((row) => String((row as Row).name)),
    );

    for (const file of files) {
      if (applied.has(file)) continue;
      if (this.migrationAlreadyApplied(file)) {
        this.recordMigration(file);
        continue;
      }
      this.db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
      this.recordMigration(file);
    }
  }

  /** Test-only access for asserting persisted rows. */
  raw<T = Row>(query: string, ...values: unknown[]): T[] {
    return this.db.prepare(query).all(...(values as never[])) as T[];
  }

  rawRun(query: string, ...values: unknown[]): void {
    this.db.prepare(query).run(...(values as never[]));
  }

  /** Runs a multi-statement SQL script (migrations, seed files). */
  rawExec(sql: string): void {
    this.db.exec(sql);
  }
}

export function createTestDatabase(): TestDatabase {
  const database = new TestDatabase();
  database.migrate();
  return database;
}
