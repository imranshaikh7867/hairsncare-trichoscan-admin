import { api } from "../lib/api";

/* Authorising care for one patient.
 *
 * A different job from the care workspace next door. That one decides which
 * products belong to a condition — a catalogue decision, made once, for
 * everybody. This one decides whether a particular person may be given a
 * particular product, and at what dose.
 *
 * The engine decides what needs deciding. It holds a mapped product whenever
 * anything about the patient or the product is unresolved, and the report then
 * prints "Individual directions withheld pending review." in place of a dose.
 * Nothing here second-guesses that: the queue is what the engine held, the
 * reasons are the engine's own words, and a product it cleared never appears.
 */

export interface QueueRow {
  sessionId: string;
  assessedAt: string;
  leading: string | null;
  templateId: string | null;
  pathway: string;
  reviewPriority: string | null;
  blocked: boolean;
  safetyFlags: number;
  heldCount: number;
  productCount: number;
  reasons: string[];
  prescriptionStatus: "unmapped" | "issued" | "revoked";
  patient: { name: string; phone: string; email: string };
  claimed: boolean;
}

export interface ReviewProduct {
  mappingId: string;
  title: string;
  strength: string;
  prescriptionClass: string;
  requiresRx: boolean;
  held: boolean;
  reasons: string[];
  commerce: {
    price?: number;
    mrp?: number;
    currency?: string;
    variantLabel?: string;
    availability?: string;
  };
  authorised: { dose: string; directions: string; review: string } | null;
}

export interface ReviewDetail {
  sessionId: string;
  card: {
    leading: string | null;
    evidenceStrength: string | null;
    reviewPriority: string | null;
    answered: number;
    applicable: number;
    pct: number;
    clinicalContext: string;
  };
  createdAt: string;
  assessedAt: string | null;
  blocked: boolean;
  note: string;
  templateId: string | null;
  pathway: string;
  revision: number;
  clinical: {
    ageGroup: string;
    clinicalSex: string;
    pregnancyStatus: string;
    breastfeeding: string;
    pregnancyPlanning: string;
    allergies: string[];
    currentRx: string;
    currentTopical: string;
    medications: string;
    priorScalpDiagnosis: string;
    safetyFlags: { code: string; severity: string; message: string }[];
    clinicianReview: { priority?: string; nextAction?: string } | null;
  };
  treatments: {
    title: string;
    strength: string;
    directions: string;
    duration: string;
  }[];
  products: ReviewProduct[];
  reviewable: string[];
  prescription: {
    status: "unmapped" | "issued" | "revoked";
    reference: string;
    issuedAt: string | null;
    issuedBy: { email?: string; name?: string } | null;
    note: string;
    items: {
      mappingId: string;
      title: string;
      dose: string;
      directions: string;
      review: string;
    }[];
  };
}

/** One authorised line, as the clinician filled it in. */
export interface RxItemInput {
  mappingId: string;
  dose: string;
  directions: string;
  review: string;
}

export const listQueue = (status: "pending" | "issued" = "pending") =>
  api<QueueRow[]>(`/admin/hnc-tricho-rx/queue?status=${status}`);

export const getReview = (sessionId: string) =>
  api<ReviewDetail>(`/admin/hnc-tricho-rx/${encodeURIComponent(sessionId)}`);

export const issue = (sessionId: string, items: RxItemInput[], note: string) =>
  api<ReviewDetail["prescription"]>(
    `/admin/hnc-tricho-rx/${encodeURIComponent(sessionId)}/prescription`,
    { method: "PUT", body: { items, note } }
  );

export const revoke = (sessionId: string, reason: string) =>
  api<ReviewDetail["prescription"]>(
    `/admin/hnc-tricho-rx/${encodeURIComponent(sessionId)}/prescription`,
    { method: "DELETE", body: { reason } }
  );
