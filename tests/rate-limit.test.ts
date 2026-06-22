import { describe, it, expect } from "vitest";
import { createLoginThrottle, type RateLimitConfig } from "../lib/rate-limit";

// small, fast config so the test reads clearly: lock after 3 fails for 1000ms,
// window 5000ms, cap 8000ms.
const CFG: RateLimitConfig = { maxAttempts: 3, lockoutMs: 1000, windowMs: 5000, maxLockoutMs: 8000 };

const EMAIL = "user@test.co";
const IP = "203.0.113.7";

describe("loginThrottle — counts + lockout", () => {
  it("allows attempts below the threshold and is not locked", () => {
    const t = createLoginThrottle(CFG);
    expect(t.check(EMAIL, IP, 0).allowed).toBe(true);
    expect(t.recordFailure(EMAIL, IP, 0).allowed).toBe(true); // 1
    expect(t.recordFailure(EMAIL, IP, 1).allowed).toBe(true); // 2
    expect(t.failureCount(EMAIL, IP)).toBe(2);
    expect(t.check(EMAIL, IP, 2).allowed).toBe(true);
  });

  it("locks out once maxAttempts failures accrue", () => {
    const t = createLoginThrottle(CFG);
    t.recordFailure(EMAIL, IP, 0);
    t.recordFailure(EMAIL, IP, 0);
    const third = t.recordFailure(EMAIL, IP, 0); // hits the threshold (3)
    expect(third.allowed).toBe(false);
    if (!third.allowed) expect(third.retryAfterMs).toBe(1000);

    const c = t.check(EMAIL, IP, 500); // still inside the lock window
    expect(c.allowed).toBe(false);
    if (!c.allowed) expect(c.retryAfterMs).toBe(500);
  });

  it("unlocks after the lockout elapses", () => {
    const t = createLoginThrottle(CFG);
    for (let i = 0; i < 3; i++) t.recordFailure(EMAIL, IP, 0);
    expect(t.check(EMAIL, IP, 1000).allowed).toBe(true); // lockedUntil === now → not > now
    expect(t.check(EMAIL, IP, 1001).allowed).toBe(true);
  });

  it("applies exponential backoff on continued failures past the threshold", () => {
    const t = createLoginThrottle(CFG);
    for (let i = 0; i < 3; i++) t.recordFailure(EMAIL, IP, 0); // lock 1000ms (base)
    const fourth = t.recordFailure(EMAIL, IP, 0); // overshoot 1 → 1000 × 2 = 2000
    expect(fourth.allowed).toBe(false);
    if (!fourth.allowed) expect(fourth.retryAfterMs).toBe(2000);
    const fifth = t.recordFailure(EMAIL, IP, 0); // overshoot 2 → 1000 × 4 = 4000
    if (!fifth.allowed) expect(fifth.retryAfterMs).toBe(4000);
  });

  it("caps the backoff at maxLockoutMs", () => {
    const t = createLoginThrottle(CFG);
    // many failures would push backoff past the 8000ms cap
    for (let i = 0; i < 10; i++) t.recordFailure(EMAIL, IP, 0);
    const res = t.check(EMAIL, IP, 0);
    expect(res.allowed).toBe(false);
    if (!res.allowed) expect(res.retryAfterMs).toBe(8000);
  });
});

describe("loginThrottle — reset semantics", () => {
  it("recordSuccess clears the counter (reset-on-success)", () => {
    const t = createLoginThrottle(CFG);
    t.recordFailure(EMAIL, IP, 0);
    t.recordFailure(EMAIL, IP, 0);
    expect(t.failureCount(EMAIL, IP)).toBe(2);
    t.recordSuccess(EMAIL, IP);
    expect(t.failureCount(EMAIL, IP)).toBe(0);
    expect(t.check(EMAIL, IP, 0).allowed).toBe(true);
  });

  it("the counter self-heals after the idle window expires", () => {
    const t = createLoginThrottle(CFG);
    t.recordFailure(EMAIL, IP, 0); // firstFailAt = 0
    t.recordFailure(EMAIL, IP, 100);
    expect(t.failureCount(EMAIL, IP)).toBe(2);
    // a check past the window resets the record
    expect(t.check(EMAIL, IP, 5001).allowed).toBe(true);
    expect(t.failureCount(EMAIL, IP)).toBe(0);
  });

  it("a failure after the window expires starts a fresh count, not a lockout", () => {
    const t = createLoginThrottle(CFG);
    for (let i = 0; i < 2; i++) t.recordFailure(EMAIL, IP, 0);
    const fresh = t.recordFailure(EMAIL, IP, 6000); // window (5000) elapsed → counter restarts at 1
    expect(fresh.allowed).toBe(true);
    expect(t.failureCount(EMAIL, IP)).toBe(1);
  });
});

describe("loginThrottle — key isolation", () => {
  it("scopes by email+IP independently", () => {
    const t = createLoginThrottle(CFG);
    for (let i = 0; i < 3; i++) t.recordFailure(EMAIL, IP, 0); // lock this pair
    expect(t.check(EMAIL, IP, 0).allowed).toBe(false);
    // same email, different IP → not locked
    expect(t.check(EMAIL, "198.51.100.1", 0).allowed).toBe(true);
    // different email, same IP → not locked
    expect(t.check("other@test.co", IP, 0).allowed).toBe(true);
  });

  it("normalizes the email (case + whitespace) into the same key", () => {
    const t = createLoginThrottle(CFG);
    for (let i = 0; i < 3; i++) t.recordFailure("  User@Test.CO ", IP, 0);
    expect(t.check(EMAIL, IP, 0).allowed).toBe(false);
  });
});
