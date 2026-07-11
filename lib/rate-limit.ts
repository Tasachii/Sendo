// In-memory login throttle: per (email + IP) failed-attempt counter with
// exponential backoff and a temporary lockout. Mitigates credential stuffing /
// brute force on the Credentials provider (D10).
//
// ⚠️ PER-INSTANCE ONLY. The counter lives in this process's memory, so it does
// NOT span multiple app instances / serverless invocations. For a multi-instance
// deployment, back this with a shared store (Redis / a DB table) keyed the same way.
// For a single-instance MVP this is sufficient and has zero external dependencies.

export type AttemptRecord = {
  fails: number; // consecutive failures since the last success/reset
  firstFailAt: number; // epoch ms of the first failure in the current window
  lockedUntil: number; // epoch ms; 0 when not locked
};

export type RateLimitConfig = {
  maxAttempts: number; // failures allowed before a lockout kicks in
  lockoutMs: number; // base lockout duration (grows with backoff)
  windowMs: number; // idle window after which the counter resets
  maxLockoutMs: number; // cap on the exponential backoff
};

export const DEFAULT_CONFIG: RateLimitConfig = {
  maxAttempts: 5, // 5 strikes…
  lockoutMs: 15 * 60_000, // …then locked 15 min (base)
  windowMs: 15 * 60_000, // counter resets after 15 min of no attempts
  maxLockoutMs: 24 * 60 * 60_000, // never lock longer than 24 h
};

export type CheckResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

// One store instance per process. Exported factory so tests get a clean store.
export function createLoginThrottle(config: RateLimitConfig = DEFAULT_CONFIG) {
  const store = new Map<string, AttemptRecord>();

  function keyOf(email: string, ip: string): string {
    return `${email.toLowerCase().trim()}|${ip}`;
  }

  /** True when the key is currently locked out. Returns remaining lock time. */
  function check(email: string, ip: string, now: number = Date.now()): CheckResult {
    const rec = store.get(keyOf(email, ip));
    if (!rec) return { allowed: true };
    // a stale window (no activity for windowMs) self-heals: treat as fresh.
    if (rec.lockedUntil === 0 && now - rec.firstFailAt > config.windowMs) {
      store.delete(keyOf(email, ip));
      return { allowed: true };
    }
    if (rec.lockedUntil > now) {
      return { allowed: false, retryAfterMs: rec.lockedUntil - now };
    }
    return { allowed: true };
  }

  /**
   * Record a failed attempt. After `maxAttempts` failures the key locks for
   * `lockoutMs`, doubling on each subsequent lockout up to `maxLockoutMs`.
   */
  function recordFailure(email: string, ip: string, now: number = Date.now()): CheckResult {
    const key = keyOf(email, ip);
    let rec = store.get(key);
    // start (or restart) the window if there's no record or it has gone stale.
    if (!rec || (rec.lockedUntil === 0 && now - rec.firstFailAt > config.windowMs)) {
      rec = { fails: 0, firstFailAt: now, lockedUntil: 0 };
    }
    rec.fails += 1;

    if (rec.fails >= config.maxAttempts) {
      // exponential backoff: base × 2^(extraFailures past the threshold), capped.
      const overshoot = rec.fails - config.maxAttempts;
      const backoff = Math.min(config.lockoutMs * 2 ** overshoot, config.maxLockoutMs);
      rec.lockedUntil = now + backoff;
    }
    store.set(key, rec);

    return rec.lockedUntil > now
      ? { allowed: false, retryAfterMs: rec.lockedUntil - now }
      : { allowed: true };
  }

  /** Clear the counter for a key — call on a successful login. */
  function recordSuccess(email: string, ip: string): void {
    store.delete(keyOf(email, ip));
  }

  /** Test/maintenance helper: current failure count for a key. */
  function failureCount(email: string, ip: string): number {
    return store.get(keyOf(email, ip))?.fails ?? 0;
  }

  return { check, recordFailure, recordSuccess, failureCount };
}

// Process-wide singleton used by lib/auth.ts.
export const loginThrottle = createLoginThrottle();

export function createFixedWindowThrottle(maxAttempts: number, windowMs: number) {
  const store = new Map<string, { count: number; resetAt: number }>();

  function checkAndRecord(key: string, now: number = Date.now()): CheckResult {
    const normalized = key.toLowerCase().trim();
    const current = store.get(normalized);
    const record = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;
    if (record.count >= maxAttempts) {
      return { allowed: false, retryAfterMs: record.resetAt - now };
    }
    record.count += 1;
    store.set(normalized, record);
    return { allowed: true };
  }

  return { checkAndRecord };
}

// Per-instance guard for the current SQLite/single-instance deployment. Production
// multi-instance deployments must replace this with the same key in a shared store.
export const registrationIdentityThrottle = createFixedWindowThrottle(3, 15 * 60_000);
export const registrationIpThrottle = createFixedWindowThrottle(5, 15 * 60_000);
