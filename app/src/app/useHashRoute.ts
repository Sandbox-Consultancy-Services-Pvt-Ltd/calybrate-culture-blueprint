import { useEffect, useState } from 'react';
import { resolveRoute, type ViewKey } from './routes';

/** Current view from `location.hash`, updated on `hashchange`. */
export function useHashRoute(isAdmin: boolean): ViewKey {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return resolveRoute(hash, isAdmin);
}
