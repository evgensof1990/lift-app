import { Link } from "react-router-dom";
import { dueLabel, GOALS, isSoon, plural, pointsWord, TASKS } from "../api";
import FloorCard from "../components/FloorCard";
import { IconFlag, IconForm, IconMegaphone } from "../components/Icons";
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

      {data.review.pending ? (
        <Link to="/review" className="card card--link card--accent">
          <span className="tile"><IconFlag /></span>
          <span className="card__text">
            <strong>Стратегия на согласование</strong>
            <small>
              {data.review.goals ? `${data.review.goals} ${plural(data.review.goals, GOALS)}, ${data.review.tasks} ${plural(data.review.tasks, TASKS)}` : `${data.review.tasks} ${plural(data.review.tasks, TASKS)}`} — выберите, что берёте
              {!data.review.reviewed ? ` · +${data.review.points} ${pointsWord(data.review.points)}` : ""}
            </small>
          </span>
          <span className="card__action">Открыть</span>
        </Link>
      ) : null}

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

      {!data.tasks.length && !data.review.pending ? (
        <section className="card stack">
          <h2 className="h2">Что дальше</h2>
          <ol className="next-steps">
            <li className={survey.complete ? "done" : "now"}>
              <strong>Анкета</strong>
              <span>{survey.complete ? "Готово — команда её изучает." : "Ответьте на вопросы, на какие можете, и нажмите «Отправить команде» в конце."}</span>
            </li>
            <li className={survey.complete ? "now" : ""}>
              <strong>Стратегия</strong>
              <span>{survey.complete ? "Команда составляет план: цели и задачи со сроками. Обычно 1–3 дня." : "По вашим ответам команда составит план: цели и задачи со сроками."}</span>
            </li>
            <li><strong>Согласование</strong><span>Здесь появится «Стратегия на согласование» — вы выберете, что берёте в работу.</span></li>
            <li><strong>Задачи и этажи</strong><span>Делаете задачи в срок — получаете баллы и поднимаетесь по этажам.</span></li>
          </ol>
        </section>
      ) : null}

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
