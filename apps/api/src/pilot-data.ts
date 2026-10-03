import { db, type Pilot, type Stage, type Task, type Tool } from "./db.js";
import { gameState, isOverdue, taskPoints } from "./game.js";
import { SURVEY_POINTS, surveyProgress } from "./survey.js";

export function getPilot(id: number) {
  return db.prepare("SELECT * FROM pilots WHERE id = ?").get(id) as Pilot | undefined;
}

export function getAnswers(pilotId: number) {
  const rows = db
    .prepare("SELECT question_id, value FROM survey_answers WHERE pilot_id = ?")
    .all(pilotId) as { question_id: string; value: string }[];
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.question_id] = JSON.parse(r.value);
    } catch {
      /* битую строку пропускаем */
    }
  }
  return out;
}

export function listTasks(pilotId: number) {
  return db
    .prepare(
      `SELECT * FROM tasks WHERE pilot_id = ?
       ORDER BY done_at IS NOT NULL, due_date IS NULL, due_date, id`,
    )
    .all(pilotId) as Task[];
}

export function listStages(pilotId: number) {
  return db.prepare("SELECT * FROM stages WHERE pilot_id = ? ORDER BY sort_order, id").all(pilotId) as Stage[];
}

export function listTools(pilotId: number) {
  return db.prepare("SELECT * FROM tools WHERE pilot_id = ? ORDER BY sort_order, id").all(pilotId) as Tool[];
}

export function publicTask(t: Task) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    dueDate: t.due_date,
    points: t.points,
    earned: taskPoints(t),
    doneAt: t.done_at,
    overdue: isOverdue(t),
  };
}

/** Всё, что видит пилот в приложении (и команда в карточке пилота) */
export function pilotOverview(pilot: Pilot) {
  const tasks = listTasks(pilot.id);
  const survey = surveyProgress(getAnswers(pilot.id));
  return {
    pilot: {
      id: pilot.id,
      name: pilot.name,
      business: pilot.business,
      niche: pilot.niche,
      goal: pilot.goal,
      goalNote: pilot.goal_note,
      planTitle: pilot.plan_title,
      teamNote: pilot.team_note,
      createdAt: pilot.created_at,
    },
    game: gameState(tasks, survey.complete, SURVEY_POINTS, pilot.created_at),
    survey: { ...survey, points: SURVEY_POINTS },
    tasks: tasks.map(publicTask),
    stages: listStages(pilot.id).map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      status: s.status,
    })),
    tools: listTools(pilot.id).map((t) => ({
      id: t.id,
      kind: t.kind,
      title: t.title,
      subtitle: t.subtitle,
      url: t.url,
      adminUrl: t.admin_url,
      status: t.status,
    })),
  };
}
