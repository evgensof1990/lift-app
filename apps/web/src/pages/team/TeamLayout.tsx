import { Link, NavLink, useNavigate } from "react-router-dom";
import { api, clearSession } from "../../api";
import { LogoMark } from "../../components/Logo";

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  async function logout() {
    await api("/api/auth/logout", { method: "POST", role: "team" }).catch(() => undefined);
    clearSession("team");
    nav("/team/login", { replace: true });
  }
  return (
    <div className="team">
      <header className="team__bar">
        <Link to="/team" className="logo">
          <LogoMark size={30} />
          <span className="logo__word">Лифт · команда</span>
        </Link>
        <nav className="team-nav">
          <NavLink to="/team" end>Пилоты</NavLink>
          <NavLink to="/team/pains">Рутина пилотов</NavLink>
        </nav>
        <button type="button" className="btn btn--ghost" onClick={() => void logout()}>Выйти</button>
      </header>
      <main className="team__main">{children}</main>
    </div>
  );
}

/** Скопировать ссылку; в старых WebView без clipboard — выделить текст в prompt */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt("Скопируйте ссылку:", text);
    return false;
  }
}
