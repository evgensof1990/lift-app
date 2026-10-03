import { config } from "./config.js";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Политика обработки ПДн пилотов. Шаблон — перед запуском показать юристу. */
export function privacyPage() {
  const op = esc(config.operatorName || "[оператор: ФИО / ИП / ООО — заполнить OPERATOR_NAME в .env]");
  const email = esc(config.operatorEmail || "[email — OPERATOR_EMAIL в .env]");
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Политика обработки персональных данных — Лифт</title>
<style>body{margin:0;background:#0B0A10;color:#F4F2FA;font:16px/1.6 Manrope,system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 16px 64px}h1{font-size:26px;line-height:1.25}h2{font-size:18px;margin-top:28px}
a{color:#C4B5FD}p,li{color:#DCD8E8}</style></head><body><main>
<h1>Политика обработки персональных данных приложения «Лифт»</h1>
<p>Оператор: ${op}. Связь по вопросам персональных данных: ${email}.</p>
<h2>Какие данные мы обрабатываем</h2>
<ul><li>имя, телефон, название и сведения о бизнесе;</li>
<li>ответы на анкету и загруженные файлы (фото, логотипы, прайсы, отзывы);</li>
<li>данные для документов сайта: ФИО или наименование, ИНН, ОГРН/ОГРНИП, адрес, email;</li>
<li>отметки о выполнении задач и технические данные входа.</li></ul>
<h2>Зачем</h2>
<p>Чтобы вести стратегию развития вашего бизнеса, ставить и отслеживать задачи, создавать и сопровождать ваш сайт, ботов и другие инструменты.</p>
<h2>Как храним</h2>
<p>Данные хранятся на сервере в России, доступ есть только у команды проекта. Мы не передаём данные третьим лицам, кроме случаев, предусмотренных законом.</p>
<h2>Ваши права</h2>
<p>Вы можете запросить сведения о своих данных, их исправление или удаление и отозвать согласие, написав на ${email}. После отзыва согласия данные удаляются в течение 30 дней.</p>
<p><a href="/">Вернуться в приложение</a></p>
</main></body></html>`;
}
