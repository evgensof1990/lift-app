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
`);

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
