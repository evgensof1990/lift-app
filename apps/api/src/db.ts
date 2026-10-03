import fs from "node:fs";
import Database from "better-sqlite3";
import { config } from "./config.js";

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });

export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS pilots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,              -- как обращаться: «Анна»
  business TEXT NOT NULL DEFAULT '', -- название бизнеса: «Рентал»
  niche TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',   -- цель стратегии
  goal_note TEXT NOT NULL DEFAULT '',
  plan_title TEXT NOT NULL DEFAULT '', -- «план на 6 месяцев»
  team_note TEXT NOT NULL DEFAULT '',
  invite_token TEXT UNIQUE,
  consent_at TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('pilot', 'team')),
  pilot_id INTEGER REFERENCES pilots(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pilot_id INTEGER NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'next' CHECK (status IN ('done', 'current', 'next'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pilot_id INTEGER NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  due_date TEXT,                   -- YYYY-MM-DD, срок включительно
  points INTEGER NOT NULL DEFAULT 50,
  done_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pilot_id INTEGER NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'other',
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  admin_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'soon' CHECK (status IN ('works', 'setup', 'soon'))
);

CREATE TABLE IF NOT EXISTS survey_answers (
  pilot_id INTEGER NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  value TEXT NOT NULL,             -- JSON
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (pilot_id, question_id)
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,             -- случайное имя, оно же адрес /files/<id>
  pilot_id INTEGER NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pilot_id INTEGER NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- proposed — ждёт согласования пилотом, accepted — в работе, declined — в архиве
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'declined')),
  decline_reason TEXT NOT NULL DEFAULT '',
  decided_at TEXT
);
`);

/** Новые колонки в существующих таблицах (база могла быть создана прежней версией) */
function addColumn(table: string, name: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
}
addColumn("tasks", "goal_id", "INTEGER REFERENCES goals(id) ON DELETE SET NULL");
// задачи, созданные до согласования стратегии, — сразу в работе
addColumn("tasks", "status", "TEXT NOT NULL DEFAULT 'accepted'");
addColumn("tasks", "decline_reason", "TEXT NOT NULL DEFAULT ''");
addColumn("tasks", "decided_at", "TEXT");
addColumn("tasks", "sort_order", "INTEGER NOT NULL DEFAULT 0");
addColumn("pilots", "reviewed_at", "TEXT");

export type Status = "proposed" | "accepted" | "declined";

export type Goal = {
  id: number;
  pilot_id: number;
  sort_order: number;
  title: string;
  description: string;
  status: Status;
  decline_reason: string;
  decided_at: string | null;
};

export type Pilot = {
  id: number;
  name: string;
  business: string;
  niche: string;
  phone: string;
  goal: string;
  goal_note: string;
  plan_title: string;
  team_note: string;
  invite_token: string | null;
  consent_at: string | null;
  reviewed_at: string | null;
  archived: number;
  created_at: string;
};

export type Stage = {
  id: number;
  pilot_id: number;
  sort_order: number;
  title: string;
  description: string;
  status: "done" | "current" | "next";
};

export type Task = {
  id: number;
  pilot_id: number;
  title: string;
  description: string;
  due_date: string | null;
  points: number;
  done_at: string | null;
  created_at: string;
  goal_id: number | null;
  status: Status;
  decline_reason: string;
  decided_at: string | null;
  sort_order: number;
};

export type Tool = {
  id: number;
  pilot_id: number;
  sort_order: number;
  kind: string;
  title: string;
  subtitle: string;
  url: string;
  admin_url: string;
  status: "works" | "setup" | "soon";
};

/*
 * Автопостинг. Каналы подключает команда (ключи доступа хранятся только на сервере и в ответах API не отдаются),
 * посты создают и пилот, и команда; планировщик (posting.ts) раз в минуту публикует то, чему пришло время.
 */
db.exec(`
CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pilot_id INTEGER NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('vk', 'max')),
  title TEXT NOT NULL DEFAULT '',
  -- vk: { groupId, token } (ключ администратора сообщества); max: { botToken, chatId }
  config TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pilot_id INTEGER NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  photos TEXT NOT NULL DEFAULT '[]',      -- JSON: id файлов из таблицы files
  publish_at TEXT,                        -- ISO-время UTC; NULL у черновика
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'publishing', 'done', 'partial', 'failed')),
  created_by TEXT NOT NULL DEFAULT 'pilot',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS post_targets (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  url TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT,
  PRIMARY KEY (post_id, channel_id)
);
`);

export type ChannelKind = "vk" | "max";

export type Channel = {
  id: number;
  pilot_id: number;
  kind: ChannelKind;
  title: string;
  config: string;
  enabled: number;
  created_at: string;
};

export type Post = {
  id: number;
  pilot_id: number;
  text: string;
  photos: string;
  publish_at: string | null;
  status: "draft" | "scheduled" | "publishing" | "done" | "partial" | "failed";
  created_by: "pilot" | "team";
  created_at: string;
  updated_at: string;
};

export type PostTarget = {
  post_id: number;
  channel_id: number;
  status: "pending" | "sent" | "failed";
  url: string;
  error: string;
  attempts: number;
  sent_at: string | null;
};
