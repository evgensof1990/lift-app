import { Link } from "react-router-dom";
import { GOALS, plural, pointsWord, TASKS, type Overview } from "../api";

type Step = { key: string; label: string };
const STEPS: Step[] = [
  { key: "survey", label: "Анкета" },
  { key: "strategy", label: "Стратегия" },
  { key: "review", label: "Согласование" },
  { key: "work", label: "Работа по плану" },
];

/** Где пилот на своём пути: анкета → стратегия от команды → согласование → задачи. Всегда на главной. */
export default function Journey({ data }: { data: Overview }) {
  const { survey, review, tasks, goals, stages } = data;
  const hasPlan = review.pending > 0 || tasks.length > 0 || goals.length > 0;
  const now = !survey.complete && !hasPlan ? 0 : !hasPlan ? 1 : review.pending ? 2 : 3;

  const done = tasks.filter((t) => t.doneAt).length;
  const stage = stages.find((s) => s.status === "current");
  const next = tasks.find((t) => !t.doneAt);

  const info = [
    {
      title: "Заполните анкету",
      text: `Расскажите о бизнесе — по ответам команда составит вашу стратегию. Заполнено ${survey.answered} из ${survey.total}, за анкету +${survey.points} ${pointsWord(survey.points)}.`,
      action: { to: "/survey", label: survey.answered ? "Продолжить анкету" : "Начать анкету" },
    },
    {
      title: "Команда готовит стратегию",
      text: "Изучаем ваши ответы и составляем план: цели, задачи и сроки. Обычно 1–3 дня — здесь появится «Стратегия на согласование».",
      action: null,
    },
    {
      title: "Стратегия готова — решаете вы",
      text: `${review.goals ? `${review.goals} ${plural(review.goals, GOALS)}, ` : ""}${review.tasks} ${plural(review.tasks, TASKS)}. Отметьте, что берёте в работу, — остальное уйдёт в архив.${!review.reviewed ? ` +${review.points} ${pointsWord(review.points)}` : ""}`,
      action: { to: "/review", label: "Согласовать стратегию" },
    },
    {
      title: stage ? `Сейчас: ${stage.title}` : "Работаете по плану",
      text: `Сделано ${done} из ${tasks.length} ${plural(tasks.length, TASKS)}.${next ? ` Следующая: «${next.title}».` : " Открытых задач нет — команда скоро добавит новые."}`,
      action: next ? { to: "/tasks", label: "К задачам" } : { to: "/strategy", label: "Моя стратегия" },
    },
  ][now];

  return (
    <section className={`card stack journey${now === 2 || now === 0 ? " card--accent" : ""}`}>
      <ol className="journey__steps">
        {STEPS.map((s, i) => (
          <li key={s.key} className={i < now ? "done" : i === now ? "now" : ""}>
            <span className="journey__dot">{i < now ? "✓" : i + 1}</span>
            <span className="journey__label">{s.label}</span>
          </li>
        ))}
      </ol>
      <div className="journey__now">
        <strong>{info.title}</strong>
        <span className="muted small">{info.text}</span>
      </div>
      {info.action ? (
        <Link to={info.action.to} className={`btn ${now === 3 ? "btn--soft" : "btn--primary"}`}>{info.action.label}</Link>
      ) : null}
    </section>
  );
}
