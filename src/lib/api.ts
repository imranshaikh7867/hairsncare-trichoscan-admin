import { firebaseAuth } from "./firebase";

/* The one way this panel talks to the API.
 *
 * Every request carries a fresh Firebase ID token. "Fresh" matters: tokens
 * expire after an hour, and `getIdToken()` renews one that is close to
 * expiring, so a workspace left open over lunch still saves.
 */
const BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export const apiConfigured = Boolean(BASE);

/** The error the API actually sent, rather than "Request failed". */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** The `message` an error body carries, if it carries one at all. */
function messageIn(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const { message } = payload as { message?: unknown };
  return typeof message === "string" && message ? message : null;
}

async function idToken(): Promise<string> {
  const user = firebaseAuth().currentUser;
  if (!user) throw new ApiError("You are not signed in.", 401);
  return user.getIdToken();
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Some calls are made before a sign-in has settled. */
  anonymous?: boolean;
};

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!apiConfigured) {
    throw new ApiError(
      "The API address is not set. Add VITE_API_BASE_URL to .env.local.",
      0
    );
  }

  const { method = "GET", body, anonymous = false } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (!anonymous) headers.Authorization = `Bearer ${await idToken()}`;

  let response: Response;
  try {
    response = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    /* A request the browser refused to send — offline, CORS, or the API
       unreachable — arrives with no response at all and the bare text
       "Failed to fetch", which tells nobody anything. */
    throw new ApiError(
      "Could not reach the API. Check your connection, then try again.",
      0
    );
  }

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError(
      messageIn(payload) ?? `The API returned HTTP ${response.status}.`,
      response.status
    );
  }

  // The API wraps everything as { success, statusCode, data, message }.
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}
