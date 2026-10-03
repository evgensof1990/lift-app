import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import type { ChannelView } from "../../components/Posts";

type Draft = { kind: "vk" | "max"; title: string; target: string; token: string };
const EMPTY: Draft = { kind: "vk", title: "", target: "", token: "" };

const HELP = {
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
};

/** Подключение соцсетей пилота. Ключи вводятся один раз и обратно не показываются. */
export default function ChannelsPanel({ pilotId, onChange }: { pilotId: number; onChange: () => void }) {
  const [list, setList] = useState<ChannelView[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [msg, setMsg] = useState<Record<number, string>>({});
  const [err, setErr] = useState("");

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
            <span className="muted small">{c.kind === "vk" ? "ВКонтакте" : "MAX"} · {c.target}</span>
          </div>
          {msg[c.id] ? <p className={`small ${msg[c.id].startsWith("✓") ? "ok" : msg[c.id].startsWith("✕") ? "error" : "muted"}`}>{msg[c.id]}</p> : null}
          <div className="row-gap">
            <button type="button" className="btn btn--soft" onClick={() => void check(c.id)}>Проверить</button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
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
            <div className="segmented">
              {(["vk", "max"] as const).map((k) => (
                <button key={k} type="button" className={draft.kind === k ? "on" : ""} aria-pressed={draft.kind === k} onClick={() => setDraft({ ...draft, kind: k })}>
                  {k === "vk" ? "ВКонтакте" : "MAX"}
                </button>
              ))}
            </div>
          ) : null}
          <p className="muted small">{HELP[draft.kind].hint}</p>
          <label className="field"><span>Название (видно пилоту)</span>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={draft.kind === "vk" ? "ВКонтакте" : "Канал в MAX"} /></label>
          <label className="field"><span>{HELP[draft.kind].target}</span>
            <input value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} /></label>
          <label className="field"><span>{HELP[draft.kind].token}{editId ? " (пусто — оставить прежний)" : ""}</span>
            <input type="password" autoComplete="off" value={draft.token} onChange={(e) => setDraft({ ...draft, token: e.target.value })} /></label>
          {err ? <p className="error">{err}</p> : null}
          <div className="row-gap">
            <button type="button" className="btn btn--primary" onClick={() => void save()}>Сохранить</button>
            <button type="button" className="btn btn--ghost" onClick={() => { setDraft(null); setEditId(null); setErr(""); }}>Отмена</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn--soft" onClick={() => setDraft(EMPTY)}>+ Подключить соцсеть</button>
      )}
      <p className="muted small">Instagram пока не подключаем: Meta признана в России экстремистской, реклама там запрещена, а API Instagram из России недоступен.</p>
    </aside>
  );
}
