import { Router } from "express";
import { requirePilot } from "../auth.js";
import { db, type Task } from "../db.js";
import { filesInfo, saveAnswers, upload, registerUploads } from "../answers.js";
import { getAnswers, getPilot, pilotOverview, publicTask } from "../pilot-data.js";
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

/** Пилот отмечает задачу сделанной или снимает отметку */
pilotRouter.post("/tasks/:id/done", (req, res) => {
  const pilotId = req.session!.pilotId!;
  const task = db
    .prepare("SELECT * FROM tasks WHERE id = ? AND pilot_id = ?")
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
  res.json({ task: publicTask(updated) });
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
