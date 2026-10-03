import { Router } from "express";
import { checkTeamPassword, createSession, dropSession, loginAllowed } from "../auth.js";
import { db, type Pilot } from "../db.js";

export const authRouter = Router();

/** Что за приглашение: показать имя на экране входа */
authRouter.get("/invite/:token", (req, res) => {
  const p = db
    .prepare("SELECT name, business FROM pilots WHERE invite_token = ? AND archived = 0")
    .get(req.params.token) as Pick<Pilot, "name" | "business"> | undefined;
  if (!p) {
    res.status(404).json({ error: "Ссылка недействительна. Попросите команду прислать новую." });
    return;
  }
  res.json({ name: p.name, business: p.business });
});

/**
 * Вход пилота по ссылке-приглашению. Ссылка многоразовая (телефон + планшет),
 * пока команда не выпустит новую. Согласие на обработку ПДн обязательно.
 */
authRouter.post("/invite/:token", (req, res) => {
  if (!loginAllowed(req.ip || "")) {
    res.status(429).json({ error: "Слишком много попыток, попробуйте через 10 минут" });
    return;
  }
  const p = db
    .prepare("SELECT * FROM pilots WHERE invite_token = ? AND archived = 0")
    .get(req.params.token) as Pilot | undefined;
  if (!p) {
    res.status(404).json({ error: "Ссылка недействительна. Попросите команду прислать новую." });
    return;
  }
  if (req.body?.consent !== true) {
    res.status(400).json({ error: "Нужно согласие на обработку персональных данных" });
    return;
  }
  if (!p.consent_at) db.prepare("UPDATE pilots SET consent_at = datetime('now') WHERE id = ?").run(p.id);
  res.json({ token: createSession("pilot", p.id), role: "pilot" });
});

authRouter.post("/team", (req, res) => {
  if (!loginAllowed(req.ip || "")) {
    res.status(429).json({ error: "Слишком много попыток, попробуйте через 10 минут" });
    return;
  }
  if (!checkTeamPassword(String(req.body?.password || ""))) {
    res.status(401).json({ error: "Неверный пароль" });
    return;
  }
  res.json({ token: createSession("team", null), role: "team" });
});

authRouter.post("/logout", (req, res) => {
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) dropSession(h.slice(7).trim());
  res.json({ ok: true });
});
