/**
 * Подключение ВКонтакте через VK ID (OAuth 2.1 + PKCE): команда жмёт «Подключить через ВКонтакте»,
 * администратор сообщества входит в ВК и разрешает доступ, ВК возвращает на /vk/callback.
 * Ключ VK ID живёт ~1 час — перед публикацией сервер сам обновляет его по refresh-ключу
 * (refresh-ключ одноразовый: новый сразу сохраняется в канал).
 */
import crypto from "node:crypto";
import { config } from "./config.js";
import { db, type Channel } from "./db.js";
import { vkResolveGroup } from "./publishers.js";

const VK_ID = (process.env.VK_ID_BASE || "https://id.vk.com").replace(/\/$/, "");
const SCOPE = "wall photos groups";
const STATE_TTL = 15 * 60 * 1000;

type Pending = { by: "team" | "pilot"; pilotId: number; channelId?: number; title: string; groupId: string; verifier: string; until: number };
const pending = new Map<string, Pending>();

const b64url = (buf: Buffer) => buf.toString("base64url");

export function redirectUri() {
  return `${config.publicUrl}/vk/callback`;
}

export function vkAuthUrl(pilotId: number, b: { channelId?: number; title?: string; target?: string }, by: "team" | "pilot" = "team") {
  if (!config.vkClientId) throw new Error("Не задан VK_CLIENT_ID (ID приложения VK ID) в .env сервера");
  if (!config.publicUrl) throw new Error("Не задан PUBLIC_URL в .env сервера");
  const groupId = String(b.target || "").trim().slice(0, 100);
  if (!groupId) throw new Error("Сначала укажите сообщество ВК");
  const now = Date.now();
  for (const [k, v] of pending) if (v.until < now) pending.delete(k);
  const state = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(48));
  pending.set(state, { by, pilotId, channelId: b.channelId, title: String(b.title || "").trim().slice(0, 100), groupId, verifier, until: now + STATE_TTL });
  const q = new URLSearchParams({
    response_type: "code",
    client_id: config.vkClientId,
    redirect_uri: redirectUri(),
    state,
    code_challenge: b64url(crypto.createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
    scope: SCOPE,
    // всегда показывать окно разрешений: иначе ВК повторит прежнее согласие без wall/photos
    prompt: "consent",
  });
  return `${VK_ID}/authorize?${q}`;
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; user_id?: number; error?: string; error_description?: string };

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(`${VK_ID}/oauth2/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.vkClientId, ...params }),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (json.error || !json.access_token) {
    throw new Error(`VK ID: ${json.error_description || json.error || `ошибка ${res.status}`}`);
  }
  return json;
}

function tokenConfig(t: TokenResponse, deviceId: string) {
  return {
    token: t.access_token!,
    refreshToken: t.refresh_token || "",
    deviceId,
    expiresAt: String(Date.now() + (t.expires_in || 3600) * 1000),
    scope: t.scope || "",
    vkUserId: String(t.user_id || ""),
  };
}

/** Ответ ВК на /vk/callback: обмен кода на ключи, сохранение канала. Возвращает пилота — куда вернуть команду. */
export async function vkCallback(q: Record<string, unknown>) {
  const state = String(q.state || "");
  const p = pending.get(state);
  pending.delete(state);
  if (!p || p.until < Date.now()) throw new Error("Ссылка устарела — нажмите «Подключить через ВКонтакте» ещё раз");
  if (q.error) throw new Error(`ВК: ${String(q.error_description || q.error)}`);
  const code = String(q.code || "");
  const deviceId = String(q.device_id || "");
  if (!code || !deviceId) throw new Error("ВК не вернул код подтверждения");
  const t = await tokenRequest({ grant_type: "authorization_code", code, code_verifier: p.verifier, device_id: deviceId, redirect_uri: redirectUri(), state });
  const cfg = { groupId: p.groupId, ...tokenConfig(t, deviceId) };
  const group = await vkResolveGroup(p.groupId, cfg.token).catch(() => null);
  const title = p.title || group?.name || "ВКонтакте";
  const prev = p.channelId
    ? (db.prepare("SELECT id FROM channels WHERE id = ? AND pilot_id = ? AND kind = 'vk'").get(p.channelId, p.pilotId) as { id: number } | undefined)
    : undefined;
  if (prev) db.prepare("UPDATE channels SET title = ?, config = ?, enabled = 1 WHERE id = ?").run(title, JSON.stringify(cfg), prev.id);
  else db.prepare("INSERT INTO channels (pilot_id, kind, title, config) VALUES (?, 'vk', ?, ?)").run(p.pilotId, title, JSON.stringify(cfg));
  return { by: p.by, pilotId: p.pilotId, hasWall: cfg.scope.split(/[\s,]+/).includes("wall") };
}

const refreshing = new Map<number, Promise<Record<string, string>>>();

/** Конфиг ВК-канала с живым ключом: ключ VK ID обновляется, если до конца жизни меньше 5 минут */
export async function freshVkConfig(c: Pick<Channel, "id" | "config">): Promise<Record<string, string>> {
  const cfg = JSON.parse(c.config || "{}") as Record<string, string>;
  if (!cfg.refreshToken || Number(cfg.expiresAt || 0) - Date.now() > 5 * 60 * 1000) return cfg;
  const running = refreshing.get(c.id);
  if (running) return running;
  const job = (async () => {
    // берём свежую строку: refresh-ключ одноразовый, другой запрос мог его уже обновить
    const row = db.prepare("SELECT config FROM channels WHERE id = ?").get(c.id) as { config: string } | undefined;
    const cur = JSON.parse(row?.config || c.config) as Record<string, string>;
    if (Number(cur.expiresAt || 0) - Date.now() > 5 * 60 * 1000) return cur;
    let t: TokenResponse;
    try {
      t = await tokenRequest({
        grant_type: "refresh_token",
        refresh_token: cur.refreshToken,
        device_id: cur.deviceId,
        state: b64url(crypto.randomBytes(16)),
      });
    } catch (e) {
      throw new Error(`${(e as Error).message}. Переподключите ВКонтакте в панели команды («Изменить» → «Подключить через ВКонтакте»)`);
    }
    const next = { ...cur, ...tokenConfig(t, cur.deviceId), scope: t.scope || cur.scope || "" };
    if (!t.refresh_token) next.refreshToken = cur.refreshToken;
    db.prepare("UPDATE channels SET config = ? WHERE id = ?").run(JSON.stringify(next), c.id);
    return next;
  })();
  refreshing.set(c.id, job);
  try {
    return await job;
  } finally {
    refreshing.delete(c.id);
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

/** Страница после входа в ВК: ссылка обратно в панель (в APK вход мог открыться в браузере телефона) */
export function callbackPage(ok: boolean, text: string, back = "/") {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Лифт — ВКонтакте</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0912;color:#eee;font:16px/1.5 system-ui,sans-serif}
main{max-width:420px;padding:24px;text-align:center}h1{font-size:22px}a{display:inline-block;margin-top:16px;padding:12px 20px;border-radius:12px;background:#7c4dff;color:#fff;text-decoration:none}</style></head>
<body><main><h1>${ok ? "ВКонтакте подключён" : "Не получилось"}</h1><p>${esc(text)}</p><a href="${back}">Вернуться в «Лифт»</a><p style="opacity:.6;font-size:14px">Если вход открылся в браузере телефона — просто закройте вкладку и вернитесь в приложение «Лифт».</p></main></body></html>`;
}
