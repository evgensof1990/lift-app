/**
 * Анкета для сайта — те же 46 вопросов, что были в Google Форме.
 * Порядок и id вопросов не менять: по id хранятся ответы пилотов (survey_answers.question_id).
 * Новые вопросы — с новыми id.
 */
export type QuestionType = "text" | "textarea" | "radio" | "checkbox" | "files";

export type Question = {
  id: string;
  type: QuestionType;
  title: string;
  hint?: string;
  required?: boolean;
  /** обязательный вопрос засчитан, если ответили на него ИЛИ на вопрос or (фото — или ссылка на папку) */
  or?: string;
  options?: string[];
};

export type Section = { id: string; title: string; questions: Question[] };

export const SURVEY_TITLE = "Анкета для сайта";
export const SURVEY_INTRO =
  "Ответы помогут собрать ваш сайт без лишних созвонов. Пишите своими словами, мы всё отредактируем. Если на вопрос нет ответа — пропустите его.";
/** Баллы за полностью заполненные обязательные вопросы */
export const SURVEY_POINTS = 200;

export const SURVEY: Section[] = [
  {
    id: "about",
    title: "О вас и бизнесе",
    questions: [
      { id: "q1", type: "text", required: true, title: "Как называется ваш бизнес или бренд?", hint: "Если названия нет, напишите «нет» — мы предложим варианты." },
      { id: "q2", type: "text", required: true, title: "Как вас зовут? Как к вам обращаются клиенты?", hint: "Например: «Анна» или «мастер Анна»." },
      { id: "q3", type: "radio", required: true, title: "Что вы продаёте?", options: ["Товары — изделия, которые можно заказать и получить", "Услуги — запись, выезд, работа на объекте", "И то и другое"] },
      { id: "q4", type: "textarea", required: true, title: "Опишите, чем вы занимаетесь, в одном-двух предложениях", hint: "Как вы объяснили бы это новому знакомому." },
      { id: "q5", type: "textarea", required: true, title: "В каком городе и районах вы работаете? Отправляете ли по России?" },
      { id: "q6", type: "textarea", title: "Сколько лет вы этим занимаетесь и сколько примерно клиентов или работ у вас было?", hint: "Цифры можно примерно." },
      { id: "q7", type: "textarea", required: true, title: "Расскажите свою историю: как пришли в это дело, что вам в нём нравится, чем гордитесь", hint: "Пишите как удобно, хоть голосом через диктовку на клавиатуре. Отредактируем мы." },
      { id: "q8", type: "textarea", required: true, title: "Почему клиенты выбирают именно вас? Назовите 3–5 причин", hint: "Например: натуральные материалы, выезд в день обращения, гарантия год." },
    ],
  },
  {
    id: "clients",
    title: "Ваши клиенты",
    questions: [
      { id: "q9", type: "textarea", required: true, title: "Кто ваш типичный клиент? Опишите 1–2 примера", hint: "Возраст, чем занимается, зачем приходит к вам." },
      { id: "q10", type: "textarea", required: true, title: "Какие вопросы клиенты задают чаще всего до покупки или записи?", hint: "Перечислите 5–10 вопросов. Ответы можно коротко." },
      { id: "q11", type: "textarea", required: true, title: "Почему клиенты будут хотеть вернуться к вам? Почему захотят рассказывать о вас знакомым?" },
      { id: "q12", type: "textarea", title: "Есть ли отзывы клиентов? Вставьте текст", hint: "Укажите имя клиента, если он не против." },
      { id: "q13", type: "files", title: "Скриншоты отзывов" },
      { id: "q14", type: "textarea", required: true, title: "Каналы продаж: как вы находите клиентов сейчас и как пробовали раньше?", hint: "Какие способы не оправдались, какие оказались самыми успешными. Пишите в свободной форме всё, что считаете важным." },
      { id: "q15", type: "textarea", required: true, title: "Ваше идеальное видение бизнеса", hint: "Каким он должен быть, сколько чистого дохода в год приносить, до какого масштаба вырасти и к какой дате." },
    ],
  },
  {
    id: "catalog",
    title: "Каталог: товары или услуги",
    questions: [
      { id: "q16", type: "textarea", required: true, title: "На какие группы делятся ваши товары или услуги?", hint: "От 2 до 6 групп. Например: «Разделочные доски», «Подносы», «Подарочные наборы»." },
      { id: "q17", type: "textarea", required: true, title: "Перечислите товары или услуги с ценами", hint: "Каждый с новой строки: название — цена от — срок — пара слов описания. Пример: «Доска из дуба 40×25 — от 2 500 ₽ — 5 дней — масло, гравировка по желанию». Можно прикрепить готовый прайс ниже." },
      { id: "q18", type: "files", title: "Прайс-лист, если он есть в файле", hint: "Excel, PDF, фото прайса." },
      { id: "q19", type: "textarea", title: "Есть ли у товаров варианты на выбор? Какие?", hint: "Размер, цвет, материал, гравировка, длительность услуги." },
      { id: "q20", type: "files", required: true, or: "q21", title: "Фото товаров или выполненных работ", hint: "Прикрепите фото здесь или дайте ссылку на папку в следующем вопросе — достаточно одного. Лучше вертикальные (3:4), при дневном свете, без чужих логотипов." },
      { id: "q21", type: "text", title: "Ссылка на папку с фото", hint: "Яндекс Диск, Google Drive, облако. Обязательно, если не прикрепили фото выше." },
    ],
  },
  {
    id: "sales",
    title: "Как вы продаёте",
    questions: [
      { id: "q22", type: "checkbox", required: true, title: "Как клиент получает товар или услугу?", options: ["Самовывоз", "Курьер по городу", "СДЭК", "Почта России", "Другие службы доставки", "Выезд к клиенту", "Клиент приходит ко мне", "Онлайн"] },
      { id: "q23", type: "checkbox", required: true, title: "Как клиенты сейчас платят?", options: ["Наличные", "Перевод на карту", "СБП", "Оплата картой онлайн", "Счёт для юрлиц", "Предоплата", "Оплата после получения"] },
      { id: "q24", type: "radio", required: true, title: "Ваш статус", options: ["Самозанятый", "ИП", "ООО", "Пока не оформлен"] },
      { id: "q25", type: "textarea", title: "Что клиенту важно написать в заявке, чтобы вы сразу поняли задачу?", hint: "Например: размер, адрес объекта, дата, фото помещения." },
    ],
  },
  {
    id: "look",
    title: "Внешний вид",
    questions: [
      { id: "q26", type: "radio", required: true, title: "Есть ли у вас логотип?", options: ["Есть, прикреплю файл", "Нет, сделайте", "Есть идея, опишу"] },
      { id: "q27", type: "files", title: "Файл логотипа", hint: "Лучше PNG с прозрачным фоном или SVG." },
      { id: "q28", type: "textarea", title: "Ваша идея логотипа" },
      { id: "q29", type: "text", title: "Какие цвета вам нравятся или уже используются в бренде?", hint: "Можно словами: «тёмно-зелёный и бежевый»." },
      { id: "q30", type: "checkbox", required: true, title: "Каким должен ощущаться сайт? Выберите до трёх", options: ["Тёплый и уютный", "Строгий", "Премиальный", "Яркий", "Минимализм", "Натуральный, эко", "Женственный", "Технологичный"] },
      { id: "q31", type: "textarea", title: "Ссылки на 1–3 сайта или аккаунта, которые вам нравятся внешне" },
      { id: "q32", type: "files", title: "Ваше фото, фото команды, мастерской или процесса работы", hint: "Нужно для главного экрана и «О нас». Горизонтальное фото для обложки особенно пригодится." },
    ],
  },
  {
    id: "contacts",
    title: "Контакты и заявки",
    questions: [
      { id: "q33", type: "text", required: true, title: "Телефон для клиентов" },
      { id: "q34", type: "textarea", required: true, title: "Ссылки на ваши соцсети и мессенджеры", hint: "Каждая с новой строки: VK, Telegram, WhatsApp, MAX, YouTube, Дзен и другие." },
      { id: "q35", type: "checkbox", required: true, title: "Куда вам удобнее получать заявки?", options: ["MAX", "Telegram", "WhatsApp", "Email", "Звонок"] },
      { id: "q36", type: "text", title: "Часы работы или время, когда вы отвечаете клиентам" },
      { id: "q37", type: "radio", required: true, title: "Есть ли у вас домен для сайта?", options: ["Есть (впишите ниже)", "Нет, помогите выбрать и зарегистрировать"] },
      { id: "q38", type: "text", title: "Домен или 2–3 желаемых названия для адреса сайта" },
    ],
  },
  {
    id: "legal",
    title: "Данные для политики конфиденциальности",
    questions: [
      { id: "q39", type: "text", required: true, title: "ФИО полностью, «ИП Иванова Анна Сергеевна» или название организации" },
      { id: "q40", type: "text", required: true, title: "ИНН" },
      { id: "q41", type: "text", title: "ОГРНИП или ОГРН, если есть" },
      { id: "q42", type: "text", title: "Адрес для документов (город, улица, дом)" },
      { id: "q43", type: "text", title: "Email для обращений клиентов" },
    ],
  },
  {
    id: "content",
    title: "Контент и соцсети",
    questions: [
      { id: "q44", type: "textarea", title: "Где вы уже публикуете контент и как часто?", hint: "Например: «VK — раз в неделю, Telegram — редко»." },
      { id: "q45", type: "textarea", title: "О чём вы могли бы рассказывать клиентам? 3–5 тем", hint: "Например: как выбрать дерево, как ухаживать за изделием, как проходит работа." },
      { id: "q46", type: "checkbox", required: true, title: "Согласие на использование материалов", options: ["Разрешаю использовать мои тексты, фото и данные из анкеты для создания и продвижения моего сайта"] },
    ],
  },
];

export const ALL_QUESTIONS = SURVEY.flatMap((s) => s.questions);
export const QUESTION_BY_ID = new Map(ALL_QUESTIONS.map((q) => [q.id, q]));

/** Ответ считается данным, если в нём есть непустой текст / выбор / файл */
export function isAnswered(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" && value.trim().length > 0;
}

/** Проверка и нормализация ответа под тип вопроса; null — ответ некорректен */
export function normalizeAnswer(q: Question, value: unknown): string | string[] | null {
  if (q.type === "text" || q.type === "textarea") {
    if (typeof value !== "string") return null;
    return value.slice(0, q.type === "text" ? 500 : 10000);
  }
  if (q.type === "radio") {
    if (value === "") return "";
    return typeof value === "string" && q.options?.includes(value) ? value : null;
  }
  if (q.type === "checkbox") {
    if (!Array.isArray(value)) return null;
    return value.filter((v): v is string => typeof v === "string" && !!q.options?.includes(v));
  }
  // files: список id загруженных файлов — проверяется в маршруте
  if (!Array.isArray(value)) return null;
  return value.filter((v): v is string => typeof v === "string").slice(0, 50);
}

/** sentAt — когда пилот отправил анкету команде: с этого момента она готова, даже с пропусками */
/** Обязательный вопрос закрыт: есть ответ на него или на парный вопрос (q.or) */
export function requiredMet(q: Question, answers: Record<string, unknown>) {
  return isAnswered(answers[q.id]) || (!!q.or && isAnswered(answers[q.or]));
}

export function surveyProgress(answers: Record<string, unknown>, sentAt?: string | null) {
  const answered = ALL_QUESTIONS.filter((q) => isAnswered(answers[q.id])).length;
  const required = ALL_QUESTIONS.filter((q) => q.required);
  const requiredDone = required.filter((q) => requiredMet(q, answers)).length;
  return {
    answered,
    total: ALL_QUESTIONS.length,
    requiredDone,
    requiredTotal: required.length,
    complete: requiredDone === required.length || !!sentAt,
    sentAt: sentAt || null,
    /** обязательные вопросы без ответа — показать перед отправкой */
    missing: required.filter((q) => !requiredMet(q, answers)).map((q) => q.id),
  };
}
