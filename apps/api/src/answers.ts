import path from "node:path";
import multer from "multer";
import { config } from "./config.js";
import { randomToken } from "./auth.js";
import { db } from "./db.js";
import { QUESTION_BY_ID, normalizeAnswer } from "./survey.js";

const ALLOWED = /^(image\/(jpeg|png|webp|gif|heic|heif|svg\+xml)|video\/(mp4|quicktime|webm|x-m4v|3gpp)|application\/pdf|application\/vnd\.(ms-excel|openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document))|application\/msword|text\/csv)$/;

/** Телефоны иногда не говорят тип видео (application/octet-stream) — узнаём по расширению */
const VIDEO_EXT: Record<string, string> = { ".mov": "video/quicktime", ".mp4": "video/mp4", ".m4v": "video/x-m4v", ".webm": "video/webm", ".3gp": "video/3gpp" };

/** Файлы анкеты и постов: случайное имя на диске = адрес /files/<id> (угадать нельзя). Видео — до 300 МБ */
export const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadsDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 8);
      cb(null, `${randomToken(18)}${ext}`);
    },
  }),
  limits: { fileSize: 300 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    const byExt = VIDEO_EXT[path.extname(file.originalname).toLowerCase()];
    if (byExt && !file.mimetype.startsWith("video/")) file.mimetype = byExt;
    cb(null, ALLOWED.test(file.mimetype));
  },
});

export type FileInfo = { id: string; name: string; mime: string; size: number; url: string };

/** multer отдаёт имя файла в latin1 — возвращаем кириллицу */
function originalName(name: string) {
  return Buffer.from(name, "latin1").toString("utf8").slice(0, 200);
}

export function registerUploads(pilotId: number, files: Express.Multer.File[]): FileInfo[] {
  const ins = db.prepare("INSERT INTO files (id, pilot_id, original_name, mime, size) VALUES (?, ?, ?, ?, ?)");
  return files.map((f) => {
    const name = originalName(f.originalname);
    ins.run(f.filename, pilotId, name, f.mimetype, f.size);
    return { id: f.filename, name, mime: f.mimetype, size: f.size, url: `/files/${f.filename}` };
  });
}

/** Сведения о файлах, упомянутых в ответах (только файлы этого пилота) */
export function filesInfo(pilotId: number, answers: Record<string, unknown>): Record<string, FileInfo> {
  const ids = Object.entries(answers)
    .filter(([qid]) => QUESTION_BY_ID.get(qid)?.type === "files")
    .flatMap(([, v]) => (Array.isArray(v) ? v : []))
    .filter((v): v is string => typeof v === "string");
  const out: Record<string, FileInfo> = {};
  const get = db.prepare("SELECT * FROM files WHERE id = ? AND pilot_id = ?");
  for (const id of ids) {
    const f = get.get(id, pilotId) as { id: string; original_name: string; mime: string; size: number } | undefined;
    if (f) out[id] = { id: f.id, name: f.original_name, mime: f.mime, size: f.size, url: `/files/${f.id}` };
  }
  return out;
}

export function saveAnswers(pilotId: number, raw: unknown): { ok: true; saved: number } | { error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "Нет ответов" };
  const owned = db.prepare("SELECT 1 FROM files WHERE id = ? AND pilot_id = ?");
  const upsert = db.prepare(
    `INSERT INTO survey_answers (pilot_id, question_id, value, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT (pilot_id, question_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  let saved = 0;
  const run = db.transaction(() => {
    for (const [qid, value] of Object.entries(raw as Record<string, unknown>)) {
      const q = QUESTION_BY_ID.get(qid);
      if (!q) continue;
      let v = normalizeAnswer(q, value);
      if (v === null) continue;
      if (q.type === "files" && Array.isArray(v)) v = v.filter((id) => owned.get(id, pilotId));
      upsert.run(pilotId, qid, JSON.stringify(v));
      saved++;
    }
  });
  run();
  return { ok: true, saved };
}
