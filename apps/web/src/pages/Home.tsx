import { Link } from "react-router-dom";
import { dueLabel, isSoon } from "../api";
import FloorCard from "../components/FloorCard";
import InstallHint from "../components/InstallHint";
import { IconMegaphone } from "../components/Icons";
import Journey from "../components/Journey";
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

      <Journey data={data} />

      {data.postsWaiting ? (
        <Link to="/posts" className="card card--link card--accent">
          <span className="tile"><IconMegaphone /></span>
          <span className="card__text">
            <strong>Пора опубликовать в Instagram</strong>
            <small>Готово постов: {data.postsWaiting} — одно касание</small>
          </span>
          <span className="card__action">Открыть</span>
        </Link>
      ) : null}

      <FloorCard game={game} />

      <InstallHint />

      {!data.tasks.length && !data.review.pending ? null : (
        <div className="section-head">
          <h2 className="h2">Ближайшие задачи</h2>
          <Link to="/tasks" className="link">Все задачи</Link>
        </div>
      )}
      {!data.tasks.length && !data.review.pending ? null : upcoming.length ? (
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
        <p className="muted">{data.review.pending ? "Задачи появятся здесь, когда вы согласуете стратегию." : "Открытых задач нет. Команда скоро добавит новые."}</p>
      )}

      {survey.complete ? (
        <Link to="/survey" className="link">Посмотреть свои ответы в анкете</Link>
      ) : null}
    </div>
  );
}
