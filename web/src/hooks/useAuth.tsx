import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  type User,
} from 'firebase/auth';
import { auth } from '../lib/firebase-crm';

interface AuthState {
  user: User | null;
  /** Mirrors the `admin` custom claim minted by scripts/grant-admin.mjs. */
  isAdmin: boolean;
  loading: boolean;
  /** Set when auth state could not be resolved at all — see RequireAdmin. */
  error: string | null;
  /** Re-runs the claim check after a failure, without a full page reload. */
  retry: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Firebase error codes are not something to put in front of a person, so the
 * ones we can actually expect get a plain-English message. Anything else falls
 * through to the SDK's own text, which is more use than "something went wrong"
 * when there is one operator and he is also the person debugging it.
 */
function describeAuthError(cause: unknown): string {
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? String((cause as { code: unknown }).code)
      : '';

  switch (code) {
    case 'auth/network-request-failed':
      return "Couldn't reach the authentication service. Check your connection and try again.";
    case 'auth/user-token-expired':
    case 'auth/user-disabled':
    case 'auth/user-not-found':
      return 'This session is no longer valid. Sign in again.';
    default:
      return cause instanceof Error ? cause.message : 'Your access could not be verified.';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const readClaims = useCallback(async (nextUser: User | null) => {
    setError(null);

    try {
      if (nextUser) {
        // Force-refresh so a claim granted while signed in takes effect without
        // making Chris sign out and back in.
        const token = await nextUser.getIdTokenResult(true);
        setIsAdmin(token.claims.admin === true);
      } else {
        setIsAdmin(false);
      }
    } catch (cause) {
      // The refresh is a network call, so it can fail on a blip, a revoked
      // token or bad config. Surface it and carry on — the `finally` below is
      // what stops a throw here stranding the CRM on its loading screen.
      setIsAdmin(false);
      setError(describeAuthError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    return onAuthStateChanged(
      auth,
      (nextUser) => {
        setUser(nextUser);
        void readClaims(nextUser);
      },
      (cause) => {
        // The listener itself failed, so the success path above will never
        // run. Without this the spinner spins for ever.
        setUser(null);
        setIsAdmin(false);
        setError(describeAuthError(cause));
        setLoading(false);
      },
    );
  }, [readClaims]);

  const retry = useCallback(() => {
    setLoading(true);
    void readClaims(auth.currentUser);
  }, [readClaims]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      isAdmin,
      loading,
      error,
      retry,
      signIn: async (email, password) => {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      },
      signOut: async () => {
        await firebaseSignOut(auth);
      },
      resetPassword: async (email) => {
        await sendPasswordResetEmail(auth, email.trim());
      },
    }),
    [user, isAdmin, loading, error, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
