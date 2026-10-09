/**
 * Вход команды и вход пилота хранятся отдельно: владелец может быть и командой, и пилотом
 * в одном браузере — один вход не должен выбивать другой.
 */
const KEY: Record<Role, string> = { team: "lift.token.team", pilot: "lift.token.pilot" };

export type Role = "pilot" | "team";

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// прежний формат: один токен + роль — переносим один раз
(() => {
  const st = storage();
  const old = st?.getItem("lift.token");
  const role = st?.getItem("lift.role");
  if (st && old && (role === "pilot" || role === "team")) {
    if (!st.getItem(KEY[role])) st.setItem(KEY[role], old);
    st.removeItem("lift.token");
    st.removeItem("lift.role");
  }
})();

export function getToken(role: Role) {
  return storage()?.getItem(KEY[role]) || "";
}

export function hasSession(role: Role) {
  return !!getToken(role);
}

export function setSession(token: string, role: Role) {
  storage()?.setItem(KEY[role], token);
}

export function clearSession(role: Role) {
  storage()?.removeItem(KEY[role]);
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

/** role — чей вход использовать; по умолчанию /api/team/* — команда, остальное — пилот */
export async function api<T>(path: string, init: RequestInit & { json?: unknown; role?: Role } = {}): Promise<T> {
  if (DEMO) {
    const { demoApi } = await import("./demo");
    try {
      return (await demoApi(path, init.method || "GET", init.json, init.body)) as T;
    } catch (e) {
      throw new ApiError((e as Error).message, (e as { status?: number }).status || 400);
    }
  }
  const headers = new Headers(init.headers);
  const token = getToken(init.role || (path.startsWith("/api/team") ? "team" : "pilot"));
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

/** Загрузка файлов с процентами (видео бывают большие); в демо — обычный api() */
export function uploadFiles<T>(path: string, form: FormData, onProgress: (pct: number) => void): Promise<T> {
  if (DEMO) return api<T>(path, { method: "POST", body: form });
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    const token = getToken(path.startsWith("/api/team") ? "team" : "pilot");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: { error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* nginx отвечает страницей, а не JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else if (xhr.status === 413) reject(new ApiError("Файл слишком большой — сожмите видео или загрузите покороче", 413));
      else reject(new ApiError(data.error || "Не удалось загрузить файл, попробуйте ещё раз", xhr.status));
    };
    xhr.onerror = () => reject(new ApiError("Нет связи — проверьте интернет и попробуйте ещё раз", 0));
    xhr.send(form);
  });
}

export const isVideoFile = (f: { mime: string }) => f.mime.startsWith("video/");

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
  /** рутина, которую команда забирает на себя */
  pains: PainItem[];
  painSummary: PainSummary;
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

/** Предложение пилота по стратегии */
export type StrategyRequestItem = {
  id: number;
  goalTitle: string;
  text: string;
  status: "open" | "done";
  answer: string;
  createdAt: string;
  resolvedAt: string | null;
};

export type PainStatus = "new" | "study" | "building" | "solved" | "later";

/** Рутина пилота: что отнимает время и что с этим делает команда */
export type PainItem = {
  id: number;
  title: string;
  details: string;
  freq: string;
  duration: string;
  area: string;
  status: PainStatus;
  /** что «Лифт» делает (или будет делать) вместо пилота — видит пилот */
  solution: string;
  /** часов в неделю уходит на рутину */
  hours: number;
  /** часов в неделю освободили (только у решённых) */
  savedHours: number;
  createdBy: string;
  createdAt: string;
  solvedAt: string | null;
};

export type PainSummary = {
  total: number;
  solved: number;
  inWork: number;
  savedHours: number;
  openHours: number;
  points: number;
  pointsEach: number;
  pointsLeft: boolean;
};

/** Для команды: плюс внутренняя заметка и ручная оценка */
export type TeamPainItem = PainItem & { teamNote: string; savedEstimate: number | null; updatedAt: string };

/** «2,5 ч» */
export function hoursLabel(h: number) {
  return `${String(Math.round(h * 10) / 10).replace(".", ",")} ч`;
}
