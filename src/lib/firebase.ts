import { initializeApp, getApp, getApps } from "firebase/app";
import {
  browserSessionPersistence,
  getAuth,
  setPersistence,
  signInWithCustomToken,
  type Auth,
} from "firebase/auth";

/* Firebase, the same project every HairsnCares panel signs in to.
 *
 * Firebase proves who someone is. It does not decide what they may do: the
 * API looks the signed-in uid up in the Admin collection and refuses anyone
 * who is not there, so a Firebase account on its own opens nothing.
 *
 * These values are not secrets. A Firebase web config ships inside every
 * client bundle by design; access is controlled by the backend's token check
 * and by Firebase's own rules, not by hiding the key.
 */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** Every config value the SDK needs before it can be initialised. */
export const firebaseConfigured = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId
);

let cached: Auth | null = null;

/** The Auth instance, created on first use. Throws if nothing is configured. */
export function firebaseAuth(): Auth {
  if (cached) return cached;
  if (!firebaseConfigured) {
    throw new Error(
      "Firebase is not configured. Copy .env.example to .env.local and fill in the VITE_FIREBASE_* values."
    );
  }
  const app = getApps().length ? getApp() : initializeApp(config);
  cached = getAuth(app);

  /* A way in for the end-to-end test, in development only.
   *
   * Signing in here is email and password, which an automated run cannot
   * supply without the password being written down somewhere. A custom token
   * minted by the Admin SDK proves the same uid without one, and the API still
   * checks that uid against the Admin collection — so this opens nothing that
   * a real sign-in would not.
   *
   * `import.meta.env.DEV` is replaced at build time, so this block is removed
   * from a production bundle rather than merely being unreachable in it. */
  if (import.meta.env.DEV) {
    (
      window as unknown as { __hncDevSignIn?: (t: string) => Promise<unknown> }
    ).__hncDevSignIn = (token: string) => signInWithCustomToken(cached!, token);
  }

  /* Session persistence, not local: a refresh keeps you in the workspace,
     closing the tab signs you out. This workspace holds client care mappings,
     so staying signed in indefinitely on a shared machine is the worse
     default. The promise is deliberately not awaited — persistence applies
     before any sign-in completes, and a failure here (private mode, blocked
     storage) must not stop someone signing in. */
  void setPersistence(cached, browserSessionPersistence).catch(() => {});

  return cached;
}

/** A Firebase error code turned into something worth showing a person. */
export function authErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  switch (code) {
    case "auth/invalid-email":
      return "That does not look like an email address.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact your super admin.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email or password is incorrect.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Could not reach Firebase. Check your connection and try again.";
    case "auth/operation-not-allowed":
      return "Email and password sign-in is switched off for this Firebase project.";
    default:
      break;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Sign-in failed. Please try again.";
}
