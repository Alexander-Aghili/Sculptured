import { Link, useLocation } from "react-router-dom";
import { rememberWorkspace } from "./workspaceLink";
import { BrandMark } from '../shell/BrandMark';
export const hosted = import.meta.env.VITE_COMMUNITY === "true";
export function ReleaseNav() {
  const { pathname } = useLocation();
  const workspace = hosted ? rememberWorkspace() : null;
  const links = hosted
    ? [
        ["/community", "Your account"],
        ["/community/saved", "Saved blocks"],
        ["/community/explore", "Browse blocks"],
        ["/community/mine", "Your publications"],
        ["/community/publish", "Publish"],
      ]
    : [
        ["/", "Workspace"],
        ["/library/groups", "Library"],
        ["/community", "Community"],
      ];
  return (
    <nav
      className="workspace-nav"
      aria-label={hosted ? "Community account" : "Workspace navigation"}
    >
      <a className="coastal-brand" href={workspace ?? '/?all'} aria-label="Sculptured workspace"><BrandMark /><span>Sculptured</span></a>
      {workspace && <a href={workspace}>← Workspace</a>}
      {workspace && <a href={`${workspace}/library/groups`}>Library</a>}
      {links.map(([to, label]) => (
        <Link
          key={to}
          to={to}
          aria-current={pathname === to ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
