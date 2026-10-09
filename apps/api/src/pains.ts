/**
 * Рутина — главное в «Лифте»: пилот рассказывает, что отнимает у него время, команда забирает это на себя
 * (автоматизирует), пилот видит, сколько часов в неделю ему освободили.
 * Чистые функции без базы — те же работают в демо-режиме приложения.
 */

/** Как часто: сколько раз в неделю */
export const PAIN_FREQ = [
  { id: "day", label: "Каждый день", perWeek: 5 },
  { id: "week3", label: "Несколько раз в неделю", perWeek: 3 },
  { id: "week", label: "Раз в неделю", perWeek: 1 },
  { id: "month", label: "Раз в месяц", perWeek: 0.25 },
] as const;

/** Сколько времени за раз, минуты */
export const PAIN_DURATION = [
  { id: "15", label: "до 15 минут", minutes: 15 },
  { id: "30", label: "около 30 минут", minutes: 30 },
  { id: "60", label: "около часа", minutes: 60 },
  { id: "120", label: "2 часа и больше", minutes: 120 },
] as const;

/** Область — чтобы команда видела похожую рутину у пилотов из разных ниш и решала её один раз для всех */
export const PAIN_AREAS = [
  { id: "clients", label: "Ответы клиентам и заявки" },
  { id: "booking", label: "Запись, брони, расписание" },
  { id: "content", label: "Соцсети и контент" },
  { id: "docs", label: "Счета, документы, отчёты" },
  { id: "money", label: "Оплаты и учёт денег" },
  { id: "supply", label: "Закупки, склад, доставка" },
  { id: "team", label: "Сотрудники и подрядчики" },
  { id: "other", label: "Другое" },
] as const;

/** Подсказки пилоту: частая рутина малого бизнеса (одно касание — и текст в поле) */
export const PAIN_EXAMPLES = [
  { title: "Отвечаю клиентам на одни и те же вопросы: цены, сроки, адрес", area: "clients" },
  { title: "Переписываю заявки из мессенджеров в таблицу или блокнот", area: "clients" },
  { title: "Записываю клиентов и напоминаю им о визите", area: "booking" },
  { title: "Придумываю и публикую посты в соцсети", area: "content" },
  { title: "Выставляю счета, акты, готовлю отчёты", area: "docs" },
  { title: "Проверяю, кто оплатил, и напоминаю о долгах", area: "money" },
] as const;

export const PAIN_STATUSES = ["new", "study", "building", "solved", "later"] as const;
export type PainStatus = (typeof PAIN_STATUSES)[number];

/** Баллы за каждую рассказанную рутину (засчитываются первые PAIN_POINTS_MAX) */
export const PAIN_POINTS = 30;
export const PAIN_POINTS_MAX = 10;

export type PainRow = {
  id: number;
  title: string;
  details: string;
  freq: string;
  duration: string;
  area: string;
  status: PainStatus;
  solution: string;
  saved_hours: number | null;
  team_note: string;
  created_by: string;
  created_at: string;
  solved_at: string | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Сколько часов в неделю уходит на эту рутину (по ответам «как часто» и «сколько за раз») */
export function painHours(p: Pick<PainRow, "freq" | "duration">) {
  const f = PAIN_FREQ.find((x) => x.id === p.freq);
  const d = PAIN_DURATION.find((x) => x.id === p.duration);
  return f && d ? round1((f.perWeek * d.minutes) / 60) : 0;
}

/** Сколько освободили: оценка команды, а если её нет — всё время, что уходило на рутину */
export function painSaved(p: PainRow) {
  if (p.status !== "solved") return 0;
  return round1(p.saved_hours ?? painHours(p));
}

export function publicPain(p: PainRow) {
  return {
    id: p.id,
    title: p.title,
    details: p.details,
    freq: p.freq,
    duration: p.duration,
    area: p.area,
    status: p.status,
    solution: p.solution,
    hours: painHours(p),
    savedHours: painSaved(p),
    createdBy: p.created_by,
    createdAt: p.created_at,
    solvedAt: p.solved_at,
  };
}

const ORDER: Record<PainStatus, number> = { building: 0, study: 1, new: 2, solved: 3, later: 4 };

export function buildPains(rows: PainRow[]) {
  const list = rows
    .slice()
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || painHours(b) - painHours(a) || b.id - a.id)
    .map(publicPain);
  const told = rows.filter((p) => p.created_by === "pilot").length;
  return {
    list,
    summary: {
      total: rows.length,
      solved: rows.filter((p) => p.status === "solved").length,
      inWork: rows.filter((p) => p.status === "new" || p.status === "study" || p.status === "building").length,
      savedHours: round1(rows.reduce((s, p) => s + painSaved(p), 0)),
      openHours: round1(rows.filter((p) => p.status !== "solved" && p.status !== "later").reduce((s, p) => s + painHours(p), 0)),
      points: Math.min(told, PAIN_POINTS_MAX) * PAIN_POINTS,
      pointsEach: PAIN_POINTS,
      pointsLeft: told < PAIN_POINTS_MAX,
    },
  };
}

const pick = <T extends { id: string }>(list: readonly T[], v: unknown) => list.find((x) => x.id === v)?.id ?? "";

/** Проверка и очистка полей рутины (от пилота или команды) */
export function cleanPain(b: Record<string, unknown>, team = false) {
  const out: Partial<PainRow> = {};
  if (b.title !== undefined) out.title = String(b.title ?? "").trim().slice(0, 300);
  if (b.details !== undefined) out.details = String(b.details ?? "").trim().slice(0, 3000);
  if (b.freq !== undefined) out.freq = pick(PAIN_FREQ, b.freq);
  if (b.duration !== undefined) out.duration = pick(PAIN_DURATION, b.duration);
  if (b.area !== undefined) out.area = pick(PAIN_AREAS, b.area) || "other";
  if (team) {
    if (b.status !== undefined && (PAIN_STATUSES as readonly string[]).includes(String(b.status))) out.status = b.status as PainStatus;
    if (b.solution !== undefined) out.solution = String(b.solution ?? "").trim().slice(0, 3000);
    if (b.teamNote !== undefined) out.team_note = String(b.teamNote ?? "").trim().slice(0, 3000);
    if (b.savedHours !== undefined) {
      const n = b.savedHours === null || b.savedHours === "" ? null : Number(b.savedHours);
      out.saved_hours = n === null || !Number.isFinite(n) ? null : Math.max(0, Math.min(80, round1(n)));
    }
  }
  return out;
}
