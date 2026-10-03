import { Link } from "react-router-dom";
import { dueLabel, isSoon, pointsWord } from "../api";
import FloorCard from "../components/FloorCard";
import { IconForm } from "../components/Icons";
import { Logo } from "../components/Logo";
import type { PilotCtx } from "../PilotShell";

export default function Home({ data }: PilotCtx) {
  const { pilot, game, survey } = data;
  const upcoming = data.tasks.filter((t) => !t.doneAt).slice(0, 3);
  return (
    <div className="page">
      <header className="page__bar">
        <Logo />
      </header>

      <div>
        {pilot.business ? <p className="muted">{pilot.business}</p> : null}
        <h1 className="h1">Привет, {pilot.name}!</h1>
      </div>

      <FloorCard game={game} />

      {!survey.complete ? (
        <Link to="/survey" className="card card--link">
          <span className="tile"><IconForm /></span>
          <span className="card__text">
            <strong>Анкета для сайта</strong>
            <small>
              Заполнено {survey.answered} из {survey.total} · +{survey.points} {pointsWord(survey.points)}
            </small>
          </span>
          <span className="card__action">{survey.answered ? "Продолжить" : "Начать"}</span>
        </Link>
      ) : null}

      <div className="section-head">
        <h2 className="h2">Ближайшие задачи</h2>
        <Link to="/tasks" className="link">Все задачи</Link>
      </div>
      {upcoming.length ? (
        <ul className="list">
          {upcoming.map((t) => (
            <li key={t.id} className="row-item">
              <span className={`dot${t.overdue || isSoon(t.dueDate) ? " dot--warn" : ""}`} />
              <span className="row-item__title">{t.title}</span>
              {t.dueDate ? (
                <span className={`row-item__meta${t.overdue || isSoon(t.dueDate) ? " warn" : ""}`}>
                  {dueLabel(t.dueDate)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Открытых задач нет. Команда скоро добавит новые.</p>
      )}

      {survey.complete ? (
        <Link to="/survey" className="link">Посмотреть свои ответы в анкете</Link>
      ) : null}
    </div>
  );
}
