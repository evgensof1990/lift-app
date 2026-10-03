/**
 * Автопостинг: каналы пилота, посты, планировщик.
 * Пост → цели публикации (post_targets) по одной на канал. Раз в минуту планировщик берёт посты,
 * у которых наступило время, и публикует в каждый канал; неудачная попытка повторяется до 3 раз.
 */
import { config } from "./config.js";
import { db, type Channel, type ChannelKind, type Post, type PostTarget } from "./db.js";
import { filePath, maxPublisher, vkPublisher, type MaxConfig, type PostPayload, type VkConfig } from "./publishers.js";

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

export const CHANNEL_LABEL: Record<ChannelKind, string> = { vk: "ВКонтакте", max: "MAX" };

/** Без ключей: в браузер уходит только то, что можно показать */
export function channelView(c: Channel) {
  const cfg = parse<Record<string, string>>(c.config, {});
  return {
    id: c.id,
    kind: c.kind,
    title: c.title || CHANNEL_LABEL[c.kind],
    enabled: !!c.enabled,
    target: c.kind === "vk" ? cfg.groupId || "" : cfg.chatId || "",
    hasToken: !!(c.kind === "vk" ? cfg.token : cfg.botToken),
  };
}

export function listChannels(pilotId: number) {
  return db.prepare("SELECT * FROM channels WHERE pilot_id = ? ORDER BY id").all(pilotId) as Channel[];
}

function channelConfig(kind: ChannelKind, b: Record<string, unknown>, prev: Record<string, string>) {
  // пустое поле ключа при правке = оставить прежний ключ
  if (kind === "vk") return { groupId: str(b.target, 100), token: str(b.token, 500) || prev.token || "" };
  return { chatId: str(b.target, 100), botToken: str(b.token, 500) || prev.botToken || "" };
}

export function saveChannel(pilotId: number, b: Record<string, unknown>, id?: number) {
  const prev = id ? (db.prepare("SELECT * FROM channels WHERE id = ? AND pilot_id = ?").get(id, pilotId) as Channel | undefined) : undefined;
  if (id && !prev) return { error: "Канал не найден" };
  const kind = (prev?.kind || str(b.kind)) as ChannelKind;
  if (kind !== "vk" && kind !== "max") return { error: "Неизвестный тип канала" };
  const cfg = channelConfig(kind, b, parse(prev?.config || "{}", {}));
  const target = kind === "vk" ? (cfg as VkConfig).groupId : (cfg as MaxConfig).chatId;
  const token = kind === "vk" ? (cfg as VkConfig).token : (cfg as MaxConfig).botToken;
  if (!target || !token) return { error: kind === "vk" ? "Нужны сообщество и ключ доступа" : "Нужны ID канала и токен бота" };
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
  return c.kind === "vk" ? vkPublisher.check(cfg as VkConfig) : maxPublisher.check(cfg as MaxConfig);
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
  photos?: unknown;
  channelIds?: unknown;
  publishAt?: unknown;
  /** draft — сохранить, schedule — на время publishAt, now — сразу */
  mode?: unknown;
};

const IMAGE = /^image\/(jpeg|png|webp|gif)$/;

export function savePost(pilotId: number, b: PostInput, createdBy: "pilot" | "team", id?: number) {
  const prev = id ? (db.prepare("SELECT * FROM posts WHERE id = ? AND pilot_id = ?").get(id, pilotId) as Post | undefined) : undefined;
  if (id && !prev) return { error: "Пост не найден" };
  if (prev && !["draft", "scheduled", "failed"].includes(prev.status)) return { error: "Опубликованный пост менять нельзя" };

  const text = String(b.text ?? "").trim().slice(0, 4000);
  const photoIds = Array.isArray(b.photos) ? b.photos.filter((x): x is string => typeof x === "string").slice(0, 10) : [];
  const photos = photoRows(pilotId, photoIds).filter((f) => IMAGE.test(f.mime));
  if (!text && !photos.length) return { error: "Добавьте текст или фото" };

  const mode = b.mode === "now" || b.mode === "schedule" ? b.mode : "draft";
  const own = new Set(listChannels(pilotId).filter((c) => c.enabled).map((c) => c.id));
  const channelIds = Array.isArray(b.channelIds) ? [...new Set(b.channelIds.map(Number))].filter((x) => own.has(x)) : [];
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
      db.prepare("UPDATE posts SET text = ?, photos = ?, publish_at = ?, status = ?, updated_at = datetime('now') WHERE id = ?").run(
        text,
        JSON.stringify(photos.map((f) => f.id)),
        publishAt,
        status,
        prev.id,
      );
      db.prepare("DELETE FROM post_targets WHERE post_id = ?").run(prev.id);
    } else {
      postId = Number(
        db
          .prepare("INSERT INTO posts (pilot_id, text, photos, publish_at, status, created_by) VALUES (?, ?, ?, ?, ?, ?)")
          .run(pilotId, text, JSON.stringify(photos.map((f) => f.id)), publishAt, status, createdBy).lastInsertRowid,
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

export async function runDue() {
  if (running) return;
  running = true;
  try {
    const due = db
      .prepare("SELECT * FROM posts WHERE status = 'scheduled' AND publish_at <= ? ORDER BY publish_at LIMIT 20")
      .all(new Date().toISOString()) as Post[];
    for (const p of due) await publishPost(p);
  } finally {
    running = false;
  }
}

async function publishPost(p: Post) {
  db.prepare("UPDATE posts SET status = 'publishing' WHERE id = ?").run(p.id);
  const photos = photoRows(p.pilot_id, parse<string[]>(p.photos, [])).map((f) => ({ path: filePath(f.id), name: f.original_name, mime: f.mime }));
  const payload: PostPayload = { text: p.text, photos };
  const targets = db
    .prepare("SELECT t.*, c.kind, c.config, c.enabled FROM post_targets t JOIN channels c ON c.id = t.channel_id WHERE t.post_id = ? AND t.status = 'pending'")
    .all(p.id) as (PostTarget & { kind: ChannelKind; config: string; enabled: number })[];
  for (const t of targets) {
    try {
      if (!t.enabled) throw new Error("Канал выключен");
      const cfg = parse<Record<string, string>>(t.config, {});
      const r = t.kind === "vk" ? await vkPublisher.publish(cfg as VkConfig, payload) : await maxPublisher.publish(cfg as MaxConfig, payload);
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
  const all = db.prepare("SELECT status FROM post_targets WHERE post_id = ?").all(p.id) as { status: string }[];
  const sent = all.filter((x) => x.status === "sent").length;
  const pending = all.filter((x) => x.status === "pending").length;
  const status = pending ? "scheduled" : sent === all.length ? "done" : sent ? "partial" : "failed";
  db.prepare("UPDATE posts SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, p.id);
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
