/**
 * Игра «Лифт»: баллы за задачи и анкету поднимают пилота по этажам.
 * - задача сделана в срок (или без срока) — все её баллы, с опозданием — половина;
 * - вся обязательная часть анкеты — SURVEY_POINTS;
 * - серия — сколько полных недель подряд не было просрочек.
 */
import type { Task } from "./db.js";

/** Сколько баллов нужно, чтобы оказаться на этаже N (индекс = N − 1) */
export const FLOORS = [0, 150, 400, 750, 1200, 1800, 2500, 3300, 4200, 5200, 6500, 8000];

const DAY = 24 * 60 * 60 * 1000;

/** Конец дня срока (23:59:59) по московскому времени */
export function dueEnd(due: string) {
  return new Date(`${due}T23:59:59+03:00`).getTime();
}

export function taskPoints(t: Task) {
  if (!t.done_at) return 0;
  if (!t.due_date) return t.points;
  return Date.parse(t.done_at + "Z") <= dueEnd(t.due_date) ? t.points : Math.floor(t.points / 2);
}

export function isOverdue(t: Task, now = Date.now()) {
  return !t.done_at && !!t.due_date && dueEnd(t.due_date) < now;
}

/** Когда последний раз был промах: срок прошёл без отметки или отметили позже срока */
function lastMiss(tasks: Task[], now: number) {
  let last = 0;
  for (const t of tasks) {
    if (!t.due_date) continue;
    const end = dueEnd(t.due_date);
    const missed = t.done_at ? Date.parse(t.done_at + "Z") > end : end < now;
    if (missed) last = Math.max(last, end);
  }
  return last;
}

export function gameState(tasks: Task[], surveyComplete: boolean, surveyPoints: number, startedAt: string) {
  const now = Date.now();
  const points = tasks.reduce((s, t) => s + taskPoints(t), 0) + (surveyComplete ? surveyPoints : 0);
  let index = 0;
  while (index + 1 < FLOORS.length && points >= FLOORS[index + 1]) index++;
  const floorStart = FLOORS[index];
  const next = FLOORS[index + 1] ?? null;
  const from = Math.max(lastMiss(tasks, now), Date.parse(startedAt + "Z") || now);
  return {
    points,
    floor: index + 1,
    floorStart,
    nextFloorAt: next,
    progress: next === null ? 1 : (points - floorStart) / (next - floorStart),
    streakWeeks: Math.max(0, Math.floor((now - from) / (7 * DAY))),
    topFloor: FLOORS.length,
  };
}
