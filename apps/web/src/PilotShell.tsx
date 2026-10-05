import { useCallback, useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api, ApiError, clearSession, type Overview } from "./api";
import { IconFlag, IconGrid, IconHome, IconMegaphone, IconTasks } from "./components/Icons";
import Home from "./pages/Home";
import Posts from "./pages/Posts";
import Review from "./pages/Review";
import Strategy from "./pages/Strategy";
import Tasks from "./pages/Tasks";
import Tools from "./pages/Tools";

export type PilotCtx = { data: Overview; reload: () => Promise<void> };

/** Экраны пилота с нижним меню; данные грузятся один раз и обновляются после действий */
export default function PilotShell() {
  const nav = useNavigate();
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState("");

  const reload = useCallback(async () => {
    try {
      setData(await api<Overview>("/api/me"));
      setErr("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        clearSession();
        nav("/welcome", { replace: true });
        return;
      }
      setErr((e as Error).message);
    }
  }, [nav]);

  useEffect(() => {
    void reload();
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  if (!data) {
    return (
      <div className="screen screen--center">
        {err ? (
          <>
            <p className="muted">{err}</p>
            <button className="btn" type="button" onClick={() => void reload()}>Повторить</button>
          </>
        ) : (
          <p className="muted">Загрузка…</p>
        )}
      </div>
    );
  }

  const ctx = { data, reload };
  return (
    <div className="app">
      <main className="app__main">
        <Routes>
          <Route index element={<Home {...ctx} />} />
          <Route path="strategy" element={<Strategy {...ctx} />} />
          <Route path="review" element={<Review {...ctx} />} />
          <Route path="tasks" element={<Tasks {...ctx} />} />
          <Route path="posts" element={<Posts />} />
          <Route path="tools" element={<Tools {...ctx} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <nav className="tabbar" aria-label="Разделы">
        <NavLink to="/" end className="tabbar__item"><IconHome />Главная</NavLink>
        <NavLink to="/strategy" className="tabbar__item"><IconFlag />Стратегия</NavLink>
        <NavLink to="/tasks" className="tabbar__item"><IconTasks />Задачи</NavLink>
        <NavLink to="/posts" className="tabbar__item"><IconMegaphone />Посты</NavLink>
        <NavLink to="/tools" className="tabbar__item"><IconGrid />Инструменты</NavLink>
      </nav>
    </div>
  );
}
