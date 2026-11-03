/// <reference types="vite/client" />

/* Build-time configuration.
 *
 * The Firebase values are not secrets — a Firebase web config ships inside
 * every client bundle by design, and access is controlled by the backend's
 * token check and the Admin collection, not by hiding the key. There is no
 * admin password here any more: Firebase holds it.
 */
interface ImportMetaEnv {
  /** Where the HairsnCares API lives, including /api/v1. */
  readonly VITE_API_BASE_URL?: string;

  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
