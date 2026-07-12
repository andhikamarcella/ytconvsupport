const globalStore = globalThis.__ytconvSupportRateLimits || new Map();
globalThis.__ytconvSupportRateLimits = globalStore;

function cleanup(now = Date.now()) {
  if (globalStore.size < 500) return;
  for (const [key, value] of globalStore.entries()) {
    if ((value.expiresAt || 0) <= now) globalStore.delete(key);
  }
}

export function assertNotLocked(key) {
  cleanup();
  const item = globalStore.get(key);
  if (item?.lockedUntil && item.lockedUntil > Date.now()) return false;
  return true;
}

export function recordFailure(key, maxAttempts, windowMs) {
  const now = Date.now();
  const previous = globalStore.get(key);
  const withinWindow = previous && previous.expiresAt > now;
  const attempts = withinWindow ? Number(previous.attempts || 0) + 1 : 1;
  const lockedUntil = attempts >= maxAttempts ? now + windowMs : 0;
  globalStore.set(key, { attempts, lockedUntil, expiresAt: now + windowMs });
  return { attempts, lockedUntil };
}

export function clearFailures(key) {
  globalStore.delete(key);
}
