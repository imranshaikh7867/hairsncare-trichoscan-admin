import LoginScreen from "./screens/LoginScreen";
import WorkspaceScreen from "./screens/WorkspaceScreen";
import { useAdminAuth } from "./auth/useAdminAuth";
import "./styles/admin.css";
import "./styles/login.css";

/* The gate: sign-in first, the workspace once an admin profile is loaded.
 *
 * Three states, and the middle one matters. Firebase restores a session
 * asynchronously, so on a refresh there is a moment where nobody is signed in
 * yet and nobody has failed to sign in either. Rendering the login form in
 * that moment makes a signed-in admin see it flash on every reload.
 *
 * The workspace is only mounted once there is a profile, never merely hidden,
 * so the engine does not start — and no care data is fetched into the page —
 * until the API has confirmed the account.
 */
export default function App() {
  const { profile, checking, error, signIn } = useAdminAuth();

  if (checking) {
    return (
      <div className="boot">
        <span className="boot-mark" aria-hidden="true">
          ✚
        </span>
        <p>Checking your session…</p>
      </div>
    );
  }

  if (!profile) return <LoginScreen onSignIn={signIn} notice={error} />;

  return <WorkspaceScreen profile={profile} />;
}
