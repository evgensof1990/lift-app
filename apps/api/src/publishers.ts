/**
 * Публикация поста в соцсети. Каждый канал: проверить подключение (check) и опубликовать (publish).
 * Фото берутся из загруженных файлов (data/uploads). Сетевые ошибки бросаются как Error с понятным текстом.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

export type PostPayload = { text: string; photos: { path: string; name: string; mime: string }[] };
export type PublishResult = { url: string };

export type VkConfig = { groupId: string; token: string };
export type MaxConfig = { botToken: string; chatId: string };

const VK_API = (process.env.VK_API_BASE || "https://api.vk.com/method").replace(/\/$/, "");
const VK_V = "5.199";

async function readJson(res: Response, label: string) {
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`${label}: неожиданный ответ (${res.status}) ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`${label}: ${res.status} ${text.slice(0, 300)}`);
  return json;
}

/* ——— ВКонтакте: ключ администратора сообщества, пост от имени сообщества ——— */

async function vk(method: string, params: Record<string, string>, token: string) {
  const body = new URLSearchParams({ ...params, access_token: token, v: VK_V });
  const json = await readJson(await fetch(`${VK_API}/${method}`, { method: "POST", body }), `ВК ${method}`);
  const err = json.error as { error_code?: number; error_msg?: string } | undefined;
  if (err) throw new Error(`ВК ${method}: ${err.error_msg || "ошибка"} (код ${err.error_code})`);
  return json.response as unknown;
}

/** ID сообщества: «123», «club123», «public123» или короткое имя «workshop4» */
export async function vkResolveGroup(groupId: string, token: string) {
  const id = groupId.trim().replace(/^https?:\/\/(m\.)?vk\.(com|ru)\//i, "").replace(/^(club|public)(\d+)$/i, "$2").replace(/^-/, "");
  const res = (await vk("groups.getById", { group_id: id }, token)) as { groups?: { id: number; name: string }[] } | { id: number; name: string }[];
  const g = Array.isArray(res) ? res[0] : res.groups?.[0];
  if (!g) throw new Error("ВК: сообщество не найдено");
  return { id: String(g.id), name: g.name };
}

async function vkUploadPhoto(groupId: string, token: string, photo: PostPayload["photos"][number]) {
  const server = (await vk("photos.getWallUploadServer", { group_id: groupId }, token)) as { upload_url: string };
  const form = new FormData();
  form.append("photo", new Blob([fs.readFileSync(photo.path)], { type: photo.mime }), photo.name);
  const up = await readJson(await fetch(server.upload_url, { method: "POST", body: form }), "ВК загрузка фото");
  const saved = (await vk(
    "photos.saveWallPhoto",
    { group_id: groupId, server: String(up.server), photo: String(up.photo), hash: String(up.hash) },
    token,
  )) as { id: number; owner_id: number }[];
  return `photo${saved[0].owner_id}_${saved[0].id}`;
}

export const vkPublisher = {
  async check(c: VkConfig) {
    const g = await vkResolveGroup(c.groupId, c.token);
    return `Сообщество «${g.name}»`;
  },
  async publish(c: VkConfig, p: PostPayload): Promise<PublishResult> {
    const { id } = await vkResolveGroup(c.groupId, c.token);
    const attachments: string[] = [];
    for (const ph of p.photos.slice(0, 10)) attachments.push(await vkUploadPhoto(id, c.token, ph));
    const res = (await vk(
      "wall.post",
      { owner_id: `-${id}`, from_group: "1", message: p.text, attachments: attachments.join(",") },
      c.token,
    )) as { post_id: number };
    return { url: `https://vk.com/wall-${id}_${res.post_id}` };
  },
};

/* ——— MAX: бот — администратор канала, пост через POST /messages?chat_id= ——— */

async function maxFetch(c: MaxConfig, method: string, apiPath: string, body?: unknown) {
  const res = await fetch(`${config.maxApiBase}${apiPath}`, {
    method,
    headers: { Authorization: c.botToken, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return readJson(res, `MAX ${apiPath.split("?")[0]}`);
}

async function maxUploadPhoto(c: MaxConfig, photo: PostPayload["photos"][number]) {
  const meta = (await maxFetch(c, "POST", "/uploads?type=image")) as { url: string };
  const form = new FormData();
  form.append("data", new Blob([fs.readFileSync(photo.path)], { type: photo.mime }), photo.name);
  const payload = await readJson(await fetch(meta.url, { method: "POST", body: form }), "MAX загрузка фото");
  return { type: "image", payload };
}

export const maxPublisher = {
  async check(c: MaxConfig) {
    const me = (await maxFetch(c, "GET", "/me")) as { name?: string; username?: string };
    const chat = (await maxFetch(c, "GET", `/chats/${encodeURIComponent(c.chatId)}`)) as { title?: string };
    return `Бот «${me.name || me.username || "?"}» → канал «${chat.title || c.chatId}»`;
  },
  async publish(c: MaxConfig, p: PostPayload): Promise<PublishResult> {
    const attachments = [];
    for (const ph of p.photos.slice(0, 10)) attachments.push(await maxUploadPhoto(c, ph));
    if (attachments.length) await new Promise((r) => setTimeout(r, 1000)); // MAX обрабатывает фото не мгновенно
    const body: Record<string, unknown> = { text: p.text.slice(0, 4000) };
    if (attachments.length) body.attachments = attachments;
    const res = (await maxFetch(c, "POST", `/messages?chat_id=${encodeURIComponent(c.chatId)}`, body)) as {
      message?: { url?: string };
    };
    return { url: res.message?.url || "" };
  },
};

export function filePath(id: string) {
  return path.join(config.uploadsDir, path.basename(id));
}
