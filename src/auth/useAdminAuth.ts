import { useCallback, useEffect, useRef, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { authErrorMessage, firebaseAuth, firebaseConfigured } from "../lib/firebase";
import { loadProfile, type AdminProfile } from "../api/careWorkspace";

/* Signing in, in two steps that both have to pass.
 *
 *   1. Firebase checks the email and password.
 *   2. The API looks the resulting uid up in the Admin collection.
 *
 * Step 2 is the one that surprises people. A Firebase account created in the
 * console has no Admin record, so step 1 succeeds and step 2 answers 403 —
 * the password was right and the person still cannot get in. When that
 * happens the Firebase session is signed out again, so the panel never sits
 * in a half-authenticated state, and the API's own wording is shown rather
 * than a generic failure.
 */

export type AuthState = {
  /** null until the first Firebase check has settled. */
  profile: AdminProfile | null;
  checking: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  dismissError: () => void;
};

export function useAdminAuth(): AuthState {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [checking, setChecking] = useState(firebaseConfigured);
  const [error, setError] = useState<string | null>(
    firebaseConfigured
      ? null
      : "Firebase is not configured. Copy .env.example to .env.local and fill in the VITE_FIREBASE_* values."
  );

  // Signing in drives the profile itself; this guard stops the auth listener
  // fetching it a second time for the same sign-in.
  const claiming = useRef(false);

  useEffect(() => {
    if (!firebaseConfigured) return;

    const auth = firebaseAuth();
    const stop = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setProfile(null);
        setChecking(false);
        return;
      }
      if (claiming.current) return; // signIn is already loading the profile
      try {
        setProfile(await loadProfile());
      } catch (e) {
        // A restored Firebase session whose Admin record has since gone, or
        // an API that cannot be reached. Either way this is not a workspace.
        await firebaseSignOut(auth).catch(() => {});
        setProfile(null);
        setError(e instanceof Error ? e.message : "Could not load your admin profile.");
      } finally {
        setChecking(false);
      }
    });

    return stop;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const auth = firebaseAuth();
    setError(null);
    claiming.current = true;
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setProfile(await loadProfile());
    } catch (e) {
      // Do not leave a Firebase session behind for an account the API will
      // not accept — the next reload would land in a workspace with no data.
      await firebaseSignOut(auth).catch(() => {});
      setProfile(null);
      throw new Error(authErrorMessage(e));
    } finally {
      claiming.current = false;
      setChecking(false);
    }
  }, []);

  const signOut = useCallback(() => {
    const auth = firebaseConfigured ? firebaseAuth() : null;
    const done = () => {
      /* Reload rather than re-render. The workspace is driven by the
         carried-over engine, which takes ownership of the document and
         registers listeners at startup; it was never written to initialise
         twice. A reload is the one way to guarantee the next sign-in gets a
         clean workspace instead of a half-torn-down one. It also clears the
         care config out of browser storage along with everything else. */
      location.reload();
    };
    if (auth) firebaseSignOut(auth).then(done).catch(done);
    else done();
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  return { profile, checking, error, signIn, signOut, dismissError };
}
