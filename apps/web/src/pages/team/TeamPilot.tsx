import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  api,
  dueLabel,
  type Answers,
  type FileInfo,
  type ItemStatus,
  type Overview,
  type Section,
  type StageItem,
  type TaskItem,
  type ToolItem,
} from "../../api";
import FloorCard from "../../components/FloorCard";
import TeamLayout, { copyText } from "./TeamLayout";
import ChannelsPanel from "./ChannelsPanel";
import PostsBoard from "../../components/Posts";

type FullGoal = { id: number; title: string; description: string; status: ItemStatus; declineReason: string; tasks: TaskItem[] };

type Detail = Overview & {
  allGoals: FullGoal[];
  allTasks: TaskItem[];
  profile: { phone: string; consentAt: string | null; inviteUrl: string };
  surveySections: Section[];
  answers: Answers;
  files: Record<string, FileInfo>;
};

type Tab = "profile" | "strategy" | "tasks" | "posts" | "tools" | "survey";
const TABS: [Tab, string][] = [
  ["profile", "Профиль и цель"],
  ["strategy", "Стратегия"],
  ["tasks", "Задачи"],
  ["posts", "Посты"],
  ["tools", "Инструменты"],
  ["survey", "Анкета"],
];

export default function TeamPilot() {
  const { id = "" } = useParams();
  const [d, setD] = useState<Detail | null>(null);
  const [search] = useSearchParams();
  // ?tab=posts — возврат из входа ВКонтакте
  const [tab, setTab] = useState<Tab>(() => TABS.find(([k]) => k === search.get("tab"))?.[0] ?? "profile");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      setD(await api<Detail>(`/api/team/pilots/${id}`));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!d) return <TeamLayout><p className="muted">{err || "Загрузка…"}</p></TeamLayout>;

  return (
    <TeamLayout>
      <div className="team__head">
        <div>
          <h1 className="h1">{d.pilot.business || d.pilot.name}</h1>
          <p className="muted">{[d.pilot.name, d.pilot.niche].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "profile" ? <ProfileTab d={d} reload={load} /> : null}
      {tab === "strategy" ? <StrategyTab d={d} reload={load} /> : null}
      {tab === "tasks" ? <TasksTab d={d} reload={load} /> : null}
      {tab === "posts" ? <PostsTab pilotId={d.pilot.id} /> : null}
      {tab === "tools" ? <ToolsTab d={d} reload={load} /> : null}
      {tab === "survey" ? <SurveyTab d={d} /> : null}
    </TeamLayout>
  );
}

type TabProps = { d: Detail; reload: () => Promise<void> };

function useSaver() {
  const [state, setState] = useState<{ busy: boolean; msg: string; err: string }>({ busy: false, msg: "", err: "" });
  async function run(fn: () => Promise<unknown>, ok = "Сохранено") {
    setState({ busy: true, msg: "", err: "" });
    try {
      await fn();
      setState({ busy: false, msg: ok, err: "" });
    } catch (e) {
      setState({ busy: false, msg: "", err: (e as Error).message });
    }
  }
  const note = state.err ? <p className="error">{state.err}</p> : state.msg ? <p className="ok">✓ {state.msg}</p> : null;
  return { busy: state.busy, run, note };
}

function ProfileTab({ d, reload }: TabProps) {
  const nav = useNavigate();
  const [f, setF] = useState({
    name: d.pilot.name,
    business: d.pilot.business,
    niche: d.pilot.niche,
    phone: d.profile.phone,
    goal: d.pilot.goal,
    goalNote: d.pilot.goalNote,
    planTitle: d.pilot.planTitle,
    teamNote: d.pilot.teamNote,
  });
  const [invite, setInvite] = useState(d.profile.inviteUrl);
  const s = useSaver();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <div className="team-grid">
      <form
        className="card team-form"
        onSubmit={(e) => {
          e.preventDefault();
          void s.run(async () => {
            await api(`/api/team/pilots/${d.pilot.id}`, { method: "PUT", json: f });
            await reload();
          });
        }}
      >
        <label className="field"><span>Имя (как обращаться)</span><input value={f.name} onChange={set("name")} required /></label>
        <label className="field"><span>Бизнес</span><input value={f.business} onChange={set("business")} /></label>
        <label className="field"><span>Ниша</span><input value={f.niche} onChange={set("niche")} /></label>
        <label className="field"><span>Телефон</span><input value={f.phone} onChange={set("phone")} /></label>
        <label className="field wide"><span>Цель стратегии</span><input value={f.goal} onChange={set("goal")} placeholder="15 объектов в управлении к марту 2027" /></label>
        <label className="field wide"><span>Пояснение к цели</span><input value={f.goalNote} onChange={set("goalNote")} placeholder="Сейчас 4 · из ответа на вопрос 15 анкеты" /></label>
        <label className="field wide"><span>Подпись плана</span><input value={f.planTitle} onChange={set("planTitle")} placeholder="план на 6 месяцев" /></label>
        <label className="field wide"><span>Заметка команды (видна пилоту в «Стратегии»)</span><textarea rows={3} value={f.teamNote} onChange={set("teamNote")} /></label>
        <div className="wide row-gap">
          <button className="btn btn--primary" type="submit" disabled={s.busy}>Сохранить</button>
          {s.note}
        </div>
      </form>

      <div className="stack">
        <FloorCard game={d.game} />
        <div className="card stack">
          <p className="strong">Ссылка-приглашение</p>
          <p className="invite-url">{invite}</p>
          <p className="muted small">
            {d.profile.consentAt ? `Пилот вошёл и дал согласие на ПДн: ${d.profile.consentAt}` : "Пилот ещё не входил"}
          </p>
          <div className="row-gap">
            <button type="button" className="btn btn--soft" onClick={() => void copyText(invite)}>Скопировать</button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                if (!window.confirm("Выпустить новую ссылку? Старая перестанет работать, пилоту нужно будет войти заново.")) return;
                void api<{ inviteUrl: string }>(`/api/team/pilots/${d.pilot.id}/invite`, { method: "POST" }).then((r) =>
                  setInvite(r.inviteUrl),
                );
              }}
            >
              Новая ссылка
            </button>
          </div>
        </div>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => {
            if (!window.confirm("Убрать пилота в архив? Он потеряет доступ к приложению.")) return;
            void api(`/api/team/pilots/${d.pilot.id}/archive`, { method: "POST" }).then(() => nav("/team"));
          }}
        >
          В архив
        </button>
      </div>
    </div>
  );
}

const STAGE_TEMPLATE: Omit<StageItem, "id">[] = [
  { title: "Упаковка", description: "Анкета, сайт, тексты и фото", status: "current" },
  { title: "Запуск каналов", description: "Боты в MAX и Telegram, заявки с сайта", status: "next" },
  { title: "Первые клиенты", description: "SMM, автопостинг, отзывы", status: "next" },
  { title: "Масштаб", description: "Автоматизация, новые направления", status: "next" },
];

const STATUS_LABEL: Record<ItemStatus, string> = { proposed: "на согласовании", accepted: "в работе", declined: "в архиве" };

function GoalsPanel({ d, reload }: TabProps) {
  const [json, setJson] = useState("");
  const [open, setOpen] = useState(false);
  const s = useSaver();
  const act = (url: string, method = "POST") => void s.run(async () => { await api(url, { method }); await reload(); }, "Готово");

  return (
    <div className="stack">
      <div className="row-gap">
        <h2 className="h2">Цели и задачи</h2>
        <button type="button" className="btn btn--soft" onClick={() => setOpen((v) => !v)}>Импорт стратегии (JSON)</button>
      </div>
      {open ? (
        <div className="card stack">
          <p className="muted small">
            Вставьте JSON стратегии или выберите файл. Цели и задачи уйдут пилоту на согласование и добавятся к уже существующим.
          </p>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void f.text().then(setJson);
            }}
          />
          <textarea rows={8} value={json} onChange={(e) => setJson(e.target.value)} placeholder='{"goals":[{"title":"…","tasks":[{"title":"…","dueDate":"2026-10-15","points":50}]}]}' />
          <div className="row-gap">
            <button
              type="button"
              className="btn btn--primary"
              disabled={!json.trim() || s.busy}
              onClick={() =>
                void s.run(async () => {
                  let strategy: unknown;
                  try {
                    strategy = JSON.parse(json);
                  } catch {
                    throw new Error("Это не JSON — проверьте, что скопировали файл целиком");
                  }
                  const r = await api<{ goals: number; tasks: number }>(`/api/team/pilots/${d.pilot.id}/strategy`, { method: "POST", json: { strategy } });
                  setJson("");
                  setOpen(false);
                  await reload();
                  return r;
                }, "Стратегия загружена и отправлена пилоту на согласование")
              }
            >
              Загрузить
            </button>
            {s.note}
          </div>
        </div>
      ) : (
        s.note
      )}
      {d.allGoals.length === 0 ? <p className="muted">Целей пока нет — загрузите стратегию.</p> : null}
      {d.allGoals.map((g) => (
        <details key={g.id} className={`card team-goal team-goal--${g.status}`}>
          <summary>
            <span className="strong">{g.title}</span>
            <span className={`pill pill--${g.status}`}>{STATUS_LABEL[g.status]}</span>
            <span className="muted small">
              {g.tasks.filter((t) => t.status === "accepted").length} в работе · {g.tasks.filter((t) => t.doneAt).length} сделано · {g.tasks.length} всего
            </span>
          </summary>
          {g.declineReason ? <p className="warn small">Пилот: «{g.declineReason}»</p> : null}
          {g.description ? <p className="muted small pre">{g.description}</p> : null}
          <ul className="team-goal__tasks">
            {g.tasks.map((t) => (
              <li key={t.id}>
                <span className={t.status === "declined" ? "dim" : ""}>
                  {t.doneAt ? "✓ " : ""}{t.title}
                </span>
                <span className="muted small nowrap">
                  {t.dueDate ? dueLabel(t.dueDate, !!t.doneAt) + " · " : ""}{STATUS_LABEL[t.status]}
                  {t.declineReason ? ` · «${t.declineReason}»` : ""}
                </span>
                {t.status === "declined" && g.status !== "declined" ? (
                  <button type="button" className="btn btn--ghost" onClick={() => act(`/api/team/tasks/${t.id}/repropose`)}>Предложить снова</button>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="row-gap">
            {g.status === "declined" ? (
              <button type="button" className="btn btn--soft" onClick={() => act(`/api/team/goals/${g.id}/repropose`)}>Предложить снова</button>
            ) : null}
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                if (window.confirm(`Удалить цель «${g.title}» вместе с задачами?`)) act(`/api/team/goals/${g.id}`, "DELETE");
              }}
            >
              Удалить цель
            </button>
          </div>
        </details>
      ))}
    </div>
  );
}

function StrategyTab({ d, reload }: TabProps) {
  const [list, setList] = useState<Omit<StageItem, "id">[]>(
    d.stages.length ? d.stages.map(({ title, description, status }) => ({ title, description, status })) : [],
  );
  const s = useSaver();
  const upd = (i: number, patch: Partial<StageItem>) => setList(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = list.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };

  return (
    <div className="stack">
      <GoalsPanel d={d} reload={reload} />
      <h2 className="h2">Этапы (таймлайн)</h2>
      {list.length === 0 ? (
        <div className="card stack">
          <p className="muted">Этапов пока нет.</p>
          <button type="button" className="btn btn--soft" onClick={() => setList(STAGE_TEMPLATE)}>Взять типовые 4 этапа</button>
        </div>
      ) : null}
      {list.map((st, i) => (
        <div key={i} className="card team-form">
          <label className="field"><span>Этап {i + 1}</span><input value={st.title} onChange={(e) => upd(i, { title: e.target.value })} /></label>
          <label className="field"><span>Статус</span>
            <select value={st.status} onChange={(e) => upd(i, { status: e.target.value as StageItem["status"] })}>
              <option value="done">Готово</option>
              <option value="current">Сейчас</option>
              <option value="next">Дальше</option>
            </select>
          </label>
          <label className="field wide"><span>Что входит</span><textarea rows={2} value={st.description} onChange={(e) => upd(i, { description: e.target.value })} /></label>
          <div className="wide row-gap">
            <button type="button" className="btn btn--ghost" onClick={() => move(i, -1)} aria-label="Выше">↑</button>
            <button type="button" className="btn btn--ghost" onClick={() => move(i, 1)} aria-label="Ниже">↓</button>
            <button type="button" className="btn btn--ghost" onClick={() => setList(list.filter((_, j) => j !== i))}>Удалить</button>
          </div>
        </div>
      ))}
      <div className="row-gap">
        <button type="button" className="btn btn--soft" onClick={() => setList([...list, { title: "", description: "", status: "next" }])}>+ Этап</button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={s.busy}
          onClick={() =>
            void s.run(async () => {
              await api(`/api/team/pilots/${d.pilot.id}/stages`, { method: "PUT", json: { stages: list } });
              await reload();
            })
          }
        >
          Сохранить стратегию
        </button>
        {s.note}
      </div>
    </div>
  );
}

const emptyTask = { title: "", description: "", dueDate: "", points: 50, goalId: 0, propose: false };

function TasksTab({ d, reload }: TabProps) {
  const [form, setForm] = useState(emptyTask);
  const [editId, setEditId] = useState<number | null>(null);
  const s = useSaver();

  function edit(t: TaskItem) {
    setEditId(t.id);
    setForm({ title: t.title, description: t.description, dueDate: t.dueDate || "", points: t.points, goalId: t.goalId || 0, propose: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="stack">
      <form
        className="card team-form"
        onSubmit={(e) => {
          e.preventDefault();
          void s.run(async () => {
            if (editId) await api(`/api/team/tasks/${editId}`, { method: "PUT", json: form });
            else await api(`/api/team/pilots/${d.pilot.id}/tasks`, { method: "POST", json: form });
            setForm(emptyTask);
            setEditId(null);
            await reload();
          }, editId ? "Задача обновлена" : "Задача добавлена");
        }}
      >
        <label className="field wide"><span>{editId ? "Изменить задачу" : "Новая задача"}</span>
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Загрузить фото 6 объектов" /></label>
        <label className="field wide"><span>Подробности</span>
          <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label className="field"><span>Срок</span>
          <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
        <label className="field"><span>Баллы</span>
          <input type="number" min={0} max={1000} step={10} value={form.points} onChange={(e) => setForm({ ...form, points: Number(e.target.value) })} /></label>
        <label className="field"><span>Цель</span>
          <select value={form.goalId} onChange={(e) => setForm({ ...form, goalId: Number(e.target.value) })}>
            <option value={0}>Без цели</option>
            {d.allGoals.filter((g) => g.status !== "declined").map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </label>
        {editId ? null : (
          <label className="check field">
            <input type="checkbox" checked={form.propose} onChange={(e) => setForm({ ...form, propose: e.target.checked })} />
            <span>Отправить пилоту на согласование (иначе — сразу в работу)</span>
          </label>
        )}
        <div className="wide row-gap">
          <button className="btn btn--primary" type="submit" disabled={s.busy}>{editId ? "Сохранить" : "Добавить задачу"}</button>
          {editId ? <button type="button" className="btn btn--ghost" onClick={() => { setEditId(null); setForm(emptyTask); }}>Отмена</button> : null}
          {s.note}
        </div>
      </form>

      <div className="table-box">
        <table className="table">
          <thead><tr><th>Задача</th><th>Срок</th><th>Баллы</th><th>Статус</th><th /></tr></thead>
          <tbody>
            {d.allTasks.length === 0 ? (
              <tr><td colSpan={5} className="muted">Задач пока нет.</td></tr>
            ) : (
              d.allTasks.map((t) => (
                <tr key={t.id}>
                  <td>
                    {t.goalTitle ? <small className="task__goal block">{t.goalTitle}</small> : null}
                    <span className="strong">{t.title}</span>
                  </td>
                  <td className={t.overdue ? "warn strong" : ""}>{dueLabel(t.dueDate, !!t.doneAt) || "—"}</td>
                  <td>{t.doneAt ? `${t.earned} из ${t.points}` : t.points}</td>
                  <td>
                    {t.status !== "accepted" ? STATUS_LABEL[t.status] : t.doneAt ? `сделано ${t.doneAt.slice(0, 10)}` : t.overdue ? "просрочено" : "в работе"}
                  </td>
                  <td className="nowrap">
                    <button type="button" className="btn btn--ghost" onClick={() => edit(t)}>Изменить</button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => {
                        if (!window.confirm(`Удалить задачу «${t.title}»?`)) return;
                        void api(`/api/team/tasks/${t.id}`, { method: "DELETE" }).then(reload);
                      }}
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type ToolDraft = Omit<ToolItem, "id">;
const TOOL_KINDS: [string, string][] = [
  ["site", "Сайт"],
  ["bot_max", "Бот MAX"],
  ["bot_tg", "Бот Telegram"],
  ["smm", "Соцсети / автопостинг"],
  ["other", "Другое"],
];
const TOOL_TEMPLATE: ToolDraft[] = [
  { kind: "site", title: "Сайт", subtitle: "", url: "", adminUrl: "", status: "setup" },
  { kind: "bot_max", title: "Бот в MAX", subtitle: "Заявки с сайта и каталог", url: "", adminUrl: "", status: "soon" },
  { kind: "bot_tg", title: "Бот в Telegram", subtitle: "", url: "", adminUrl: "", status: "soon" },
  { kind: "smm", title: "Автопостинг в соцсети", subtitle: "VK, Telegram, MAX по графику", url: "", adminUrl: "", status: "soon" },
];

function ToolsTab({ d, reload }: TabProps) {
  const [list, setList] = useState<ToolDraft[]>(d.tools.map(({ id: _id, ...t }) => t));
  const s = useSaver();
  const upd = (i: number, patch: Partial<ToolDraft>) => setList(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="stack">
      {list.length === 0 ? (
        <div className="card stack">
          <p className="muted">Инструментов пока нет.</p>
          <button type="button" className="btn btn--soft" onClick={() => setList(TOOL_TEMPLATE)}>Добавить типовой набор</button>
        </div>
      ) : null}
      {list.map((t, i) => (
        <div key={i} className="card team-form">
          <label className="field"><span>Тип</span>
            <select value={t.kind} onChange={(e) => upd(i, { kind: e.target.value })}>
              {TOOL_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="field"><span>Статус</span>
            <select value={t.status} onChange={(e) => upd(i, { status: e.target.value as ToolItem["status"] })}>
              <option value="works">Работает</option>
              <option value="setup">Подключаем</option>
              <option value="soon">Скоро</option>
            </select>
          </label>
          <label className="field"><span>Название</span><input value={t.title} onChange={(e) => upd(i, { title: e.target.value })} /></label>
          <label className="field"><span>Подпись</span><input value={t.subtitle} onChange={(e) => upd(i, { subtitle: e.target.value })} placeholder="myrenthub.ru" /></label>
          <label className="field"><span>Ссылка «Открыть»</span><input type="url" value={t.url} onChange={(e) => upd(i, { url: e.target.value })} placeholder="https://…" /></label>
          <label className="field"><span>Ссылка «Админка»</span><input type="url" value={t.adminUrl} onChange={(e) => upd(i, { adminUrl: e.target.value })} placeholder="https://…/admin" /></label>
          <div className="wide row-gap">
            <button type="button" className="btn btn--ghost" onClick={() => setList(list.filter((_, j) => j !== i))}>Удалить</button>
          </div>
        </div>
      ))}
      <div className="row-gap">
        <button type="button" className="btn btn--soft" onClick={() => setList([...list, { kind: "other", title: "", subtitle: "", url: "", adminUrl: "", status: "soon" }])}>+ Инструмент</button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={s.busy}
          onClick={() =>
            void s.run(async () => {
              await api(`/api/team/pilots/${d.pilot.id}/tools`, { method: "PUT", json: { tools: list } });
              await reload();
            })
          }
        >
          Сохранить инструменты
        </button>
        {s.note}
      </div>
    </div>
  );
}

const fmtAnswer = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : "");

/** Вся анкета одним текстом — чтобы по ней составить стратегию (вставить в чат с ИИ или в документ) */
function surveyText(d: Detail) {
  const origin = window.location.origin;
  const p = d.pilot;
  const lines = [
    `АНКЕТА ПИЛОТА «ЛИФТ»: ${[p.business, p.name].filter(Boolean).join(" — ")}`,
    p.niche ? `Ниша: ${p.niche}` : "",
    `Заполнено ${d.survey.answered} из ${d.survey.total}, обязательных ${d.survey.requiredDone} из ${d.survey.requiredTotal}`,
  ].filter(Boolean);
  for (const s of d.surveySections) {
    lines.push("", `## ${s.title}`);
    for (const q of s.questions) {
      const v = d.answers[q.id];
      let a: string;
      if (q.type === "files") {
        const files = (Array.isArray(v) ? v : []).map((fid) => d.files[fid]).filter(Boolean);
        a = files.length ? files.map((f) => `${f.name} — ${origin}${f.url}`).join("\n   ") : "—";
      } else {
        a = fmtAnswer(v).trim() || "—";
      }
      lines.push(`${q.id.slice(1)}. ${q.title}`, `   ${a.replace(/\n/g, "\n   ")}`);
    }
  }
  return lines.join("\n");
}

function SurveyTab({ d }: { d: Detail }) {
  const fmt = fmtAnswer;
  const [copied, setCopied] = useState<"" | "ok" | "manual">("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(surveyText(d));
      setCopied("ok");
    } catch {
      setCopied("manual");
    }
  }
  return (
    <div className="stack">
      <div className="card stack">
        <p className="muted">
          Заполнено {d.survey.answered} из {d.survey.total} · обязательных {d.survey.requiredDone} из {d.survey.requiredTotal}
        </p>
        <button type="button" className="btn btn--primary" disabled={!d.survey.answered} onClick={() => void copy()}>
          Скопировать анкету для стратегии
        </button>
        {copied === "ok" ? <p className="ok">Скопировано — вставьте в чат, где составляем стратегию.</p> : null}
        {copied === "manual" ? (
          <>
            <p className="muted small">Браузер не дал скопировать автоматически — выделите текст ниже и скопируйте.</p>
            <textarea className="copy-box" readOnly rows={10} value={surveyText(d)} onFocus={(e) => e.currentTarget.select()} />
          </>
        ) : null}
      </div>
      {d.surveySections.map((s) => (
        <section key={s.id} className="card stack">
          <h2 className="h2">{s.title}</h2>
          {s.questions.map((q) => {
            const v = d.answers[q.id];
            return (
              <div key={q.id} className="answer">
                <p className="answer__q">{q.id.slice(1)}. {q.title}{q.required ? " *" : ""}</p>
                {q.type === "files" ? (
                  Array.isArray(v) && v.length ? (
                    <ul className="files">
                      {v.map((fid) => {
                        const f = d.files[fid];
                        return f ? (
                          <li key={fid} className="files__item">
                            {f.mime.startsWith("image/") && f.mime !== "image/svg+xml" ? <img src={f.url} alt="" /> : <span className="files__doc">{f.name.split(".").pop()?.toUpperCase()}</span>}
                            <a className="files__name" href={f.url} target="_blank" rel="noreferrer" download={f.name}>{f.name}</a>
                          </li>
                        ) : null;
                      })}
                    </ul>
                  ) : <p className="muted">—</p>
                ) : (
                  <p className="answer__a">{fmt(v) || <span className="muted">—</span>}</p>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function PostsTab({ pilotId }: { pilotId: number }) {
  const [rev, setRev] = useState(0);
  const urls = {
    list: `/api/team/pilots/${pilotId}/posts`,
    create: `/api/team/pilots/${pilotId}/posts`,
    item: (id: number) => `/api/team/posts/${id}`,
    files: `/api/team/pilots/${pilotId}/files`,
  };
  return (
    <div className="team-grid">
      <div key={rev}>
        <PostsBoard urls={urls} emptyChannelsHint="Подключите соцсети справа — после этого посты можно публиковать." />
      </div>
      <ChannelsPanel pilotId={pilotId} onChange={() => setRev((r) => r + 1)} />
    </div>
  );
}
