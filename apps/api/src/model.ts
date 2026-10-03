/**
 * Чистые функции поверх строк базы: что видит пилот, что видит команда, как применяется согласование.
 * Без обращения к базе — те же функции работают в демо-режиме приложения (apps/web/src/demo.ts).
 */
import { gameState, isOverdue, taskPoints } from "./game.js";
import { SURVEY_POINTS, surveyProgress } from "./survey.js";

export type Status = "proposed" | "accepted" | "declined";

export type PilotRow = {
  id: number; name: string; business: string; niche: string; goal: string; goal_note: string;
  plan_title: string; team_note: string; created_at: string; reviewed_at: string | null;
};
export type GoalRow = { id: number; sort_order: number; title: string; description: string; status: Status; decline_reason: string; decided_at: string | null };
export type TaskRow = {
  id: number; title: string; description: string; due_date: string | null; points: number; done_at: string | null;
  goal_id: number | null; status: Status; decline_reason: string; decided_at: string | null; sort_order: number;
};
export type StageRow = { id: number; title: string; description: string; status: "done" | "current" | "next" };
export type ToolRow = { id: number; kind: string; title: string; subtitle: string; url: string; admin_url: string; status: "works" | "setup" | "soon" };

/** Баллы за пройденное согласование стратегии */
export const REVIEW_POINTS = 100;

export function publicTask(t: TaskRow, goals: Map<number, GoalRow>) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    dueDate: t.due_date,
    points: t.points,
    earned: taskPoints(t),
    doneAt: t.done_at,
    overdue: t.status === "accepted" && isOverdue(t),
    status: t.status,
    declineReason: t.decline_reason,
    goalId: t.goal_id,
    goalTitle: t.goal_id ? goals.get(t.goal_id)?.title || "" : "",
  };
}

const byOrder = <T extends { sort_order: number; id: number }>(a: T, b: T) => a.sort_order - b.sort_order || a.id - b.id;

function sortTasks(list: TaskRow[]) {
  return list.slice().sort(
    (a, b) =>
      Number(!!a.done_at) - Number(!!b.done_at) ||
      (a.due_date || "9999").localeCompare(b.due_date || "9999") ||
      a.sort_order - b.sort_order ||
      a.id - b.id,
  );
}

/** Всё, что видит пилот (команда видит то же плюс черновики и архив) */
export function buildOverview(
  p: PilotRow,
  goalRows: GoalRow[],
  taskRows: TaskRow[],
  stages: StageRow[],
  tools: ToolRow[],
  answers: Record<string, unknown>,
) {
  const goals = new Map(goalRows.map((g) => [g.id, g]));
  // задача в работе, только если она принята и её цель (если есть) тоже принята
  const active = (t: TaskRow) => t.status === "accepted" && (!t.goal_id || goals.get(t.goal_id)?.status === "accepted");
  const work = sortTasks(taskRows.filter(active));
  const survey = surveyProgress(answers);
  const game = gameState(work, (survey.complete ? SURVEY_POINTS : 0) + (p.reviewed_at ? REVIEW_POINTS : 0), p.created_at);
  const pt = (t: TaskRow) => publicTask(t, goals);
  const goalView = (g: GoalRow) => {
    const tasks = taskRows.filter((t) => t.goal_id === g.id);
    const inWork = tasks.filter(active);
    return {
      id: g.id,
      title: g.title,
      description: g.description,
      status: g.status,
      declineReason: g.decline_reason,
      tasksDone: inWork.filter((t) => t.done_at).length,
      tasksTotal: inWork.length,
    };
  };
  const proposedGoals = goalRows.filter((g) => g.status === "proposed").sort(byOrder);
  // на согласование: задачи предложенных целей + новые задачи уже принятых целей / без цели
  const proposedTasks = taskRows
    .filter((t) => t.status === "proposed" && (!t.goal_id || goals.get(t.goal_id)?.status !== "declined"))
    .sort(byOrder);
  const declinedGoals = goalRows.filter((g) => g.status === "declined").sort(byOrder);
  const declinedTasks = taskRows.filter((t) => t.status === "declined" && (!t.goal_id || goals.get(t.goal_id)?.status !== "declined"));

  return {
    pilot: {
      id: p.id, name: p.name, business: p.business, niche: p.niche, goal: p.goal, goalNote: p.goal_note,
      planTitle: p.plan_title, teamNote: p.team_note, createdAt: p.created_at, reviewedAt: p.reviewed_at,
    },
    game,
    survey: { ...survey, points: SURVEY_POINTS },
    tasks: work.map(pt),
    goals: goalRows.filter((g) => g.status === "accepted").sort(byOrder).map(goalView),
    review: {
      // сколько решений ждёт пилот: предложенные цели + отдельные задачи вне них
      pending: proposedGoals.length + proposedTasks.filter((t) => !t.goal_id || goals.get(t.goal_id)?.status !== "proposed").length,
      goals: proposedGoals.length,
      tasks: proposedTasks.length,
      points: REVIEW_POINTS,
      reviewed: !!p.reviewed_at,
    },
    archive: {
      goals: declinedGoals.map((g) => ({
        ...goalView(g),
        tasks: taskRows.filter((t) => t.goal_id === g.id).sort(byOrder).map(pt),
      })),
      tasks: declinedTasks.map(pt),
    },
    stages: stages.map(({ id, title, description, status }) => ({ id, title, description, status })),
    tools: tools.map((t) => ({ id: t.id, kind: t.kind, title: t.title, subtitle: t.subtitle, url: t.url, adminUrl: t.admin_url, status: t.status })),
  };
}

/** Экран согласования: предложенные цели с задачами + предложенные задачи вне предложенных целей */
export function buildReview(goalRows: GoalRow[], taskRows: TaskRow[]) {
  const goals = new Map(goalRows.map((g) => [g.id, g]));
  const pt = (t: TaskRow) => publicTask(t, goals);
  const proposed = taskRows.filter((t) => t.status === "proposed").sort(byOrder);
  const groups = goalRows
    .filter((g) => g.status === "proposed" || proposed.some((t) => t.goal_id === g.id && g.status === "accepted"))
    .sort(byOrder)
    .map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description,
      status: g.status,
      tasks: proposed.filter((t) => t.goal_id === g.id).map(pt),
    }));
  return { goals: groups, tasks: proposed.filter((t) => !t.goal_id).map(pt) };
}

export type Decision = { accept: boolean; reason?: string };
export type Decisions = { goals?: Record<string, Decision>; tasks?: Record<string, Decision> };
export type Change = { kind: "goal" | "task"; id: number; status: Status; reason: string };

/**
 * Решения пилота → изменения статусов. Отклонённая цель уносит в архив и все свои
 * незавершённые предложенные задачи; принятая цель с задачами, по которым решения нет, их тоже принимает.
 */
export function applyDecisions(goalRows: GoalRow[], taskRows: TaskRow[], d: Decisions): Change[] {
  const changes: Change[] = [];
  const reason = (x: Decision) => String(x.reason || "").trim().slice(0, 500);
  for (const g of goalRows) {
    const x = d.goals?.[g.id];
    if (!x || g.status !== "proposed") continue;
    changes.push({ kind: "goal", id: g.id, status: x.accept ? "accepted" : "declined", reason: x.accept ? "" : reason(x) });
  }
  const goalStatus = new Map(goalRows.map((g) => [g.id, g.status]));
  for (const c of changes) goalStatus.set(c.id, c.status);
  for (const t of taskRows) {
    if (t.status !== "proposed") continue;
    const x = d.tasks?.[t.id];
    const gs = t.goal_id ? goalStatus.get(t.goal_id) : undefined;
    if (gs === "declined") {
      changes.push({ kind: "task", id: t.id, status: "declined", reason: x && !x.accept ? reason(x) : "" });
    } else if (x) {
      changes.push({ kind: "task", id: t.id, status: x.accept ? "accepted" : "declined", reason: x.accept ? "" : reason(x) });
    } else if (gs === "accepted" && d.goals?.[t.goal_id!]) {
      changes.push({ kind: "task", id: t.id, status: "accepted", reason: "" });
    }
  }
  return changes;
}

/** Импорт стратегии (JSON от команды): всё приходит как «на согласовании» */
export type StrategyImport = {
  goal?: string;
  goalNote?: string;
  planTitle?: string;
  teamNote?: string;
  stages?: { title: string; description?: string; status?: string }[];
  goals: { title: string; description?: string; tasks?: { title: string; description?: string; dueDate?: string; points?: number }[] }[];
};

export function parseStrategy(raw: unknown): StrategyImport | string {
  if (!raw || typeof raw !== "object") return "Нужен JSON-объект стратегии";
  const s = raw as Record<string, unknown>;
  if (!Array.isArray(s.goals) || !s.goals.length) return "В стратегии нет целей (goals)";
  const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
  const goals = (s.goals as Record<string, unknown>[]).slice(0, 100).map((g) => ({
    title: str(g.title, 200),
    description: str(g.description, 3000),
    tasks: (Array.isArray(g.tasks) ? (g.tasks as Record<string, unknown>[]) : []).slice(0, 100).map((t) => {
      const due = str(t.dueDate, 10);
      const pts = Math.round(Number(t.points));
      return {
        title: str(t.title, 200),
        description: str(t.description, 3000),
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : undefined,
        points: Number.isFinite(pts) ? Math.min(Math.max(pts, 0), 1000) : 50,
      };
    }).filter((t) => t.title),
  })).filter((g) => g.title);
  if (!goals.length) return "У целей нет названий";
  return {
    goal: s.goal === undefined ? undefined : str(s.goal, 300),
    goalNote: s.goalNote === undefined ? undefined : str(s.goalNote, 300),
    planTitle: s.planTitle === undefined ? undefined : str(s.planTitle, 100),
    teamNote: s.teamNote === undefined ? undefined : str(s.teamNote, 2000),
    stages: Array.isArray(s.stages)
      ? (s.stages as Record<string, unknown>[]).slice(0, 30).map((x) => ({
          title: str(x.title, 150),
          description: str(x.description, 2000),
          status: ["done", "current", "next"].includes(String(x.status)) ? String(x.status) : "next",
        })).filter((x) => x.title)
      : undefined,
    goals,
  };
}
