import { useCallback, useEffect, useState } from "react";
import { api, isVideoFile, uploadFiles, type FileInfo } from "../api";
import { IconPaperclip } from "./Icons";
import { shareToInstagram } from "../share";

export type ChannelKind = "vk" | "max" | "tg" | "dzen" | "instagram";
export type ChannelView = { id: number; kind: ChannelKind; title: string; enabled: boolean; target: string; hasToken: boolean; manual?: boolean; vkid?: boolean; vkWall?: boolean };
export type PostTargetView = { channelId: number; kind: ChannelKind; title: string; status: "pending" | "manual" | "sent" | "failed"; url: string; error: string; sentAt: string | null };
export type PostView = {
  id: number;
  text: string;
  photos: FileInfo[];
  publishAt: string | null;
  status: "draft" | "scheduled" | "publishing" | "waiting" | "done" | "partial" | "failed";
  createdBy: "pilot" | "team";
  createdAt: string;
  targets: PostTargetView[];
};

/** Адреса API: у пилота — свои, у команды — с id пилота */
export type PostsApi = { list: string; create: string; item: (id: number) => string; files: string };

const STATUS: Record<PostView["status"], [string, string]> = {
  draft: ["Черновик", "muted"],
  scheduled: ["Запланирован", "accent"],
  publishing: ["Публикуется…", "accent"],
  waiting: ["Ждёт вас в Instagram", "warn"],
  done: ["Опубликован", "ok"],
  partial: ["Опубликован частично", "warn"],
  failed: ["Не опубликован", "error"],
};

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
function when(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** datetime-local ↔ ISO в часовом поясе телефона */
function toLocalInput(iso: string | null) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PostsBoard({ urls, emptyChannelsHint }: { urls: PostsApi; emptyChannelsHint: string }) {
  const [posts, setPosts] = useState<PostView[] | null>(null);
  const [channels, setChannels] = useState<ChannelView[]>([]);
  const [editing, setEditing] = useState<PostView | "new" | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api<{ posts: PostView[]; channels: ChannelView[] }>(urls.list);
      setPosts(r.posts);
      setChannels(r.channels.filter((c) => c.enabled));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [urls.list]);

  useEffect(() => {
    void load();
    // пока что-то публикуется — обновляем статусы
    const t = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(t);
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setErr("");
    try {
      await fn();
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (!posts) return <p className="muted">{err || "Загрузка…"}</p>;

  if (editing) {
    return (
      <PostEditor
        post={editing === "new" ? null : editing}
        channels={channels}
        urls={urls}
        onDone={async () => {
          setEditing(null);
          await load();
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  const waiting = posts.filter((p) => p.status === "waiting");
  const upcoming = posts.filter((p) => !["done", "partial", "waiting"].includes(p.status));
  const published = posts.filter((p) => ["done", "partial"].includes(p.status));

  return (
    <div className="stack">
      {channels.length ? (
        <p className="muted small">Публикуем в: {channels.map((c) => c.title).join(", ")}</p>
      ) : (
        <p className="card muted small">{emptyChannelsHint}</p>
      )}
      <button type="button" className="btn btn--primary" onClick={() => setEditing("new")}>+ Новый пост</button>
      {err ? <p className="error">{err}</p> : null}

      {waiting.length ? <h2 className="h2">Пора опубликовать</h2> : null}
      <ul className="list">
        {waiting.map((p) => (
          <PostCard key={p.id} p={p} act={act} urls={urls} />
        ))}
      </ul>

      {upcoming.length ? <h2 className="h2">Запланировано и черновики</h2> : null}
      <ul className="list">
        {upcoming.map((p) => (
          <PostCard key={p.id} p={p} onEdit={() => setEditing(p)} act={act} urls={urls} />
        ))}
      </ul>

      {published.length ? <h2 className="h2">Опубликовано</h2> : null}
      <ul className="list">
        {published.map((p) => (
          <PostCard key={p.id} p={p} act={act} urls={urls} />
        ))}
      </ul>
      {!posts.length ? <p className="muted">Постов пока нет. Напишите первый — текст, фото или видео и время публикации.</p> : null}
    </div>
  );
}

function PostCard({ p, onEdit, act, urls }: { p: PostView; onEdit?: () => void; act: (fn: () => Promise<unknown>) => Promise<void>; urls: PostsApi }) {
  const [label, cls] = STATUS[p.status];
  const editable = ["draft", "scheduled", "failed"].includes(p.status);
  return (
    <li className="card post">
      <div className="post__head">
        <span className={`post__status ${cls}`}>{label}</span>
        <span className="muted small">{p.publishAt ? when(p.publishAt) : "без даты"}</span>
      </div>
      {p.photos.length ? (
        <div className="post__photos">
          {p.photos.slice(0, 4).map((f) => <Thumb key={f.id} f={f} />)}
          {p.photos.length > 4 ? <span className="post__more">+{p.photos.length - 4}</span> : null}
        </div>
      ) : null}
      {p.text ? <p className="post__text">{p.text}</p> : null}
      {p.targets.length ? (
        <ul className="post__targets">
          {p.targets.map((t) => (
            <li key={t.channelId} className={`chip-target chip-target--${t.status}`}>
              {t.status === "sent" && t.url ? (
                <a href={t.url} target="_blank" rel="noreferrer">{t.title} ✓</a>
              ) : (
                <span>{t.title}{t.status === "sent" ? " ✓" : t.status === "failed" ? " ✕" : ""}</span>
              )}
              {t.error && t.status !== "sent" ? <small className="error block">{t.error}</small> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {p.targets
        .filter((t) => t.status === "manual")
        .map((t) => (
          <ManualPublish key={t.channelId} p={p} t={t} act={act} urls={urls} />
        ))}
      <div className="row-gap">
        {editable && onEdit ? <button type="button" className="btn btn--soft" onClick={onEdit}>Изменить</button> : null}
        {p.status === "failed" || p.status === "partial" ? (
          <button type="button" className="btn btn--soft" onClick={() => void act(() => api(`${urls.item(p.id)}/retry`, { method: "POST" }))}>
            Повторить
          </button>
        ) : null}
        {p.status !== "publishing" ? (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              const msg = ["done", "partial"].includes(p.status)
                ? "Убрать пост из списка? В соцсетях он останется."
                : "Удалить пост?";
              if (window.confirm(msg)) void act(() => api(urls.item(p.id), { method: "DELETE" }));
            }}
          >
            Удалить
          </button>
        ) : null}
      </div>
    </li>
  );
}

function PostEditor({
  post,
  channels,
  urls,
  onDone,
  onCancel,
}: {
  post: PostView | null;
  channels: ChannelView[];
  urls: PostsApi;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(post?.text || "");
  const [photos, setPhotos] = useState<FileInfo[]>(post?.photos || []);
  const [selected, setSelected] = useState<number[]>(post ? post.targets.map((t) => t.channelId) : channels.map((c) => c.id));
  const [mode, setMode] = useState<"now" | "schedule">(post?.publishAt && post.status === "scheduled" ? "schedule" : "now");
  const [at, setAt] = useState(toLocalInput(post?.publishAt || null));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [progress, setProgress] = useState<number | null>(null);

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    const form = new FormData();
    Array.from(list).slice(0, 10 - photos.length).forEach((f) => form.append("files", f));
    setBusy(true);
    setErr("");
    setProgress(0);
    try {
      const r = await uploadFiles<{ files: FileInfo[] }>(urls.files, form, setProgress);
      const media = r.files.filter((f) => MEDIA.test(f.mime));
      if (media.length < list.length) setErr("Подходят фото JPG, PNG, WebP и видео MP4, MOV, WebM");
      setPhotos([...photos, ...media].slice(0, 10));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function save(kind: "draft" | "now" | "schedule") {
    setBusy(true);
    setErr("");
    const body = {
      text,
      photos: photos.map((f) => f.id),
      channelIds: selected,
      mode: kind,
      publishAt: kind === "schedule" ? new Date(at).toISOString() : undefined,
    };
    try {
      await api(post ? urls.item(post.id) : urls.create, { method: post ? "PUT" : "POST", json: body });
      await onDone();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="stack post-editor">
      <h2 className="h2">{post ? "Изменить пост" : "Новый пост"}</h2>

      <label className="field">
        <span>Текст поста</span>
        <textarea rows={7} value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} placeholder="Например: машинка из одного бруска бука за 60 секунд…" />
        <small className="muted">{text.length} / 4000</small>
      </label>

      <div className="field">
        <span>Фото и видео (до 10)</span>
        {photos.length ? (
          <div className="post__photos post__photos--edit">
            {photos.map((f) => (
              <span key={f.id} className="post__photo">
                <Thumb f={f} />
                <button type="button" aria-label="Убрать" onClick={() => setPhotos(photos.filter((x) => x.id !== f.id))}>×</button>
              </span>
            ))}
          </div>
        ) : null}
        {progress !== null ? (
          <div className="stack upload-progress">
            <div className="bar"><i style={{ width: `${progress}%` }} /></div>
            <small className="muted">{progress < 100 ? `Загружаем… ${progress}%` : "Обрабатываем…"} Видео может загружаться пару минут — не закрывайте экран.</small>
          </div>
        ) : photos.length < 10 ? (
          <label className="btn btn--outline file-btn">
            <IconPaperclip size={18} />Добавить фото или видео
            <input type="file" multiple accept={ACCEPT} onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
          </label>
        ) : null}
      </div>

      <fieldset className="q">
        <legend className="field-legend">Куда публикуем</legend>
        {channels.length ? (
          channels.map((c) => (
            <label key={c.id} className={`option${selected.includes(c.id) ? " option--on" : ""}`}>
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={() => setSelected(selected.includes(c.id) ? selected.filter((x) => x !== c.id) : [...selected, c.id])}
              />
              {c.title}
            </label>
          ))
        ) : (
          <p className="muted small">Каналы ещё не подключены — пост можно сохранить черновиком.</p>
        )}
      </fieldset>

      <fieldset className="q">
        <legend className="field-legend">Когда</legend>
        <div className="segmented">
          <button type="button" aria-pressed={mode === "now"} className={mode === "now" ? "on" : ""} onClick={() => setMode("now")}>Сейчас</button>
          <button type="button" aria-pressed={mode === "schedule"} className={mode === "schedule" ? "on" : ""} onClick={() => setMode("schedule")}>По расписанию</button>
        </div>
        {mode === "schedule" ? (
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Дата и время публикации" />
        ) : null}
      </fieldset>

      {err ? <p className="error">{err}</p> : null}
      <button type="button" className="btn btn--primary" disabled={busy || !channels.length} onClick={() => void save(mode)}>
        {mode === "now" ? "Опубликовать сейчас" : "Запланировать"}
      </button>
      <div className="row-gap">
        <button type="button" className="btn btn--soft" disabled={busy} onClick={() => void save("draft")}>Сохранить черновик</button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Отмена</button>
      </div>
    </div>
  );
}

/** Instagram: подпись в буфер + фото в «Поделиться», затем «Опубликовал» */
function ManualPublish({ p, t, act, urls }: { p: PostView; t: PostTargetView; act: (fn: () => Promise<unknown>) => Promise<void>; urls: PostsApi }) {
  const [step, setStep] = useState<"start" | "shared" | "copied">("start");
  const [err, setErr] = useState("");
  return (
    <div className="manual">
      <p className="small">
        <strong>{t.title}:</strong>{" "}
        {step === "start"
          ? "нажмите кнопку — подпись скопируется, фото и видео откроются в «Поделиться». Выберите Instagram и вставьте подпись."
          : step === "shared"
            ? "Опубликовали? Отметьте — пост перейдёт в «Опубликовано»."
            : "Подпись скопирована. Сохраните фото и видео (нажмите и удерживайте) и опубликуйте их в Instagram."}
      </p>
      {err ? <p className="error small">{err}</p> : null}
      <div className="row-gap">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() =>
            void shareToInstagram(p.text, p.photos)
              .then((r) => setStep(r === "shared" ? "shared" : "copied"))
              .catch((e: Error) => {
                if (e.name !== "AbortError") setErr(e.message);
                setStep("shared");
              })
          }
        >
          Опубликовать в Instagram
        </button>
        <button type="button" className="btn btn--soft" onClick={() => void act(() => api(`${urls.item(p.id)}/targets/${t.channelId}/done`, { method: "POST", json: {} }))}>
          Готово — опубликовал
        </button>
      </div>
    </div>
  );
}

const MEDIA = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime|webm|x-m4v|3gpp))$/;
const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,video/*,.mov,.mp4,.m4v";

/** Миниатюра вложения: фото или первый кадр видео со значком ▶ */
function Thumb({ f }: { f: FileInfo }) {
  if (!isVideoFile(f)) return <img src={f.url} alt="" />;
  return (
    <span className="thumb-video">
      <video src={`${f.url}#t=0.1`} muted playsInline preload="metadata" />
      <span className="thumb-video__play" aria-hidden>▶</span>
    </span>
  );
}
