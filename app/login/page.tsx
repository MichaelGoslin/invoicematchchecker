import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  constantTimeEqual,
  gateMode,
  safeNextPath,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sessionToken,
} from "@/lib/auth/session";

async function signIn(formData: FormData) {
  "use server";
  const next = safeNextPath(String(formData.get("next") ?? "/"));
  const passcode = process.env.APP_PASSCODE;
  if (!passcode) redirect(next);

  const entered = String(formData.get("passcode") ?? "");
  if (!constantTimeEqual(entered, passcode)) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  (await cookies()).set(SESSION_COOKIE, await sessionToken(passcode), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  redirect(next);
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  if (gateMode() === "open-dev") redirect(safeNextPath(next));

  return (
    <main className="narrow">
      <h1>Invoice Match Checker</h1>
      <p className="muted">Enter the team passcode to continue.</p>
      <form action={signIn} className="stack">
        <input type="hidden" name="next" value={safeNextPath(next)} />
        <label>
          Passcode
          <input name="passcode" type="password" autoComplete="current-password" required autoFocus />
        </label>
        {error ? <p className="error" role="alert">That passcode didn't match.</p> : null}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
