import { Link, useNavigate } from "react-router-dom";
import { DEMO, setSession } from "../api";
import { LogoMark } from "../components/Logo";

/** Экран без входа: пилот попадает в приложение только по ссылке-приглашению */
export default function Welcome() {
  const nav = useNavigate();
  return (
    <div className="screen screen--center welcome">
      <LogoMark size={84} />
      <h1 className="display">Лифт</h1>
      <p className="lead">Ваш бизнес поднимается на новый этаж</p>
      {DEMO ? (
        <div className="welcome__form">
          <p className="muted center">Демо-версия: данные — примеры, хранятся только в этом телефоне.</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setSession("demo", "pilot");
              nav("/", { replace: true });
            }}
          >
            Открыть кабинет пилота
          </button>
          <button
            type="button"
            className="btn btn--soft"
            onClick={() => {
              setSession("demo", "team");
              nav("/team", { replace: true });
            }}
          >
            Открыть панель команды
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void import("../demo").then((d) => d.resetDemo())}
          >
            Сбросить демо-данные
          </button>
        </div>
      ) : (
        <>
          <p className="muted center">
            Чтобы войти, откройте ссылку-приглашение, которую прислала команда. Нет ссылки — напишите своему менеджеру.
          </p>
          <Link to="/team/login" className="link small">Вход для команды</Link>
        </>
      )}
    </div>
  );
}
