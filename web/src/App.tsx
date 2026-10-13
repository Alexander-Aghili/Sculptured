import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { ReleasePage } from './release/ReleasePage';
import { Profile } from './release/Profile';
import { Community } from './release/Community';
import { GitPage } from './release/GitPage';
import { hosted } from './release/Nav';
import { Shell } from './shell/Shell';
import type { OpenStream } from './useRigStream';
import { HostedGate, useHosted } from './hosted/HostedGate';
import { JoinPage } from './hosted/JoinPage';
import { LoginPage } from './hosted/LoginPage';
import { ResetPage } from './hosted/ResetPage';
import { AdminPage } from './hosted/AdminPage';
import { ConnectPage } from './hosted/ConnectPage';
import { ComputersPage } from './hosted/ComputersPage';
import { AccountPage } from './account/AccountPage';
import { WhatWeRecord } from './hosted/WhatWeRecord';

/** Hosted beta admin page; anyone else goes home. */
function AdminGuard() {
  const s = useHosted();
  return s.kind === 'signed-in' && s.user.role === 'admin' ? <AdminPage /> : <Navigate replace to="/" />;
}

/** M1 links used /seat/; agents now live under /agent/. */
function LegacySeatLink() {
  const { pathname, search } = useLocation();
  // Anchored on the rig segment; a bare /seat (no agent) goes to the team.
  const m = /^(\/rig\/[^/]+)\/seat\/?(.*)$/.exec(pathname);
  const to = m && m[2] ? `${m[1]}/agent/${m[2]}` : m ? m[1] : '/';
  return <Navigate replace to={to + search} />;
}

/** `/team/:id` opens the team's Structure board. */
function TeamLink() {
  const { pathname } = useLocation();
  return <Navigate replace to={`${pathname.replace(/\/$/, '')}/structure`} />;
}

/** `/team/:id/live` is the team's Live board, which lives at `/rig/:id`. */
function TeamLiveLink() {
  const { team } = useParams();
  return <Navigate replace to={`/rig/${encodeURIComponent(team!)}`} />;
}

export function AppRoutes({ openStream }: { openStream?: OpenStream }) {
  const shell = <Shell openStream={openStream} />;
  if(hosted)return <Routes>
    <Route path="/community" element={<ReleasePage><Profile/></ReleasePage>}/>
    <Route path="/community/*" element={<ReleasePage><Community/></ReleasePage>}/>
    <Route path="*" element={<Navigate replace to="/community"/>}/>
  </Routes>;
  return (
    <Routes>
      <Route path="/join/:token" element={<JoinPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset/:token" element={<ResetPage />} />
      <Route path="/admin" element={<AdminGuard />} />
      <Route path="/connect" element={<ConnectPage />} />
      <Route path="/computers" element={<ComputersPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/what-we-record" element={<WhatWeRecord />} />
      <Route path="/community/*" element={<ReleasePage><Community/></ReleasePage>}/>
      <Route path="/team/:team/git" element={<ReleasePage><GitPage/></ReleasePage>}/>
      <Route path="/" element={shell} />
      <Route path="/library" element={<Navigate replace to="/library/groups" />} />
      <Route path="/library/:collection" element={shell} />
      <Route path="/rig/:rig" element={shell} />
      <Route path="/rig/:rig/agent/:seat" element={shell} />
      <Route path="/rig/:rig/agent/:seat/:tab" element={shell} />
      <Route path="/rig/:rig/seat/*" element={<LegacySeatLink />} />
      <Route path="/team/:team/structure" element={shell} />
      <Route path="/team/:team/progress" element={<TeamLiveLink />} />
      <Route path="/team/:team" element={<TeamLink />} />
      <Route path="/team/:team/live" element={<TeamLiveLink />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      {hosted ? <AppRoutes /> : <HostedGate><AppRoutes /></HostedGate>}
    </BrowserRouter>
  );
}
