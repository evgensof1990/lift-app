import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, clearSession, dueLabel } from "../../api";
import TeamLayout, { copyText } from "./TeamLayout";

type Row = {
  id: number;
  name: string;
  business: string;
  niche: string;
  stage: string;
  floor: number;
  points: number;
  tasksDone: number;
  tasksTotal: number;
  overdue: number;
  nearest: { title: string; dueDate: string; overdue: boolean } | null;
  survey: { answered: number; total: number; complete: boolean };
  review: number;
  archived: number;
  tools: string[];
  joined: boolean;
};

export default function TeamPilots() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ name: "", business: "", niche: "", phone: "" });
  const [created, setCreated] = useState<{ id: number; inviteUrl: string } | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows((await api<{ pilots: Row[] }>("/api/team/pilots")).pilots);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        clearSession();
        nav("/team/login", { replace: true });
        return;
      }
      setErr((e as Error).message);
    }
  }, [nav]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const r = await api<{ id: number; inviteUrl: string }>("/api/team/pilots", { method: "POST", json: form });
      setCreated(r);
      setForm({ name: "", business: "", niche: "", phone: "" });
      setShowForm(false);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const all = rows || [];
  const overdue = all.reduce((n, r) => n + r.overdue, 0);
  const inWork = all.reduce((n, r) => n + r.tasksTotal - r.tasksDone, 0);
  const surveys = all.filter((r) => r.survey.complete).length;

  return (
    <TeamLayout>
      <div className="team__head">
        <h1 className="h1">Пилоты</h1>
        <button type="button" className="btn btn--primary" onClick={() => setShowForm((v) => !v)}>
          + Пригласить пилота
        </button>
      </div>

      {showForm ? (
        <form className="card team-form" onSubmit={(e) => void create(e)}>
          <label className="field"><span>Имя (как обращаться) *</span>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Анна" /></label>
          <label className="field"><span>Бизнес</span>
            <input value={form.business} onChange={(e) => setForm({ ...form, business: e.target.value })} placeholder="Рентал" /></label>
          <label className="field"><span>Ниша</span>
            <input value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="Управление арендой" /></label>
          <label className="field"><span>Телефон</span>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+7…" /></label>
          <button className="btn btn--primary" type="submit">Создать и получить ссылку</button>
        </form>
      ) : null}

      {created ? (
        <div className="card card--goal">
          <p className="strong">Пилот создан. Отправьте ему ссылку-приглашение:</p>
          <p className="invite-url">{created.inviteUrl}</p>
          <div className="row-gap">
            <button type="button" className="btn btn--soft" onClick={() => void copyText(created.inviteUrl)}>Скопировать</button>
            <Link className="btn btn--soft" to={`/team/pilots/${created.id}`}>Заполнить стратегию и задачи</Link>
          </div>
        </div>
      ) : null}

      {err ? <p className="error">{err}</p> : null}

      <div className="kpis">
        <div className="card"><small>Пилотов</small><b>{all.length}</b></div>
        <div className="card"><small>Задач в работе</small><b>{inWork}</b></div>
        <div className={`card${overdue ? " card--warn" : ""}`}><small>Просрочено</small><b>{overdue}</b></div>
        <div className="card"><small>Анкет заполнено</small><b>{surveys} из {all.length}</b></div>
      </div>

      <div className="table-box">
        <table className="table">
          <thead>
            <tr>
              <th>Пилот</th><th>Этап</th><th>Этаж</th><th>Задачи</th><th>Ближайший срок</th><th>Анкета</th><th>Инструменты</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={7} className="muted">Загрузка…</td></tr>
            ) : all.length === 0 ? (
              <tr><td colSpan={7} className="muted">Пилотов пока нет — пригласите первого.</td></tr>
            ) : (
              all.map((r) => (
                <tr key={r.id} onClick={() => nav(`/team/pilots/${r.id}`)} className="table__row">
                  <td>
                    <Link to={`/team/pilots/${r.id}`} className="strong plain">{r.business || r.name}</Link>
                    <small className="muted block">{[r.name, r.niche].filter(Boolean).join(" · ")}{r.joined ? "" : " · не входил"}</small>
                  </td>
                  <td>
                    {r.stage || "—"}
                    {r.review ? <small className="accent block">ждёт согласования: {r.review}</small> : null}
                    {r.archived ? <small className="muted block">в архиве: {r.archived}</small> : null}
                  </td>
                  <td>{r.floor}</td>
                  <td>{r.tasksDone} / {r.tasksTotal}{r.overdue ? <span className="warn"> · {r.overdue} просрочено</span> : null}</td>
                  <td className={r.nearest?.overdue ? "warn strong" : ""}>
                    {r.nearest ? `${dueLabel(r.nearest.dueDate)} · ${r.nearest.title}` : "—"}
                  </td>
                  <td>{r.survey.complete ? "готова" : `${r.survey.answered} / ${r.survey.total}`}</td>
                  <td>{r.tools.join(" · ") || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </TeamLayout>
  );
}
