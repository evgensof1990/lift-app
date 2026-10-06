import { useState } from "react";
import { Capacitor } from "@capacitor/core";

const KEY_HIDE = "lift.installHint.hidden";
/** Ссылка-приглашение, по которой пилот вошёл: на айфоне у иконки на экране «Домой» своё хранилище, войти нужно ещё раз */
export const KEY_INVITE = "lift.invite";

function store(key: string, value?: string) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    /* приватный режим — просто без запоминания */
  }
  return null;
}

function isIosBrowser() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const standalone = (navigator as { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  return ios && !standalone && !Capacitor.isNativePlatform();
}

/** На айфоне в Safari: как поставить «Лифт» на экран «Домой» — иконка и полный экран, как у приложения */
export default function InstallHint() {
  const [hidden, setHidden] = useState(() => store(KEY_HIDE) === "1" || !isIosBrowser());
  const [copied, setCopied] = useState(false);
  if (hidden) return null;
  const invite = store(KEY_INVITE);
  const link = invite ? `${window.location.origin}/invite/${invite}` : "";

  return (
    <section className="card stack install">
      <strong>«Лифт» на экран «Домой»</strong>
      <ol className="install__steps">
        <li>Внизу Safari нажмите «Поделиться» <span className="install__icon" aria-hidden>⬆︎</span></li>
        <li>Выберите «На экран „Домой“» → «Добавить»</li>
        <li>Откройте «Лифт» с экрана и один раз войдите по своей ссылке-приглашению</li>
      </ol>
      <div className="row-gap">
        {link ? (
          <button
            type="button"
            className="btn btn--soft"
            onClick={() => {
              void navigator.clipboard
                .writeText(link)
                .then(() => setCopied(true))
                .catch(() => window.prompt("Скопируйте ссылку:", link));
            }}
          >
            {copied ? "Ссылка скопирована ✓" : "Скопировать ссылку для входа"}
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            store(KEY_HIDE, "1");
            setHidden(true);
          }}
        >
          Скрыть
        </button>
      </div>
    </section>
  );
}
