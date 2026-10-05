/**
 * Демо-режим (сборка с VITE_DEMO=1): сервер не нужен, данные — примерные и живут в памяти телефона.
 * Повторяет ответы настоящего API на тех же функциях (apps/api/src/model.ts), чтобы экраны работали как в жизни.
 * Пилот в демо — «Цех №4» со стратегией на согласовании (strategies/tseh4.json).
 */
import {
  applyDecisions,
  buildOverview,
  buildReview,
  parseStrategy,
  publicTask,
  type GoalRow,
  type PilotRow,
  type StageRow,
  type Status,
  type StrategyImport,
  type TaskRow,
  type ToolRow,
} from "../../api/src/model";
import { QUESTION_BY_ID, SURVEY, SURVEY_INTRO, SURVEY_POINTS, SURVEY_TITLE, normalizeAnswer, surveyProgress } from "../../api/src/survey";
import tseh4 from "../../../strategies/tseh4.json";

type DPilot = PilotRow & { phone: string; consent_at: string | null; archived: number; invite: string };
type DGoal = GoalRow & { pilot_id: number };
type DTask = TaskRow & { pilot_id: number };
type DStage = StageRow & { pilot_id: number };
type DTool = ToolRow & { pilot_id: number };
type DFile = { id: string; pilot_id: number; name: string; mime: string; size: number; url: string };
type State = {
  seq: number;
  pilots: DPilot[];
  goals: DGoal[];
  tasks: DTask[];
  stages: DStage[];
  tools: DTool[];
  answers: Record<number, Record<string, unknown>>;
  files: DFile[];
};

const KEY = "lift.demo.v3";
const day = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const ago = (n: number) => `${day(-n)} 10:00:00`;

function pilotRow(id: number, name: string, business: string, niche: string, created: number, consent: number | null): DPilot {
  return {
    id, name, business, niche, phone: "", goal: "", goal_note: "", plan_title: "", team_note: "",
    created_at: ago(created), reviewed_at: null, consent_at: consent === null ? null : ago(consent), archived: 0, invite: `demo-${id}`,
  };
}

function task(id: number, pilot_id: number, title: string, due: number | null, points: number, done: number | null, extra: Partial<DTask> = {}): DTask {
  return {
    id, pilot_id, title, description: "", due_date: due === null ? null : day(due), points,
    done_at: done === null ? null : ago(done), goal_id: null, status: "accepted", decline_reason: "", decided_at: null, sort_order: 0, ...extra,
  };
}

function seed(): State {
  const s: State = {
    seq: 1000,
    pilots: [
      pilotRow(1, "Евгений", "Цех №4", "Изделия из дерева", 3, 1),
      pilotRow(2, "Анна", "Рентал", "Управление арендой", 40, 20),
      pilotRow(3, "Ольга", "Студия «Лак»", "Маникюр", 2, null),
    ],
    goals: [],
    tasks: [
      task(1, 1, "Познакомиться с командой", null, 100, 1),
      task(2, 2, "Познакомиться с командой", null, 150, 30),
      task(3, 2, "Загрузить фото 6 объектов", 1, 50, null),
      task(4, 2, "Создать бота в MAX", 7, 80, null),
      task(5, 2, "Написать 3 отзыва клиентов", -4, 50, 5),
    ],
    stages: [],
    tools: [
      { id: 4, pilot_id: 2, kind: "site", title: "Сайт", subtitle: "myrenthub.ru", url: "https://myrenthub.ru", admin_url: "https://myrenthub.ru/admin", status: "works" },
    ],
    answers: { 1: { q1: "Цех №4", q3: "Товары — изделия, которые можно заказать и получить" } },
    files: [],
  };
  importInto(s, 1, tseh4 as StrategyImport);
  return s;
}

/** Та же логика, что apps/api/src/strategy.ts → importStrategy */
function importInto(s: State, pilotId: number, st: StrategyImport) {
  const base = Math.max(0, ...s.goals.filter((g) => g.pilot_id === pilotId).map((g) => g.sort_order));
  st.goals.forEach((g, i) => {
    const gid = s.seq++;
    s.goals.push({ id: gid, pilot_id: pilotId, sort_order: base + i + 1, title: g.title, description: g.description || "", status: "proposed", decline_reason: "", decided_at: null });
    (g.tasks || []).forEach((t, j) =>
      s.tasks.push(task(s.seq++, pilotId, t.title, null, t.points ?? 50, null, {
        description: t.description || "", due_date: t.dueDate || null, goal_id: gid, status: "proposed", sort_order: j,
      })),
    );
  });
  const p = s.pilots.find((x) => x.id === pilotId)!;
  if (st.goal !== undefined) p.goal = st.goal;
  if (st.goalNote !== undefined) p.goal_note = st.goalNote;
  if (st.planTitle !== undefined) p.plan_title = st.planTitle;
  if (st.teamNote !== undefined) p.team_note = st.teamNote;
  if (st.stages) {
    s.stages = s.stages.filter((x) => x.pilot_id !== pilotId);
    st.stages.forEach((x) => s.stages.push({ id: s.seq++, pilot_id: pilotId, title: x.title, description: x.description || "", status: (x.status || "next") as StageRow["status"] }));
  }
  if (st.tools) {
    s.tools = s.tools.filter((x) => x.pilot_id !== pilotId);
    st.tools.forEach((t) => s.tools.push({ id: s.seq++, pilot_id: pilotId, kind: t.kind, title: t.title, subtitle: t.subtitle || "", url: t.url || "", admin_url: t.adminUrl || "", status: (t.status || "works") as ToolRow["status"] }));
  }
  return { goals: st.goals.length, tasks: st.goals.reduce((n, g) => n + (g.tasks?.length || 0), 0) };
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

const mine = <T extends { pilot_id: number }>(list: T[], id: number) => list.filter((x) => x.pilot_id === id);
const gmap = (id: number) => new Map(mine(state.goals, id).map((g) => [g.id, g as GoalRow]));
const overview = (p: DPilot) =>
  buildOverview(p, mine(state.goals, p.id), mine(state.tasks, p.id), mine(state.stages, p.id), mine(state.tools, p.id), state.answers[p.id] || {});

function filesFor(pilotId: number) {
  return Object.fromEntries(mine(state.files, pilotId).map((f) => [f.id, { id: f.id, name: f.name, mime: f.mime, size: f.size, url: f.url }]));
}

const pilot = (id: number) => state.pilots.find((p) => p.id === id && !p.archived) || fail("Пилот не найден", 404);
const str = (v: unknown, max = 2000) => String(v ?? "").trim().slice(0, max);
const ME = 1; // в демо пилот — «Цех №4»
const setStatus = (x: { status: Status; decline_reason: string; decided_at: string | null }, status: Status, reason = "") =>
  Object.assign(x, { status, decline_reason: reason, decided_at: status === "proposed" ? null : now() });

export async function demoApi(path: string, method: string, json: unknown, body: unknown): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 120));
  const b = (json || {}) as Record<string, unknown>;
  const m = (re: RegExp) => path.match(re);
  let r: RegExpMatchArray | null;

  if (path.startsWith("/api/auth/invite/")) return method === "GET" ? { name: "Евгений", business: "Цех №4" } : { token: "demo", role: "pilot" };
  if (path === "/api/auth/team") return { token: "demo", role: "team" };
  if (path === "/api/auth/logout") return { ok: true };

  // ——— пилот ———
  if (path === "/api/me") return { ...overview(pilot(ME)), postsWaiting: demoPostList.filter((p) => p.status === "waiting").length };
  if ((r = m(/^\/api\/tasks\/(\d+)\/done$/))) {
    const t = state.tasks.find((x) => x.id === Number(r![1]) && x.pilot_id === ME && x.status === "accepted") || fail("Задача не найдена", 404);
    t.done_at = b.done === false ? null : t.done_at || now();
    persist();
    return { task: publicTask(t, gmap(ME)) };
  }
  if (path === "/api/review" && method === "GET") return buildReview(mine(state.goals, ME), mine(state.tasks, ME));
  if (path === "/api/review" && method === "POST") {
    const changes = applyDecisions(mine(state.goals, ME), mine(state.tasks, ME), b);
    for (const c of changes) {
      const x = (c.kind === "goal" ? state.goals : state.tasks).find((y) => y.id === c.id && y.pilot_id === ME);
      if (x) setStatus(x, c.status, c.reason);
    }
    const left = buildReview(mine(state.goals, ME), mine(state.tasks, ME));
    const p = pilot(ME);
    if (!left.goals.length && !left.tasks.length && !p.reviewed_at) p.reviewed_at = now();
    persist();
    return { changed: changes.length };
  }
  if ((r = m(/^\/api\/archive\/(goal|task)\/(\d+)\/restore$/))) {
    const id = Number(r[2]);
    if (r[1] === "goal") {
      const g = state.goals.find((x) => x.id === id && x.pilot_id === ME && x.status === "declined");
      if (g) {
        setStatus(g, "accepted");
        state.tasks.filter((t) => t.goal_id === id && t.status === "declined").forEach((t) => setStatus(t, "accepted"));
      }
    } else {
      const t = state.tasks.find((x) => x.id === id && x.pilot_id === ME && x.status === "declined");
      if (t) {
        setStatus(t, "accepted");
        const g = state.goals.find((x) => x.id === t.goal_id && x.status === "declined");
        if (g) setStatus(g, "accepted");
      }
    }
    persist();
    return { ok: true };
  }
  if (path === "/api/survey" && method === "GET") {
    return { title: SURVEY_TITLE, intro: SURVEY_INTRO, points: SURVEY_POINTS, sections: SURVEY, answers: state.answers[ME] || {}, files: filesFor(ME), sentAt: pilot(ME).survey_sent_at || null };
  }
  if (path === "/api/survey/send") {
    const p = pilot(ME);
    p.survey_sent_at ||= now();
    persist();
    return { ok: true };
  }
  if (path === "/api/survey" && method === "PUT") {
    if (pilot(ME).survey_sent_at) fail("Анкета уже у команды — ответы закреплены. Чтобы что-то изменить, напишите менеджеру.", 409);
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
    return {
      files: files.map((f) => {
        const file: DFile = { id: `demo-${state.seq++}`, pilot_id: ME, name: f.name, mime: f.type || "application/octet-stream", size: f.size, url: URL.createObjectURL(f) };
        state.files.push(file);
        return { id: file.id, name: file.name, mime: file.mime, size: file.size, url: file.url };
      }),
    };
  }

  // ——— посты (в демо ничего не публикуется — статусы имитируются) ———
  const postsUrl = m(/^\/api\/(?:team\/pilots\/\d+\/)?posts$/) || m(/^\/api\/(?:team\/)?posts\/(\d+)(\/retry)?$/);
  if (postsUrl || path.match(/^\/api\/team\/pilots\/\d+\/files$/) || path.match(/^\/api\/team\/(pilots\/\d+\/)?channels/)) {
    return demoPosts(path, method, b, body);
  }

  // ——— команда ———
  if (path === "/api/team/pilots" && method === "GET") {
    return {
      pilots: state.pilots.filter((p) => !p.archived).map((p) => {
        const o = overview(p);
        const open = o.tasks.filter((t) => !t.doneAt);
        const nearest = open.find((t) => t.dueDate);
        return {
          id: p.id, name: p.name, business: p.business, niche: p.niche,
          stage: mine(state.stages, p.id).find((s) => s.status === "current")?.title || "",
          floor: o.game.floor, points: o.game.points,
          tasksDone: o.tasks.filter((t) => t.doneAt).length, tasksTotal: o.tasks.length,
          overdue: open.filter((t) => t.overdue).length,
          nearest: nearest ? { title: nearest.title, dueDate: nearest.dueDate, overdue: nearest.overdue } : null,
          survey: o.survey, tools: o.tools.filter((t) => t.status !== "soon").map((t) => t.title), joined: !!p.consent_at,
          review: o.review.pending, archived: o.archive.goals.length + o.archive.tasks.length,
        };
      }),
    };
  }
  if (path === "/api/team/pilots" && method === "POST") {
    const name = str(b.name, 100) || fail("Укажите имя пилота");
    const p = pilotRow(state.seq++, name, str(b.business), str(b.niche), 0, null);
    state.pilots.push(p);
    persist();
    return { id: p.id, inviteUrl: `https://lift.myrenthub.ru/invite/${p.invite}` };
  }
  if ((r = m(/^\/api\/team\/pilots\/(\d+)$/))) {
    const p = pilot(Number(r[1]));
    if (method === "PUT") {
      Object.assign(p, {
        name: str(b.name, 100) || p.name, business: str(b.business), niche: str(b.niche), phone: str(b.phone),
        goal: str(b.goal), goal_note: str(b.goalNote), plan_title: str(b.planTitle), team_note: str(b.teamNote),
      });
      persist();
      return { ok: true };
    }
    const answers = state.answers[p.id] || {};
    const g = gmap(p.id);
    const tasks = mine(state.tasks, p.id).sort((a, c) => a.sort_order - c.sort_order || a.id - c.id);
    return {
      ...overview(p),
      allGoals: mine(state.goals, p.id).sort((a, c) => a.sort_order - c.sort_order).map((x) => ({
        id: x.id, title: x.title, description: x.description, status: x.status, declineReason: x.decline_reason,
        tasks: tasks.filter((t) => t.goal_id === x.id).map((t) => publicTask(t, g)),
      })),
      allTasks: tasks.map((t) => publicTask(t, g)),
      profile: { phone: p.phone, consentAt: p.consent_at, inviteUrl: `https://lift.myrenthub.ru/invite/${p.invite}` },
      surveySections: SURVEY, answers, files: filesFor(p.id), surveyProgress: surveyProgress(answers, p.survey_sent_at),
    };
  }
  if ((r = m(/^\/api\/team\/pilots\/(\d+)\/survey\/reopen$/))) {
    pilot(Number(r[1])).survey_sent_at = null;
    persist();
    return { ok: true };
  }
  if ((r = m(/^\/api\/team\/pilots\/(\d+)\/strategy$/))) {
    const p = pilot(Number(r[1]));
    const parsed = parseStrategy(b.strategy);
    if (typeof parsed === "string") fail(parsed);
    const res = importInto(state, p.id, parsed);
    persist();
    return res;
  }
  if ((r = m(/^\/api\/team\/pilots\/(\d+)\/invite$/))) {
    const p = pilot(Number(r[1]));
    p.invite = `demo-${state.seq++}`;
    persist();
    return { inviteUrl: `https://lift.myrenthub.ru/invite/${p.invite}` };
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
      if (str(s.title)) state.stages.push({ id: state.seq++, pilot_id: id, title: str(s.title), description: str(s.description), status: (["done", "current", "next"].includes(String(s.status)) ? s.status : "next") as StageRow["status"] });
    }
    persist();
    return { ok: true };
  }
  if ((r = m(/^\/api\/team\/pilots\/(\d+)\/tools$/))) {
    const id = pilot(Number(r[1])).id;
    state.tools = state.tools.filter((t) => t.pilot_id !== id);
    for (const t of (b.tools as Record<string, unknown>[]) || []) {
      if (str(t.title)) state.tools.push({ id: state.seq++, pilot_id: id, kind: str(t.kind) || "other", title: str(t.title), subtitle: str(t.subtitle), url: str(t.url), admin_url: str(t.adminUrl), status: (["works", "setup", "soon"].includes(String(t.status)) ? t.status : "soon") as ToolRow["status"] });
    }
    persist();
    return { ok: true };
  }
  if ((r = m(/^\/api\/team\/goals\/(\d+)$/))) {
    const id = Number(r[1]);
    if (method === "DELETE") {
      state.tasks = state.tasks.filter((t) => t.goal_id !== id);
      state.goals = state.goals.filter((g) => g.id !== id);
    } else {
      const g = state.goals.find((x) => x.id === id) || fail("Цель не найдена", 404);
      Object.assign(g, { title: str(b.title, 200) || g.title, description: str(b.description, 3000) });
    }
    persist();
    return { ok: true };
  }
  if ((r = m(/^\/api\/team\/goals\/(\d+)\/repropose$/))) {
    const id = Number(r[1]);
    const g = state.goals.find((x) => x.id === id) || fail("Цель не найдена", 404);
    setStatus(g, "proposed");
    state.tasks.filter((t) => t.goal_id === id && t.status === "declined" && !t.done_at).forEach((t) => setStatus(t, "proposed"));
    persist();
    return { ok: true };
  }
  if ((r = m(/^\/api\/team\/tasks\/(\d+)\/repropose$/))) {
    const t = state.tasks.find((x) => x.id === Number(r![1])) || fail("Задача не найдена", 404);
    setStatus(t, "proposed");
    const g = state.goals.find((x) => x.id === t.goal_id && x.status === "declined");
    if (g) setStatus(g, "proposed");
    persist();
    return { ok: true };
  }
  const taskFields = (pilotId: number) => {
    const goalId = Number(b.goalId) || null;
    return {
      title: str(b.title, 200) || fail("Укажите задачу"),
      description: str(b.description, 3000),
      due_date: /^\d{4}-\d{2}-\d{2}$/.test(str(b.dueDate)) ? str(b.dueDate) : null,
      points: Number.isFinite(Number(b.points)) ? Math.min(Math.max(Math.round(Number(b.points)), 0), 1000) : 50,
      goal_id: goalId && state.goals.some((g) => g.id === goalId && g.pilot_id === pilotId) ? goalId : null,
    };
  };
  if ((r = m(/^\/api\/team\/pilots\/(\d+)\/tasks$/))) {
    const id = pilot(Number(r[1])).id;
    const t = task(state.seq++, id, "", null, 50, null, { ...taskFields(id), status: b.propose ? "proposed" : "accepted" });
    state.tasks.push(t);
    persist();
    return { id: t.id };
  }
  if ((r = m(/^\/api\/team\/tasks\/(\d+)$/))) {
    const i = state.tasks.findIndex((t) => t.id === Number(r![1]));
    if (i === -1) fail("Задача не найдена", 404);
    if (method === "DELETE") state.tasks.splice(i, 1);
    else Object.assign(state.tasks[i], taskFields(state.tasks[i].pilot_id));
    persist();
    return { ok: true };
  }
  return fail("Не найдено", 404);
}

type DemoPost = {
  id: number; text: string; photos: { id: string; name: string; mime: string; size: number; url: string }[];
  publishAt: string | null; status: string; createdBy: string; createdAt: string;
  targets: { channelId: number; kind: "vk" | "max" | "tg" | "dzen" | "instagram"; title: string; status: string; url: string; error: string; sentAt: string | null }[];
};
const DEMO_CHANNELS = [
  { id: 1, kind: "vk" as const, title: "ВКонтакте (демо)", enabled: true, target: "vk.com/workshop4", hasToken: true },
  { id: 2, kind: "max" as const, title: "Канал в MAX (демо)", enabled: true, target: "-100", hasToken: true },
  { id: 3, kind: "tg" as const, title: "Telegram (демо)", enabled: true, target: "@cex4", hasToken: true },
  { id: 4, kind: "dzen" as const, title: "Дзен (демо)", enabled: true, target: "dzen.ru/cex4", hasToken: true },
  { id: 5, kind: "instagram" as const, title: "Instagram (демо)", enabled: true, target: "@cex4", hasToken: true, manual: true },
];
let demoPostList: DemoPost[] = [];

function demoPosts(path: string, method: string, b: Record<string, unknown>, body: unknown): unknown {
  if (path.endsWith("/files")) {
    const files = body instanceof FormData ? (body.getAll("files") as File[]) : [];
    return { files: files.map((f) => ({ id: `demo-${state.seq++}`, name: f.name, mime: f.type, size: f.size, url: URL.createObjectURL(f) })) };
  }
  if (path.includes("/channels")) {
    if (path.endsWith("/check")) return { ok: true, info: "Демо: подключение не проверяется" };
    return fail("В демо соцсети не подключаются");
  }
  if (method === "GET") return { posts: demoPostList, channels: DEMO_CHANNELS };
  const idm = path.match(/posts\/(\d+)/);
  const id = idm ? Number(idm[1]) : 0;
  if (method === "DELETE") {
    demoPostList = demoPostList.filter((p) => p.id !== id);
    return { ok: true };
  }
  if (path.endsWith("/retry")) return { ok: true };
  const done = path.match(/posts\/(\d+)\/targets\/(\d+)\/done$/);
  if (done) {
    const p = demoPostList.find((x) => x.id === Number(done[1]));
    const t = p?.targets.find((x) => x.channelId === Number(done[2]));
    if (p && t) {
      t.status = "sent";
      t.sentAt = now();
      if (!p.targets.some((x) => x.status === "manual")) p.status = "done";
    }
    return { ok: true };
  }
  const mode = String(b.mode || "draft");
  const ids = Array.isArray(b.channelIds) ? (b.channelIds as number[]) : [];
  if (!String(b.text || "").trim() && !(b.photos as unknown[])?.length) fail("Добавьте текст или фото");
  if (mode !== "draft" && !ids.length) fail("Выберите, куда публиковать");
  const prev = demoPostList.find((p) => p.id === id);
  const photos = ((b.photos as string[]) || []).map((pid) => prev?.photos.find((x) => x.id === pid) || { id: pid, name: "фото", mime: "image/jpeg", size: 0, url: "" });
  const post: DemoPost = {
    id: prev?.id || state.seq++,
    text: String(b.text || ""),
    photos,
    publishAt: mode === "now" ? new Date().toISOString() : mode === "schedule" ? String(b.publishAt) : null,
    status: mode === "now" ? (ids.includes(5) ? "waiting" : "done") : mode === "schedule" ? "scheduled" : "draft",
    createdBy: "pilot",
    createdAt: now(),
    targets: DEMO_CHANNELS.filter((c) => ids.includes(c.id)).map((c) => ({
      channelId: c.id, kind: c.kind, title: c.title, status: mode !== "now" ? "pending" : c.kind === "instagram" ? "manual" : "sent", url: "", error: "", sentAt: mode === "now" && c.kind !== "instagram" ? now() : null,
    })),
  };
  demoPostList = [post, ...demoPostList.filter((p) => p.id !== post.id)];
  return { id: post.id };
}
