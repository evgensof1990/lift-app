import { Router } from "express";
import { requirePilot } from "../auth.js";
import { db, type Task } from "../db.js";
import { filesInfo, saveAnswers, upload, registerUploads } from "../answers.js";
import { applyChanges } from "../strategy.js";
import { applyDecisions, publicTask, type Decisions } from "../model.js";
import { getAnswers, getPilot, listGoals, listTasks, pilotOverview, pilotReview } from "../pilot-data.js";
import { SURVEY, SURVEY_INTRO, SURVEY_POINTS, SURVEY_TITLE } from "../survey.js";

export const pilotRouter = Router();
pilotRouter.use(requirePilot);

pilotRouter.get("/me", (req, res) => {
  const pilot = getPilot(req.session!.pilotId!);
  if (!pilot) {
    res.status(404).json({ error: "Пилот не найден" });
    return;
  }
  res.json(pilotOverview(pilot));
});

/** Пилот отмечает задачу сделанной или снимает отметку (только задачи в работе) */
pilotRouter.post("/tasks/:id/done", (req, res) => {
  const pilotId = req.session!.pilotId!;
  const task = db
    .prepare("SELECT * FROM tasks WHERE id = ? AND pilot_id = ? AND status = 'accepted'")
    .get(Number(req.params.id), pilotId) as Task | undefined;
  if (!task) {
    res.status(404).json({ error: "Задача не найдена" });
    return;
  }
  const done = req.body?.done !== false;
  db.prepare("UPDATE tasks SET done_at = ? WHERE id = ?").run(
    done ? task.done_at || new Date().toISOString().slice(0, 19).replace("T", " ") : null,
    task.id,
  );
  const updated = db.prepare("SELECT * FROM tasks WHERE id = ?").get(task.id) as Task;
  res.json({ task: publicTask(updated, new Map(listGoals(pilotId).map((g) => [g.id, g]))) });
});

/** Стратегия на согласование */
pilotRouter.get("/review", (req, res) => {
  res.json(pilotReview(req.session!.pilotId!));
});

/** Решения пилота: { goals: { "3": { accept: false, reason: "…" } }, tasks: { "12": { accept: true } } } */
pilotRouter.post("/review", (req, res) => {
  const pilotId = req.session!.pilotId!;
  const changes = applyDecisions(listGoals(pilotId), listTasks(pilotId), (req.body || {}) as Decisions);
  applyChanges(pilotId, changes);
  const left = pilotReview(pilotId);
  if (!left.goals.length && !left.tasks.length) {
    db.prepare("UPDATE pilots SET reviewed_at = COALESCE(reviewed_at, datetime('now')) WHERE id = ?").run(pilotId);
  }
  res.json({ changed: changes.length, left: left.goals.length + left.tasks.length });
});

/** Вернуть из архива в работу */
pilotRouter.post("/archive/:kind/:id/restore", (req, res) => {
  const pilotId = req.session!.pilotId!;
  const id = Number(req.params.id);
  if (req.params.kind === "goal") {
    const r = db
      .prepare("UPDATE goals SET status = 'accepted', decline_reason = '', decided_at = datetime('now') WHERE id = ? AND pilot_id = ? AND status = 'declined'")
      .run(id, pilotId);
    // задачи, которые ушли в архив вместе с целью, возвращаются тоже
    if (r.changes) {
      db.prepare(
        "UPDATE tasks SET status = 'accepted', decline_reason = '', decided_at = datetime('now') WHERE goal_id = ? AND pilot_id = ? AND status = 'declined'",
      ).run(id, pilotId);
    }
  } else {
    db.prepare(
      "UPDATE tasks SET status = 'accepted', decline_reason = '', decided_at = datetime('now') WHERE id = ? AND pilot_id = ? AND status = 'declined'",
    ).run(id, pilotId);
    // задача из отклонённой цели возвращает и цель
    db.prepare(
      `UPDATE goals SET status = 'accepted', decline_reason = '', decided_at = datetime('now')
       WHERE status = 'declined' AND pilot_id = ? AND id = (SELECT goal_id FROM tasks WHERE id = ?)`,
    ).run(pilotId, id);
  }
  res.json({ ok: true });
});

pilotRouter.get("/survey", (req, res) => {
  const pilotId = req.session!.pilotId!;
  const answers = getAnswers(pilotId);
  res.json({
    title: SURVEY_TITLE,
    intro: SURVEY_INTRO,
    points: SURVEY_POINTS,
    sections: SURVEY,
    answers,
    files: filesInfo(pilotId, answers),
  });
});

/** Автосохранение: { answers: { q1: "…", q22: ["СДЭК"] } } */
pilotRouter.put("/survey", (req, res) => {
  const result = saveAnswers(req.session!.pilotId!, req.body?.answers);
  if ("error" in result) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

pilotRouter.post("/files", upload.array("files", 20), (req, res) => {
  const files = registerUploads(req.session!.pilotId!, (req.files as Express.Multer.File[]) || []);
  res.json({ files });
});
