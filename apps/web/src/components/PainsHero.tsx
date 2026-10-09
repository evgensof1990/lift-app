import { Link } from "react-router-dom";
import { hoursLabel, pointsWord, type Overview, type PainStatus, type PainSummary } from "../api";

const STATUS: Record<PainStatus, string> = {
  new: "Получили",
  study: "Разбираемся",
  building: "Автоматизируем",
  solved: "Делает «Лифт» ✓",
  later: "Отложили",
};

export const painStatus = (s: PainStatus) => STATUS[s];

/** Сколько часов в неделю освободили и сколько рутины ещё в работе у команды */
export function SavedHours({ sum }: { sum: PainSummary }) {
  return (
    <div className="saved">
      <div className="saved__main">
        <span className="saved__label">Освободили вам</span>
        <span className="saved__value">{hoursLabel(sum.savedHours)}</span>
        <span className="saved__sub">в неделю</span>
      </div>
      <div className="saved__side">
        <span><b>{sum.inWork}</b> в работе у команды</span>
        {sum.openHours ? <span>ещё ≈ {hoursLabel(sum.openHours)} в неделю заберём</span> : null}
        <span><b>{sum.solved}</b> уже делает «Лифт»</span>
      </div>
    </div>
  );
}

/** Главное на главной: что «Лифт» уже забрал у пилота и кнопка «рассказать о рутине» */
export default function PainsHero({ data }: { data: Overview }) {
  const sum = data.painSummary;
  const bonus = sum.pointsLeft ? ` · +${sum.pointsEach} ${pointsWord(sum.pointsEach)}` : "";

  if (!sum.total) {
    return (
      <section className="card stack card--accent">
        <span className="eyebrow">Главное в «Лифте»</span>
        <strong className="goal">Что отнимает у вас время?</strong>
        <span className="muted">
          Переписка с клиентами, посты, счета, запись, отчёты… Расскажите — команда заберёт рутину на себя, а вы займётесь продажами и своим делом.
        </span>
        <Link to="/pains?new=1" className="btn btn--primary">Рассказать{bonus}</Link>
      </section>
    );
  }

  const latest = data.pains.filter((p) => p.status !== "later").slice(0, 3);
  return (
    <section className="card stack card--accent">
      <SavedHours sum={sum} />
      <ul className="pain-mini">
        {latest.map((p) => (
          <li key={p.id}>
            <span className={`pain__status pain__status--${p.status}`}>{STATUS[p.status]}</span>
            <span className="pain-mini__title">{p.title}</span>
          </li>
        ))}
      </ul>
      <div className="row-gap">
        <Link to="/pains?new=1" className="btn btn--primary grow">+ Ещё рутина</Link>
        <Link to="/pains" className="btn btn--soft">Вся рутина</Link>
      </div>
    </section>
  );
}
