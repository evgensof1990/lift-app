import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { db } from "./db.js";

export type Session = { role: "pilot" | "team"; pilotId: number | null };

declare module "express-serve-static-core" {
  interface Request {
    session?: Session;
  }
}

const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Новая сессия: токен возвращается клиенту один раз, в базе — только его хеш */
export function createSession(role: Session["role"], pilotId: number | null) {
  const token = randomToken(32);
  db.prepare("INSERT INTO sessions (token_hash, role, pilot_id) VALUES (?, ?, ?)").run(hash(token), role, pilotId);
  return token;
}

export function dropSession(token: string) {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash(token));
}

function bearer(req: Request) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

export function loadSession(req: Request, _res: Response, next: NextFunction) {
  const token = bearer(req);
  if (token) {
    const row = db
      .prepare(
        `SELECT s.role, s.pilot_id FROM sessions s
         LEFT JOIN pilots p ON p.id = s.pilot_id
         WHERE s.token_hash = ? AND (s.role = 'team' OR p.archived = 0)`,
      )
      .get(hash(token)) as { role: Session["role"]; pilot_id: number | null } | undefined;
    if (row) {
      req.session = { role: row.role, pilotId: row.pilot_id };
      db.prepare("UPDATE sessions SET last_seen_at = datetime('now') WHERE token_hash = ?").run(hash(token));
    }
  }
  next();
}

export function requirePilot(req: Request, res: Response, next: NextFunction) {
  if (req.session?.role === "pilot" && req.session.pilotId) return next();
  res.status(401).json({ error: "Войдите по ссылке-приглашению" });
}

export function requireTeam(req: Request, res: Response, next: NextFunction) {
  if (req.session?.role === "team") return next();
  res.status(401).json({ error: "Нужен вход команды" });
}

/** Сравнение пароля без утечки по времени */
export function checkTeamPassword(password: string) {
  if (!config.teamPassword) return false;
  const a = Buffer.from(hash(password));
  const b = Buffer.from(hash(config.teamPassword));
  return crypto.timingSafeEqual(a, b);
}

/** Простой лимит попыток входа: 10 за 10 минут с одного IP */
const attempts = new Map<string, number[]>();
export function loginAllowed(ip: string) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  attempts.set(ip, list);
  return list.length <= 10;
}
