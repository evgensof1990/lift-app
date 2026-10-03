import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, setSession } from "../api";
import { LogoMark } from "../components/Logo";

export default function Invite() {
  const { token = "" } = useParams();
  const nav = useNavigate();
  const [who, setWho] = useState<{ name: string; business: string } | null>(null);
  const [err, setErr] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ name: string; business: string }>(`/api/auth/invite/${encodeURIComponent(token)}`)
      .then(setWho)
      .catch((e: Error) => setErr(e.message));
  }, [token]);

  async function enter(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ token: string }>(`/api/auth/invite/${encodeURIComponent(token)}`, {
        method: "POST",
        json: { consent },
      });
      setSession(r.token, "pilot");
      nav("/", { replace: true });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen screen--center welcome">
      <LogoMark size={72} />
      {who ? (
        <form className="welcome__form" onSubmit={(e) => void enter(e)}>
          <h1 className="h1 center">Здравствуйте, {who.name}!</h1>
          <p className="muted center">
            {who.business ? `Это кабинет «${who.business}» в Лифте. ` : ""}Здесь ваша стратегия, задачи, анкета и все
            инструменты.
          </p>
          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              Даю согласие на обработку моих персональных данных в соответствии с{" "}
              <a href="/privacy" target="_blank" rel="noreferrer">политикой</a>
            </span>
          </label>
          {err ? <p className="error">{err}</p> : null}
          <button className="btn btn--primary" type="submit" disabled={!consent || busy}>
            {busy ? "Входим…" : "Войти"}
          </button>
        </form>
      ) : (
        <p className={err ? "error center" : "muted"}>{err || "Проверяем приглашение…"}</p>
      )}
    </div>
  );
}
