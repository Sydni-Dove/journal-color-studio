/** Online saving: sign in with a Dove Expressions account, see where projects are saved. */
import { useState } from "react";
import type { CloudStatus } from "../../app/useCloud";

export const cloudLabel = (status: CloudStatus) =>
  ({ "signed-out": "On this device only", syncing: "Saving online…", saved: "Saved online", offline: "Offline — on this device; goes online when you're back", error: "Couldn't save online — kept on this device" })[status];

export function CloudAccount({ email, status, error, onSignIn, onSignOut, onRetry }: { email: string | null; status: CloudStatus; error: string | null; onSignIn: (email: string, password: string) => Promise<void>; onSignOut: () => void; onRetry: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (email)
    return (
      <section className="cloud-account" aria-label="Online saving">
        <p>
          <strong>{cloudLabel(status)}</strong> · signed in as {email}
        </p>
        {status === "error" && error && <p className="hint">{error}</p>}
        <div className="cloud-account__actions">
          {(status === "error" || status === "offline") && <button type="button" className="btn" onClick={onRetry}>Try again</button>}
          <button type="button" className="btn btn--ghost" onClick={onSignOut}>Sign out</button>
        </div>
      </section>
    );
  return (
    <section className="cloud-account" aria-label="Online saving">
      <p>
        <strong>Your projects are saved on this device only.</strong> Sign in with your Dove Expressions account to save them online and open them anywhere.
      </p>
      {!open ? (
        <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>Sign in to save online</button>
      ) : (
        <form
          className="cloud-account__form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setProblem(null);
            try {
              await onSignIn(form.email, form.password);
              setOpen(false);
            } catch (err) {
              setProblem((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            <span className="field-label">Email</span>
            <input type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          {problem && <p className="hint cloud-account__problem" role="alert">{problem}</p>}
          <div className="cloud-account__actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
