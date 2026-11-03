import { useEffect, useRef, useState } from "react";
import {
  fetchCareConfig,
  fetchCatalogue,
  saveCareConfig,
  type CareConfig,
} from "../api/careWorkspace";

/* Puts the carried-over workspace on the database without rewriting it.
 *
 * The workspace keeps everything in two browser keys and has exactly two
 * functions that touch them — `load()` at startup and `save()` on every
 * change. It knows nothing about an API, and teaching it would mean making a
 * synchronous application asynchronous throughout: the surest way to break
 * the mapping validation and the revision-conflict checks, which are the one
 * thing that must not drift.
 *
 * So the keys become a cache instead.
 *
 *   down  this hook fills both keys before the engine boots, so `load()`
 *         finds server data exactly where it expects browser data;
 *   up    `setItem` is wrapped, so when `save()` writes the config this hook
 *         sees it and sends it on.
 *
 * The engine is untouched. It still believes it is talking to localStorage.
 *
 * Only the config travels upward. The catalogue is the shop's, read-only
 * here, and the workspace's own `save()` writes it back unchanged.
 */

const CONFIG_KEY = "hnc.care-template-products.v1";
const CATALOGUE_KEY = "hnc.offline-catalogue.v2";

/** Long enough to collect a burst of edits, short enough to feel immediate. */
const SAVE_DEBOUNCE_MS = 800;

export type SyncStatus =
  | { state: "loading" }
  | { state: "ready"; templates: number; products: number }
  | { state: "saving" }
  | { state: "saved"; changed: number; at: number }
  | { state: "error"; message: string };

export function useCareSync(enabled: boolean) {
  const [status, setStatus] = useState<SyncStatus>({ state: "loading" });
  /** The engine may not be started until its data is in place. */
  const [hydrated, setHydrated] = useState(false);

  const timer = useRef<number | null>(null);
  const pending = useRef<string | null>(null);
  const inFlight = useRef(false);
  const restore = useRef<(() => void) | null>(null);

  /* Nothing here is memoised, and nothing needs to be: every one of these
     closes over refs and `setStatus`, all of which are stable. The one place
     identity would have mattered — the effect that wraps `setItem` — reads
     through `scheduleRef` instead, so it can depend on `enabled` alone. That
     matters more than it looks: an effect that re-ran would unwrap and
     re-wrap `setItem`, and an unwrap landing while another wrap is live
     restores the wrong function, after which a save is never seen again. */

  const push = async () => {
    const raw = pending.current;
    pending.current = null;
    if (!raw || inFlight.current) return;

    let config: CareConfig;
    try {
      config = JSON.parse(raw) as CareConfig;
    } catch {
      setStatus({ state: "error", message: "The workspace saved something unreadable." });
      return;
    }

    inFlight.current = true;
    setStatus({ state: "saving" });
    try {
      const result = await saveCareConfig(config);
      /* Take the server's copy back. It carries the revision numbers the
         database assigned, and the workspace compares revisions to decide
         whether someone else has saved since — left stale, it would refuse
         the next save with "Care settings changed elsewhere". */
      writeThrough(CONFIG_KEY, JSON.stringify(result.config));
      setStatus({ state: "saved", changed: result.changed.length, at: Date.now() });
    } catch (e) {
      setStatus({
        state: "error",
        message: e instanceof Error ? e.message : "Could not save to the server.",
      });
    } finally {
      inFlight.current = false;
      // An edit that arrived mid-request still has to go.
      if (pending.current) void push();
    }
  };

  const schedule = (raw: string) => {
    pending.current = raw;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void push(), SAVE_DEBOUNCE_MS);
  };

  const scheduleRef = useRef(schedule);
  // Assigned in an effect, not during render: a ref written while rendering is
  // a React rule violation, and this one is only ever read from the wrap.
  // Declared before the wrap effect so it is set first on mount.
  useEffect(() => {
    scheduleRef.current = schedule;
  });

  /* ── down ─────────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      try {
        setStatus({ state: "loading" });
        const [config, catalogue] = await Promise.all([fetchCareConfig(), fetchCatalogue()]);
        if (cancelled) return;

        writeThrough(CONFIG_KEY, JSON.stringify(config));
        writeThrough(CATALOGUE_KEY, JSON.stringify(catalogue));

        setStatus({
          state: "ready",
          templates: Object.keys(config.templates || {}).length,
          products: catalogue.length,
        });
        setHydrated(true);
      } catch (e) {
        if (cancelled) return;
        setStatus({
          state: "error",
          message: e instanceof Error ? e.message : "Could not load the care data.",
        });
        /* Deliberately not hydrated. Booting the workspace now would show the
           37 shipped templates with no products and let someone edit them,
           and the first save would overwrite the server with that. An error
           the person can act on is the safer outcome. */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  /* ── the wrap ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!enabled) return;

    const original = window.localStorage.setItem.bind(window.localStorage);
    restore.current = () => {
      window.localStorage.setItem = original;
    };

    window.localStorage.setItem = function patched(key: string, value: string) {
      original(key, value);
      // Only the config travels upward, and only when it came from the engine
      // rather than from this hook writing the server's answer back.
      if (key === CONFIG_KEY && !writingThrough) scheduleRef.current(value);
    };

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      restore.current?.();
      restore.current = null;
    };
  }, [enabled]);

  /** Push whatever is waiting, now — used before signing out. */
  const flush = async () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (pending.current) await push();
  };

  return { status, hydrated, flush };
}

/* ── writing without being heard ─────────────────────────────────────────
   This hook writes to the same key the engine does, and must not treat its
   own writes as edits to send back. A flag rather than a comparison: the
   server's copy differs from what was sent (revisions move), so comparing
   would not tell the two apart. */
let writingThrough = false;

function writeThrough(key: string, value: string) {
  writingThrough = true;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* Private mode or blocked storage. The engine falls back to its shipped
       defaults, which the status line reports as an error anyway. */
  } finally {
    writingThrough = false;
  }
}
