import { Navigate, Route, Routes } from "react-router-dom";
import { hasSession } from "./api";
import PilotShell from "./PilotShell";
import Invite from "./pages/Invite";
import Survey from "./pages/Survey";
import TeamLogin from "./pages/team/TeamLogin";
import TeamPilots from "./pages/team/TeamPilots";
import TeamPilot from "./pages/team/TeamPilot";
import TeamPains from "./pages/team/TeamPains";
import Welcome from "./pages/Welcome";

function PilotOnly({ children }: { children: React.ReactNode }) {
  if (hasSession("pilot")) return <>{children}</>;
  return <Navigate to={hasSession("team") ? "/team" : "/welcome"} replace />;
}

function TeamOnly({ children }: { children: React.ReactNode }) {
  return hasSession("team") ? <>{children}</> : <Navigate to="/team/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/welcome" element={<Welcome />} />
      <Route path="/invite/:token" element={<Invite />} />
      <Route path="/team/login" element={<TeamLogin />} />
      <Route path="/team" element={<TeamOnly><TeamPilots /></TeamOnly>} />
      <Route path="/team/pains" element={<TeamOnly><TeamPains /></TeamOnly>} />
      <Route path="/team/pilots/:id" element={<TeamOnly><TeamPilot /></TeamOnly>} />
      <Route path="/survey" element={<PilotOnly><Survey /></PilotOnly>} />
      <Route path="/*" element={<PilotOnly><PilotShell /></PilotOnly>} />
    </Routes>
  );
}
