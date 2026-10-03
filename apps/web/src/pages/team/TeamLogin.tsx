import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setSession } from "../../api";
import { LogoMark } from "../../components/Logo";

export default function TeamLogin() {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ token: string }>("/api/auth/team", { method: "POST", json: { password } });
      setSession(r.token, "team");
      nav("/team", { replace: true });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen screen--center welcome">
      <LogoMark size={64} />
      <form className="welcome__form" onSubmit={(e) => void submit(e)}>
        <h1 className="h1 center">Лифт · команда</h1>
        <label className="field">
          <span>Пароль</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {err ? <p className="error">{err}</p> : null}
        <button className="btn btn--primary" type="submit" disabled={!password || busy}>Войти</button>
      </form>
    </div>
  );
}
