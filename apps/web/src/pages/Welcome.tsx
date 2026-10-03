import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DEMO, setSession } from "../api";
import { LogoMark } from "../components/Logo";

/** Экран без входа: пилот попадает в приложение только по ссылке-приглашению */
export default function Welcome() {
  const nav = useNavigate();
  const [link, setLink] = useState("");
  const [err, setErr] = useState("");

  /** Ссылка вида https://…/invite/<код> или просто код */
  function enter(e: React.FormEvent) {
    e.preventDefault();
    const m = link.trim().match(/(?:invite\/)?([A-Za-z0-9_-]{16,})\/?$/);
    if (!m) {
      setErr("Не похоже на ссылку-приглашение. Скопируйте её из сообщения целиком.");
      return;
    }
    nav(`/invite/${m[1]}`);
  }

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
          <form className="welcome__form" onSubmit={enter}>
            <label className="field">
              <span>Ссылка-приглашение от команды</span>
              <input
                type="text"
                inputMode="url"
                autoCapitalize="off"
                autoComplete="off"
                placeholder="https://lift.myrenthub.ru/invite/…"
                value={link}
                onChange={(e) => {
                  setLink(e.target.value);
                  setErr("");
                }}
              />
            </label>
            {err ? <p className="error">{err}</p> : null}
            <button className="btn btn--primary" type="submit" disabled={!link.trim()}>Войти</button>
            <p className="muted small center">Нет ссылки — напишите своему менеджеру.</p>
          </form>
          <Link to="/team/login" className="link small">Вход для команды</Link>
        </>
      )}
    </div>
  );
}
