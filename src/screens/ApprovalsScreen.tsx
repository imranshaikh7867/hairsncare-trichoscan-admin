import { useCallback, useEffect, useState } from "react";
import {
  getReview,
  issue,
  listQueue,
  revoke,
  type QueueRow,
  type ReviewDetail,
  type RxItemInput,
} from "../api/careApproval";
import "../styles/approvals.css";

/* Clinical authorisations.
 *
 * The queue is every assessment with at least one product the engine has
 * held. A held product still appears on the patient's report and can still be
 * bought — what is withheld is the dose and the directions, and that is what
 * an authorisation here supplies.
 *
 * Three things this screen deliberately does not do:
 *
 *   · It never offers to authorise a product the engine cleared. Those need
 *     nothing, and putting them here would bury the ones that do.
 *   · It will not accept a partial decision. Every held product has to be
 *     filled in, because a report showing a dose for two of three withheld
 *     products reads as though the third were fine.
 *   · It shows the engine's reasons verbatim and offers no way to dismiss
 *     them. The decision is the clinician's; the reasons are the evidence.
 */

const ANSWER_LABELS: Record<string, string> = {
  under18: "Under 18",
  between18_20: "18–20",
  between20_30: "20–30",
  between30_40: "30–40",
  between40_50: "40–50",
  between50_60: "50–60",
  over60: "Over 60",
  not_applicable: "Not applicable",
  none: "None",
  no: "No",
  yes: "Yes",
  male: "Male",
  female: "Female",
  not_sure: "Not sure",
  prefer_not: "Prefers not to say",
};

const label = (v: string) => (v ? (ANSWER_LABELS[v] ?? v.replace(/_/g, " ")) : "—");

const money = (p?: number, c?: string) =>
  typeof p === "number" && p > 0 ? `${c === "INR" ? "₹" : ""}${p.toLocaleString("en-IN")}` : "—";

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

type Draft = Record<string, { dose: string; directions: string; review: string }>;

/** The form starts from whatever is already authorised, not from blank. */
function draftFrom(detail: ReviewDetail): Draft {
  const out: Draft = {};
  for (const p of detail.products) {
    if (!p.held) continue;
    out[p.mappingId] = {
      dose: p.authorised?.dose ?? "",
      directions: p.authorised?.directions ?? "",
      review: p.authorised?.review ?? "",
    };
  }
  return out;
}

export default function ApprovalsScreen({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"pending" | "issued">("pending");
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [queueError, setQueueError] = useState("");

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [draft, setDraft] = useState<Draft>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState("");

  const loadQueue = useCallback(async (which: "pending" | "issued") => {
    setLoadingQueue(true);
    setQueueError("");
    try {
      setRows(await listQueue(which));
    } catch (e) {
      setQueueError(e instanceof Error ? e.message : "The queue could not be loaded.");
      setRows([]);
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue(tab);
  }, [tab, loadQueue]);

  const openRow = useCallback(async (sessionId: string) => {
    setOpenId(sessionId);
    setLoadingDetail(true);
    setDetailError("");
    setSaveError("");
    setSaved("");
    try {
      const d = await getReview(sessionId);
      setDetail(d);
      setDraft(draftFrom(d));
      setNote(d.prescription.note || "");
    } catch (e) {
      setDetail(null);
      setDetailError(e instanceof Error ? e.message : "That assessment could not be loaded.");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const edit = (id: string, field: keyof Draft[string], value: string) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], [field]: value } }));

  const held = detail ? detail.products.filter((p) => p.held) : [];
  const cleared = detail ? detail.products.filter((p) => !p.held) : [];

  /* The button is only enabled for a complete decision. The API refuses a
     partial one as well — this is so the refusal is not a surprise. */
  const complete =
    held.length > 0 &&
    held.every((p) => {
      const d = draft[p.mappingId];
      return d && d.dose.trim() && d.directions.trim();
    });

  const authorise = async () => {
    if (!detail || busy) return;
    setBusy(true);
    setSaveError("");
    setSaved("");
    try {
      const items: RxItemInput[] = held.map((p) => ({
        mappingId: p.mappingId,
        dose: draft[p.mappingId].dose.trim(),
        directions: draft[p.mappingId].directions.trim(),
        review: draft[p.mappingId].review.trim(),
      }));
      const rx = await issue(detail.sessionId, items, note);
      /* Re-read first, then say so. openRow() clears the message as part of
         loading a row, so setting it before the reload made the confirmation
         appear and vanish in the same breath. */
      await openRow(detail.sessionId);
      setSaved(`Authorised · reference ${rx.reference}`);
      await loadQueue(tab);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "That authorisation could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    if (!detail || busy) return;
    const reason = window.prompt(
      "Why is this authorisation being withdrawn?\n\nThe patient's report stops showing the doses immediately."
    );
    if (reason === null) return;
    setBusy(true);
    setSaveError("");
    setSaved("");
    try {
      await revoke(detail.sessionId, reason);
      await openRow(detail.sessionId);
      setSaved("Authorisation withdrawn.");
      await loadQueue(tab);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "That could not be withdrawn.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ap">
      <header className="ap-top">
        <div>
          <p className="ap-eyebrow">TRICHOSCAN · CLINICAL AUTHORISATION</p>
          <h1 className="ap-title">
            Held care, <em>awaiting a decision.</em>
          </h1>
        </div>
        <button type="button" className="ap-close" onClick={onClose}>
          ← Back to care templates
        </button>
      </header>

      <p className="ap-lead">
        The engine holds a mapped product when something about the patient or
        the product is unresolved. The patient still sees it and can still buy
        it — what is withheld is the dose and the directions. Supplying those
        is what an authorisation here does. Products the rules already cleared
        are not listed: they need nothing.
      </p>

      <div className="ap-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "pending"}
          className={tab === "pending" ? "ap-tab ap-tab-on" : "ap-tab"}
          onClick={() => setTab("pending")}
        >
          Waiting for a decision
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "issued"}
          className={tab === "issued" ? "ap-tab ap-tab-on" : "ap-tab"}
          onClick={() => setTab("issued")}
        >
          Already authorised
        </button>
      </div>

      <div className="ap-split">
        {/* ── the queue ───────────────────────────────────────────────── */}
        <section className="ap-queue" aria-label="Assessments">
          {loadingQueue ? (
            <p className="ap-muted">Reading the assessments…</p>
          ) : queueError ? (
            <p className="ap-error">{queueError}</p>
          ) : rows.length === 0 ? (
            <div className="ap-empty">
              <p className="ap-empty-mark" aria-hidden="true">
                ℞
              </p>
              <p className="ap-empty-title">
                {tab === "pending" ? "Nothing is waiting." : "Nothing authorised yet."}
              </p>
              <p className="ap-muted">
                {tab === "pending"
                  ? "Every mapped product on every recent assessment is cleared by the safety rules."
                  : "Authorisations will be listed here once they are given."}
              </p>
            </div>
          ) : (
            <ul className="ap-rows">
              {rows.map((r) => (
                <li key={r.sessionId}>
                  <button
                    type="button"
                    className={
                      openId === r.sessionId ? "ap-row ap-row-on" : "ap-row"
                    }
                    onClick={() => void openRow(r.sessionId)}
                  >
                    <span className="ap-row-head">
                      <strong>{r.leading ?? "Assessment"}</strong>
                      {r.blocked ? (
                        <em className="ap-chip ap-chip-stop">Examine first</em>
                      ) : null}
                      {r.reviewPriority === "urgent" ? (
                        <em className="ap-chip ap-chip-urgent">Urgent</em>
                      ) : null}
                    </span>
                    <span className="ap-row-meta">
                      {r.patient.name || r.patient.phone || "Not claimed yet"} ·{" "}
                      {when(r.assessedAt)} · template {r.templateId ?? "—"} ·{" "}
                      {r.pathway}
                    </span>
                    <span className="ap-row-meta">
                      {r.heldCount} of {r.productCount} held
                      {r.safetyFlags ? ` · ${r.safetyFlags} safety flag${r.safetyFlags === 1 ? "" : "s"}` : ""}
                      {r.prescriptionStatus === "issued" ? " · authorised" : ""}
                      {r.prescriptionStatus === "revoked" ? " · withdrawn" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── one assessment ──────────────────────────────────────────── */}
        <section className="ap-detail" aria-label="The decision">
          {!openId ? (
            <p className="ap-muted ap-detail-idle">
              Choose an assessment to see what is held and why.
            </p>
          ) : loadingDetail ? (
            <p className="ap-muted">Loading the assessment…</p>
          ) : detailError ? (
            <p className="ap-error">{detailError}</p>
          ) : detail ? (
            <>
              <h2 className="ap-h2">{detail.card.leading ?? "Assessment"}</h2>
              <p className="ap-muted">
                {detail.sessionId} · assessed {when(detail.assessedAt)} · template{" "}
                {detail.templateId ?? "—"} / {detail.pathway} · mapping revision{" "}
                {detail.revision}
              </p>

              {detail.blocked ? (
                <p className="ap-stop">
                  The engine has blocked treatment on this assessment: it wants
                  an examination before anything begins. Authorising still works
                  — you are the examination — but read the safety flags first.
                </p>
              ) : null}

              {/* What the holds are actually about. */}
              <h3 className="ap-h3">The patient</h3>
              <dl className="ap-facts">
                <div>
                  <dt>Age</dt>
                  <dd>{label(detail.clinical.ageGroup)}</dd>
                </div>
                <div>
                  <dt>Sex</dt>
                  <dd>{label(detail.clinical.clinicalSex)}</dd>
                </div>
                <div>
                  <dt>Pregnant</dt>
                  <dd>{label(detail.clinical.pregnancyStatus)}</dd>
                </div>
                <div>
                  <dt>Breastfeeding</dt>
                  <dd>{label(detail.clinical.breastfeeding)}</dd>
                </div>
                <div>
                  <dt>Planning pregnancy</dt>
                  <dd>{label(detail.clinical.pregnancyPlanning)}</dd>
                </div>
                <div>
                  <dt>Allergies</dt>
                  <dd>
                    {detail.clinical.allergies.length
                      ? detail.clinical.allergies.map(label).join(", ")
                      : "Not stated"}
                  </dd>
                </div>
                <div>
                  <dt>On a prescription</dt>
                  <dd>{label(detail.clinical.currentRx)}</dd>
                </div>
                <div>
                  <dt>Other medication</dt>
                  <dd>{label(detail.clinical.medications)}</dd>
                </div>
                <div>
                  <dt>Prior scalp diagnosis</dt>
                  <dd>{label(detail.clinical.priorScalpDiagnosis)}</dd>
                </div>
                <div>
                  <dt>Completeness</dt>
                  <dd>
                    {detail.card.answered} of {detail.card.applicable} ({detail.card.pct}%)
                  </dd>
                </div>
              </dl>

              {detail.clinical.safetyFlags.length ? (
                <ul className="ap-flags">
                  {detail.clinical.safetyFlags.map((f) => (
                    <li key={f.code} className={`ap-flag ap-flag-${f.severity}`}>
                      <strong>{f.severity}</strong> {f.message}
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* ── the decision ── */}
              <h3 className="ap-h3">
                Held products — {held.length} to decide
              </h3>

              {held.length === 0 ? (
                <p className="ap-muted">
                  Nothing on this assessment is held. Every mapped product is
                  cleared by the safety rules, so there is nothing to authorise.
                </p>
              ) : (
                <div className="ap-items">
                  {held.map((p) => (
                    <article className="ap-item" key={p.mappingId}>
                      <header>
                        <strong>{p.title}</strong>
                        <span className="ap-muted">
                          {p.prescriptionClass} ·{" "}
                          {money(p.commerce.price, p.commerce.currency)}
                          {p.commerce.variantLabel ? ` · ${p.commerce.variantLabel}` : ""}
                          {p.strength ? ` · catalogue strength ${p.strength}` : ""}
                        </span>
                      </header>

                      <ul className="ap-reasons">
                        {p.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>

                      <label>
                        Strength and dose
                        <input
                          value={draft[p.mappingId]?.dose ?? ""}
                          onChange={(e) => edit(p.mappingId, "dose", e.target.value)}
                          placeholder="e.g. 5% · 1 ml"
                        />
                      </label>
                      <label>
                        Route, frequency and protocol
                        <textarea
                          rows={2}
                          value={draft[p.mappingId]?.directions ?? ""}
                          onChange={(e) => edit(p.mappingId, "directions", e.target.value)}
                          placeholder="e.g. Apply to a dry scalp twice daily"
                        />
                      </label>
                      <label>
                        Duration and review
                        <input
                          value={draft[p.mappingId]?.review ?? ""}
                          onChange={(e) => edit(p.mappingId, "review", e.target.value)}
                          placeholder="e.g. 3 months, then review"
                        />
                      </label>
                    </article>
                  ))}

                  <label className="ap-note">
                    A note for the patient (optional)
                    <textarea
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Shown with the authorisation on their report."
                    />
                  </label>

                  {saveError ? <p className="ap-error">{saveError}</p> : null}
                  {saved ? <p className="ap-ok">{saved}</p> : null}

                  <div className="ap-actions">
                    <button
                      type="button"
                      className="ap-primary"
                      onClick={() => void authorise()}
                      disabled={busy || !complete}
                    >
                      {busy
                        ? "Saving…"
                        : detail.prescription.status === "issued"
                          ? "Re-issue the authorisation"
                          : `Authorise ${held.length} product${held.length === 1 ? "" : "s"}`}
                    </button>
                    {detail.prescription.status === "issued" ? (
                      <button
                        type="button"
                        className="ap-text"
                        onClick={() => void withdraw()}
                        disabled={busy}
                      >
                        Withdraw
                      </button>
                    ) : null}
                  </div>

                  {!complete && held.length > 0 ? (
                    <p className="ap-muted">
                      A dose and directions are needed for every held product
                      before this can be authorised.
                    </p>
                  ) : null}
                </div>
              )}

              {detail.prescription.status === "issued" ? (
                <p className="ap-issued">
                  Authorised · reference {detail.prescription.reference} ·{" "}
                  {when(detail.prescription.issuedAt)}
                  {detail.prescription.issuedBy?.email
                    ? ` · ${detail.prescription.issuedBy.email}`
                    : ""}
                </p>
              ) : null}
              {detail.prescription.status === "revoked" ? (
                <p className="ap-stop">
                  A previous authorisation ({detail.prescription.reference}) was
                  withdrawn. The patient's report shows no doses.
                </p>
              ) : null}

              {/* Context, not decisions. */}
              {cleared.length ? (
                <>
                  <h3 className="ap-h3">Cleared by the rules — no decision needed</h3>
                  <ul className="ap-cleared">
                    {cleared.map((p) => (
                      <li key={p.mappingId}>
                        <strong>{p.title}</strong>
                        <span className="ap-muted">
                          {" "}
                          {p.strength || "no strength set"} ·{" "}
                          {money(p.commerce.price, p.commerce.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {detail.treatments.length ? (
                <>
                  <h3 className="ap-h3">Clinic treatments on this template</h3>
                  <ul className="ap-cleared">
                    {detail.treatments.map((t) => (
                      <li key={t.title}>
                        <strong>{t.title}</strong>
                        <span className="ap-muted">
                          {" "}
                          {[t.strength, t.directions, t.duration].filter(Boolean).join(" · ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="ap-muted">
                    Performed in clinic rather than dispensed, so they are not
                    authorised here.
                  </p>
                </>
              ) : null}
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
