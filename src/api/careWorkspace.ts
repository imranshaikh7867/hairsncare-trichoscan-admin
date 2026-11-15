import { api } from "../lib/api";

/* The endpoints behind the care workspace.
 *
 * Deliberately thin. The carried-over workspace keeps its state in two
 * browser keys and knows nothing about an API, so the panel's job is to fill
 * those keys before it boots and send the first one back when it saves —
 * nothing more. The shapes here are the workspace's own, not the database's.
 */

/** The care config, `hnc.care-template-products/1`. */
export type CareConfig = {
  schema: "hnc.care-template-products/1";
  version: number;
  templates: Record<string, unknown>;
};

/** One product, in the shape the workspace's catalogue screen renders. */
export type WorkspaceProduct = {
  id: string;
  sku: string;
  status: string;
  data: Record<string, unknown>;
};

export type AdminProfile = {
  _id: string;
  email: string;
  name: string;
  role: "admin" | "super_admin";
  status: "active" | "suspended" | "invited";
};

const BASE = "/admin/hnc-care-templates";

/** Who is signed in, and may they be here at all.
 *
 * This is the handshake every panel does after Firebase sign-in. It answers
 * 403 when the Firebase account has no Admin record, which is the single most
 * likely reason a correct password still will not let someone in. */
export const loadProfile = () =>
  api<AdminProfile>("/admin/admins/me/sync", { method: "POST" });

/* Which stored state the copy in this browser was taken from.
 *
 * The workspace posts back all 37 templates every time it saves, so whatever
 * it uploads replaces what is on the server. That is only safe while the copy
 * it holds is current. It was not: one person adding a female pathway and
 * another saving a page opened beforehand meant the second upload quietly
 * erased the first, and nobody could see it had happened.
 *
 * The server hands this token out with the config and refuses a save that
 * does not carry the matching one. Kept here rather than in the config
 * itself, because the config round-trips through browser storage and the
 * workspace would drop an unfamiliar key.
 */
const STATE_HEADER = "X-Care-State";
let careState: string | null = null;

/** Forget the token — a failed load must not leave a stale one behind. */
export const resetCareState = () => {
  careState = null;
};

export const fetchCareConfig = () =>
  api<CareConfig>(`${BASE}/config`, {
    onResponse: (res) => {
      careState = res.headers.get(STATE_HEADER) ?? null;
    },
  });

export const saveCareConfig = (config: CareConfig) =>
  api<{ changed: string[]; ignored: string[]; config: CareConfig; token?: string }>(
    `${BASE}/config`,
    {
      method: "PUT",
      body: { config },
      headers: careState ? { [STATE_HEADER]: careState } : {},
      onResponse: (res) => {
        // Moves on every successful save, so the next one is not stale. A
        // conflict response carries the current token too, but taking it
        // would defeat the check — only a reload may do that.
        if (res.ok) careState = res.headers.get(STATE_HEADER) ?? careState;
      },
    }
  );

export const fetchCatalogue = () =>
  api<WorkspaceProduct[]>(`${BASE}/catalogue?limit=1000`);
