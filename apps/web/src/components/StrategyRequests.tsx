import { useEffect, useRef, useState } from "react";
import { api, type GoalItem, type StrategyRequestItem } from "../api";

const fmtDate = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

/**
 * «Предложить правку» в стратегии: стратегию составляет команда, пилот пишет, что поменять, —
 * команда правит и присылает обновлённую на согласование. Здесь же — ответы команды.
 */
export default function StrategyRequests({ goals, startOpen }: { goals: GoalItem[]; startOpen?: boolean }) {
  const [list, setList] = useState<StrategyRequestItem[]>([]);
  const [open, setOpen] = useState(!!startOpen);
  const [goalId, setGoalId] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  const box = useRef<HTMLElement>(null);

  useEffect(() => {
    api<{ requests: StrategyRequestItem[] }>("/api/strategy-requests").then((r) => setList(r.requests)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (startOpen) box.current?.scrollIntoView({ block: "start" });
  }, [startOpen]);

  async function send() {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ requests: StrategyRequestItem[] }>("/api/strategy-requests", {
        method: "POST",
        json: { text, goalId: goalId ? Number(goalId) : undefined },
      });
      setList(r.requests);
      setText("");
      setGoalId("");
      setOpen(false);
      setSent(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section ref={box} className="card stack sr">
      <h2 className="h2">Хотите что-то поменять?</h2>
      {!open ? (
        <>
          <p className="muted small">
            Стратегию составляет команда по вашей анкете. Если цель не про вас, срок нереальный или не хватает важного — напишите. Команда поправит стратегию и пришлёт обновлённую на согласование.
          </p>
          {sent ? <p className="ok small">Отправлено — команда ответит здесь.</p> : null}
          <button type="button" className="btn btn--soft" onClick={() => { setOpen(true); setSent(false); }}>
            Предложить правку
          </button>
        </>
      ) : (
        <>
          <label className="field">
            <span>К чему относится</span>
            <select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">К стратегии в целом</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>Цель: {g.title}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Что поменять и почему</span>
            <textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Например: «Хочу не услугу под клиента, а приложение для массового рынка — распространять через Google Play, RuStore и App Store»"
            />
          </label>
          {err ? <p className="error">{err}</p> : null}
          <div className="row-gap">
            <button type="button" className="btn btn--primary" disabled={busy || text.trim().length < 3} onClick={() => void send()}>
              {busy ? "Отправляем…" : "Отправить команде"}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>Отмена</button>
          </div>
        </>
      )}

      {list.length ? (
        <ul className="sr__list">
          {list.map((r) => (
            <li key={r.id} className="sr__item">
              <div className="sr__head">
                <span className={`sr__status sr__status--${r.status}`}>{r.status === "open" ? "Команда рассматривает" : "Учтено"}</span>
                <span className="muted small">{fmtDate(r.createdAt)}</span>
              </div>
              {r.goalTitle ? <p className="muted small">Цель: {r.goalTitle}</p> : null}
              <p className="sr__text">{r.text}</p>
              {r.answer ? (
                <p className="sr__answer"><b>Команда:</b> {r.answer}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
