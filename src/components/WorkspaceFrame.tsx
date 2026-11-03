/* The static frame the carried-over admin engine expects to find.
 *
 * Originally this was a generated HTML string (src/generated/shell.ts, from
 * HairsnCares-Admin-Connected.html). It is JSX now because the frame gained
 * React-owned controls — the sign-out buttons — and a string injected with
 * dangerouslySetInnerHTML cannot carry a React handler.
 *
 * The engine still owns everything it owned before. It looks up #main,
 * #modal, #toast, #status and #import-file, and binds click handlers to the
 * [data-page] buttons; all of those are rendered here and then left alone.
 * #main is filled via dangerouslySetInnerHTML, which makes its contents
 * opaque to React — React will not diff what the engine writes there.
 *
 * Changed from the original frame, as requested:
 *   · "Test client inputs", "Backup & transfer" and "Workspace guide" are
 *     gone from the nav. Exporting a mapping backup remains on the template
 *     page, where it is used.
 *   · The header no longer says "no login" — it shows who is signed in.
 *   · Sign-out sits in both the header and the foot of the sidebar.
 *   · #status starts hidden; the engine only reveals it to warn.
 *   · A sync line reports what is happening between the workspace and the
 *     database, because the engine's own "settings saved in this browser"
 *     wording is no longer true — they are saved to the server.
 */

import type { SyncStatus } from "../workspace/useCareSync";

/** The sync line, in the words an admin needs rather than a state name. */
function syncLabel(status: SyncStatus): { text: string; tone: string } {
  switch (status.state) {
    case "loading":
      return { text: "Loading care data…", tone: "busy" };
    case "ready":
      return {
        text: `${status.templates} templates · ${status.products} products`,
        tone: "ok",
      };
    case "saving":
      return { text: "Saving…", tone: "busy" };
    case "saved":
      return {
        text: status.changed
          ? `Saved · ${status.changed} template${status.changed === 1 ? "" : "s"}`
          : "Up to date",
        tone: "ok",
      };
    case "error":
      return { text: status.message, tone: "error" };
    default:
      return { text: "", tone: "ok" };
  }
}

/** What #main shows for the moment before the engine takes it over. */
const MAIN_PLACEHOLDER = `
  <section class="hero">
    <p class="eyebrow">HAIRSNCARES</p>
    <h1>Care, <em>beautifully organised.</em></h1>
    <p>Loading your care templates…</p>
  </section>
`;

export default function WorkspaceFrame({
  profile,
  status,
  ready,
  hidden,
  onApprovals,
  onSignOut,
}: {
  profile: { email: string; name: string; role: string };
  status: SyncStatus;
  /** False until the care data has arrived; the engine has not started yet. */
  ready: boolean;
  /* Hidden rather than unmounted while another screen is showing. The engine
     owns everything inside #main and cannot be restarted without reloading
     its data and rebuilding its pages, so it stays where it is. */
  hidden: boolean;
  onApprovals: () => void;
  onSignOut: () => void;
}) {
  const sync = syncLabel(status);

  return (
    <>
      <div className="app-shell" hidden={hidden}>
        <header className="top">
          <span className="brand">✚ HairsnCares</span>
          <span className="tag">TRICHOSCAN · CARE ATELIER</span>

          <div className="top-account">
            <span className={`sync sync-${sync.tone}`} role="status">
              <i className="sync-dot" aria-hidden="true" />
              {sync.text}
            </span>
            <span className="top-who">
              <small>Signed in as</small>
              <strong>{profile.email}</strong>
            </span>
            <button type="button" className="top-signout" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </header>

        {/* the engine writes here, and only reveals it to carry a warning */}
        <div id="status" className="status" role="status" hidden />

        <div className="layout">
          <nav aria-label="Workspace">
            <p>CARE MANAGEMENT</p>
            <button type="button" data-page="templates">
              ℞ Built-in care templates
            </button>
            <button type="button" data-page="products">
              ▣ Product catalogue
            </button>

            <p>CLINICAL</p>
            {/* No data-page: the engine binds those and routes them itself,
                and this screen is React's, not the engine's. */}
            <button type="button" onClick={onApprovals}>
              ✓ Authorise held care
            </button>

            <div className="nav-foot">
              <button type="button" className="nav-signout" onClick={onSignOut}>
                ⏻ Log out
              </button>
            </div>
          </nav>

          {/* Filled by the engine once the care data is in place. Until then
              it carries the placeholder, or the reason nothing loaded. */}
          {ready || status.state !== "error" ? (
            <main id="main" dangerouslySetInnerHTML={{ __html: MAIN_PLACEHOLDER }} />
          ) : (
            <main id="main">
              <section className="hero">
                <p className="eyebrow">HAIRSNCARES</p>
                <h1>
                  The care data <em>did not load.</em>
                </h1>
                <p>{status.message}</p>
                <p className="hero-note">
                  The workspace has not been started, so nothing can be edited
                  or overwritten. Fix the problem above and reload.
                </p>
              </section>
            </main>
          )}
        </div>
      </div>

      {/* siblings of the shell, as in the original, so the fixed overlays
          are never affected by the shell's own overflow */}
      <div id="modal" />
      <div id="toast" className="toast" hidden role="status" />
      <input id="import-file" type="file" accept="application/json,.json" hidden />
    </>
  );
}
