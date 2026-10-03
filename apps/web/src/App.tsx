import { Navigate, Route, Routes } from "react-router-dom";
import { getRole } from "./api";
import PilotShell from "./PilotShell";
import Invite from "./pages/Invite";
import Survey from "./pages/Survey";
import TeamLogin from "./pages/team/TeamLogin";
import TeamPilots from "./pages/team/TeamPilots";
import TeamPilot from "./pages/team/TeamPilot";
import Welcome from "./pages/Welcome";

function PilotOnly({ children }: { children: React.ReactNode }) {
  return getRole() === "pilot" ? <>{children}</> : <Navigate to="/welcome" replace />;
}

function TeamOnly({ children }: { children: React.ReactNode }) {
  return getRole() === "team" ? <>{children}</> : <Navigate to="/team/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/welcome" element={<Welcome />} />
      <Route path="/invite/:token" element={<Invite />} />
      <Route path="/team/login" element={<TeamLogin />} />
      <Route path="/team" element={<TeamOnly><TeamPilots /></TeamOnly>} />
      <Route path="/team/pilots/:id" element={<TeamOnly><TeamPilot /></TeamOnly>} />
      <Route path="/survey" element={<PilotOnly><Survey /></PilotOnly>} />
      <Route path="/*" element={<PilotOnly><PilotShell /></PilotOnly>} />
    </Routes>
  );
}
