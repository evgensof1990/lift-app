import { db } from "./db.js";
import type { Change, StrategyImport } from "./model.js";

/** Записать решения согласования в базу */
export function applyChanges(pilotId: number, changes: Change[]) {
  const goal = db.prepare(
    "UPDATE goals SET status = ?, decline_reason = ?, decided_at = datetime('now') WHERE id = ? AND pilot_id = ?",
  );
  const task = db.prepare(
    "UPDATE tasks SET status = ?, decline_reason = ?, decided_at = datetime('now') WHERE id = ? AND pilot_id = ?",
  );
  db.transaction(() => {
    for (const c of changes) (c.kind === "goal" ? goal : task).run(c.status, c.reason, c.id, pilotId);
  })();
}

/**
 * Импорт стратегии: цели и задачи добавляются «на согласование» после уже существующих.
 * Цель, этапы и заметка пилота перезаписываются, если переданы.
 */
export function importStrategy(pilotId: number, s: StrategyImport) {
  const maxGoal = (db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM goals WHERE pilot_id = ?").get(pilotId) as { m: number }).m;
  const insGoal = db.prepare("INSERT INTO goals (pilot_id, sort_order, title, description, status) VALUES (?, ?, ?, ?, 'proposed')");
  const insTask = db.prepare(
    `INSERT INTO tasks (pilot_id, goal_id, sort_order, title, description, due_date, points, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'proposed')`,
  );
  let goals = 0;
  let tasks = 0;
  db.transaction(() => {
    s.goals.forEach((g, i) => {
      const gid = Number(insGoal.run(pilotId, maxGoal + i + 1, g.title, g.description || "").lastInsertRowid);
      goals++;
      (g.tasks || []).forEach((t, j) => {
        insTask.run(pilotId, gid, j, t.title, t.description || "", t.dueDate || null, t.points ?? 50);
        tasks++;
      });
    });
    const sets: string[] = [];
    const vals: unknown[] = [];
    const set = (col: string, v: string | undefined) => {
      if (v !== undefined) {
        sets.push(`${col} = ?`);
        vals.push(v);
      }
    };
    set("goal", s.goal);
    set("goal_note", s.goalNote);
    set("plan_title", s.planTitle);
    set("team_note", s.teamNote);
    if (sets.length) db.prepare(`UPDATE pilots SET ${sets.join(", ")} WHERE id = ?`).run(...vals, pilotId);
    if (s.stages) {
      db.prepare("DELETE FROM stages WHERE pilot_id = ?").run(pilotId);
      const ins = db.prepare("INSERT INTO stages (pilot_id, sort_order, title, description, status) VALUES (?, ?, ?, ?, ?)");
      s.stages.forEach((st, i) => ins.run(pilotId, i, st.title, st.description || "", st.status || "next"));
    }
    if (s.tools) {
      db.prepare("DELETE FROM tools WHERE pilot_id = ?").run(pilotId);
      const ins = db.prepare(
        "INSERT INTO tools (pilot_id, sort_order, kind, title, subtitle, url, admin_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      s.tools.forEach((t, i) => ins.run(pilotId, i, t.kind, t.title, t.subtitle || "", t.url || "", t.adminUrl || "", t.status || "works"));
    }
  })();
  return { goals, tasks };
}
