/**
 * Автопостинг: каналы пилота, посты, планировщик.
 * Пост → цели публикации (post_targets) по одной на канал. Раз в минуту планировщик берёт посты,
 * у которых наступило время, и публикует в каждый канал; неудачная попытка повторяется до 3 раз.
 */
import { config } from "./config.js";
import { db, type Channel, type ChannelKind, type Post, type PostTarget } from "./db.js";
import { freshVkConfig } from "./vk-id.js";
import { filePath, maxPublisher, tgPublisher, vkPublisher, type MaxConfig, type PostPayload, type TgConfig, type VkConfig } from "./publishers.js";

const MAX_ATTEMPTS = 3;
const str = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);

function parse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/* ——— каналы ——— */

export const CHANNEL_LABEL: Record<ChannelKind, string> = {
  vk: "ВКонтакте",
  max: "MAX",
  tg: "Telegram",
  dzen: "Дзен",
  instagram: "Instagram",
};
const KINDS = Object.keys(CHANNEL_LABEL) as ChannelKind[];
/** Каналы без ключей: Дзен (через Telegram) и Instagram (публикует пилот в одно касание) */
const NO_TOKEN: ChannelKind[] = ["dzen", "instagram"];

/** Без ключей: в браузер уходит только то, что можно показать */
export function channelView(c: Channel) {
  const cfg = parse<Record<string, string>>(c.config, {});
  return {
    id: c.id,
    kind: c.kind,
    title: c.title || CHANNEL_LABEL[c.kind],
    enabled: !!c.enabled,
    target: c.kind === "vk" ? cfg.groupId || "" : NO_TOKEN.includes(c.kind) ? cfg.account || "" : cfg.chatId || "",
    hasToken: NO_TOKEN.includes(c.kind) || cfg.manual === "1" || !!(c.kind === "vk" ? cfg.token : cfg.botToken),
    /** публикует пилот с телефона: Instagram всегда, Telegram — если сервер до него не достаёт */
    manual: c.kind === "instagram" || (c.kind === "tg" && cfg.manual === "1"),
    /** ВК подключён через VK ID; wall — ВК разрешил публикацию на стене */
    vkid: c.kind === "vk" && !!cfg.refreshToken,
    vkWall: c.kind === "vk" && !!cfg.refreshToken ? cfg.scope.split(/[\s,]+/).includes("wall") : undefined,
  };
}

export function listChannels(pilotId: number) {
  return db.prepare("SELECT * FROM channels WHERE pilot_id = ? ORDER BY id").all(pilotId) as Channel[];
}

function channelConfig(kind: ChannelKind, b: Record<string, unknown>, prev: Record<string, string>): Record<string, string> {
  // пустое поле ключа при правке = оставить прежний ключ
  if (kind === "vk") {
    const token = str(b.token, 500);
    // новый ключ вставлен вручную — VK ID-ключи (refresh) больше не нужны; иначе сохраняем всё прежнее
    return token ? { groupId: str(b.target, 100), token } : { ...prev, groupId: str(b.target, 100), token: prev.token || "" };
  }
  if (NO_TOKEN.includes(kind)) return { account: str(b.target, 100) };
  const cfg: Record<string, string> = { chatId: str(b.target, 100), botToken: str(b.token, 500) || prev.botToken || "" };
  // Telegram с телефона: в России сервер не всегда достаёт до Telegram — тогда публикует пилот в одно касание
  if (kind === "tg" && (b.manual === true || (b.manual === undefined && prev.manual === "1"))) cfg.manual = "1";
  return cfg;
}

export function saveChannel(pilotId: number, b: Record<string, unknown>, id?: number) {
  const prev = id ? (db.prepare("SELECT * FROM channels WHERE id = ? AND pilot_id = ?").get(id, pilotId) as Channel | undefined) : undefined;
  if (id && !prev) return { error: "Канал не найден" };
  const kind = (prev?.kind || str(b.kind)) as ChannelKind;
  if (!KINDS.includes(kind)) return { error: "Неизвестный тип канала" };
  const cfg = channelConfig(kind, b, parse(prev?.config || "{}", {}));
  const target = cfg.groupId || cfg.chatId || cfg.account || "";
  const token = NO_TOKEN.includes(kind) || cfg.manual === "1" ? "-" : cfg.token || cfg.botToken || "";
  if (!target || !token) {
    return { error: kind === "vk" ? "Нужны сообщество и ключ доступа" : NO_TOKEN.includes(kind) ? "Укажите аккаунт" : "Нужны канал и токен бота" };
  }
  const title = str(b.title, 100);
  const enabled = b.enabled === false ? 0 : 1;
  if (prev) {
    db.prepare("UPDATE channels SET title = ?, config = ?, enabled = ? WHERE id = ?").run(title, JSON.stringify(cfg), enabled, prev.id);
    return { id: prev.id };
  }
  const r = db.prepare("INSERT INTO channels (pilot_id, kind, title, config, enabled) VALUES (?, ?, ?, ?, ?)").run(pilotId, kind, title, JSON.stringify(cfg), enabled);
  return { id: Number(r.lastInsertRowid) };
}

export async function checkChannel(c: Channel) {
  const cfg = parse<Record<string, string>>(c.config, {});
  if (c.kind === "vk") {
    const fresh = await freshVkConfig(c);
    const info = await vkPublisher.check(fresh as VkConfig);
    if (fresh.refreshToken && !fresh.scope.split(/[\s,]+/).includes("wall")) {
      throw new Error(`${info} найдено, но ВК пока не дал право публиковать на стене (wall). Ждём ответ поддержки VK ID, потом нажмите «Изменить» → «Подключить через ВКонтакте» ещё раз.`);
    }
    return info;
  }
  if (c.kind === "max") return maxPublisher.check(cfg as MaxConfig);
  if (c.kind === "tg" && cfg.manual === "1") return "С телефона: у поста появится «Опубликовать в Telegram» — текст скопируется, фото и видео откроются в «Поделиться»";
  if (c.kind === "tg") return tgPublisher.check(cfg as TgConfig);
  if (c.kind === "dzen") {
    const tg = listChannels(c.pilot_id).find((x) => x.kind === "tg" && x.enabled);
    if (!tg) throw new Error("Подключите Telegram-канал: Дзен забирает посты из него через «Синхробот Дзена»");
    return `Посты придут в Дзен из Telegram «${tg.title || "Telegram"}» — если Синхробот Дзена подключён к каналу`;
  }
  return "Ключи не нужны: в назначенное время пилот публикует в одно касание из приложения";
}

/* ——— посты ——— */

type FileRow = { id: string; original_name: string; mime: string; size: number };

function photoRows(pilotId: number, ids: string[]) {
  const get = db.prepare("SELECT id, original_name, mime, size FROM files WHERE id = ? AND pilot_id = ?");
  return ids.map((id) => get.get(id, pilotId) as FileRow | undefined).filter((f): f is FileRow => !!f);
}

export function postView(p: Post) {
  const targets = db
    .prepare(
      `SELECT t.*, c.kind, c.title FROM post_targets t JOIN channels c ON c.id = t.channel_id
       WHERE t.post_id = ? ORDER BY c.id`,
    )
    .all(p.id) as (PostTarget & { kind: ChannelKind; title: string })[];
  return {
    id: p.id,
    text: p.text,
    shortText: p.short_text || "",
    photos: photoRows(p.pilot_id, parse<string[]>(p.photos, [])).map((f) => ({
      id: f.id,
      name: f.original_name,
      mime: f.mime,
      size: f.size,
      url: `/files/${f.id}`,
    })),
    publishAt: p.publish_at,
    status: p.status,
    createdBy: p.created_by,
    createdAt: p.created_at,
    targets: targets.map((t) => ({
      channelId: t.channel_id,
      kind: t.kind,
      title: t.title || CHANNEL_LABEL[t.kind],
      status: t.status,
      url: t.url,
      error: t.error,
      sentAt: t.sent_at,
    })),
  };
}

export function listPosts(pilotId: number) {
  const rows = db
    .prepare(
      `SELECT * FROM posts WHERE pilot_id = ?
       ORDER BY CASE WHEN status IN ('done', 'partial') THEN 1 ELSE 0 END, COALESCE(publish_at, created_at) DESC, id DESC
       LIMIT 200`,
    )
    .all(pilotId) as Post[];
  return rows.map(postView);
}

export type PostInput = {
  text?: unknown;
  /** подпись для Telegram и Дзена, если в посте видео */
  shortText?: unknown;
  photos?: unknown;
  channelIds?: unknown;
  publishAt?: unknown;
  /** draft — сохранить, schedule — на время publishAt, now — сразу */
  mode?: unknown;
};

/** Фото и видео поста */
const MEDIA = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime|webm|x-m4v|3gpp))$/;

export function savePost(pilotId: number, b: PostInput, createdBy: "pilot" | "team", id?: number) {
  const prev = id ? (db.prepare("SELECT * FROM posts WHERE id = ? AND pilot_id = ?").get(id, pilotId) as Post | undefined) : undefined;
  if (id && !prev) return { error: "Пост не найден" };
  if (prev && !["draft", "scheduled", "failed"].includes(prev.status)) return { error: "Опубликованный пост менять нельзя" };

  const text = String(b.text ?? "").trim().slice(0, 4000);
  const shortText = String(b.shortText ?? "").trim().slice(0, 140);
  const photoIds = Array.isArray(b.photos) ? b.photos.filter((x): x is string => typeof x === "string").slice(0, 10) : [];
  const photos = photoRows(pilotId, photoIds).filter((f) => MEDIA.test(f.mime));
  if (!text && !photos.length) return { error: "Добавьте текст, фото или видео" };

  const mode = b.mode === "now" || b.mode === "schedule" ? b.mode : "draft";
  const enabled = listChannels(pilotId).filter((c) => c.enabled);
  const own = new Set(enabled.map((c) => c.id));
  const channelIds = Array.isArray(b.channelIds) ? [...new Set(b.channelIds.map(Number))].filter((x) => own.has(x)) : [];
  // Дзен получает пост через Telegram-канал — значит, в Telegram он тоже должен уйти
  if (enabled.some((c) => c.kind === "dzen" && channelIds.includes(c.id))) {
    const tg = enabled.find((c) => c.kind === "tg");
    if (!tg) return { error: "Для Дзена нужен подключённый Telegram-канал" };
    if (!channelIds.includes(tg.id)) channelIds.push(tg.id);
  }
  if (mode !== "draft" && !channelIds.length) return { error: "Выберите, куда публиковать" };

  let publishAt: string | null = null;
  if (mode === "now") publishAt = new Date().toISOString();
  if (mode === "schedule") {
    const t = Date.parse(String(b.publishAt || ""));
    if (!Number.isFinite(t)) return { error: "Укажите дату и время публикации" };
    if (t < Date.now() - 5 * 60 * 1000) return { error: "Это время уже прошло" };
    publishAt = new Date(t).toISOString();
  }
  const status = mode === "draft" ? "draft" : "scheduled";

  let postId = prev?.id;
  db.transaction(() => {
    if (prev) {
      db.prepare("UPDATE posts SET text = ?, short_text = ?, photos = ?, publish_at = ?, status = ?, updated_at = datetime('now') WHERE id = ?").run(
        text,
        shortText,
        JSON.stringify(photos.map((f) => f.id)),
        publishAt,
        status,
        prev.id,
      );
      db.prepare("DELETE FROM post_targets WHERE post_id = ?").run(prev.id);
    } else {
      postId = Number(
        db
          .prepare("INSERT INTO posts (pilot_id, text, short_text, photos, publish_at, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(pilotId, text, shortText, JSON.stringify(photos.map((f) => f.id)), publishAt, status, createdBy).lastInsertRowid,
      );
    }
    const ins = db.prepare("INSERT INTO post_targets (post_id, channel_id) VALUES (?, ?)");
    for (const cid of channelIds) ins.run(postId, cid);
  })();
  if (mode === "now") setTimeout(() => void runDue(), 50);
  return { id: postId! };
}

export function deletePost(pilotId: number, id: number) {
  const p = db.prepare("SELECT * FROM posts WHERE id = ? AND pilot_id = ?").get(id, pilotId) as Post | undefined;
  if (!p) return { error: "Пост не найден" };
  if (p.status === "publishing") return { error: "Пост сейчас публикуется — подождите минуту" };
  // из соцсетей опубликованное не удаляется — только из списка в «Лифте»
  db.prepare("DELETE FROM posts WHERE id = ?").run(id);
  return { ok: true };
}

/** Повторить неудавшиеся каналы сейчас */
export function retryPost(pilotId: number, id: number) {
  const p = db.prepare("SELECT * FROM posts WHERE id = ? AND pilot_id = ?").get(id, pilotId) as Post | undefined;
  if (!p || !["failed", "partial"].includes(p.status)) return { error: "Повторять нечего" };
  db.prepare("UPDATE post_targets SET status = 'pending', attempts = 0, error = '' WHERE post_id = ? AND status = 'failed'").run(id);
  db.prepare("UPDATE posts SET status = 'scheduled', publish_at = ?, updated_at = datetime('now') WHERE id = ?").run(new Date().toISOString(), id);
  setTimeout(() => void runDue(), 50);
  return { ok: true };
}

/* ——— планировщик ——— */

let running = false;
/** «Опубликовать сейчас», пока планировщик занят другим постом, — пройти ещё раз сразу после */
let again = false;

export async function runDue() {
  if (running) {
    again = true;
    return;
  }
  running = true;
  again = false;
  try {
    const due = db
      .prepare("SELECT * FROM posts WHERE status = 'scheduled' AND publish_at <= ? ORDER BY publish_at LIMIT 20")
      .all(new Date().toISOString()) as Post[];
    for (const p of due) await publishPost(p);
  } finally {
    running = false;
    if (again) setTimeout(() => void runDue(), 50);
  }
}

async function publishPost(p: Post) {
  db.prepare("UPDATE posts SET status = 'publishing' WHERE id = ?").run(p.id);
  const photos = photoRows(p.pilot_id, parse<string[]>(p.photos, [])).map((f) => ({ path: filePath(f.id), name: f.original_name, mime: f.mime }));
  // в Telegram с видео — короткая подпись, если она есть: тогда Дзен сделает из поста ролик
  const tgPayload: PostPayload = { text: p.short_text && photos.some((f) => f.mime.startsWith("video/")) ? p.short_text : p.text, photos };
  const payload: PostPayload = { text: p.text, photos };
  const targets = (
    db
      .prepare("SELECT t.*, c.kind, c.config, c.enabled FROM post_targets t JOIN channels c ON c.id = t.channel_id WHERE t.post_id = ? AND t.status = 'pending'")
      .all(p.id) as (PostTarget & { kind: ChannelKind; config: string; enabled: number })[]
  ).sort((a, b) => Number(a.kind === "dzen") - Number(b.kind === "dzen")); // Дзен — после Telegram
  const setTarget = db.prepare("UPDATE post_targets SET status = ?, url = ?, error = ?, sent_at = ? WHERE post_id = ? AND channel_id = ?");
  for (const t of targets) {
    if (t.kind === "instagram" || (t.kind === "tg" && parse<Record<string, string>>(t.config, {}).manual === "1")) {
      // публикует пилот: в приложении появляется кнопка «Опубликовать в Instagram»
      setTarget.run("manual", "", "", null, p.id, t.channel_id);
      continue;
    }
    if (t.kind === "dzen") {
      const tgSent = db
        .prepare("SELECT t.status FROM post_targets t JOIN channels c ON c.id = t.channel_id WHERE t.post_id = ? AND c.kind = 'tg'")
        .get(p.id) as { status: string } | undefined;
      if (tgSent?.status === "pending") continue; // Telegram ещё повторяется — Дзен ждёт
      // Telegram публикует пилот с телефона — Дзен отметится, когда пилот нажмёт «Готово»
      if (tgSent?.status === "manual") {
        setTarget.run("manual", "", "", null, p.id, t.channel_id);
        continue;
      }
      if (tgSent?.status === "sent") setTarget.run("sent", "", "", new Date().toISOString().slice(0, 19).replace("T", " "), p.id, t.channel_id);
      else setTarget.run("failed", "", "Не ушло в Telegram — Дзен берёт посты оттуда", null, p.id, t.channel_id);
      continue;
    }
    try {
      if (!t.enabled) throw new Error("Канал выключен");
      const cfg = parse<Record<string, string>>(t.config, {});
      const r =
        t.kind === "vk"
          ? await vkPublisher.publish((await freshVkConfig({ id: t.channel_id, config: t.config })) as VkConfig, payload)
          : t.kind === "tg"
            ? await tgPublisher.publish(cfg as TgConfig, tgPayload)
            : await maxPublisher.publish(cfg as MaxConfig, payload);
      db.prepare("UPDATE post_targets SET status = 'sent', url = ?, error = '', attempts = attempts + 1, sent_at = datetime('now') WHERE post_id = ? AND channel_id = ?").run(
        r.url,
        p.id,
        t.channel_id,
      );
    } catch (e) {
      const attempts = t.attempts + 1;
      db.prepare("UPDATE post_targets SET status = ?, error = ?, attempts = ? WHERE post_id = ? AND channel_id = ?").run(
        attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        String((e as Error).message).slice(0, 500),
        attempts,
        p.id,
        t.channel_id,
      );
      console.warn(`[posting] пост ${p.id}, канал ${t.channel_id}: ${(e as Error).message}`);
    }
  }
  updateStatus(p.id);
}

/** Итог поста по его каналам */
function updateStatus(postId: number) {
  const all = db.prepare("SELECT status FROM post_targets WHERE post_id = ?").all(postId) as { status: string }[];
  const n = (s: string) => all.filter((x) => x.status === s).length;
  const status = n("pending")
    ? "scheduled"
    : n("manual")
      ? "waiting"
      : n("sent") === all.length
        ? "done"
        : n("sent")
          ? "partial"
          : "failed";
  db.prepare("UPDATE posts SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, postId);
}

/** Пилот опубликовал вручную (Instagram) — по желанию со ссылкой на пост */
export function markManual(pilotId: number, postId: number, channelId: number, url: unknown) {
  const link = str(url, 500);
  const r = db
    .prepare(
      `UPDATE post_targets SET status = 'sent', url = ?, error = '', sent_at = datetime('now')
       WHERE post_id = ? AND channel_id = ? AND status = 'manual'
         AND post_id IN (SELECT id FROM posts WHERE pilot_id = ?)`,
    )
    .run(/^https?:\/\//i.test(link) ? link : "", postId, channelId, pilotId);
  if (!r.changes) return { error: "Нечего отмечать" };
  // опубликовали в Telegram — Дзен заберёт пост оттуда сам
  db.prepare(
    `UPDATE post_targets SET status = 'sent', sent_at = datetime('now')
     WHERE post_id = ? AND status = 'manual' AND channel_id IN (SELECT id FROM channels WHERE kind = 'dzen')
       AND EXISTS (SELECT 1 FROM post_targets t JOIN channels c ON c.id = t.channel_id WHERE t.post_id = ? AND t.channel_id = ? AND c.kind = 'tg')`,
  ).run(postId, postId, channelId);
  updateStatus(postId);
  return { ok: true };
}

/** Сколько постов ждут ручной публикации пилота */
export function waitingCount(pilotId: number) {
  return (db.prepare("SELECT COUNT(*) AS n FROM posts WHERE pilot_id = ? AND status = 'waiting'").get(pilotId) as { n: number }).n;
}

export function startScheduler() {
  if (config.postingDisabled) {
    console.log("Автопостинг выключен (POSTING_DISABLED=true)");
    return;
  }
  // пост, на котором сервер перезапустился посреди публикации, — повторить
  db.prepare("UPDATE posts SET status = 'scheduled' WHERE status = 'publishing'").run();
  setInterval(() => void runDue(), 60 * 1000).unref();
  setTimeout(() => void runDue(), 5000).unref();
}

/** Каналы MAX, куда добавлен бот (по токену из формы или по сохранённому каналу) */
export async function maxBotChats(pilotId: number, token: string, channelId?: number) {
  let botToken = token.trim();
  if (!botToken && channelId) {
    const c = db.prepare("SELECT * FROM channels WHERE id = ? AND pilot_id = ? AND kind = 'max'").get(channelId, pilotId) as Channel | undefined;
    botToken = parse<Record<string, string>>(c?.config || "{}", {}).botToken || "";
  }
  if (!botToken) throw new Error("Сначала вставьте токен бота");
  return maxPublisher.listChats(botToken);
}
