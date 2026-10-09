import { db, type Goal, type Pilot, type Stage, type StrategyRequest, type Task, type Tool } from "./db.js";
import type { PainRow } from "./pains.js";
import { buildOverview, buildReview } from "./model.js";

export function listRequests(pilotId: number) {
  const rows = db.prepare("SELECT * FROM strategy_requests WHERE pilot_id = ? ORDER BY id DESC LIMIT 100").all(pilotId) as StrategyRequest[];
  return rows.map((r) => ({
    id: r.id,
    goalTitle: r.goal_title,
    text: r.text,
    status: r.status,
    answer: r.answer,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  }));
}

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
  return db.prepare("SELECT * FROM tasks WHERE pilot_id = ? ORDER BY sort_order, id").all(pilotId) as Task[];
}

export function listGoals(pilotId: number) {
  return db.prepare("SELECT * FROM goals WHERE pilot_id = ? ORDER BY sort_order, id").all(pilotId) as Goal[];
}

export function listStages(pilotId: number) {
  return db.prepare("SELECT * FROM stages WHERE pilot_id = ? ORDER BY sort_order, id").all(pilotId) as Stage[];
}

export function listTools(pilotId: number) {
  return db.prepare("SELECT * FROM tools WHERE pilot_id = ? ORDER BY sort_order, id").all(pilotId) as Tool[];
}

/** Всё, что видит пилот в приложении (и команда в карточке пилота) */
export function pilotOverview(pilot: Pilot) {
  return buildOverview(
    pilot,
    listGoals(pilot.id),
    listTasks(pilot.id),
    listStages(pilot.id),
    listTools(pilot.id),
    getAnswers(pilot.id),
    listPains(pilot.id),
  );
}

export function pilotReview(pilotId: number) {
  return buildReview(listGoals(pilotId), listTasks(pilotId));
}

export function listPains(pilotId: number) {
  return db.prepare("SELECT * FROM pains WHERE pilot_id = ? ORDER BY id").all(pilotId) as PainRow[];
}
