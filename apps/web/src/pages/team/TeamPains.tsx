import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, hoursLabel, type PainStatus, type TeamPainItem } from "../../api";
import { PAIN_AREAS } from "../../../../api/src/pains";
import TeamLayout from "./TeamLayout";
import { areaLabel, PAIN_STATUS_TEAM } from "./PainsTab";

type Row = TeamPainItem & { pilot: { id: number; name: string; business: string; niche: string } };
type Filter = "all" | "new" | "work" | "solved" | "later";

const FILTERS: [Filter, string][] = [
  ["all", "Все"],
  ["new", "Новые"],
  ["work", "В работе"],
  ["solved", "Решено"],
  ["later", "Отложено"],
];

const match = (f: Filter, s: PainStatus) =>
  f === "all" || (f === "work" ? s === "study" || s === "building" : f === s);

/**
 * Рутина всех пилотов вместе: что повторяется в разных нишах — то автоматизируем один раз и раздаём всем.
 * Сводка по областям сверху, весь список ниже.
 */
export default function TeamPains() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    api<{ pains: Row[] }>("/api/team/pains").then((r) => setRows(r.pains), (e) => setErr((e as Error).message));
  }, []);

  const all = rows || [];
  const live = all.filter((p) => p.status !== "later");
  const areas = PAIN_AREAS.map((a) => {
    const list = live.filter((p) => p.area === a.id);
    return {
      ...a,
      count: list.length,
      pilots: new Set(list.map((p) => p.pilot.id)).size,
      niches: [...new Set(list.map((p) => p.pilot.niche || p.pilot.business).filter(Boolean))],
      open: list.filter((p) => p.status !== "solved").reduce((s, p) => s + p.hours, 0),
      solved: list.filter((p) => p.status === "solved").length,
    };
  })
    .filter((a) => a.count)
    .sort((a, b) => b.pilots - a.pilots || b.open - a.open);
  const shown = all.filter((p) => match(filter, p.status));

  return (
    <TeamLayout>
      <div>
        <h1 className="h1">Рутина пилотов</h1>
        <p className="muted">
          Что отнимает время у предпринимателей. Повторяется у разных пилотов — автоматизируем один раз и подключаем всем.
        </p>
      </div>
      {err ? <p className="error">{err}</p> : null}

      <div className="kpis">
        <div className="card"><small>Освободили пилотам</small><b>{hoursLabel(all.reduce((s, p) => s + p.savedHours, 0))} / нед</b></div>
        <div className={`card${all.some((p) => p.status === "new") ? " card--accent" : ""}`}><small>Новых — разберите</small><b>{all.filter((p) => p.status === "new").length}</b></div>
        <div className="card"><small>В работе</small><b>{all.filter((p) => p.status === "study" || p.status === "building").length}</b></div>
        <div className="card"><small>Решено</small><b>{all.filter((p) => p.status === "solved").length}</b></div>
        <div className="card"><small>Ещё не забрали</small><b>{hoursLabel(live.filter((p) => p.status !== "solved").reduce((s, p) => s + p.hours, 0))} / нед</b></div>
      </div>

      {areas.length ? (
        <>
          <h2 className="h2">Где больше всего рутины</h2>
          <div className="areas">
            {areas.map((a) => (
              <div key={a.id} className="card">
                <small className="muted">{a.label}</small>
                <b>{a.pilots} {a.pilots === 1 ? "пилот" : a.pilots < 5 ? "пилота" : "пилотов"}</b>
                <span className="small">
                  случаев: {a.count} · решено: {a.solved}
                  {a.open ? ` · ещё ${hoursLabel(a.open)} / нед` : ""}
                </span>
                {a.niches.length ? <span className="muted small">{a.niches.join(", ")}</span> : null}
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div className="tabs" role="tablist">
        {FILTERS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>
            {l} · {all.filter((p) => match(k, p.status)).length}
          </button>
        ))}
      </div>

      <div className="table-box">
        <table className="table">
          <thead>
            <tr><th>Рутина</th><th>Пилот</th><th>Область</th><th>Время</th><th>Статус</th><th>Как забираем</th></tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={6} className="muted">Загрузка…</td></tr>
            ) : !shown.length ? (
              <tr><td colSpan={6} className="muted">Пока пусто. Пилоты рассказывают о рутине в приложении (раздел «Рутина»), а вы можете записать её со звонка в карточке пилота.</td></tr>
            ) : (
              shown.map((p) => (
                <tr key={p.id} className="table__row" onClick={() => nav(`/team/pilots/${p.pilot.id}?tab=pains`)}>
                  <td>
                    <span className="strong">{p.title}</span>
                    {p.details ? <small className="muted block">{p.details}</small> : null}
                  </td>
                  <td>
                    <Link to={`/team/pilots/${p.pilot.id}?tab=pains`} className="plain strong">{p.pilot.business || p.pilot.name}</Link>
                    <small className="muted block">{p.pilot.niche}</small>
                  </td>
                  <td>{areaLabel(p.area)}</td>
                  <td className="nowrap">
                    {p.hours ? `${hoursLabel(p.hours)} / нед` : "—"}
                    {p.status === "solved" && p.savedHours ? <small className="ok block">−{hoursLabel(p.savedHours)}</small> : null}
                  </td>
                  <td><span className={`status status--${p.status === "new" ? "action" : p.status === "solved" ? "ok" : p.status === "later" ? "muted" : "warn"}`}>{PAIN_STATUS_TEAM.find(([k]) => k === p.status)?.[1]}</span></td>
                  <td className="small">{p.solution || <span className="muted">—</span>}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </TeamLayout>
  );
}
