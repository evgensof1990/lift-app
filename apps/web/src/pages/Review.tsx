import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, dueLabel, GOALS, plural, pointsWord, TASKS, type ReviewData, type TaskItem } from "../api";
import { IconBack } from "../components/Icons";
import type { PilotCtx } from "../PilotShell";

type Choice = "take" | "skip";

/**
 * Согласование стратегии: по каждой цели — «Беру» / «Не актуально».
 * Внутри принятой цели задачи по умолчанию берутся, лишние можно убрать.
 * Не актуальное уходит в архив (его можно вернуть со страницы «Стратегия»).
 */
export default function Review({ data, reload }: PilotCtx) {
  const nav = useNavigate();
  const [review, setReview] = useState<ReviewData | null>(null);
  const [goalChoice, setGoalChoice] = useState<Record<number, Choice>>({});
  const [skipTask, setSkipTask] = useState<Record<number, boolean>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<ReviewData>("/api/review").then(setReview).catch((e: Error) => setErr(e.message));
  }, []);

  const proposedGoals = useMemo(() => review?.goals.filter((g) => g.status === "proposed") || [], [review]);
  const decided = proposedGoals.filter((g) => goalChoice[g.id]).length;
  const allTasks = useMemo(
    () => [...(review?.goals.flatMap((g) => g.tasks.map((t) => ({ t, goalId: g.id }))) || []), ...(review?.tasks || []).map((t) => ({ t, goalId: 0 }))],
    [review],
  );
  const taken = allTasks.filter(({ t, goalId }) => goalChoice[goalId] !== "skip" && !skipTask[t.id]);
  const takenPoints = taken.reduce((s, { t }) => s + t.points, 0);

  if (!review) return <div className="page"><p className="muted">{err || "Загрузка…"}</p></div>;

  if (!review.goals.length && !review.tasks.length) {
    return (
      <div className="page">
        <h1 className="h1">Стратегия согласована</h1>
        <p className="muted">Новых предложений от команды нет.</p>
        <Link to="/strategy" className="btn btn--primary">К стратегии</Link>
      </div>
    );
  }

  async function submit() {
    setBusy(true);
    setErr("");
    const goals: Record<number, { accept: boolean; reason?: string }> = {};
    for (const g of proposedGoals) goals[g.id] = { accept: goalChoice[g.id] === "take", reason: reasons[`g${g.id}`] };
    const tasks: Record<number, { accept: boolean; reason?: string }> = {};
    for (const { t, goalId } of allTasks) {
      if (goalChoice[goalId] === "skip") continue;
      tasks[t.id] = { accept: !skipTask[t.id], reason: reasons[`t${t.id}`] };
    }
    try {
      await api("/api/review", { method: "POST", json: { goals, tasks } });
      await reload();
      nav("/strategy", { replace: true });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  const taskRow = (t: TaskItem, goalSkipped: boolean) => {
    const off = goalSkipped || skipTask[t.id];
    return (
      <li key={t.id} className={`rv-task${off ? " rv-task--off" : ""}`}>
        <label className="rv-task__main">
          <input
            type="checkbox"
            checked={!off}
            disabled={goalSkipped}
            onChange={() => setSkipTask({ ...skipTask, [t.id]: !skipTask[t.id] })}
            aria-label={`Беру задачу «${t.title}»`}
          />
          <span className="rv-task__body">
            <span className="rv-task__title">{t.title}</span>
            {t.description ? <span className="rv-task__desc">{t.description}</span> : null}
            <span className="task__meta">
              {t.dueDate ? <span>до {dueLabel(t.dueDate, true)}</span> : null}
              <span className="accent">+{t.points} {pointsWord(t.points)}</span>
            </span>
          </span>
        </label>
        {skipTask[t.id] && !goalSkipped ? (
          <input
            className="rv-reason"
            placeholder="Почему не берёте? (необязательно)"
            value={reasons[`t${t.id}`] || ""}
            onChange={(e) => setReasons({ ...reasons, [`t${t.id}`]: e.target.value })}
          />
        ) : null}
      </li>
    );
  };

  return (
    <div className="page review">
      <header className="review__bar">
        <Link to="/" className="icon-btn" aria-label="Назад"><IconBack /></Link>
        <span className="strong">Стратегия на согласование</span>
      </header>

      <section className="card card--goal">
        <p className="eyebrow">{data.pilot.planTitle || "Стратегия"}</p>
        {data.pilot.goal ? <p className="goal">{data.pilot.goal}</p> : null}
        <p className="muted small">
          Команда подготовила {proposedGoals.length ? `${proposedGoals.length} ${plural(proposedGoals.length, GOALS)} и ` : ""}{allTasks.length} {plural(allTasks.length, TASKS)}.
          Отметьте, что берёте в работу. Не актуальное уйдёт в архив, его можно вернуть позже.
          {!data.review.reviewed ? ` За согласование — +${data.review.points} ${pointsWord(data.review.points)}.` : ""}
        </p>
        <Link to="/strategy?suggest=1" className="link small">Стратегия в целом не про вас? Предложите правку команде</Link>
      </section>

      {review.goals.map((g) => {
        const choice = g.status === "proposed" ? goalChoice[g.id] : "take";
        const skipped = choice === "skip";
        return (
          <section key={g.id} className={`rv-goal${skipped ? " rv-goal--off" : ""}${choice === "take" ? " rv-goal--on" : ""}`}>
            <div className="rv-goal__head">
              <h2 className="h2">{g.title}</h2>
              {g.description ? <p className="muted small pre">{g.description}</p> : null}
              {g.status === "accepted" ? <p className="accent small">Цель уже в работе — новые задачи</p> : null}
            </div>
            {g.status === "proposed" ? (
              <div className="rv-choice" role="group" aria-label={`Цель «${g.title}»`}>
                <button type="button" aria-pressed={choice === "take"} onClick={() => setGoalChoice({ ...goalChoice, [g.id]: "take" })}>
                  Беру в работу
                </button>
                <button type="button" aria-pressed={choice === "skip"} className="skip" onClick={() => setGoalChoice({ ...goalChoice, [g.id]: "skip" })}>
                  Не актуально
                </button>
              </div>
            ) : null}
            {skipped ? (
              <input
                className="rv-reason"
                placeholder="Почему не актуально? (необязательно)"
                value={reasons[`g${g.id}`] || ""}
                onChange={(e) => setReasons({ ...reasons, [`g${g.id}`]: e.target.value })}
              />
            ) : null}
            {g.tasks.length ? (
              <details className="rv-tasks" open={choice === "take"}>
                <summary>
                  Задачи: {g.tasks.length}
                  {choice === "take" ? ` · беру ${g.tasks.filter((t) => !skipTask[t.id]).length}` : ""}
                </summary>
                <ul className="list">{g.tasks.map((t) => taskRow(t, skipped))}</ul>
              </details>
            ) : null}
          </section>
        );
      })}

      {review.tasks.length ? (
        <section className="rv-goal rv-goal--on">
          <h2 className="h2">Отдельные задачи</h2>
          <ul className="list">{review.tasks.map((t) => taskRow(t, false))}</ul>
        </section>
      ) : null}

      {err ? <p className="error">{err}</p> : null}

      <footer className="review__footer">
        <p className="muted small center">
          {decided < proposedGoals.length
            ? `Решено ${decided} из ${proposedGoals.length} ${plural(proposedGoals.length, ["цели", "целей", "целей"])}`
            : `Беру ${taken.length} из ${allTasks.length} ${plural(allTasks.length, ["задачи", "задач", "задач"])} · до +${takenPoints} ${pointsWord(takenPoints)}`}
        </p>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy || decided < proposedGoals.length}
          onClick={() => void submit()}
        >
          {busy ? "Сохраняем…" : "Подтвердить выбор"}
        </button>
      </footer>
    </div>
  );
}
