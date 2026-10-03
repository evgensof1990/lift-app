import { IconCheck } from "../components/Icons";
import type { PilotCtx } from "../PilotShell";

export default function Strategy({ data }: PilotCtx) {
  const { pilot, stages } = data;
  return (
    <div className="page">
      <div>
        <h1 className="h1">Стратегия</h1>
        <p className="muted">{[pilot.business, pilot.planTitle].filter(Boolean).join(" · ")}</p>
      </div>

      {pilot.goal ? (
        <section className="card card--goal">
          <p className="eyebrow">Цель</p>
          <p className="goal">{pilot.goal}</p>
          {pilot.goalNote ? <p className="muted small">{pilot.goalNote}</p> : null}
        </section>
      ) : null}

      {stages.length ? (
        <ol className="timeline">
          {stages.map((s, i) => (
            <li key={s.id} className={`timeline__item timeline__item--${s.status}`}>
              <span className="timeline__mark">{s.status === "done" ? <IconCheck size={14} /> : i + 1}</span>
              <div className="timeline__body">
                <p className="timeline__title">
                  {s.title}
                  {s.status === "current" ? <span className="badge">сейчас</span> : null}
                </p>
                {s.description ? <p className="timeline__text">{s.description}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">Команда готовит вашу стратегию — она появится здесь.</p>
      )}

      {pilot.teamNote ? (
        <section className="card card--note">
          <span className="avatar">Л</span>
          <div>
            <p className="strong small">Заметка команды</p>
            <p className="note-text">{pilot.teamNote}</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
