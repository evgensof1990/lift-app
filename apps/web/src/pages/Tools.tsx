import { useNavigate } from "react-router-dom";
import { clearSession, api } from "../api";
import { IconLogout, toolIcon } from "../components/Icons";
import type { PilotCtx } from "../PilotShell";

const STATUS = {
  works: { label: "Работает", cls: "ok" },
  setup: { label: "Подключаем", cls: "warn" },
  soon: { label: "Скоро", cls: "muted" },
} as const;

export default function Tools({ data }: PilotCtx) {
  const nav = useNavigate();
  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    clearSession();
    nav("/welcome", { replace: true });
  }
  return (
    <div className="page">
      <div>
        <h1 className="h1">Инструменты</h1>
        <p className="muted">Всё, что мы сделали для вашего бизнеса</p>
      </div>

      {data.tools.length ? (
        <ul className="list">
          {data.tools.map((t) => {
            const st = STATUS[t.status];
            return (
              <li key={t.id} className="card tool">
                <div className="tool__head">
                  <span className="tile">{toolIcon(t.kind)}</span>
                  <span className="card__text">
                    <strong>{t.title}</strong>
                    {t.subtitle ? <small>{t.subtitle}</small> : null}
                  </span>
                  <span className={`status status--${st.cls}`}>{st.label}</span>
                </div>
                {t.url || t.adminUrl ? (
                  <div className="tool__actions">
                    {t.url ? (
                      <a className="btn btn--soft" href={t.url} target="_blank" rel="noreferrer">Открыть</a>
                    ) : null}
                    {t.adminUrl ? (
                      <a className="btn btn--soft" href={t.adminUrl} target="_blank" rel="noreferrer">Админка</a>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">Здесь появятся ваш сайт, боты и другие инструменты.</p>
      )}

      <div className="page__footer">
        <a className="link small" href="/privacy">Политика обработки персональных данных</a>
        <button type="button" className="btn btn--ghost" onClick={() => void logout()}>
          <IconLogout size={18} />Выйти
        </button>
      </div>
    </div>
  );
}
