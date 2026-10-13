import type { ReactNode } from "react";
import { ReleaseNav } from "./Nav";
export function ReleasePage({ children }: { children: ReactNode }) {
  return (
    <div className="release-shell">
      <ReleaseNav />
      <main>{children}</main>
    </div>
  );
}
