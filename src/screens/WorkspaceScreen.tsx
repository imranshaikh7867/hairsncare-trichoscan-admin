import { useEffect, useRef, useState } from "react";
import ApprovalsScreen from "./ApprovalsScreen";
import WorkspaceFrame from "../components/WorkspaceFrame";
import { useCareSync } from "../workspace/useCareSync";
import { useAdminAuth } from "../auth/useAdminAuth";
import type { AdminProfile } from "../api/careWorkspace";
import seed from "../generated/seed.json";
import "../styles/admin.css";
import "../styles/shell.css";
import "../styles/catalogue.css";

/* HairsnCares · Care Atelier — the admin workspace.
 *
 * The original is a vanilla app that owns its own DOM: it routes between the
 * workspace pages, renders the template and catalogue tables, opens its
 * modals, and runs the mapping validation and revision-conflict checks. All
 * of that is carried over in public/engine/admin-app.js, because rewriting
 * it as React state would risk changing the care-mapping and safety
 * behaviour — the one thing that must not drift.
 *
 * React supplies what the original document supplied, and one thing more:
 *
 *   * the frame the script expects to find;
 *   * the seed data it reads at startup;
 *   * the live care config and product catalogue, written into the browser
 *     keys the script reads, before it is allowed to start.
 *
 * That last point is the whole of the database integration. See
 * workspace/useCareSync.ts — the engine still believes it is talking to
 * localStorage.
 */
export default function WorkspaceScreen({ profile }: { profile: AdminProfile }) {
  const { signOut } = useAdminAuth();
  const { status, hydrated, flush } = useCareSync(true);
  const started = useRef(false);

  /* Two screens, one of them the carried-over engine.
   *
   * The engine is never unmounted — it boots once, against care data loaded
   * before it started, and restarting it would mean reloading all of that and
   * rebuilding its pages from scratch. So the atelier stays mounted and is
   * hidden while the authorisation screen is up. */
  const [view, setView] = useState<"atelier" | "approvals">("atelier");

  useEffect(() => {
    // Nothing starts until the server's data is in place. Booting the engine
    // first would show the 37 shipped templates with no products, and the
    // first save would push that over the real mapping.
    if (!hydrated || started.current) return;
    started.current = true;

    // Its first statement is
    //   JSON.parse(document.getElementById('seed').textContent)
    // so the seed must already be in the document when the script runs.
    if (!document.getElementById("seed")) {
      const data = document.createElement("script");
      data.type = "application/json";
      data.id = "seed";
      data.textContent = JSON.stringify(seed);
      document.body.appendChild(data);
    }

    const tag = document.createElement("script");
    tag.src = `${import.meta.env.BASE_URL}engine/admin-app.js`;
    tag.async = false;
    document.body.appendChild(tag);
  }, [hydrated]);

  /* An edit made a moment before signing out is still sitting in the debounce.
     Push it first, then go. */
  const handleSignOut = () => {
    void flush().finally(signOut);
  };

  return (
    <>
      <WorkspaceFrame
        profile={profile}
        status={status}
        ready={hydrated}
        hidden={view !== "atelier"}
        onApprovals={() => setView("approvals")}
        onSignOut={handleSignOut}
      />
      {view === "approvals" ? (
        <ApprovalsScreen onClose={() => setView("atelier")} />
      ) : null}
    </>
  );
}
