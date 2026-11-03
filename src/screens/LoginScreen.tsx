import { useState, type SubmitEvent } from "react";
// the workspace stylesheet carries the shared tokens, type and control styles
import "../styles/admin.css";
import "../styles/login.css";

/* The sign-in screen: a two-panel split, brand on one side, the form on the
 * other. Email and password and nothing else — no sign-up and no reset,
 * because admin accounts are provisioned, not self-served.
 *
 * The form only collects. `useAdminAuth` does the work: Firebase checks the
 * password, then the API checks that the account has an Admin record. The
 * second step is the one that bites — a Firebase account made in the console
 * has no record, so the password is right and sign-in still fails. Whatever
 * reason comes back is shown verbatim rather than flattened into "sign-in
 * failed", because the two failures need different fixes.
 *
 * Palette, type and button treatment are taken from the workspace
 * stylesheet, so signing in and the workspace read as one product.
 */
export default function LoginScreen({
  onSignIn,
  notice,
}: {
  onSignIn: (email: string, password: string) => Promise<void>;
  /** A reason carried over from a failed session restore. */
  notice?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      // on success this screen unmounts, so `busy` is deliberately left set
      await onSignIn(email, password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign you in.");
      setBusy(false);
    }
  }

  // An error from this attempt outranks a notice left by a previous session.
  const message = error || notice || "";

  return (
    <div className="login">
      <section className="login-brand" aria-hidden="true">
        <div className="login-brand-top">
          <span className="brand">✚ HairsnCares</span>
          <span className="tag">TRICHOSCAN · CARE ATELIER</span>
        </div>

        <div className="login-brand-body">
          <p className="eyebrow">HAIRSNCARES</p>
          <h1>
            Care, <em>beautifully organised.</em>
          </h1>
          <p>
            The template library, the product catalogue and every care mapping
            behind the TrichoScan assessment — in one workspace.
          </p>
        </div>

        <ul className="login-points">
          <li>
            <strong>37</strong>
            <span>built-in care templates</span>
          </li>
          <li>
            <strong>℞</strong>
            <span>male and female pathways</span>
          </li>
          <li>
            <strong>▣</strong>
            <span>product catalogue and guidance</span>
          </li>
        </ul>
      </section>

      <section className="login-panel">
        <form className="login-form" onSubmit={submit} noValidate>
          <p className="eyebrow">ADMIN ACCESS</p>
          <h2>Sign in</h2>
          <p className="note">
            Use the HairsnCares admin account issued for this workspace.
          </p>

          <label htmlFor="login-email">
            Email address
            <input
              id="login-email"
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              placeholder="you@hairsncares.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              autoFocus
              required
            />
          </label>

          <label htmlFor="login-password">
            Password
            <span className="login-password">
              <input
                id="login-password"
                type={reveal ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                required
              />
              <button
                type="button"
                className="login-reveal"
                onClick={() => setReveal((on) => !on)}
                disabled={busy}
                aria-pressed={reveal}
              >
                {reveal ? "Hide" : "Show"}
              </button>
            </span>
          </label>

          {/* role=alert so the reason is announced, not just shown */}
          <p className="login-error" role="alert" hidden={!message}>
            {message}
          </p>

          <button type="submit" className="gold login-submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in to the workspace"}
          </button>

          <p className="login-foot">
            Care mappings are saved to the HairsnCares database. Closing the tab
            signs you out.
          </p>
        </form>
      </section>
    </div>
  );
}
