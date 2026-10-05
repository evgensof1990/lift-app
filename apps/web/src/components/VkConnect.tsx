import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { ChannelView } from "./Posts";

/**
 * Пилот сам подключает своё сообщество ВК: входит в ВК как администратор и разрешает доступ.
 * В APK вход открывается в браузере телефона — после возврата в приложение статус обновится сам.
 */
export default function VkConnect() {
  const [ch, setCh] = useState<ChannelView | null | undefined>(undefined);
  const [target, setTarget] = useState("");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api<{ channel: ChannelView | null }>("/api/vk");
      setCh(r.channel);
      if (r.channel) setTarget((t) => t || r.channel!.target);
    } catch {
      setCh(null);
    }
  }, []);

  useEffect(() => {
    void load();
    const onShow = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [load]);

  async function connect() {
    setErr("");
    try {
      window.location.href = (await api<{ url: string }>("/api/vk/auth", { method: "POST", json: { target } })).url;
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (ch === undefined) return null;
  const ready = !!ch?.vkid && !!ch.vkWall;
  const status = !ch
    ? "Не подключено"
    : ready
      ? `Подключено: ${ch.title}`
      : ch.vkid
        ? "Вход выполнен, ждём, когда ВКонтакте откроет право публикации"
        : "Нужно войти в ВКонтакте";

  return (
    <div className="card stack">
      <div className="channel__head">
        <strong>ВКонтакте</strong>
        <span className={`small ${ready ? "ok" : "muted"}`}>{status}</span>
      </div>
      {open || !ch ? (
        <>
          <p className="muted small">
            Войдите в ВК как владелец или администратор сообщества и разрешите доступ — посты будут выходить от имени сообщества. Пароль от ВК «Лифт» не видит.
          </p>
          <label className="field">
            <span>Адрес сообщества</span>
            <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="vk.com/ваше_сообщество" autoCapitalize="off" />
          </label>
          {err ? <p className="error">{err}</p> : null}
          <button type="button" className="btn btn--primary" disabled={!target.trim()} onClick={() => void connect()}>
            Подключить ВКонтакте
          </button>
        </>
      ) : (
        <button type="button" className={`btn ${ready ? "btn--ghost" : "btn--primary"}`} onClick={() => setOpen(true)}>
          {ready ? "Подключить заново" : "Подключить ВКонтакте"}
        </button>
      )}
    </div>
  );
}
