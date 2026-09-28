import { useSyncExternalStore } from 'react';

const query = window.matchMedia('(max-width: 1000px)');
const subscribe = (notify: () => void) => {
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};

export function useCompactLayout() {
  return useSyncExternalStore(subscribe, () => query.matches);
}
