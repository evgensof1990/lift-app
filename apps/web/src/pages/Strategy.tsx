import { useState } from "react";
import { Link } from "react-router-dom";
import { api, GOALS, plural, TASKS } from "../api";
import { IconCheck } from "../components/Icons";
import type { PilotCtx } from "../PilotShell";

export default function Strategy({ data, reload }: PilotCtx) {
  const { pilot, stages, goals, archive, review } = data;
  const [busy, setBusy] = useState("");
  const archived = archive.goals.length + archive.tasks.length;

  async function restore(kind: "goal" | "task", id: number) {
    setBusy(`${kind}${id}`);
    try {
      await api(`/api/archive/${kind}/${id}/restore`, { method: "POST" });
      await reload();
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="page">
      <div>
        <h1 className="h1">Стратегия</h1>
        <p className="muted">{[pilot.business, pilot.planTitle].filter(Boolean).join(" · ")}</p>
      </div>

      {review.pending ? (
        <Link to="/review" className="card card--link card--accent">
          <span className="card__text">
            <strong>Стратегия на согласование</strong>
            <small>{review.goals ? `${review.goals} ${plural(review.goals, GOALS)}, ${review.tasks} ${plural(review.tasks, TASKS)}` : `${review.tasks} ${plural(review.tasks, TASKS)}`} — отметьте, что берёте в работу</small>
          </span>
          <span className="card__action">Открыть</span>
        </Link>
      ) : null}

      {pilot.goal ? (
        <section className="card card--goal">
          <p className="eyebrow">Цель</p>
          <p className="goal">{pilot.goal}</p>
          {pilot.goalNote ? <p className="muted small">{pilot.goalNote}</p> : null}
        </section>
      ) : null}

      {goals.length ? (
        <>
          <h2 className="h2">Цели в работе</h2>
          <ul className="list">
            {goals.map((g) => (
              <li key={g.id} className="card goal-card">
                <div className="goal-card__head">
                  <strong>{g.title}</strong>
                  <span className="muted small nowrap">{g.tasksDone} / {g.tasksTotal}</span>
                </div>
                <div className="bar"><i style={{ width: `${g.tasksTotal ? Math.round((g.tasksDone / g.tasksTotal) * 100) : 0}%` }} /></div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {stages.length ? (
        <>
          <h2 className="h2">Этапы</h2>
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
        </>
      ) : !goals.length && !review.pending ? (
        <p className="muted">Команда готовит вашу стратегию — она появится здесь.</p>
      ) : null}

      {pilot.teamNote ? (
        <section className="card card--note">
          <span className="avatar">Л</span>
          <div>
            <p className="strong small">Заметка команды</p>
            <p className="note-text">{pilot.teamNote}</p>
          </div>
        </section>
      ) : null}

      {archived ? (
        <details className="archive">
          <summary>Архив: не актуально сейчас · {archived}</summary>
          <ul className="list">
            {archive.goals.map((g) => (
              <li key={`g${g.id}`} className="card archive__item">
                <span className="card__text">
                  <strong>{g.title}</strong>
                  <small>Цель · {g.tasks.length} задач{g.declineReason ? ` · «${g.declineReason}»` : ""}</small>
                </span>
                <button type="button" className="btn btn--soft" disabled={busy === `goal${g.id}`} onClick={() => void restore("goal", g.id)}>
                  Вернуть
                </button>
              </li>
            ))}
            {archive.tasks.map((t) => (
              <li key={`t${t.id}`} className="card archive__item">
                <span className="card__text">
                  <strong>{t.title}</strong>
                  <small>{t.goalTitle || "Задача"}{t.declineReason ? ` · «${t.declineReason}»` : ""}</small>
                </span>
                <button type="button" className="btn btn--soft" disabled={busy === `task${t.id}`} onClick={() => void restore("task", t.id)}>
                  Вернуть
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
