import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, pointsWord, type Answers, type FileInfo, type Question, type Section } from "../api";
import { IconBack, IconPaperclip } from "../components/Icons";

type SurveyData = {
  title: string;
  intro: string;
  points: number;
  sections: Section[];
  answers: Answers;
  files: Record<string, FileInfo>;
  sentAt: string | null;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const filled = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim() !== "");
/** обязательный вопрос закрыт — ответ есть на него или на парный (фото или ссылка на папку) */
const met = (q: Question, a: Answers) => filled(a[q.id]) || (!!q.or && filled(a[q.or]));

export default function Survey() {
  const [data, setData] = useState<SurveyData | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [files, setFiles] = useState<Record<string, FileInfo>>({});
  const [step, setStep] = useState(0);
  const [save, setSave] = useState<SaveState>("idle");
  const [err, setErr] = useState("");
  /** экран перед отправкой (какие обязательные пропущены) и после неё (что дальше) */
  const [finish, setFinish] = useState<"" | "check" | "sent">("");
  const [sending, setSending] = useState(false);
  const pending = useRef<Answers>({});
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    api<SurveyData>("/api/survey")
      .then((d) => {
        setData(d);
        setAnswers(d.answers);
        setFiles(d.files);
        // начинаем с первого раздела, где есть незаполненный обязательный вопрос
        const first = d.sections.findIndex((s) => s.questions.some((q) => q.required && !met(q, d.answers)));
        setStep(first === -1 ? 0 : first);
      })
      .catch((e: Error) => setErr(e.message));
  }, []);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const batch = pending.current;
    if (!Object.keys(batch).length) return;
    pending.current = {};
    setSave("saving");
    try {
      await api("/api/survey", { method: "PUT", json: { answers: batch } });
      setSave("saved");
    } catch {
      pending.current = { ...batch, ...pending.current };
      setSave("error");
    }
  }, []);

  // сохранить при сворачивании приложения
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      void flush();
    };
  }, [flush]);

  function setAnswer(id: string, value: string | string[]) {
    setAnswers((a) => ({ ...a, [id]: value }));
    pending.current[id] = value;
    setSave("idle");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 800);
  }

  async function uploadFiles(q: Question, list: FileList | null) {
    if (!list?.length) return;
    const form = new FormData();
    Array.from(list).forEach((f) => form.append("files", f));
    setSave("saving");
    try {
      const r = await api<{ files: FileInfo[] }>("/api/files", { method: "POST", body: form });
      if (!r.files.length) {
        setErr("Этот тип файла не подходит: нужны фото, PDF, Excel или Word");
        setSave("idle");
        return;
      }
      setFiles((f) => ({ ...f, ...Object.fromEntries(r.files.map((x) => [x.id, x])) }));
      const prev = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
      setAnswer(q.id, [...prev, ...r.files.map((x) => x.id)]);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
      setSave("error");
    }
  }

  if (!data) {
    return <div className="screen screen--center"><p className="muted">{err || "Загрузка…"}</p></div>;
  }

  const section = data.sections[step];
  const total = data.sections.reduce((n, s) => n + s.questions.length, 0);
  const answered = data.sections.flatMap((s) => s.questions).filter((q) => filled(answers[q.id])).length;
  const isLast = step === data.sections.length - 1;
  /** анкета у команды — только просмотр: по этим ответам готовится стратегия */
  const locked = !!data.sentAt;

  function go(next: number) {
    void flush();
    setFinish("");
    setStep(next);
    window.scrollTo({ top: 0 });
  }

  const missing = data.sections.flatMap((s, i) =>
    s.questions.filter((q) => q.required && !met(q, answers)).map((q) => ({ q, section: i })),
  );

  async function send() {
    setSending(true);
    setErr("");
    try {
      await flush();
      await api("/api/survey/send", { method: "POST" });
      setData((d) => (d ? { ...d, sentAt: d.sentAt || new Date().toISOString() } : d));
      setFinish("sent");
      window.scrollTo({ top: 0 });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (finish) {
    return (
      <div className="survey">
        <header className="survey__bar">
          <button type="button" className="icon-btn" aria-label="Назад" onClick={() => setFinish("")}><IconBack /></button>
          <span className="strong">{data.title}</span>
        </header>
        <div className="survey__body">
          {finish === "check" ? (
            <>
              <h1 className="h1">Отправить анкету команде?</h1>
              <p className="muted">
                Без ответа {missing.length} {missing.length === 1 ? "обязательный вопрос" : missing.length < 5 ? "обязательных вопроса" : "обязательных вопросов"}.
                Если ответа нет — ничего страшного, отправляйте: команда уточнит при разговоре.
              </p>
              <ul className="missing">
                {missing.map(({ q, section }) => (
                  <li key={q.id}>
                    <button type="button" className="missing__item" onClick={() => go(section)}>
                      <span>{q.title}</span>
                      <small className="accent">Ответить</small>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <h1 className="h1">Анкета у команды ✓</h1>
              <p className="accent strong">+{data.points} {pointsWord(data.points)}</p>
              <ol className="next-steps">
                <li className="done"><strong>Анкета</strong><span>Готово. Ответы закреплены — по ним команда готовит стратегию.</span></li>
                <li className="now"><strong>Стратегия</strong><span>Команда изучит ответы и составит план: цели и задачи со сроками. Обычно 1–3 дня.</span></li>
                <li><strong>Согласование</strong><span>На главной появится «Стратегия на согласование» — вы выберете, что берёте в работу.</span></li>
                <li><strong>Задачи и этажи</strong><span>Делаете задачи в срок — получаете баллы и поднимаетесь по этажам.</span></li>
              </ol>
            </>
          )}
          {err ? <p className="error">{err}</p> : null}
        </div>
        <footer className="survey__footer">
          <div className="survey__nav">
            {finish === "check" ? (
              <button type="button" className="btn btn--primary" disabled={sending} onClick={() => void send()}>
                {sending ? "Отправляем…" : "Отправить как есть"}
              </button>
            ) : (
              <Link to="/" className="btn btn--primary">На главную</Link>
            )}
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="survey">
      <header className="survey__bar">
        <Link to="/" className="icon-btn" aria-label="Назад"><IconBack /></Link>
        <span className="strong">{data.title}</span>
        <span className="accent small survey__points">+{data.points} {pointsWord(data.points)}</span>
      </header>

      <div className="survey__progress">
        <div className="survey__progress-text">
          <span>Раздел {step + 1} из {data.sections.length} · {section.title}</span>
          <span>{answered} / {total}</span>
        </div>
        <div className="steps" style={{ gridTemplateColumns: `repeat(${data.sections.length}, minmax(0, 1fr))` }}>
          {data.sections.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Раздел ${i + 1}: ${s.title}`}
              className={i < step ? "past" : i === step ? "on" : ""}
              onClick={() => go(i)}
            />
          ))}
        </div>
      </div>

      <div className="survey__body">
        {locked ? (
          <div className="card card--accent stack">
            <strong>Анкета у команды — ответы закреплены</strong>
            <span className="muted small">
              По ним готовится стратегия, поэтому менять их уже нельзя. Нужно что-то поправить или дополнить — напишите менеджеру, он откроет анкету для правок.
            </span>
          </div>
        ) : step === 0 ? <p className="muted">{data.intro}</p> : null}
        {section.questions.map((q) => (
          <QuestionField
            key={q.id}
            q={q}
            value={answers[q.id]}
            files={files}
            locked={locked}
            onChange={(v) => setAnswer(q.id, v)}
            onUpload={(l) => void uploadFiles(q, l)}
          />
        ))}
        {err ? <p className="error">{err}</p> : null}
      </div>

      <footer className="survey__footer">
        {/* одна строка постоянной высоты: смена текста не двигает страницу, пока открыта клавиатура */}
        {locked ? null : <p className={`survey__save small${save === "error" ? " error" : " muted"}`}>
          {save === "saving" ? "Сохраняем…" : save === "error" ? "Нет связи — сохраним позже" : save === "saved" ? "Сохранено ✓" : "Ответы сохраняются сами"}
        </p>}
        <div className="survey__nav">
          {step > 0 ? (
            <button type="button" className="btn btn--soft" onClick={() => go(step - 1)}>Назад</button>
          ) : null}
          {isLast ? (
            locked ? (
              <Link to="/" className="btn btn--primary">На главную</Link>
            ) : (
              <button
                type="button"
                className="btn btn--primary"
                disabled={sending}
                onClick={() => {
                  if (missing.length) {
                    void flush();
                    setFinish("check");
                    window.scrollTo({ top: 0 });
                  } else void send();
                }}
              >
                Отправить команде
              </button>
            )
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => go(step + 1)}>Дальше</button>
          )}
        </div>
      </footer>
    </div>
  );
}

function QuestionField({
  q,
  value,
  files,
  locked,
  onChange,
  onUpload,
}: {
  q: Question;
  value: string | string[] | undefined;
  files: Record<string, FileInfo>;
  locked?: boolean;
  onChange: (v: string | string[]) => void;
  onUpload: (l: FileList | null) => void;
}) {
  const id = `f-${q.id}`;
  const title = (
    <>
      {q.title}
      {q.required && !locked ? <span className="req" aria-label="обязательный вопрос"> *</span> : null}
    </>
  );
  const hint = q.hint && !locked ? <p className="q__hint">{q.hint}</p> : null;

  if (q.type === "radio" || q.type === "checkbox") {
    const list = Array.isArray(value) ? value : [];
    return (
      <fieldset className="q" disabled={locked}>
        <legend className="q__title">{title}</legend>
        {hint}
        {q.options?.map((o) => {
          const checked = q.type === "radio" ? value === o : list.includes(o);
          return (
            <label key={o} className={`option${checked ? " option--on" : ""}`}>
              <input
                type={q.type}
                name={id}
                checked={checked}
                onChange={() =>
                  q.type === "radio" ? onChange(o) : onChange(checked ? list.filter((x) => x !== o) : [...list, o])
                }
              />
              {o}
            </label>
          );
        })}
      </fieldset>
    );
  }

  if (q.type === "files") {
    const ids = Array.isArray(value) ? value : [];
    return (
      <div className="q">
        <p className="q__title">{title}</p>
        {hint}
        {ids.length ? (
          <ul className="files">
            {ids.map((fid) => {
              const f = files[fid];
              return (
                <li key={fid} className="files__item">
                  {f?.mime.startsWith("image/") && f.mime !== "image/svg+xml" ? (
                    <img src={f.url} alt="" />
                  ) : (
                    <span className="files__doc">{f?.name.split(".").pop()?.toUpperCase() || "Файл"}</span>
                  )}
                  <span className="files__name">{f?.name || "Файл"}</span>
                  {locked ? null : <button
                    type="button"
                    className="files__remove"
                    aria-label={`Убрать ${f?.name || "файл"}`}
                    onClick={() => onChange(ids.filter((x) => x !== fid))}
                  >
                    ×
                  </button>}
                </li>
              );
            })}
          </ul>
        ) : locked ? <p className="muted">—</p> : null}
        {locked ? null : <label className="btn btn--outline file-btn">
          <IconPaperclip size={18} />Прикрепить файлы
          <input
            type="file"
            multiple
            accept="image/*,.pdf,.xls,.xlsx,.doc,.docx,.csv"
            onChange={(e) => {
              onUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>}
      </div>
    );
  }

  const text = typeof value === "string" ? value : "";
  return (
    <div className="q">
      <label className="q__title" htmlFor={id}>{title}</label>
      {hint}
      {locked ? (
        <p className="q__answer">{text.trim() || <span className="muted">—</span>}</p>
      ) : q.type === "textarea" ? (
        <textarea id={id} rows={4} value={text} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} type="text" value={text} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
