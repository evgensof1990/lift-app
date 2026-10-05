const TOKEN_KEY = "lift.token";
const ROLE_KEY = "lift.role";

export type Role = "pilot" | "team";

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getToken() {
  return storage()?.getItem(TOKEN_KEY) || "";
}

export function getRole(): Role | "" {
  const r = storage()?.getItem(ROLE_KEY);
  return r === "pilot" || r === "team" ? r : "";
}

export function setSession(token: string, role: Role) {
  storage()?.setItem(TOKEN_KEY, token);
  storage()?.setItem(ROLE_KEY, role);
}

export function clearSession() {
  storage()?.removeItem(TOKEN_KEY);
  storage()?.removeItem(ROLE_KEY);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Демо-сборка (VITE_DEMO=1): без сервера, данные-примеры в телефоне */
export const DEMO = import.meta.env.VITE_DEMO === "1";

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  if (DEMO) {
    const { demoApi } = await import("./demo");
    try {
      return (await demoApi(path, init.method || "GET", init.json, init.body)) as T;
    } catch (e) {
      throw new ApiError((e as Error).message, (e as { status?: number }).status || 400);
    }
  }
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(path, { ...init, headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error || "Ошибка сети, попробуйте ещё раз", res.status);
  return data as T;
}

export type Game = {
  points: number;
  floor: number;
  floorStart: number;
  nextFloorAt: number | null;
  progress: number;
  streakWeeks: number;
  topFloor: number;
};

export type ItemStatus = "proposed" | "accepted" | "declined";

export type TaskItem = {
  id: number;
  title: string;
  description: string;
  dueDate: string | null;
  points: number;
  earned: number;
  doneAt: string | null;
  overdue: boolean;
  status: ItemStatus;
  declineReason: string;
  goalId: number | null;
  goalTitle: string;
};

export type GoalItem = {
  id: number;
  title: string;
  description: string;
  status: ItemStatus;
  declineReason: string;
  tasksDone: number;
  tasksTotal: number;
};

export type ReviewData = {
  goals: { id: number; title: string; description: string; status: ItemStatus; tasks: TaskItem[] }[];
  tasks: TaskItem[];
};

export type StageItem = { id: number; title: string; description: string; status: "done" | "current" | "next" };

export type ToolItem = {
  id: number;
  kind: string;
  title: string;
  subtitle: string;
  url: string;
  adminUrl: string;
  status: "works" | "setup" | "soon";
};

export type SurveyProgress = {
  answered: number;
  total: number;
  requiredDone: number;
  requiredTotal: number;
  complete: boolean;
  /** когда пилот отправил анкету команде */
  sentAt: string | null;
  /** id обязательных вопросов без ответа */
  missing: string[];
  points: number;
};

export type Overview = {
  pilot: {
    id: number;
    name: string;
    business: string;
    niche: string;
    goal: string;
    goalNote: string;
    planTitle: string;
    teamNote: string;
    createdAt: string;
    reviewedAt: string | null;
  };
  game: Game;
  survey: SurveyProgress;
  tasks: TaskItem[];
  goals: GoalItem[];
  /** посты, которые ждут ручной публикации (Instagram); есть только в ответе /api/me */
  postsWaiting?: number;
  review: { pending: number; goals: number; tasks: number; points: number; reviewed: boolean };
  archive: { goals: (GoalItem & { tasks: TaskItem[] })[]; tasks: TaskItem[] };
  stages: StageItem[];
  tools: ToolItem[];
};

export type Question = {
  id: string;
  type: "text" | "textarea" | "radio" | "checkbox" | "files";
  title: string;
  hint?: string;
  required?: boolean;
  or?: string;
  options?: string[];
};
export type Section = { id: string; title: string; questions: Question[] };
export type FileInfo = { id: string; name: string; mime: string; size: number; url: string };
export type Answers = Record<string, string | string[]>;

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** «Сегодня», «Завтра», «Просрочено», «12 окт» */
export function dueLabel(due: string | null, done = false) {
  if (!due) return "";
  const [y, m, d] = due.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (!done) {
    if (diff < 0) return `Просрочено · ${d} ${MONTHS[m - 1]}`;
    if (diff === 0) return "Сегодня";
    if (diff === 1) return "Завтра";
  }
  return `${d} ${MONTHS[m - 1]}`;
}

export function isSoon(due: string | null) {
  if (!due) return false;
  const [y, m, d] = due.split("-").map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (new Date(y, m - 1, d).getTime() - today.getTime()) / 86400000 <= 1;
}

/** plural(5, ["цель", "цели", "целей"]) → «целей» */
export function plural(n: number, forms: [string, string, string]) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b >= 2 && b <= 4) return forms[1];
  return forms[2];
}

export const GOALS: [string, string, string] = ["цель", "цели", "целей"];
export const TASKS: [string, string, string] = ["задача", "задачи", "задач"];

export function pointsWord(n: number) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return "баллов";
  if (b === 1) return "балл";
  if (b >= 2 && b <= 4) return "балла";
  return "баллов";
}
