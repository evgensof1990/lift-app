import type { CapacitorConfig } from "@capacitor/cli";

/**
 * APK открывает приложение с сервера (LIFT_URL), поэтому обновления экранов
 * доходят до пилотов без перевыпуска в RuStore.
 * Сборка: LIFT_URL=https://<домен> npx cap sync android
 */
const url = process.env.LIFT_URL?.trim().replace(/\/$/, "");

const config: CapacitorConfig = {
  appId: "ru.liftapp.pilot",
  appName: "Лифт",
  webDir: "dist",
  backgroundColor: "#0B0A10",
  server: url ? { url, cleartext: url.startsWith("http://") } : undefined,
  android: { allowMixedContent: false },
};

export default config;
