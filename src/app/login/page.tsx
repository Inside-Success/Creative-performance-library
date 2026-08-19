import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { isAllowedEmail } from "@/lib/auth-access";

const authErrorMessages: Record<string, string> = {
  Configuration:
    "Google sign-in could not start because the server cannot reach Google's OAuth service or the OAuth settings need attention.",
  AccessDenied:
    "This Google account is not allowed to access the CPL. Use a verified @insidesuccess.com account.",
  OAuthCallback:
    "Google returned to the app, but the sign-in callback could not be completed.",
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const params = searchParams ? await searchParams : {};
  const error = firstParam(params.error);
  const errorMessage = error ? authErrorMessages[error] ?? "Google sign-in failed." : null;

  if (isAllowedEmail(session?.user?.email)) {
    redirect("/");
  }

  async function signInWithGoogle() {
    "use server";
    await signIn("google", { redirectTo: "/" });
  }

  return (
    <main className="page login-page">
      <section className="login-shell">
        <div className="login-card">
          <div className="brand">
            <div className="logo">CP</div>
            <div>
              <p className="eyebrow">Inside Success TV</p>
              <h1>Creative Performance Library</h1>
            </div>
          </div>

          <p className="subtitle">
            Company-restricted access for the media buying team. Sign in with
            your Inside Success Google Workspace account.
          </p>

          <form className="login-actions" action={signInWithGoogle}>
            <button className="google-button" type="submit">
              <span className="google-mark">G</span>
              Continue with Google Workspace
            </button>
          </form>

          {errorMessage ? <div className="login-error">{errorMessage}</div> : null}

          <div className="lock-note">
            <strong>Access rule:</strong> only verified users with an
            @insidesuccess.com Google account can enter the CPL.
          </div>
        </div>

        <aside className="login-side panel">
          <h2>Protected workspace access</h2>
          <ul>
            <li>Google Workspace SSO for Inside Success users.</li>
            <li>Server-side email verification before dashboard access.</li>
            <li>Server-side-only Meta token handling.</li>
            <li>Private sync route for scheduled data refresh.</li>
          </ul>
        </aside>
      </section>
    </main>
  );
}
