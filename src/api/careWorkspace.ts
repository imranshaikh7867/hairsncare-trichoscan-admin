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

export const fetchCareConfig = () => api<CareConfig>(`${BASE}/config`);

export const saveCareConfig = (config: CareConfig) =>
  api<{ changed: string[]; ignored: string[]; config: CareConfig }>(
    `${BASE}/config`,
    { method: "PUT", body: { config } }
  );

export const fetchCatalogue = () =>
  api<WorkspaceProduct[]>(`${BASE}/catalogue?limit=1000`);
