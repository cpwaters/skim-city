import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Logo } from '../../components/Logo';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { Notice, Spinner } from '../../components/ui/States';
import { useAuth } from '../../hooks/useAuth';

export function LoginPage() {
  const { user, isAdmin, loading, signIn, resetPassword } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="min-h-dvh grid place-items-center bg-noir-900">
        <Spinner />
      </div>
    );
  }

  if (user && isAdmin) {
    const from = (location.state as { from?: string } | null)?.from ?? '/app';
    return <Navigate to={from} replace />;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await signIn(email, password);
    } catch {
      // Deliberately vague: distinguishing "no such user" from "wrong password"
      // tells an attacker which emails have accounts.
      setError('That email and password combination was not recognised.');
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    if (!email.trim()) {
      setError('Enter your email address first, then tap reset.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await resetPassword(email);
    } catch {
      // Ignored on purpose — see the notice below.
    } finally {
      setBusy(false);
      setNotice('If that address has an account, a reset link is on its way.');
    }
  }

  return (
    <div className="min-h-dvh grid place-items-center bg-noir-900 spotlight hatch px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex justify-center">
          <Logo size="md" to="/" />
        </div>

        <div className="bg-noir-800 border border-noir-700 rounded-[3px] p-7">
          <h1 className="display text-lg text-bone mb-1">Staff sign in</h1>
          <p className="text-xs text-smoke mb-6">Jobs, quotes, invoices and payments.</p>

          <form onSubmit={submit} className="space-y-4" noValidate>
            {error && <Notice tone="error">{error}</Notice>}
            {notice && <Notice tone="info">{notice}</Notice>}

            <Input
              label="Email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              label="Password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />

            <Button type="submit" full loading={busy}>
              Sign in
            </Button>
          </form>

          <button
            type="button"
            onClick={() => void forgotPassword()}
            disabled={busy}
            className="mt-4 text-xs text-smoke hover:text-city-500 transition-colors cursor-pointer"
          >
            Forgotten your password?
          </button>
        </div>
      </div>
    </div>
  );
}
