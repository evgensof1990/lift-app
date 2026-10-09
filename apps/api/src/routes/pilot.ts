import { Router } from "express";
import { requirePilot } from "../auth.js";
import { db, type Task } from "../db.js";
import { filesInfo, saveAnswers, upload, registerUploads } from "../answers.js";
import { applyChanges } from "../strategy.js";
import { channelView, deletePost, listChannels, listPosts, markManual, retryPost, savePost, waitingCount } from "../posting.js";
import { applyDecisions, publicTask, type Decisions } from "../model.js";
import { getAnswers, getPilot, listPains, listRequests, listGoals, listTasks, pilotOverview, pilotReview } from "../pilot-data.js";
import { buildPains, cleanPain, publicPain, type PainRow } from "../pains.js";
import { vkAuthUrl } from "../vk-id.js";
import { SURVEY, SURVEY_INTRO, SURVEY_POINTS, SURVEY_TITLE } from "../survey.js";

export const pilotRouter = Router();
pilotRouter.use(requirePilot);

pilotRouter.get("/me", (req, res) => {
  const pilot = getPilot(req.session!.pilotId!);
  if (!pilot) {
    res.status(404).json({ error: "Пилот не найден" });
    return;
  }
  res.json({ ...pilotOverview(pilot), postsWaiting: waitingCount(pilot.id) });
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
    sentAt: getPilot(pilotId)?.survey_sent_at || null,
  });
});

/** «Отправить анкету команде»: можно и с пропусками — команда уточнит при составлении стратегии */
pilotRouter.post("/survey/send", (req, res) => {
  db.prepare("UPDATE pilots SET survey_sent_at = COALESCE(survey_sent_at, datetime('now')) WHERE id = ?").run(req.session!.pilotId!);
  res.json({ ok: true });
});

/** Автосохранение: { answers: { q1: "…", q22: ["СДЭК"] } } */
pilotRouter.put("/survey", (req, res) => {
  if (getPilot(req.session!.pilotId!)?.survey_sent_at) {
    res.status(409).json({ error: "Анкета уже у команды — ответы закреплены. Чтобы что-то изменить, напишите менеджеру." });
    return;
  }
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

/* ——— посты (автопостинг) ——— */

pilotRouter.get("/posts", (req, res) => {
  const pilotId = req.session!.pilotId!;
  res.json({ posts: listPosts(pilotId), channels: listChannels(pilotId).filter((c) => c.enabled).map(channelView) });
});

/** Владелец сам подключает своё сообщество ВК (входит в ВК как его администратор) */
pilotRouter.get("/vk", (req, res) => {
  const c = listChannels(req.session!.pilotId!).find((x) => x.kind === "vk");
  res.json({ channel: c ? channelView(c) : null });
});

pilotRouter.post("/vk/auth", (req, res) => {
  const pilotId = req.session!.pilotId!;
  const c = listChannels(pilotId).find((x) => x.kind === "vk");
  try {
    res.json({ url: vkAuthUrl(pilotId, { channelId: c?.id, title: c?.title, target: req.body?.target }, "pilot") });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

pilotRouter.post("/posts", (req, res) => {
  const r = savePost(req.session!.pilotId!, req.body || {}, "pilot");
  res.status("error" in r ? 400 : 200).json(r);
});

pilotRouter.put("/posts/:id", (req, res) => {
  const r = savePost(req.session!.pilotId!, req.body || {}, "pilot", Number(req.params.id));
  res.status("error" in r ? 400 : 200).json(r);
});

pilotRouter.delete("/posts/:id", (req, res) => {
  const r = deletePost(req.session!.pilotId!, Number(req.params.id));
  res.status("error" in r ? 400 : 200).json(r);
});

pilotRouter.post("/posts/:id/retry", (req, res) => {
  const r = retryPost(req.session!.pilotId!, Number(req.params.id));
  res.status("error" in r ? 400 : 200).json(r);
});

/** «Опубликовал в Instagram» */
pilotRouter.post("/posts/:id/targets/:channelId/done", (req, res) => {
  const r = markManual(req.session!.pilotId!, Number(req.params.id), Number(req.params.channelId), req.body?.url);
  res.status("error" in r ? 400 : 200).json(r);
});

/* ——— предложения по стратегии: пилот пишет, команда правит стратегию и отвечает ——— */

pilotRouter.get("/strategy-requests", (req, res) => {
  res.json({ requests: listRequests(req.session!.pilotId!) });
});

pilotRouter.post("/strategy-requests", (req, res) => {
  const pilotId = req.session!.pilotId!;
  const text = String(req.body?.text ?? "").trim().slice(0, 3000);
  if (text.length < 3) {
    res.status(400).json({ error: "Напишите, что поменять" });
    return;
  }
  const open = (db.prepare("SELECT COUNT(*) AS n FROM strategy_requests WHERE pilot_id = ? AND status = 'open'").get(pilotId) as { n: number }).n;
  if (open >= 20) {
    res.status(429).json({ error: "Уже 20 предложений ждут команду — дождитесь ответа" });
    return;
  }
  const goal = req.body?.goalId
    ? (db.prepare("SELECT id, title FROM goals WHERE id = ? AND pilot_id = ?").get(Number(req.body.goalId), pilotId) as { id: number; title: string } | undefined)
    : undefined;
  db.prepare("INSERT INTO strategy_requests (pilot_id, goal_id, goal_title, text) VALUES (?, ?, ?, ?)").run(pilotId, goal?.id ?? null, goal?.title ?? "", text);
  res.json({ ok: true, requests: listRequests(pilotId) });
});

/* ——— рутина: пилот рассказывает, что отнимает время, команда забирает это на себя ——— */

pilotRouter.post("/pains", (req, res) => {
  const pilotId = req.session!.pilotId!;
  const f = cleanPain(req.body || {});
  if (!f.title || f.title.length < 3) {
    res.status(400).json({ error: "Напишите, что отнимает время" });
    return;
  }
  const fresh = (db.prepare("SELECT COUNT(*) AS n FROM pains WHERE pilot_id = ? AND status = 'new'").get(pilotId) as { n: number }).n;
  if (fresh >= 30) {
    res.status(429).json({ error: "Команда ещё не разобрала 30 прошлых — дождитесь ответа" });
    return;
  }
  const info = db
    .prepare("INSERT INTO pains (pilot_id, title, details, freq, duration, area, created_by) VALUES (?, ?, ?, ?, ?, ?, 'pilot')")
    .run(pilotId, f.title, f.details || "", f.freq || "", f.duration || "", f.area || "other");
  const row = db.prepare("SELECT * FROM pains WHERE id = ?").get(info.lastInsertRowid) as PainRow;
  res.json({ pain: publicPain(row), ...buildPains(listPains(pilotId)) });
});

/** Пилот может убрать только то, что команда ещё не начала разбирать */
pilotRouter.delete("/pains/:id", (req, res) => {
  const pilotId = req.session!.pilotId!;
  const r = db.prepare("DELETE FROM pains WHERE id = ? AND pilot_id = ? AND status = 'new' AND created_by = 'pilot'").run(Number(req.params.id), pilotId);
  if (!r.changes) {
    res.status(400).json({ error: "Команда уже взяла это в работу — напишите менеджеру, если неактуально" });
    return;
  }
  res.json({ ok: true, ...buildPains(listPains(pilotId)) });
});
