import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `.sql` files are not bundled, so the module-relative path only resolves when
 * this file is run from source (tests, tsx). The cwd path is what resolves
 * under `next start`, which is self-hosted from the repo root (Stage 13).
 */
function readSql(name: string): string {
  const candidates = [
    join(dirname(fileURLToPath(import.meta.url)), name),
    join(process.cwd(), 'lib', 'db', name),
  ];
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error(`migration file not found: ${name} (looked in ${candidates.join(', ')})`);
  return readFileSync(found, 'utf8');
}

export interface Migration {
  version: number;
  name: string;
  sql: () => string;
}

/**
 * Ordered, append-only. A migration is never edited once it has run anywhere;
 * a change is a new entry with the next version.
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    sql: () => readSql('schema.sql'),
  },
  {
    version: 2,
    name: 'events.stage',
    sql: () => readSql('schema-002-event-stage.sql'),
  },
  {
    version: 3,
    name: 'events.screen_id',
    sql: () => readSql('schema-003-event-screen.sql'),
  },
  {
    version: 4,
    name: 'stage renumber',
    sql: () => readSql('schema-004-stage-renumber.sql'),
  },
  {
    version: 5,
    name: 'rooms.open_stage',
    sql: () => readSql('schema-005-open-stage.sql'),
  },
];

export const SCHEMA_VERSION = migrations.reduce((max, m) => Math.max(max, m.version), 0);

/**
 * Applies every migration above the file's current `user_version`, each in its
 * own transaction. Idempotent: running it against an up-to-date file is a no-op.
 */
export function migrate(db: Database.Database): number {
  const current = db.pragma('user_version', { simple: true }) as number;

  for (const migration of migrations) {
    if (migration.version <= current) continue;

    const run = db.transaction(() => {
      db.exec(migration.sql());
      // PRAGMA does not accept a bound parameter.
      db.pragma(`user_version = ${migration.version}`);
    });
    run();
  }

  return db.pragma('user_version', { simple: true }) as number;
}
