import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ErrorState, Spinner } from '../ui/States';
import { Button } from '../ui/Button';

/**
 * Route guard for the CRM.
 *
 * This is convenience, not security — it decides what to render, nothing more.
 * The real enforcement is in firestore.rules and the assertAdmin() check on
 * every callable, both of which apply regardless of what the client does.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading, error, retry, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-dvh grid place-items-center bg-noir-900">
        <Spinner label="Checking access" />
      </div>
    );
  }

  // Checked before the redirect below: if auth failed outright there is no
  // user, and bouncing to the login page would hide the reason why.
  if (error) {
    return (
      <div className="min-h-dvh grid place-items-center bg-noir-900 px-6">
        <div className="max-w-md">
          <ErrorState message={error} retry={retry} />
          <div className="text-center">
            <Button variant="secondary" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/app/login" state={{ from: location.pathname }} replace />;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-dvh grid place-items-center bg-noir-900 px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 h-px w-12 bg-maroon-500" />
          <h1 className="display text-xl text-bone mb-3">No access</h1>
          <p className="text-sm text-smoke mb-6">
            You're signed in as {user.email}, but this account doesn't have CRM access.
            Run <code className="text-city-500">npm run grant-admin {user.email}</code> to grant it.
          </p>
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
