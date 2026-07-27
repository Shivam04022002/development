// middleware/security.js
//
// Phase 8 — dependency-free production hardening: secure HTTP headers
// (helmet-equivalent) and a lightweight in-memory rate limiter. No new npm
// packages are added.
//
// NOTE: the rate limiter is per-process (fine for a single PM2 instance). For a
// multi-instance deployment, back it with a shared store (e.g. Redis).

/** Secure response headers applied to every request. */
export function secureHeaders(req, res, next) {
  res.removeHeader("X-Powered-By");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

/**
 * rateLimit({ windowMs, max, message })
 * Simple fixed-window limiter keyed by client IP. Returns 429 when exceeded.
 */
export function rateLimit({ windowMs = 60_000, max = 100, message = "Too many requests, please try again later." } = {}) {
  const hits = new Map(); // ip -> { count, resetAt }

  // Periodically drop expired buckets so the map doesn't grow unbounded.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of hits) if (rec.resetAt <= now) hits.delete(ip);
  }, windowMs);
  if (sweep.unref) sweep.unref();

  return (req, res, next) => {
    const ip = req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    let rec = hits.get(ip);
    if (!rec || rec.resetAt <= now) {
      rec = { count: 0, resetAt: now + windowMs };
      hits.set(ip, rec);
    }
    rec.count += 1;
    const remaining = Math.max(0, max - rec.count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    if (rec.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((rec.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

export default { secureHeaders, rateLimit };
