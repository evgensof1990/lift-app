import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import type { ChannelView } from "../../components/Posts";

type Kind = "vk" | "max" | "tg" | "dzen" | "instagram";
type Draft = { kind: Kind; title: string; target: string; token: string };
const EMPTY: Draft = { kind: "vk", title: "", target: "", token: "" };

const KIND_LABEL: Record<Kind, string> = { tg: "Telegram", max: "MAX", vk: "ВКонтакте", dzen: "Дзен", instagram: "Instagram" };
const NO_TOKEN: Kind[] = ["dzen", "instagram"];

const HELP: Record<Kind, { target: string; token: string; hint: string }> = {
  vk: {
    target: "Сообщество ВК: адрес (vk.com/workshop4) или ID",
    token: "Ключ доступа администратора сообщества",
    hint: "Публикация идёт от имени сообщества. Нужен ключ пользователя-администратора группы с правами wall, photos, groups, offline — ключ самого сообщества ВК для публикации не подходит.",
  },
  max: {
    target: "ID канала MAX (chat_id, число, например -1001234567)",
    token: "Токен бота MAX",
    hint: "Бот должен быть администратором канала с правом писать сообщения. Токен — в кабинете платформы MAX (Чат-боты → ваш бот).",
  },
  tg: {
    target: "Канал: @имя или ID (-100…)",
    token: "Токен бота от @BotFather",
    hint: "Создайте бота в @BotFather и сделайте его администратором канала с правом публиковать. Telegram в России работает с перебоями — если публикации не проходят, подключим прокси.",
  },
  dzen: {
    target: "Адрес канала в Дзене (dzen.ru/…)",
    token: "",
    hint: "У Дзена нет API для публикации. Подключите к вашему Telegram-каналу официальный «Синхробот Дзена» — и каждый пост из Telegram сам появится в Дзене. В «Лифте» пост в Дзен уходит вместе с Telegram.",
  },
  instagram: {
    target: "Аккаунт: @имя",
    token: "",
    hint: "Без API Meta и без риска блокировки: в назначенное время у пилота появляется кнопка «Опубликовать в Instagram» — подпись копируется, фото открываются в «Поделиться». Публикует сам пилот, одним касанием.",
  },
};

/** Подключение соцсетей пилота. Ключи вводятся один раз и обратно не показываются. */
export default function ChannelsPanel({ pilotId, onChange }: { pilotId: number; onChange: () => void }) {
  const [list, setList] = useState<ChannelView[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [msg, setMsg] = useState<Record<number, string>>({});
  const [err, setErr] = useState("");
  const [chats, setChats] = useState<{ id: string; title: string; type: string }[] | null>(null);

  async function findChats() {
    if (!draft) return;
    setErr("");
    setChats(null);
    try {
      const r = await api<{ chats: { id: string; title: string; type: string }[] }>(`/api/team/pilots/${pilotId}/max-chats`, {
        method: "POST",
        json: { token: draft.token, channelId: editId || undefined },
      });
      setChats(r.chats);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const load = useCallback(async () => {
    setList((await api<{ channels: ChannelView[] }>(`/api/team/pilots/${pilotId}/posts`)).channels);
  }, [pilotId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!draft) return;
    setErr("");
    try {
      if (editId) await api(`/api/team/channels/${editId}`, { method: "PUT", json: draft });
      else await api(`/api/team/pilots/${pilotId}/channels`, { method: "POST", json: draft });
      setDraft(null);
      setEditId(null);
      await load();
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function check(id: number) {
    setMsg({ ...msg, [id]: "Проверяем…" });
    const r = await api<{ ok: boolean; info?: string; error?: string }>(`/api/team/channels/${id}/check`, { method: "POST" });
    setMsg((m) => ({ ...m, [id]: r.ok ? `✓ ${r.info}` : `✕ ${r.error}` }));
  }

  return (
    <aside className="card stack">
      <h2 className="h2">Соцсети пилота</h2>
      {list.length === 0 ? <p className="muted small">Пока не подключено ни одной.</p> : null}
      {list.map((c) => (
        <div key={c.id} className="channel">
          <div className="channel__head">
            <strong>{c.title}</strong>
            <span className="muted small">{KIND_LABEL[c.kind]} · {c.target}</span>
          </div>
          {msg[c.id] ? <p className={`small ${msg[c.id].startsWith("✓") ? "ok" : msg[c.id].startsWith("✕") ? "error" : "muted"}`}>{msg[c.id]}</p> : null}
          <div className="row-gap">
            <button type="button" className="btn btn--soft" onClick={() => void check(c.id)}>Проверить</button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setChats(null);
                setEditId(c.id);
                setDraft({ kind: c.kind, title: c.title, target: c.target, token: "" });
              }}
            >
              Изменить
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                if (window.confirm(`Отключить «${c.title}»? Запланированные посты в эту соцсеть не уйдут.`)) {
                  void api(`/api/team/channels/${c.id}`, { method: "DELETE" }).then(load).then(onChange);
                }
              }}
            >
              Отключить
            </button>
          </div>
        </div>
      ))}

      {draft ? (
        <div className="stack">
          {!editId ? (
            <div className="segmented segmented--wrap">
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                <button key={k} type="button" className={draft.kind === k ? "on" : ""} aria-pressed={draft.kind === k} onClick={() => setDraft({ ...draft, kind: k })}>
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          ) : null}
          <p className="muted small">{HELP[draft.kind].hint}</p>
          <label className="field"><span>Название (видно пилоту)</span>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={KIND_LABEL[draft.kind]} /></label>
          <label className="field"><span>{HELP[draft.kind].target}</span>
            <input value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} /></label>
          {NO_TOKEN.includes(draft.kind) ? null : (
            <label className="field"><span>{HELP[draft.kind].token}{editId ? " (пусто — оставить прежний)" : ""}</span>
              <input type="password" autoComplete="off" value={draft.token} onChange={(e) => setDraft({ ...draft, token: e.target.value })} /></label>
          )}
          {draft.kind === "max" ? (
            <div className="stack">
              <button type="button" className="btn btn--soft" onClick={() => void findChats()}>Найти каналы бота</button>
              {chats ? (
                chats.length ? (
                  <ul className="chat-pick">
                    {chats.map((ch) => (
                      <li key={ch.id}>
                        <button
                          type="button"
                          className={`chat-pick__item${draft.target === ch.id ? " on" : ""}`}
                          onClick={() => setDraft({ ...draft, target: ch.id, title: draft.title || ch.title })}
                        >
                          <strong>{ch.title}</strong>
                          <small className="muted">{ch.type === "channel" ? "канал" : ch.type === "chat" ? "группа" : ch.type === "dialog" ? "личный чат — не подходит" : ch.type} · {ch.id}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small">Бот пока не добавлен ни в один канал. Добавьте его в канал «Цеха» администратором и нажмите ещё раз.</p>
                )
              ) : null}
            </div>
          ) : null}
          {err ? <p className="error">{err}</p> : null}
          <div className="row-gap">
            <button type="button" className="btn btn--primary" onClick={() => void save()}>Сохранить</button>
            <button type="button" className="btn btn--ghost" onClick={() => { setDraft(null); setEditId(null); setErr(""); }}>Отмена</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn--soft" onClick={() => setDraft(EMPTY)}>+ Подключить соцсеть</button>
      )}
      <p className="muted small">
        Instagram — без API Meta: публикует пилот в одно касание. Помните: реклама в Instagram в России запрещена, пишите о процессе и работах, без «купите со скидкой».
      </p>
    </aside>
  );
}
