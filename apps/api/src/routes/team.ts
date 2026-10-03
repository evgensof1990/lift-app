import { Router, type Response } from "express";
import { randomToken, requireTeam } from "../auth.js";
import { config } from "../config.js";
import { db, type Pilot, type Task } from "../db.js";
import { filesInfo } from "../answers.js";
import { getAnswers, getPilot, listTasks, pilotOverview } from "../pilot-data.js";
import { isOverdue } from "../game.js";
import { SURVEY, surveyProgress } from "../survey.js";

export const teamRouter = Router();
teamRouter.use(requireTeam);

const str = (v: unknown, max = 2000) => String(v ?? "").trim().slice(0, max);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function inviteUrl(token: string | null) {
  return token ? `${config.publicUrl}/invite/${token}` : "";
}

function pilotOr404(id: number, res: Response) {
  const p = getPilot(id);
  if (!p) res.status(404).json({ error: "Пилот не найден" });
  return p;
}

/** Список пилотов для таблицы команды */
teamRouter.get("/pilots", (_req, res) => {
  const pilots = db.prepare("SELECT * FROM pilots WHERE archived = 0 ORDER BY id").all() as Pilot[];
  const stageOf = db.prepare(
    "SELECT title FROM stages WHERE pilot_id = ? AND status = 'current' ORDER BY sort_order, id LIMIT 1",
  );
  res.json({
    pilots: pilots.map((p) => {
      const o = pilotOverview(p);
      const open = listTasks(p.id).filter((t) => !t.done_at);
      const nearest = open.find((t) => t.due_date) as Task | undefined;
      return {
        id: p.id,
        name: p.name,
        business: p.business,
        niche: p.niche,
        stage: (stageOf.get(p.id) as { title: string } | undefined)?.title || "",
        floor: o.game.floor,
        points: o.game.points,
        tasksDone: o.tasks.filter((t) => t.doneAt).length,
        tasksTotal: o.tasks.length,
        overdue: open.filter((t) => isOverdue(t)).length,
        nearest: nearest ? { title: nearest.title, dueDate: nearest.due_date, overdue: isOverdue(nearest) } : null,
        survey: o.survey,
        tools: o.tools.filter((t) => t.status !== "soon").map((t) => t.title),
        joined: !!p.consent_at,
      };
    }),
  });
});

teamRouter.post("/pilots", (req, res) => {
  const name = str(req.body?.name, 100);
  if (!name) {
    res.status(400).json({ error: "Укажите имя пилота" });
    return;
  }
  const token = randomToken(18);
  const info = db
    .prepare("INSERT INTO pilots (name, business, niche, phone, invite_token) VALUES (?, ?, ?, ?, ?)")
    .run(name, str(req.body?.business, 100), str(req.body?.niche, 100), str(req.body?.phone, 40), token);
  res.json({ id: Number(info.lastInsertRowid), inviteUrl: inviteUrl(token) });
});

teamRouter.get("/pilots/:id", (req, res) => {
  const p = pilotOr404(Number(req.params.id), res);
  if (!p) return;
  const answers = getAnswers(p.id);
  res.json({
    ...pilotOverview(p),
    profile: { phone: p.phone, consentAt: p.consent_at, inviteUrl: inviteUrl(p.invite_token) },
    surveySections: SURVEY,
    answers,
    files: filesInfo(p.id, answers),
    surveyProgress: surveyProgress(answers),
  });
});

teamRouter.put("/pilots/:id", (req, res) => {
  const p = pilotOr404(Number(req.params.id), res);
  if (!p) return;
  const b = req.body || {};
  db.prepare(
    `UPDATE pilots SET name = ?, business = ?, niche = ?, phone = ?, goal = ?, goal_note = ?, plan_title = ?, team_note = ?
     WHERE id = ?`,
  ).run(
    str(b.name, 100) || p.name,
    str(b.business, 100),
    str(b.niche, 100),
    str(b.phone, 40),
    str(b.goal, 300),
    str(b.goalNote, 300),
    str(b.planTitle, 100),
    str(b.teamNote, 2000),
    p.id,
  );
  res.json({ ok: true });
});

/** Новая ссылка-приглашение; старые входы пилота закрываются */
teamRouter.post("/pilots/:id/invite", (req, res) => {
  const p = pilotOr404(Number(req.params.id), res);
  if (!p) return;
  const token = randomToken(18);
  db.prepare("UPDATE pilots SET invite_token = ? WHERE id = ?").run(token, p.id);
  db.prepare("DELETE FROM sessions WHERE pilot_id = ?").run(p.id);
  res.json({ inviteUrl: inviteUrl(token) });
});

teamRouter.post("/pilots/:id/archive", (req, res) => {
  const p = pilotOr404(Number(req.params.id), res);
  if (!p) return;
  db.prepare("UPDATE pilots SET archived = 1 WHERE id = ?").run(p.id);
  db.prepare("DELETE FROM sessions WHERE pilot_id = ?").run(p.id);
  res.json({ ok: true });
});

/** Этапы стратегии — всем списком: [{ title, description, status }] */
teamRouter.put("/pilots/:id/stages", (req, res) => {
  const p = pilotOr404(Number(req.params.id), res);
  if (!p) return;
  const list = Array.isArray(req.body?.stages) ? req.body.stages.slice(0, 30) : [];
  const ins = db.prepare(
    "INSERT INTO stages (pilot_id, sort_order, title, description, status) VALUES (?, ?, ?, ?, ?)",
  );
  db.transaction(() => {
    db.prepare("DELETE FROM stages WHERE pilot_id = ?").run(p.id);
    list.forEach((s: Record<string, unknown>, i: number) => {
      const title = str(s.title, 150);
      if (!title) return;
      const status = ["done", "current", "next"].includes(String(s.status)) ? String(s.status) : "next";
      ins.run(p.id, i, title, str(s.description, 2000), status);
    });
  })();
  res.json({ ok: true });
});

/** Инструменты — всем списком */
teamRouter.put("/pilots/:id/tools", (req, res) => {
  const p = pilotOr404(Number(req.params.id), res);
  if (!p) return;
  const list = Array.isArray(req.body?.tools) ? req.body.tools.slice(0, 30) : [];
  const ins = db.prepare(
    `INSERT INTO tools (pilot_id, sort_order, kind, title, subtitle, url, admin_url, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const safeUrl = (v: unknown) => {
    const u = str(v, 500);
    return /^https?:\/\//i.test(u) ? u : "";
  };
  db.transaction(() => {
    db.prepare("DELETE FROM tools WHERE pilot_id = ?").run(p.id);
    list.forEach((t: Record<string, unknown>, i: number) => {
      const title = str(t.title, 100);
      if (!title) return;
      const status = ["works", "setup", "soon"].includes(String(t.status)) ? String(t.status) : "soon";
      ins.run(p.id, i, str(t.kind, 30) || "other", title, str(t.subtitle, 150), safeUrl(t.url), safeUrl(t.adminUrl), status);
    });
  })();
  res.json({ ok: true });
});

function taskFields(b: Record<string, unknown>) {
  const due = str(b.dueDate, 10);
  const points = Math.round(Number(b.points));
  return {
    title: str(b.title, 200),
    description: str(b.description, 3000),
    due_date: DATE.test(due) ? due : null,
    points: Number.isFinite(points) ? Math.min(Math.max(points, 0), 1000) : 50,
  };
}

teamRouter.post("/pilots/:id/tasks", (req, res) => {
  const p = pilotOr404(Number(req.params.id), res);
  if (!p) return;
  const t = taskFields(req.body || {});
  if (!t.title) {
    res.status(400).json({ error: "Укажите задачу" });
    return;
  }
  const info = db
    .prepare("INSERT INTO tasks (pilot_id, title, description, due_date, points) VALUES (?, ?, ?, ?, ?)")
    .run(p.id, t.title, t.description, t.due_date, t.points);
  res.json({ id: Number(info.lastInsertRowid) });
});

teamRouter.put("/tasks/:id", (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(Number(req.params.id)) as Task | undefined;
  if (!task) {
    res.status(404).json({ error: "Задача не найдена" });
    return;
  }
  const t = taskFields(req.body || {});
  if (!t.title) {
    res.status(400).json({ error: "Укажите задачу" });
    return;
  }
  db.prepare("UPDATE tasks SET title = ?, description = ?, due_date = ?, points = ? WHERE id = ?").run(
    t.title,
    t.description,
    t.due_date,
    t.points,
    task.id,
  );
  res.json({ ok: true });
});

teamRouter.delete("/tasks/:id", (req, res) => {
  db.prepare("DELETE FROM tasks WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});
