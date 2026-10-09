import { useState } from "react";
import { api, hoursLabel, type PainStatus, type TeamPainItem } from "../../api";
import { PAIN_AREAS, PAIN_DURATION, PAIN_FREQ, painHours } from "../../../../api/src/pains";

export const PAIN_STATUS_TEAM: [PainStatus, string][] = [
  ["new", "Новая — не разобрали"],
  ["study", "Разбираемся"],
  ["building", "Автоматизируем"],
  ["solved", "Решено — делает «Лифт»"],
  ["later", "Отложили"],
];

export const areaLabel = (id: string) => PAIN_AREAS.find((a) => a.id === id)?.label || "Другое";

type Form = {
  title: string;
  details: string;
  freq: string;
  duration: string;
  area: string;
  status: PainStatus;
  solution: string;
  savedHours: string;
  teamNote: string;
};

const blank: Form = { title: "", details: "", freq: "", duration: "", area: "other", status: "new", solution: "", savedHours: "", teamNote: "" };

const toForm = (p: TeamPainItem): Form => ({
  title: p.title,
  details: p.details,
  freq: p.freq,
  duration: p.duration,
  area: p.area,
  status: p.status,
  solution: p.solution,
  savedHours: p.savedEstimate === null ? "" : String(p.savedEstimate),
  teamNote: p.teamNote,
});

/** Поля рутины — общие для «записать со звонка» и для разбора */
function Fields({ f, set }: { f: Form; set: (f: Form) => void }) {
  const hours = painHours(f);
  return (
    <>
      <label className="field wide"><span>Рутина (как сказал пилот)</span>
        <textarea rows={2} required value={f.title} onChange={(e) => set({ ...f, title: e.target.value })} /></label>
      <label className="field wide"><span>Как делает сейчас</span>
        <textarea rows={2} value={f.details} onChange={(e) => set({ ...f, details: e.target.value })} /></label>
      <label className="field"><span>Как часто</span>
        <select value={f.freq} onChange={(e) => set({ ...f, freq: e.target.value })}>
          <option value="">не знаем</option>
          {PAIN_FREQ.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select></label>
      <label className="field"><span>Сколько за раз</span>
        <select value={f.duration} onChange={(e) => set({ ...f, duration: e.target.value })}>
          <option value="">не знаем</option>
          {PAIN_DURATION.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select></label>
      <label className="field"><span>Область</span>
        <select value={f.area} onChange={(e) => set({ ...f, area: e.target.value })}>
          {PAIN_AREAS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select></label>
      <label className="field"><span>Статус</span>
        <select value={f.status} onChange={(e) => set({ ...f, status: e.target.value as PainStatus })}>
          {PAIN_STATUS_TEAM.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></label>
      <label className="field wide"><span>Как забираем — видит пилот</span>
        <textarea
          rows={2}
          value={f.solution}
          onChange={(e) => set({ ...f, solution: e.target.value })}
          placeholder="Например: бот в MAX отвечает на частые вопросы и присылает вам готовую заявку"
        /></label>
      <label className="field"><span>Освободили, ч в неделю</span>
        <input
          type="number"
          min={0}
          max={80}
          step={0.5}
          value={f.savedHours}
          onChange={(e) => set({ ...f, savedHours: e.target.value })}
          placeholder={hours ? `${hours} — всё время рутины` : "оценка"}
        /></label>
      <label className="field wide"><span>Заметка команды — пилот не видит</span>
        <textarea
          rows={2}
          value={f.teamNote}
          onChange={(e) => set({ ...f, teamNote: e.target.value })}
          placeholder="Чем решили, сколько заняло, что переиспользовать для других пилотов"
        /></label>
    </>
  );
}

const body = (f: Form) => ({ ...f, savedHours: f.savedHours === "" ? null : Number(f.savedHours) });

function PainEditor({ p, reload }: { p: TeamPainItem; reload: () => Promise<void> }) {
  const [f, setF] = useState(() => toForm(p));
  const [note, setNote] = useState<{ ok?: string; err?: string }>({});
  const [busy, setBusy] = useState(false);
  const status = PAIN_STATUS_TEAM.find(([k]) => k === p.status)?.[1];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/team/pains/${p.id}`, { method: "PUT", json: body(f) });
      setNote({ ok: "Сохранено — пилот видит статус и решение" });
      await reload();
    } catch (er) {
      setNote({ err: (er as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Удалить эту рутину? Пилот её больше не увидит.")) return;
    await api(`/api/team/pains/${p.id}`, { method: "DELETE" });
    await reload();
  }

  return (
    <details className={`card team-goal${p.status === "new" ? " card--accent" : ""}`} open={p.status === "new"}>
      <summary>
        <span className={`pill pill--${p.status === "new" ? "proposed" : p.status === "later" ? "declined" : "accepted"}`}>{status}</span>
        <span className="strong">{p.title}</span>
        <span className="muted small">
          {areaLabel(p.area)}
          {p.hours ? ` · ≈ ${hoursLabel(p.hours)} / нед` : ""}
          {p.status === "solved" && p.savedHours ? ` · освободили ${hoursLabel(p.savedHours)} / нед` : ""}
          {` · ${p.createdBy === "pilot" ? "от пилота" : "записала команда"} ${new Date(p.createdAt.replace(" ", "T") + "Z").toLocaleDateString("ru-RU")}`}
        </span>
      </summary>
      <form className="team-pain" onSubmit={(e) => void save(e)}>
        <Fields f={f} set={setF} />
        <div className="wide row-gap">
          <button className="btn btn--primary" type="submit" disabled={busy}>Сохранить</button>
          <button type="button" className="btn btn--danger" onClick={() => void remove()}>Удалить</button>
          {note.ok ? <p className="ok">✓ {note.ok}</p> : note.err ? <p className="error">{note.err}</p> : null}
        </div>
      </form>
    </details>
  );
}

/** Вкладка «Рутина» в карточке пилота: разбор того, что отнимает у него время */
export default function PainsTab({ pilotId, pains, reload }: { pilotId: number; pains: TeamPainItem[]; reload: () => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState(blank);
  const [err, setErr] = useState("");
  const saved = pains.reduce((s, p) => s + p.savedHours, 0);
  const open = pains.filter((p) => p.status !== "solved" && p.status !== "later").reduce((s, p) => s + p.hours, 0);
  const order: PainStatus[] = ["new", "study", "building", "solved", "later"];
  const list = pains.slice().sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || b.hours - a.hours);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await api(`/api/team/pilots/${pilotId}/pains`, { method: "POST", json: body(f) });
      setF(blank);
      setAdding(false);
      await reload();
    } catch (er) {
      setErr((er as Error).message);
    }
  }

  return (
    <div className="stack">
      <div className="kpis">
        <div className="card"><small>Освободили</small><b>{hoursLabel(saved)} / нед</b></div>
        <div className={`card${pains.some((p) => p.status === "new") ? " card--accent" : ""}`}>
          <small>Новых — разберите</small><b>{pains.filter((p) => p.status === "new").length}</b>
        </div>
        <div className="card"><small>Ещё не забрали</small><b>{hoursLabel(open)} / нед</b></div>
      </div>
      <p className="muted small">
        Разберите каждую рутину: поставьте область и статус, напишите пилоту, как забираем. Когда автоматизация заработала — статус «Решено» и сколько часов освободили. Заметка команды — для нас: чем решили, чтобы повторить у других пилотов.
      </p>
      <div className="row-gap">
        <button type="button" className="btn btn--soft" onClick={() => setAdding((v) => !v)}>+ Записать рутину со слов пилота</button>
      </div>
      {adding ? (
        <form className="card team-pain" onSubmit={(e) => void add(e)}>
          <Fields f={f} set={setF} />
          <div className="wide row-gap">
            <button className="btn btn--primary" type="submit">Добавить</button>
            {err ? <p className="error">{err}</p> : null}
          </div>
        </form>
      ) : null}
      {list.length ? (
        list.map((p) => <PainEditor key={`${p.id}-${p.updatedAt}`} p={p} reload={reload} />)
      ) : (
        <p className="muted">Пилот пока не рассказал о рутине. Спросите на созвоне: «Что отнимает у вас больше всего времени, кроме самой работы?» — и запишите здесь.</p>
      )}
    </div>
  );
}
