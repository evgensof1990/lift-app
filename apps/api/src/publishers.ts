/**
 * Публикация поста в соцсети. Каждый канал: проверить подключение (check) и опубликовать (publish).
 * Фото и видео берутся из загруженных файлов (data/uploads). Сетевые ошибки бросаются как Error с понятным текстом.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

/** photos — все вложения поста: фото и видео (по mime) */
export type PostPayload = { text: string; photos: { path: string; name: string; mime: string }[] };
type Media = PostPayload["photos"][number];

const isVideo = (m: Media) => m.mime.startsWith("video/");
/** Файл с диска для отправки: читается по мере отправки, а не целиком в память (видео бывают большие) */
const fileBlob = (m: Media) => fs.openAsBlob(m.path, { type: m.mime });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
  const id = groupId.trim().replace(/^(https?:\/\/)?(m\.)?vk\.(com|ru)\//i, "").replace(/^(club|public)(\d+)$/i, "$2").replace(/^-/, "");
  const res = (await vk("groups.getById", { group_id: id }, token)) as { groups?: { id: number; name: string }[] } | { id: number; name: string }[];
  const g = Array.isArray(res) ? res[0] : res.groups?.[0];
  if (!g) throw new Error("ВК: сообщество не найдено");
  return { id: String(g.id), name: g.name };
}

async function vkUploadPhoto(groupId: string, token: string, photo: Media) {
  const server = (await vk("photos.getWallUploadServer", { group_id: groupId }, token)) as { upload_url: string };
  const form = new FormData();
  form.append("photo", await fileBlob(photo), photo.name);
  const up = await readJson(await fetch(server.upload_url, { method: "POST", body: form }), "ВК загрузка фото");
  const saved = (await vk(
    "photos.saveWallPhoto",
    { group_id: groupId, server: String(up.server), photo: String(up.photo), hash: String(up.hash) },
    token,
  )) as { id: number; owner_id: number }[];
  return `photo${saved[0].owner_id}_${saved[0].id}`;
}

/** Видео — в видеозаписи сообщества, к посту прикрепляется ссылкой video-123_456 */
async function vkUploadVideo(groupId: string, token: string, video: Media, title: string) {
  let save: { upload_url: string; video_id?: number; owner_id?: number };
  try {
    save = (await vk("video.save", { group_id: groupId, name: title || "Видео", wallpost: "0" }, token)) as typeof save;
  } catch (e) {
    if (/код (15|27)\)/.test((e as Error).message)) {
      throw new Error("ВК не дал доступ к видео — нажмите «Подключить заново» в карточке ВКонтакте и разрешите доступ к видеозаписям");
    }
    throw e;
  }
  const form = new FormData();
  form.append("video_file", await fileBlob(video), video.name);
  const up = await readJson(await fetch(save.upload_url, { method: "POST", body: form }), "ВК загрузка видео");
  const owner = (up.owner_id as number | undefined) ?? save.owner_id ?? -Number(groupId);
  const id = (up.video_id as number | undefined) ?? save.video_id;
  if (!id) throw new Error("ВК не вернул номер видео");
  return `video${owner}_${id}`;
}

export const vkPublisher = {
  async check(c: VkConfig) {
    const g = await vkResolveGroup(c.groupId, c.token);
    return `Сообщество «${g.name}»`;
  },
  async publish(c: VkConfig, p: PostPayload): Promise<PublishResult> {
    const { id } = await vkResolveGroup(c.groupId, c.token);
    const attachments: string[] = [];
    const title = p.text.split("\n")[0].slice(0, 100);
    for (const m of p.photos.slice(0, 10)) attachments.push(isVideo(m) ? await vkUploadVideo(id, c.token, m, title) : await vkUploadPhoto(id, c.token, m));
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

async function maxUpload(c: MaxConfig, m: Media) {
  const type = isVideo(m) ? "video" : "image";
  const meta = (await maxFetch(c, "POST", `/uploads?type=${type}`)) as { url: string; token?: string };
  const form = new FormData();
  form.append("data", await fileBlob(m), m.name);
  const res = await fetch(meta.url, { method: "POST", body: form });
  // у видео ключ выдаётся сразу в /uploads, ответ сервера загрузки не нужен
  if (type === "video" && meta.token) {
    if (!res.ok) throw new Error(`MAX загрузка видео: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return { type, payload: { token: meta.token } };
  }
  const payload = await readJson(res, `MAX загрузка ${type === "video" ? "видео" : "фото"}`);
  return { type, payload };
}

export const maxPublisher = {
  /** Чаты и каналы, куда добавлен бот: из них выбираем канал для постов */
  async listChats(botToken: string) {
    const res = (await maxFetch({ botToken, chatId: "" }, "GET", "/chats?count=100")) as {
      chats?: { chat_id: number; type?: string; title?: string; status?: string }[];
    };
    return (res.chats || []).map((ch) => ({ id: String(ch.chat_id), title: ch.title || String(ch.chat_id), type: ch.type || "", status: ch.status || "" }));
  },
  async check(c: MaxConfig) {
    const me = (await maxFetch(c, "GET", "/me")) as { name?: string; username?: string };
    let chat: { title?: string };
    try {
      chat = (await maxFetch(c, "GET", `/chats/${encodeURIComponent(c.chatId)}`)) as { title?: string };
    } catch (e) {
      if (/chat\.not\.found|404/.test((e as Error).message)) {
        throw new Error(
          `Бот «${me.name || me.username || "?"}» работает, но канал ${c.chatId} не найден. Это должен быть ID канала (обычно с минусом), а не пользователя, и бот — администратор канала. Нажмите «Найти каналы бота».`,
        );
      }
      throw e;
    }
    return `Бот «${me.name || me.username || "?"}» → канал «${chat.title || c.chatId}»`;
  },
  async publish(c: MaxConfig, p: PostPayload): Promise<PublishResult> {
    const attachments = [];
    for (const m of p.photos.slice(0, 10)) attachments.push(await maxUpload(c, m));
    if (attachments.length) await sleep(1000); // MAX обрабатывает файлы не мгновенно
    const body: Record<string, unknown> = { text: p.text.slice(0, 4000) };
    if (attachments.length) body.attachments = attachments;
    // видео MAX обрабатывает дольше — пока «attachment.not.ready», ждём и пробуем снова (до ~2 минут)
    for (let i = 0; ; i++) {
      try {
        const res = (await maxFetch(c, "POST", `/messages?chat_id=${encodeURIComponent(c.chatId)}`, body)) as {
          message?: { url?: string };
        };
        return { url: res.message?.url || "" };
      } catch (e) {
        if (i >= 24 || !/not\.ready|not ready|process/i.test((e as Error).message)) throw e;
        await sleep(5000);
      }
    }
  },
};

export function filePath(id: string) {
  return path.join(config.uploadsDir, path.basename(id));
}

/* ——— Telegram: бот — администратор канала. Дзен забирает посты из этого канала сам (Синхробот Дзена) ——— */

export type TgConfig = { botToken: string; chatId: string };

/** Telegram в России работает с перебоями — адрес API можно заменить на свой прокси (TELEGRAM_API_BASE) */
const TG_API = (process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/$/, "");
const TG_CAPTION = 1024;
/** Бот Telegram может отправить файл до 50 МБ */
const TG_MAX_FILE = 50 * 1024 * 1024;

async function tg(c: TgConfig, method: string, body: FormData | Record<string, unknown>) {
  const isForm = body instanceof FormData;
  const res = await fetch(`${TG_API}/bot${c.botToken}/${method}`, {
    method: "POST",
    headers: isForm ? undefined : { "Content-Type": "application/json" },
    body: isForm ? body : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description || `ошибка ${res.status}`}`);
  return json.result as unknown;
}

/** @канал или числовой id */
function tgChat(chatId: string) {
  const v = chatId.trim().replace(/^https?:\/\/t\.me\//i, "");
  return /^-?\d+$/.test(v) ? v : `@${v.replace(/^@/, "")}`;
}

function tgLink(chat: { username?: string }, messageId: number) {
  return chat.username ? `https://t.me/${chat.username}/${messageId}` : "";
}

export const tgPublisher = {
  async check(c: TgConfig) {
    const me = (await tg(c, "getMe", {})) as { username: string };
    const chat = (await tg(c, "getChat", { chat_id: tgChat(c.chatId) })) as { title?: string };
    return `Бот @${me.username} → канал «${chat.title || c.chatId}»`;
  },
  async publish(c: TgConfig, p: PostPayload): Promise<PublishResult> {
    const chatId = tgChat(c.chatId);
    const chat = (await tg(c, "getChat", { chat_id: chatId })) as { username?: string };
    const photos = p.photos.slice(0, 10);
    const big = photos.find((m) => fs.statSync(m.path).size > TG_MAX_FILE);
    if (big) throw new Error(`Telegram: «${big.name}» больше 50 МБ — бот не может отправить такой файл. Сожмите видео (например, снимите в 1080p) и опубликуйте снова`);
    // подпись к фото — до 1024 знаков; длинный текст уходит отдельным сообщением после фото
    const captionFits = p.text.length <= TG_CAPTION;
    let firstId = 0;
    if (photos.length === 1) {
      const form = new FormData();
      form.append("chat_id", chatId);
      if (captionFits && p.text) form.append("caption", p.text);
      const video = isVideo(photos[0]);
      if (video) form.append("supports_streaming", "true");
      form.append(video ? "video" : "photo", await fileBlob(photos[0]), photos[0].name);
      firstId = ((await tg(c, video ? "sendVideo" : "sendPhoto", form)) as { message_id: number }).message_id;
    } else if (photos.length > 1) {
      const form = new FormData();
      form.append("chat_id", chatId);
      form.append(
        "media",
        JSON.stringify(
          photos.map((m, i) => ({
            type: isVideo(m) ? "video" : "photo",
            media: `attach://p${i}`,
            ...(isVideo(m) ? { supports_streaming: true } : {}),
            ...(i === 0 && captionFits && p.text ? { caption: p.text } : {}),
          })),
        ),
      );
      for (const [i, m] of photos.entries()) form.append(`p${i}`, await fileBlob(m), m.name);
      firstId = ((await tg(c, "sendMediaGroup", form)) as { message_id: number }[])[0].message_id;
    }
    if (p.text && (!photos.length || !captionFits)) {
      const msg = (await tg(c, "sendMessage", { chat_id: chatId, text: p.text.slice(0, 4096) })) as { message_id: number };
      firstId ||= msg.message_id;
    }
    return { url: tgLink(chat, firstId) };
  },
};
