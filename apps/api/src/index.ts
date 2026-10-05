import fs from "node:fs";
import path from "node:path";
import express from "express";
import { config } from "./config.js";
import { loadSession } from "./auth.js";
import { db } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { pilotRouter } from "./routes/pilot.js";
import { teamRouter } from "./routes/team.js";
import { privacyPage } from "./privacy.js";
import { startScheduler } from "./posting.js";
import { callbackPage, vkCallback } from "./vk-id.js";

const app = express();
app.set("trust proxy", "loopback");
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(loadSession);

app.get("/health", (_req, res) => {
  db.prepare("SELECT 1").get();
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/team", teamRouter);
app.use("/api", pilotRouter);

/** Файлы из анкеты: имя случайное, листинга нет */
app.get("/files/:id", (req, res) => {
  const id = req.params.id;
  const f = db.prepare("SELECT original_name, mime FROM files WHERE id = ?").get(id) as
    | { original_name: string; mime: string }
    | undefined;
  if (!f || !/^[A-Za-z0-9_-]+(\.[a-z0-9]+)?$/.test(id)) {
    res.status(404).end();
    return;
  }
  res.setHeader("Content-Type", f.mime === "image/svg+xml" ? "text/plain" : f.mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(f.original_name)}`);
  res.sendFile(path.join(config.uploadsDir, id));
});

/** Возврат из VK ID после «Подключить через ВКонтакте» (адрес указан в приложении VK ID как доверенный) */
app.get("/vk/callback", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const r = await vkCallback(req.query);
    res.type("html").send(
      callbackPage(
        true,
        r.hasWall
          ? "Посты пилота будут публиковаться в сообщество автоматически."
          : "Вход прошёл, но ВК пока не дал право публиковать на стене (wall). Когда поддержка VK ID откроет доступ — подключите ещё раз.",
        r.pilotId,
      ),
    );
  } catch (e) {
    res.status(400).type("html").send(callbackPage(false, (e as Error).message));
  }
});

app.get("/privacy", (_req, res) => {
  res.type("html").send(privacyPage());
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Не найдено" });
});

// Приложение (React): статика + все остальные адреса → index.html
if (fs.existsSync(config.webDist)) {
  app.use(express.static(config.webDist, { index: false, maxAge: "7d", immutable: false }));
  app.get(/.*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(config.webDist, "index.html"));
  });
}

app.listen(config.port, "127.0.0.1", () => {
  console.log(`Лифт: http://127.0.0.1:${config.port}`);
  if (!config.teamPassword) console.warn("⚠ TEAM_PASSWORD не задан — вход команды закрыт");
  startScheduler();
});
