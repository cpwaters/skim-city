import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query as buildQuery,
  type Query,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '../lib/firebase-crm';

interface Result<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

/**
 * Live collection subscription.
 *
 * The CRM is single-user and realtime is genuinely useful here: a payment
 * webhook landing while Chris has the invoice open updates the screen without
 * a refresh.
 *
 * `key` identifies the query. Callers rebuild the constraint array on every
 * render, so resubscribing on array identity would tear down and rebuild the
 * listener constantly; an explicit key is both cheaper and easier to reason
 * about than trying to serialise Firestore's constraint objects.
 */
export function useCollection<T>(
  path: string,
  constraints: QueryConstraint[] = [],
  key = '',
): Result<T[]> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const subscriptionKey = useMemo(() => `${path}|${key}`, [path, key]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const query: Query = buildQuery(collection(db, path), ...constraints);

    const unsubscribe = onSnapshot(
      query,
      (snapshot) => {
        setData(snapshot.docs.map((document) => ({ id: document.id, ...document.data() }) as T));
        setLoading(false);
      },
      (cause) => {
        setError(cause.message);
        setLoading(false);
      },
    );

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionKey]);

  return { data, loading, error };
}

export function useDocument<T>(path: string, id: string | undefined): Result<T | null> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      doc(db, path, id),
      (snapshot) => {
        setData(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as T) : null);
        setLoading(false);
      },
      (cause) => {
        setError(cause.message);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [path, id]);

  return { data, loading, error };
}
