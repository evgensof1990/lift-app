import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../..");

dotenv.config({ path: path.join(repoRoot, ".env") });

const dataDir = path.resolve(process.env.DATA_DIR?.trim() || path.join(repoRoot, "data"));

export const config = {
  port: Number(process.env.PORT || 3100),
  dataDir,
  dbPath: path.join(dataDir, "lift.db"),
  uploadsDir: path.join(dataDir, "uploads"),
  webDist: path.join(repoRoot, "apps/web/dist"),
  /** Пароль входа команды в /team */
  teamPassword: (process.env.TEAM_PASSWORD || "").trim(),
  /** Адрес приложения: из него строятся ссылки-приглашения, https://lift.example.ru */
  publicUrl: (process.env.PUBLIC_URL || "").trim().replace(/\/$/, ""),
  /** Оператор персональных данных — для страницы /privacy */
  operatorName: (process.env.OPERATOR_NAME || "").trim(),
  operatorEmail: (process.env.OPERATOR_EMAIL || "").trim(),
  /** MAX Bot API (для автопостинга в каналы MAX; нужен NODE_EXTRA_CA_CERTS с сертификатами Минцифры) */
  maxApiBase: (process.env.MAX_API_BASE || "https://platform-api2.max.ru").replace(/\/$/, ""),
  /** Выключить планировщик автопостинга (например, на тестовой копии) */
  postingDisabled: process.env.POSTING_DISABLED === "true",
};
