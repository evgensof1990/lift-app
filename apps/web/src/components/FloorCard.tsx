import type { Game } from "../api";
import { pointsWord } from "../api";

function weeksWord(n: number) {
  const a = n % 100;
  const b = n % 10;
  if (a > 10 && a < 20) return "недель";
  if (b === 1) return "неделя";
  if (b >= 2 && b <= 4) return "недели";
  return "недель";
}

/** Карточка игры: этаж, шкала до следующего этажа, серия без просрочек */
export default function FloorCard({ game }: { game: Game }) {
  const shown = Math.min(game.topFloor, 5);
  const firstShown = Math.max(1, Math.min(game.floor - 2, game.topFloor - shown + 1));
  const floors = Array.from({ length: shown }, (_, i) => firstShown + i);
  return (
    <section className="floor-card" aria-label="Ваш этаж">
      <div className="floor-card__top">
        <div>
          <p className="floor-card__eyebrow">Лифт поднял вас на</p>
          <p className="floor-card__floor">{game.floor} этаж</p>
          <p className="floor-card__sub">
            {game.points} {pointsWord(game.points)}
          </p>
        </div>
        <div className="floor-card__shaft" aria-hidden="true">
          {floors
            .slice()
            .reverse()
            .map((f) => (
              <span key={f} className={f === game.floor ? "on" : f < game.floor ? "past" : ""}>
                {f}
              </span>
            ))}
        </div>
      </div>
      {game.nextFloorAt !== null ? (
        <>
          <div className="bar bar--light">
            <i style={{ width: `${Math.round(game.progress * 100)}%` }} />
          </div>
          <div className="floor-card__row">
            <span>
              Ещё {game.nextFloorAt - game.points} {pointsWord(game.nextFloorAt - game.points)}
            </span>
            <span>до {game.floor + 1} этажа</span>
          </div>
        </>
      ) : (
        <p className="floor-card__row">Вы на последнем этаже — пентхаус!</p>
      )}
      {game.streakWeeks > 0 ? (
        <span className="chip chip--deep">
          Серия: {game.streakWeeks} {weeksWord(game.streakWeeks)} без просрочек
        </span>
      ) : null}
    </section>
  );
}
