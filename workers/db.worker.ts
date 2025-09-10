/* eslint-disable no-restricted-globals */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

type Message =
  | { id: string; type: 'init' }
  | { id: string; type: 'migrate' }
  | { id: string; type: 'run'; sql: string; params?: unknown[] }
  | { id: string; type: 'all'; sql: string; params?: unknown[] };

type Response =
  | { id: string; ok: true; result?: unknown }
  | { id: string; ok: false; error: string };

let db: any = null;
let sqlite3: any = null;

async function ensureDB() {
  if (db) return db;
  if (!sqlite3) {
    sqlite3 = await sqlite3InitModule({});
  }
  try {
    db = new sqlite3.oo1.OpfsDb('/clarity/main.sqlite3');
  } catch (e) {
    // Fallback to transient db if OPFS unavailable
    db = new sqlite3.oo1.DB('/clarity/main.sqlite3', 'ct');
  }
  return db;
}

function migrateSQL(): string {
  return `
CREATE TABLE IF NOT EXISTS calendars (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  kind TEXT NOT NULL CHECK(kind IN ('local','google')),
  readOnly INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  stage TEXT NOT NULL CHECK(stage IN ('todo','in-progress','done')),
  checked INTEGER NOT NULL DEFAULT 0,
  start TEXT,
  end TEXT,
  allDay INTEGER,
  isEvent INTEGER NOT NULL DEFAULT 0,
  hiddenOnCalendar INTEGER NOT NULL DEFAULT 0,
  linkedTo TEXT,
  parentId TEXT,
  subTasks TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  calendarId TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  sortOrder REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_tasks_stage ON tasks(stage);
CREATE INDEX IF NOT EXISTS idx_tasks_calendar ON tasks(calendarId);
CREATE INDEX IF NOT EXISTS idx_tasks_time ON tasks(start, end);

INSERT OR IGNORE INTO calendars(id,title,enabled,kind,readOnly)
VALUES ('local','Local Tasks',1,'local',0);
`;
}

self.onmessage = async (e: MessageEvent<Message>) => {
  const msg = e.data;
  const send = (res: Response) => (self as unknown as Worker).postMessage(res);
  try {
    switch (msg.type) {
      case 'init': {
        await ensureDB();
        send({ id: msg.id, ok: true });
        break;
      }
      case 'migrate': {
        const dbi = await ensureDB();
        dbi.exec(migrateSQL());
        // Attempt to migrate old column name 'order' -> 'sortOrder'
        try {
          dbi.exec('ALTER TABLE tasks RENAME COLUMN "order" TO sortOrder;');
        } catch (_) {
          // ignore if not present or already migrated
        }
        // If legacy 'color' column exists, rebuild table without it
        try {
          const cols = dbi.exec({ sql: 'PRAGMA table_info(tasks);', returnValue: 'resultRows', rowMode: 'object' }) as any[];
          const hasColor = Array.isArray(cols) && cols.some((r) => String((r as any).name || '') === 'color');
          if (hasColor) {
            dbi.exec('BEGIN;');
            dbi.exec(`
CREATE TABLE IF NOT EXISTS tasks__new (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  stage TEXT NOT NULL CHECK(stage IN ('todo','in-progress','done')),
  checked INTEGER NOT NULL DEFAULT 0,
  start TEXT,
  end TEXT,
  allDay INTEGER,
  isEvent INTEGER NOT NULL DEFAULT 0,
  hiddenOnCalendar INTEGER NOT NULL DEFAULT 0,
  linkedTo TEXT,
  parentId TEXT,
  subTasks TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  calendarId TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  sortOrder REAL NOT NULL DEFAULT 0
);
`);
            dbi.exec(`INSERT INTO tasks__new (id,title,description,stage,checked,start,end,allDay,isEvent,hiddenOnCalendar,linkedTo,parentId,subTasks,createdAt,updatedAt,calendarId,sortOrder)
SELECT id,title,description,stage,checked,start,end,allDay,isEvent,hiddenOnCalendar,linkedTo,parentId,subTasks,createdAt,updatedAt,calendarId,sortOrder FROM tasks;`);
            dbi.exec('DROP TABLE tasks;');
            dbi.exec('ALTER TABLE tasks__new RENAME TO tasks;');
            dbi.exec('CREATE INDEX IF NOT EXISTS idx_tasks_stage ON tasks(stage);');
            dbi.exec('CREATE INDEX IF NOT EXISTS idx_tasks_calendar ON tasks(calendarId);');
            dbi.exec('CREATE INDEX IF NOT EXISTS idx_tasks_time ON tasks(start, end);');
            dbi.exec('COMMIT;');
          }
        } catch (_) {
          try { dbi.exec('ROLLBACK;'); } catch {}
        }
        send({ id: msg.id, ok: true });
        break;
      }
      case 'run': {
        const dbi = await ensureDB();
        dbi.exec({ sql: msg.sql, bind: msg.params ?? [] });
        send({ id: msg.id, ok: true });
        break;
      }
      case 'all': {
        const dbi = await ensureDB();
        const rows = dbi.exec({
          sql: msg.sql,
          bind: msg.params ?? [],
          returnValue: 'resultRows',
          rowMode: 'object',
        });
        send({ id: msg.id, ok: true, result: rows });
        break;
      }
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    send({ id: msg.id, ok: false, error });
  }
};
