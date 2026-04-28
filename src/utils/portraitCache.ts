import { useSyncExternalStore } from 'react';

let _version = 0;
const _listeners = new Set<() => void>();

function _subscribe(cb: () => void) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

function _getSnapshot() {
  return _version;
}

/**
 * Global portrait cache-buster version.
 *
 * Use-case: user overwrites a file under `/api/assets/...` with the same URL.
 * Browser cache won't notice; bumping this version forces `<img src>` refresh.
 */
export function bumpPortraitCacheVersion() {
  _version += 1;
  for (const cb of _listeners) cb();
}

export function usePortraitCacheVersion() {
  return useSyncExternalStore(_subscribe, _getSnapshot, _getSnapshot);
}

