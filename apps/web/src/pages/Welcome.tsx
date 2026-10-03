import { Link } from "react-router-dom";
import { LogoMark } from "../components/Logo";

/** Экран без входа: пилот попадает в приложение только по ссылке-приглашению */
export default function Welcome() {
  return (
    <div className="screen screen--center welcome">
      <LogoMark size={84} />
      <h1 className="display">Лифт</h1>
      <p className="lead">Ваш бизнес поднимается на новый этаж</p>
      <p className="muted center">
        Чтобы войти, откройте ссылку-приглашение, которую прислала команда. Нет ссылки — напишите своему менеджеру.
      </p>
      <Link to="/team/login" className="link small">Вход для команды</Link>
    </div>
  );
}
