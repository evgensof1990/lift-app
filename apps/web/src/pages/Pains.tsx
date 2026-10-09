import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, hoursLabel, pointsWord, type PainItem } from "../api";
import { PAIN_DURATION, PAIN_EXAMPLES, PAIN_FREQ, painHours } from "../../../api/src/pains";
import type { PilotCtx } from "../PilotShell";
import { painStatus, SavedHours } from "../components/PainsHero";

const empty = { title: "", details: "", freq: "", duration: "", area: "" };

/** Рутина пилота: рассказать, что отнимает время, и видеть, что команда уже забрала на себя */
export default function Pains({ data, reload }: PilotCtx) {
  const [search, setSearch] = useSearchParams();
  const [open, setOpen] = useState(search.get("new") === "1" || !data.pains.length);
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  const sum = data.painSummary;

  const inWork = data.pains.filter((p) => p.status === "new" || p.status === "study" || p.status === "building");
  const solved = data.pains.filter((p) => p.status === "solved");
  const later = data.pains.filter((p) => p.status === "later");
  const hours = painHours(f);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api("/api/pains", { method: "POST", json: f });
      setF(empty);
      setOpen(false);
      setSent(true);
      if (search.get("new")) setSearch({}, { replace: true });
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: PainItem) {
    if (!window.confirm("Убрать эту рутину?")) return;
    try {
      await api(`/api/pains/${p.id}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="page">
      <div>
        <h1 className="h1">Рутина</h1>
        <p className="muted">
          Расскажите, на что уходит ваше время. Команда заберёт это на себя — автоматизирует, а вы займётесь продажами и своим делом.
        </p>
      </div>

      {data.pains.length ? <SavedHours sum={sum} /> : null}

      {sent ? (
        <div className="card card--goal">
          <strong>Спасибо, записали!</strong>
          <span className="muted small">Команда разберётся и напишет здесь, как заберёт это на себя. Вспомните ещё что-то — добавляйте.</span>
        </div>
      ) : null}

      {open ? (
        <form className="card stack pain-form" onSubmit={(e) => void send(e)}>
          <label className="field">
            <span>Что отнимает у вас время?</span>
            <textarea
              rows={3}
              required
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
              placeholder="Например: каждый вечер переписываю заявки из WhatsApp в таблицу"
            />
          </label>
          <div className="pain-examples">
            <span className="muted small">Часто бывает:</span>
            {PAIN_EXAMPLES.map((x) => (
              <button key={x.title} type="button" className="pain-example" onClick={() => setF({ ...f, title: x.title, area: x.area })}>
                {x.title}
              </button>
            ))}
          </div>
          <fieldset className="q">
            <legend className="field-legend">Как часто?</legend>
            <div className="segmented segmented--wrap">
              {PAIN_FREQ.map((x) => (
                <button key={x.id} type="button" className={f.freq === x.id ? "on" : ""} onClick={() => setF({ ...f, freq: x.id })}>{x.label}</button>
              ))}
            </div>
          </fieldset>
          <fieldset className="q">
            <legend className="field-legend">Сколько времени за раз?</legend>
            <div className="segmented segmented--wrap">
              {PAIN_DURATION.map((x) => (
                <button key={x.id} type="button" className={f.duration === x.id ? "on" : ""} onClick={() => setF({ ...f, duration: x.id })}>{x.label}</button>
              ))}
            </div>
          </fieldset>
          {hours ? <p className="accent">≈ {hoursLabel(hours)} в неделю уходит на это</p> : null}
          <label className="field">
            <span>Как делаете сейчас? <span className="muted">(необязательно)</span></span>
            <textarea
              rows={2}
              value={f.details}
              onChange={(e) => setF({ ...f, details: e.target.value })}
              placeholder="Где, в каких программах, кто ещё участвует — так мы быстрее придумаем, как это забрать"
            />
          </label>
          {err ? <p className="error">{err}</p> : null}
          <button className="btn btn--primary" type="submit" disabled={busy || f.title.trim().length < 3}>
            Отправить команде{sum.pointsLeft ? ` · +${sum.pointsEach} ${pointsWord(sum.pointsEach)}` : ""}
          </button>
          {data.pains.length ? (
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>Отмена</button>
          ) : null}
        </form>
      ) : (
        <button type="button" className="btn btn--primary" onClick={() => { setOpen(true); setSent(false); }}>
          + Что ещё отнимает время?
        </button>
      )}

      {inWork.length ? (
        <>
          <h2 className="h2">Команда забирает</h2>
          <ul className="list">{inWork.map((p) => <PainCard key={p.id} p={p} onRemove={remove} />)}</ul>
        </>
      ) : null}

      {solved.length ? (
        <>
          <h2 className="h2">Теперь делает «Лифт»</h2>
          <ul className="list">{solved.map((p) => <PainCard key={p.id} p={p} />)}</ul>
        </>
      ) : null}

      {later.length ? (
        <details className="archive">
          <summary>Отложили · {later.length}</summary>
          <ul className="list">{later.map((p) => <PainCard key={p.id} p={p} />)}</ul>
        </details>
      ) : null}
    </div>
  );
}

function PainCard({ p, onRemove }: { p: PainItem; onRemove?: (p: PainItem) => void }) {
  const st = painStatus(p.status);
  const freq = PAIN_FREQ.find((x) => x.id === p.freq)?.label;
  const dur = PAIN_DURATION.find((x) => x.id === p.duration)?.label;
  return (
    <li className={`card pain pain--${p.status}`}>
      <div className="pain__head">
        <span className={`pain__status pain__status--${p.status}`}>{st}</span>
        {p.status === "solved" && p.savedHours ? <span className="pain__saved">−{hoursLabel(p.savedHours)} в неделю</span> : null}
      </div>
      <strong className="pain__title">{p.title}</strong>
      {freq || dur ? (
        <span className="muted small">
          {[freq, dur].filter(Boolean).join(" · ")}
          {p.hours ? ` → ≈ ${hoursLabel(p.hours)} в неделю` : ""}
        </span>
      ) : null}
      {p.solution ? (
        <p className="pain__solution">
          <b>{p.status === "solved" ? "Теперь: " : "Как забираем: "}</b>
          {p.solution}
        </p>
      ) : null}
      {onRemove && p.status === "new" && p.createdBy === "pilot" ? (
        <button type="button" className="link pain__remove" onClick={() => onRemove(p)}>Убрать</button>
      ) : null}
    </li>
  );
}
