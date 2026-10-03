import { useState } from "react";
import { api, dueLabel, isSoon, pointsWord, type TaskItem } from "../api";
import type { PilotCtx } from "../PilotShell";

type Filter = "open" | "done";

export default function Tasks({ data, reload }: PilotCtx) {
  const [filter, setFilter] = useState<Filter>("open");
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const open = data.tasks.filter((t) => !t.doneAt);
  const done = data.tasks.filter((t) => t.doneAt);
  const list = filter === "open" ? open : done.slice().sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));

  async function toggle(t: TaskItem) {
    setBusy(t.id);
    setErr("");
    try {
      await api(`/api/tasks/${t.id}/done`, { method: "POST", json: { done: !t.doneAt } });
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page">
      <div>
        <h1 className="h1">Задачи</h1>
        <p className="muted">Сделали в срок — получили все баллы, с опозданием — половину</p>
      </div>

      <div className="segmented" role="tablist">
        <button type="button" role="tab" aria-selected={filter === "open"} onClick={() => setFilter("open")}>
          В работе · {open.length}
        </button>
        <button type="button" role="tab" aria-selected={filter === "done"} onClick={() => setFilter("done")}>
          Готово · {done.length}
        </button>
      </div>

      {err ? <p className="error">{err}</p> : null}

      {list.length ? (
        <ul className="list">
          {list.map((t) => {
            const warn = !t.doneAt && (t.overdue || isSoon(t.dueDate));
            return (
              <li key={t.id}>
                <label className={`task${warn ? " task--warn" : ""}${t.doneAt ? " task--done" : ""}`}>
                  <input
                    type="checkbox"
                    checked={!!t.doneAt}
                    disabled={busy === t.id}
                    onChange={() => void toggle(t)}
                  />
                  <span className="task__body">
                    <span className="task__title">{t.title}</span>
                    {t.description ? <span className="task__desc">{t.description}</span> : null}
                    <span className="task__meta">
                      {t.dueDate ? <span className={warn ? "warn" : ""}>{dueLabel(t.dueDate, !!t.doneAt)}</span> : null}
                      <span className="accent">
                        {t.doneAt
                          ? `+${t.earned} ${pointsWord(t.earned)} получено`
                          : `+${t.points} ${pointsWord(t.points)}`}
                      </span>
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">{filter === "open" ? "Всё сделано! Новые задачи появятся здесь." : "Пока ничего не отмечено."}</p>
      )}
    </div>
  );
}
