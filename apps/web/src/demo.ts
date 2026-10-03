/**
 * Демо-режим (сборка с VITE_DEMO=1): сервер не нужен, данные — примерные и живут в памяти телефона.
 * Повторяет ответы настоящего API, чтобы экраны работали как в жизни. Для показа и тестов.
 */
import { gameState, isOverdue, taskPoints } from "../../api/src/game";
import { QUESTION_BY_ID, SURVEY, SURVEY_INTRO, SURVEY_POINTS, SURVEY_TITLE, normalizeAnswer, surveyProgress } from "../../api/src/survey";

type DPilot = {
  id: number; name: string; business: string; niche: string; phone: string; goal: string; goal_note: string;
  plan_title: string; team_note: string; consent_at: string | null; archived: number; created_at: string; invite: string;
};
type DTask = { id: number; pilot_id: number; title: string; description: string; due_date: string | null; points: number; done_at: string | null };
type DStage = { id: number; pilot_id: number; title: string; description: string; status: "done" | "current" | "next" };
type DTool = { id: number; pilot_id: number; kind: string; title: string; subtitle: string; url: string; admin_url: string; status: "works" | "setup" | "soon" };
type DFile = { id: string; pilot_id: number; name: string; mime: string; size: number; url: string };
type State = {
  seq: number;
  pilots: DPilot[]; tasks: DTask[]; stages: DStage[]; tools: DTool[];
  answers: Record<number, Record<string, unknown>>;
  files: DFile[];
};

const KEY = "lift.demo.v1";
const day = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const ago = (n: number) => `${day(-n)} 10:00:00`;

function seed(): State {
  const pilots: DPilot[] = [
    { id: 1, name: "Анна", business: "Рентал", niche: "Управление арендой", phone: "", goal: "15 объектов в управлении к марту 2027", goal_note: "Сейчас 4 объекта", plan_title: "план на 6 месяцев", team_note: "Сначала бот MAX: туда придут заявки с сайта. Авито подключим после первых 5 отзывов.", consent_at: ago(20), archived: 0, created_at: ago(40), invite: "demo-anna" },
    { id: 2, name: "Ольга", business: "Студия «Лак»", niche: "Маникюр", phone: "", goal: "Запись заполнена на 2 недели вперёд", goal_note: "", plan_title: "план на 3 месяца", team_note: "", consent_at: ago(5), archived: 0, created_at: ago(10), invite: "demo-olga" },
    { id: 3, name: "Игорь", business: "Мастерская «Дуб»", niche: "Изделия из дерева", phone: "", goal: "100 заказов в месяц", goal_note: "", plan_title: "план на 6 месяцев", team_note: "", consent_at: null, archived: 0, created_at: ago(2), invite: "demo-igor" },
  ];
  const t = (id: number, pilot_id: number, title: string, description: string, due: number | null, points: number, done: number | null): DTask =>
    ({ id, pilot_id, title, description, due_date: due === null ? null : day(due), points, done_at: done === null ? null : ago(done) });
  const tasks = [
    t(1, 1, "Познакомиться с командой", "", null, 150, 30),
    t(2, 1, "Заполнить анкету для сайта", "Можно по частям — ответы сохраняются сами", 3, 50, null),
    t(3, 1, "Загрузить фото 6 объектов", "Вертикальные, при дневном свете", 1, 50, null),
    t(4, 1, "Создать бота в MAX", "Инструкция: платформа MAX → Чат-боты → Создать", 7, 80, null),
    t(5, 1, "Написать 3 отзыва клиентов", "", -4, 50, 5),
    t(6, 1, "Подать уведомление в РКН", "pd.rkn.gov.ru — поможем заполнить", 11, 100, null),
    t(7, 2, "Заполнить анкету для сайта", "", -1, 50, null),
    t(8, 2, "Прислать прайс", "", 2, 40, null),
    t(9, 3, "Познакомиться с командой", "", null, 150, null),
  ];
  const s = (id: number, pilot_id: number, title: string, description: string, status: DStage["status"]): DStage => ({ id, pilot_id, title, description, status });
  const stages = [
    s(1, 1, "Упаковка", "Анкета, сайт, тексты и фото", "done"),
    s(2, 1, "Запуск каналов", "Бот в MAX, заявки с сайта, Авито", "current"),
    s(3, 1, "Первые клиенты", "SMM, автопостинг, отзывы", "next"),
    s(4, 1, "Масштаб", "Автоматизация, новые районы", "next"),
    s(5, 2, "Упаковка", "Анкета, сайт, фото работ", "current"),
    s(6, 2, "Запись онлайн", "Бот в Telegram с записью", "next"),
  ];
  const tools: DTool[] = [
    { id: 1, pilot_id: 1, kind: "site", title: "Сайт", subtitle: "myrenthub.ru", url: "https://myrenthub.ru", admin_url: "https://myrenthub.ru/admin", status: "works" },
    { id: 2, pilot_id: 1, kind: "bot_max", title: "Бот в MAX", subtitle: "Заявки с сайта и каталог", url: "", admin_url: "", status: "setup" },
    { id: 3, pilot_id: 1, kind: "bot_tg", title: "Бот в Telegram", subtitle: "По стратегии — этап 3", url: "", admin_url: "", status: "soon" },
    { id: 4, pilot_id: 1, kind: "smm", title: "Автопостинг в соцсети", subtitle: "VK, Telegram, MAX по графику", url: "", admin_url: "", status: "soon" },
  ];
  return {
    seq: 100,
    pilots, tasks, stages, tools,
    answers: { 1: { q1: "Рентал", q2: "Анна", q3: "Услуги — запись, выезд, работа на объекте" } },
    files: [],
  };
}

let state: State = load();

function load(): State {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...JSON.parse(raw), files: [] } as State;
  } catch {
    /* нет хранилища — работаем в памяти */
  }
  return seed();
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...state, files: [] }));
  } catch {
    /* ignore */
  }
}

export function resetDemo() {
  state = seed();
  persist();
}

function fail(message: string, status = 400): never {
  const e = new Error(message) as Error & { status: number };
  e.status = status;
  throw e;
}

const pub = (t: DTask) => ({
  id: t.id, title: t.title, description: t.description, dueDate: t.due_date, points: t.points,
  earned: taskPoints(t), doneAt: t.done_at, overdue: isOverdue(t),
});

function overview(p: DPilot) {
  const tasks = state.tasks
    .filter((t) => t.pilot_id === p.id)
    .sort((a, b) => Number(!!a.done_at) - Number(!!b.done_at) || (a.due_date || "9999").localeCompare(b.due_date || "9999") || a.id - b.id);
  const survey = surveyProgress(state.answers[p.id] || {});
  return {
    pilot: { id: p.id, name: p.name, business: p.business, niche: p.niche, goal: p.goal, goalNote: p.goal_note, planTitle: p.plan_title, teamNote: p.team_note, createdAt: p.created_at },
    game: gameState(tasks, survey.complete, SURVEY_POINTS, p.created_at),
    survey: { ...survey, points: SURVEY_POINTS },
    tasks: tasks.map(pub),
    stages: state.stages.filter((s) => s.pilot_id === p.id).map(({ id, title, description, status }) => ({ id, title, description, status })),
    tools: state.tools.filter((t) => t.pilot_id === p.id).map((t) => ({ id: t.id, kind: t.kind, title: t.title, subtitle: t.subtitle, url: t.url, adminUrl: t.admin_url, status: t.status })),
  };
}

function filesFor(pilotId: number) {
  return Object.fromEntries(state.files.filter((f) => f.pilot_id === pilotId).map((f) => [f.id, { id: f.id, name: f.name, mime: f.mime, size: f.size, url: f.url }]));
}

const pilot = (id: number) => state.pilots.find((p) => p.id === id && !p.archived) || fail("Пилот не найден", 404);
const str = (v: unknown, max = 2000) => String(v ?? "").trim().slice(0, max);
const ME = 1; // в демо пилот — всегда «Рентал»

export async function demoApi(path: string, method: string, json: unknown, body: unknown): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 120));
  const b = (json || {}) as Record<string, unknown>;
  const m = (re: RegExp) => path.match(re);
  let r: RegExpMatchArray | null;

  if (path.startsWith("/api/auth/invite/")) return method === "GET" ? { name: "Анна", business: "Рентал" } : { token: "demo", role: "pilot" };
  if (path === "/api/auth/team") return { token: "demo", role: "team" };
  if (path === "/api/auth/logout") return { ok: true };

  if (path === "/api/me") return overview(pilot(ME));
  if ((r = m(/^\/api\/tasks\/(\d+)\/done$/))) {
    const t = state.tasks.find((x) => x.id === Number(r![1]) && x.pilot_id === ME) || fail("Задача не найдена", 404);
    t.done_at = b.done === false ? null : t.done_at || now();
    persist();
    return { task: pub(t) };
  }
  if (path === "/api/survey" && method === "GET") {
    return { title: SURVEY_TITLE, intro: SURVEY_INTRO, points: SURVEY_POINTS, sections: SURVEY, answers: state.answers[ME] || {}, files: filesFor(ME) };
  }
  if (path === "/api/survey" && method === "PUT") {
    const a = (state.answers[ME] ||= {});
    for (const [qid, v] of Object.entries((b.answers || {}) as Record<string, unknown>)) {
      const q = QUESTION_BY_ID.get(qid);
      const n = q ? normalizeAnswer(q, v) : null;
      if (n !== null) a[qid] = n;
    }
    persist();
    return { ok: true };
  }
  if (path === "/api/files") {
    const files = body instanceof FormData ? (body.getAll("files") as File[]) : [];
    const out = files.map((f) => {
      const file: DFile = { id: `demo-${state.seq++}`, pilot_id: ME, name: f.name, mime: f.type || "application/octet-stream", size: f.size, url: URL.createObjectURL(f) };
      state.files.push(file);
      return { id: file.id, name: file.name, mime: file.mime, size: file.size, url: file.url };
    });
    return { files: out };
  }

  if (path === "/api/team/pilots" && method === "GET") {
    return {
      pilots: state.pilots.filter((p) => !p.archived).map((p) => {
        const o = overview(p);
        const open = state.tasks.filter((t) => t.pilot_id === p.id && !t.done_at).sort((x, y) => (x.due_date || "9999").localeCompare(y.due_date || "9999"));
        const nearest = open.find((t) => t.due_date);
        return {
          id: p.id, name: p.name, business: p.business, niche: p.niche,
          stage: state.stages.find((s) => s.pilot_id === p.id && s.status === "current")?.title || "",
          floor: o.game.floor, points: o.game.points,
          tasksDone: o.tasks.filter((t) => t.doneAt).length, tasksTotal: o.tasks.length,
          overdue: open.filter((t) => isOverdue(t)).length,
          nearest: nearest ? { title: nearest.title, dueDate: nearest.due_date, overdue: isOverdue(nearest) } : null,
          survey: o.survey, tools: o.tools.filter((t) => t.status !== "soon").map((t) => t.title), joined: !!p.consent_at,
        };
      }),
    };
  }
  if (path === "/api/team/pilots" && method === "POST") {
    const name = str(b.name, 100) || fail("Укажите имя пилота");
    const id = state.seq++;
    state.pilots.push({ id, name, business: str(b.business), niche: str(b.niche), phone: str(b.phone), goal: "", goal_note: "", plan_title: "", team_note: "", consent_at: null, archived: 0, created_at: now(), invite: `demo-${id}` });
    persist();
    return { id, inviteUrl: `https://lift.example.ru/invite/demo-${id}` };
  }
  if ((r = m(/^\/api\/team\/pilots\/(\d+)$/))) {
    const p = pilot(Number(r[1]));
    if (method === "PUT") {
      Object.assign(p, { name: str(b.name, 100) || p.name, business: str(b.business), niche: str(b.niche), phone: str(b.phone), goal: str(b.goal), goal_note: str(b.goalNote), plan_title: str(b.planTitle), team_note: str(b.teamNote) });
      persist();
      return { ok: true };
    }
    const answers = state.answers[p.id] || {};
    return { ...overview(p), profile: { phone: p.phone, consentAt: p.consent_at, inviteUrl: `https://lift.example.ru/invite/${p.invite}` }, surveySections: SURVEY, answers, files: filesFor(p.id), surveyProgress: surveyProgress(answers) };
  }
  if ((r = m(/^\/api\/team\/pilots\/(\d+)\/invite$/))) {
    const p = pilot(Number(r[1]));
    p.invite = `demo-${state.seq++}`;
    persist();
    return { inviteUrl: `https://lift.example.ru/invite/${p.invite}` };
  }
  if ((r = m(/^\/api\/team\/pilots\/(\d+)\/archive$/))) {
    pilot(Number(r[1])).archived = 1;
    persist();
    return { ok: true };
  }
  if ((r = m(/^\/api\/team\/pilots\/(\d+)\/stages$/))) {
    const id = pilot(Number(r[1])).id;
    state.stages = state.stages.filter((s) => s.pilot_id !== id);
    for (const s of (b.stages as Record<string, unknown>[]) || []) {
      if (str(s.title)) state.stages.push({ id: state.seq++, pilot_id: id, title: str(s.title), description: str(s.description), status: (["done", "current", "next"].includes(String(s.status)) ? s.status : "next") as DStage["status"] });
    }
    persist();
    return { ok: true };
  }
  if ((r = m(/^\/api\/team\/pilots\/(\d+)\/tools$/))) {
    const id = pilot(Number(r[1])).id;
    state.tools = state.tools.filter((t) => t.pilot_id !== id);
    for (const t of (b.tools as Record<string, unknown>[]) || []) {
      if (str(t.title)) state.tools.push({ id: state.seq++, pilot_id: id, kind: str(t.kind) || "other", title: str(t.title), subtitle: str(t.subtitle), url: str(t.url), admin_url: str(t.adminUrl), status: (["works", "setup", "soon"].includes(String(t.status)) ? t.status : "soon") as DTool["status"] });
    }
    persist();
    return { ok: true };
  }
  const taskFields = () => ({
    title: str(b.title, 200) || fail("Укажите задачу"),
    description: str(b.description, 3000),
    due_date: /^\d{4}-\d{2}-\d{2}$/.test(str(b.dueDate)) ? str(b.dueDate) : null,
    points: Number.isFinite(Number(b.points)) ? Math.min(Math.max(Math.round(Number(b.points)), 0), 1000) : 50,
  });
  if ((r = m(/^\/api\/team\/pilots\/(\d+)\/tasks$/))) {
    const id = pilot(Number(r[1])).id;
    const t = { id: state.seq++, pilot_id: id, done_at: null, ...taskFields() };
    state.tasks.push(t);
    persist();
    return { id: t.id };
  }
  if ((r = m(/^\/api\/team\/tasks\/(\d+)$/))) {
    const i = state.tasks.findIndex((t) => t.id === Number(r![1]));
    if (i === -1) fail("Задача не найдена", 404);
    if (method === "DELETE") state.tasks.splice(i, 1);
    else Object.assign(state.tasks[i], taskFields());
    persist();
    return { ok: true };
  }
  return fail("Не найдено", 404);
}
