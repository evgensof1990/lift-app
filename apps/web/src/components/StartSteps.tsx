import { Link } from "react-router-dom";
import { pointsWord, type Overview } from "../api";

/**
 * Первые шаги новичка — пока команда не прислала план: анкета → рутина → ждём план.
 * Одна карточка и одна главная кнопка: всегда понятно, что делать сейчас.
 */
export default function StartSteps({ data }: { data: Overview }) {
  const { survey, painSummary: pains } = data;
  const surveyDone = survey.complete;
  const painsDone = pains.total > 0;
  const now = !surveyDone ? 0 : !painsDone ? 1 : 2;

  const steps = [
    {
      title: "Расскажите о бизнесе",
      text: surveyDone
        ? "Анкета у команды ✓"
        : `Анкета — около 15 минут, можно частями: ответы сохраняются сами.${survey.answered ? ` Заполнено ${survey.answered} из ${survey.total}.` : ""} +${survey.points} ${pointsWord(survey.points)}`,
      action: surveyDone ? null : { to: "/survey", label: survey.answered ? "Продолжить анкету" : "Начать анкету" },
    },
    {
      title: "Что отнимает у вас время?",
      text: painsDone
        ? `Рассказали: ${pains.total}. Вспомните ещё — добавляйте в любой момент в разделе «Рутина».`
        : `Переписка с клиентами, посты, счета, запись… Минута на каждый пункт. +${pains.pointsEach} ${pointsWord(pains.pointsEach)} за каждый`,
      action: { to: "/pains?new=1", label: painsDone ? "Добавить ещё" : "Рассказать" },
    },
    {
      title: "Команда пришлёт план",
      text: surveyDone
        ? "Изучаем ваши ответы: что заберём на себя и как будем расти. Обычно 1–3 дня — план появится здесь."
        : "Что заберём на себя и как будем расти. Появится здесь через 1–3 дня после анкеты.",
      action: null,
    },
  ];

  return (
    <section className="card start">
      <h2 className="h2">С чего начать</h2>
      <ol className="start__list">
        {steps.map((s, i) => {
          const done = i < now || (i === 1 && painsDone);
          const cls = done ? "done" : i === now ? "now" : "";
          return (
            <li key={s.title} className={cls}>
              <span className="start__dot">{done ? "✓" : i + 1}</span>
              <div className="start__body">
                <strong>{s.title}</strong>
                <span className="muted small">{s.text}</span>
                {s.action && (i === now || (i === 1 && now === 2)) ? (
                  <Link to={s.action.to} className={`btn ${i === now ? "btn--primary" : "btn--soft"}`}>{s.action.label}</Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
