import { Router, type Response } from "express";
import { randomToken, requireTeam } from "../auth.js";
import { config } from "../config.js";
import { db, type Goal, type Pilot, type Task } from "../db.js";
import { filesInfo } from "../answers.js";
import { getAnswers, getPilot, listGoals, listTasks, pilotOverview } from "../pilot-data.js";
import { isOverdue } from "../game.js";
import { parseStrategy, publicTask } from "../model.js";
import { importStrategy } from "../strategy.js";
import { registerUploads, upload } from "../answers.js";
import { channelView, checkChannel, maxBotChats, deletePost, listChannels, listPosts, markManual, retryPost, saveChannel, savePost } from "../posting.js";
import type { Channel, Post } from "../db.js";
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
      const open = o.tasks.filter((t) => !t.doneAt);
      const nearest = open.find((t) => t.dueDate);
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
        overdue: open.filter((t) => t.overdue).length,
        nearest: nearest ? { title: nearest.title, dueDate: nearest.dueDate, overdue: nearest.overdue } : null,
        review: o.review.pending,
        archived: o.archive.goals.length + o.archive.tasks.length,
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
  const goals = listGoals(p.id);
  const tasks = listTasks(p.id);
  const gmap = new Map(goals.map((g) => [g.id, g]));
  res.json({
    ...pilotOverview(p),
    allGoals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description,
      status: g.status,
      declineReason: g.decline_reason,
      tasks: tasks.filter((t) => t.goal_id === g.id).map((t) => publicTask(t, gmap)),
    })),
    allTasks: tasks.map((t) => publicTask(t, gmap)),
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

function taskFields(b: Record<string, unknown>, pilotId: number) {
  const due = str(b.dueDate, 10);
  const goalId = Number(b.goalId) || null;
  const goalOk = goalId && db.prepare("SELECT 1 FROM goals WHERE id = ? AND pilot_id = ?").get(goalId, pilotId);
  const points = Math.round(Number(b.points));
  return {
    title: str(b.title, 200),
    description: str(b.description, 3000),
    due_date: DATE.test(due) ? due : null,
    points: Number.isFinite(points) ? Math.min(Math.max(points, 0), 1000) : 50,
    goal_id: goalOk ? goalId : null,
  };
}

teamRouter.post("/pilots/:id/tasks", (req, res) => {
  const p = pilotOr404(Number(req.params.id), res);
  if (!p) return;
  const t = taskFields(req.body || {}, p.id);
  if (!t.title) {
    res.status(400).json({ error: "Укажите задачу" });
    return;
  }
  // «предложить» — задача уходит пилоту на согласование, иначе сразу в работу
  const status = req.body?.propose ? "proposed" : "accepted";
  const info = db
    .prepare("INSERT INTO tasks (pilot_id, title, description, due_date, points, goal_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(p.id, t.title, t.description, t.due_date, t.points, t.goal_id, status);
  res.json({ id: Number(info.lastInsertRowid) });
});

teamRouter.put("/tasks/:id", (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(Number(req.params.id)) as Task | undefined;
  if (!task) {
    res.status(404).json({ error: "Задача не найдена" });
    return;
  }
  const t = taskFields(req.body || {}, task.pilot_id);
  if (!t.title) {
    res.status(400).json({ error: "Укажите задачу" });
    return;
  }
  db.prepare("UPDATE tasks SET title = ?, description = ?, due_date = ?, points = ?, goal_id = ? WHERE id = ?").run(
    t.title,
    t.description,
    t.due_date,
    t.points,
    t.goal_id,
    task.id,
  );
  res.json({ ok: true });
});

teamRouter.delete("/tasks/:id", (req, res) => {
  db.prepare("DELETE FROM tasks WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

/** Импорт стратегии из JSON: цели и задачи уходят пилоту на согласование */
teamRouter.post("/pilots/:id/strategy", (req, res) => {
  const p = pilotOr404(Number(req.params.id), res);
  if (!p) return;
  const parsed = parseStrategy(req.body?.strategy);
  if (typeof parsed === "string") {
    res.status(400).json({ error: parsed });
    return;
  }
  res.json(importStrategy(p.id, parsed));
});

teamRouter.put("/goals/:id", (req, res) => {
  const title = str(req.body?.title, 200);
  if (!title) {
    res.status(400).json({ error: "Укажите цель" });
    return;
  }
  db.prepare("UPDATE goals SET title = ?, description = ? WHERE id = ?").run(title, str(req.body?.description, 3000), Number(req.params.id));
  res.json({ ok: true });
});

/** Удалить цель вместе с её задачами */
teamRouter.delete("/goals/:id", (req, res) => {
  const id = Number(req.params.id);
  db.transaction(() => {
    db.prepare("DELETE FROM tasks WHERE goal_id = ?").run(id);
    db.prepare("DELETE FROM goals WHERE id = ?").run(id);
  })();
  res.json({ ok: true });
});

/** Вернуть из архива на повторное согласование */
teamRouter.post("/goals/:id/repropose", (req, res) => {
  const g = db.prepare("SELECT * FROM goals WHERE id = ?").get(Number(req.params.id)) as Goal | undefined;
  if (!g) {
    res.status(404).json({ error: "Цель не найдена" });
    return;
  }
  db.prepare("UPDATE goals SET status = 'proposed', decline_reason = '', decided_at = NULL WHERE id = ?").run(g.id);
  db.prepare(
    "UPDATE tasks SET status = 'proposed', decline_reason = '', decided_at = NULL WHERE goal_id = ? AND status = 'declined' AND done_at IS NULL",
  ).run(g.id);
  res.json({ ok: true });
});

teamRouter.post("/tasks/:id/repropose", (req, res) => {
  const t = db.prepare("SELECT * FROM tasks WHERE id = ?").get(Number(req.params.id)) as Task | undefined;
  if (!t) {
    res.status(404).json({ error: "Задача не найдена" });
    return;
  }
  db.prepare("UPDATE tasks SET status = 'proposed', decline_reason = '', decided_at = NULL WHERE id = ?").run(t.id);
  if (t.goal_id) {
    db.prepare("UPDATE goals SET status = 'proposed', decline_reason = '', decided_at = NULL WHERE id = ? AND status = 'declined'").run(t.goal_id);
  }
  res.json({ ok: true });
});

/* ——— автопостинг: каналы и посты пилота ——— */

teamRouter.get("/pilots/:id/posts", (req, res) => {
  const p = pilotOr404(Number(req.params.id), res);
  if (!p) return;
  res.json({ posts: listPosts(p.id), channels: listChannels(p.id).map(channelView) });
});

teamRouter.post("/pilots/:id/channels", (req, res) => {
  const p = pilotOr404(Number(req.params.id), res);
  if (!p) return;
  const r = saveChannel(p.id, req.body || {});
  res.status("error" in r ? 400 : 200).json(r);
});

function channelOr404(id: number, res: Response) {
  const c = db.prepare("SELECT * FROM channels WHERE id = ?").get(id) as Channel | undefined;
  if (!c) res.status(404).json({ error: "Канал не найден" });
  return c;
}

teamRouter.put("/channels/:id", (req, res) => {
  const c = channelOr404(Number(req.params.id), res);
  if (!c) return;
  const r = saveChannel(c.pilot_id, req.body || {}, c.id);
  res.status("error" in r ? 400 : 200).json(r);
});

teamRouter.delete("/channels/:id", (req, res) => {
  db.prepare("DELETE FROM channels WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

/** Проверить ключи: ВК — видит ли сообщество, MAX — бот и канал */
teamRouter.post("/channels/:id/check", async (req, res) => {
  const c = channelOr404(Number(req.params.id), res);
  if (!c) return;
  try {
    res.json({ ok: true, info: await checkChannel(c) });
  } catch (e) {
    res.json({ ok: false, error: (e as Error).message });
  }
});

teamRouter.post("/pilots/:id/files", upload.array("files", 20), (req, res) => {
  const p = pilotOr404(Number(req.params.id), res);
  if (!p) return;
  res.json({ files: registerUploads(p.id, (req.files as Express.Multer.File[]) || []) });
});

teamRouter.post("/pilots/:id/posts", (req, res) => {
  const p = pilotOr404(Number(req.params.id), res);
  if (!p) return;
  const r = savePost(p.id, req.body || {}, "team");
  res.status("error" in r ? 400 : 200).json(r);
});

function postPilot(id: number) {
  return (db.prepare("SELECT pilot_id FROM posts WHERE id = ?").get(id) as Pick<Post, "pilot_id"> | undefined)?.pilot_id ?? 0;
}

teamRouter.put("/posts/:id", (req, res) => {
  const id = Number(req.params.id);
  const r = savePost(postPilot(id), req.body || {}, "team", id);
  res.status("error" in r ? 400 : 200).json(r);
});

teamRouter.delete("/posts/:id", (req, res) => {
  const id = Number(req.params.id);
  const r = deletePost(postPilot(id), id);
  res.status("error" in r ? 400 : 200).json(r);
});

teamRouter.post("/posts/:id/retry", (req, res) => {
  const id = Number(req.params.id);
  const r = retryPost(postPilot(id), id);
  res.status("error" in r ? 400 : 200).json(r);
});

teamRouter.post("/posts/:id/targets/:channelId/done", (req, res) => {
  const id = Number(req.params.id);
  const r = markManual(postPilot(id), id, Number(req.params.channelId), req.body?.url);
  res.status("error" in r ? 400 : 200).json(r);
});

/** «Найти каналы бота» MAX: { token } из формы или { channelId } уже сохранённого канала */
teamRouter.post("/pilots/:id/max-chats", async (req, res) => {
  const p = pilotOr404(Number(req.params.id), res);
  if (!p) return;
  try {
    res.json({ chats: await maxBotChats(p.id, String(req.body?.token || ""), Number(req.body?.channelId) || undefined) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});
