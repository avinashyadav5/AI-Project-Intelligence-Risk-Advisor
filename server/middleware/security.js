/**
 * security.js — Response headers and rate limiting.
 *
 * Implemented without helmet or express-rate-limit so the app gains protection
 * without adding dependencies that would have to be installed before the
 * server would start.
 */

/** Conservative security headers. */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.removeHeader('X-Powered-By');
  next();
}

/**
 * Fixed-window rate limiter backed by an in-process Map.
 *
 * Adequate for a single-instance deployment. Running several replicas would
 * need a shared store such as Redis, since each process keeps its own counters.
 */
function rateLimit({ windowMs = 60_000, max = 120, keyPrefix = 'general', message } = {}) {
  const hits = new Map();

  // Drop expired buckets so the Map cannot grow without bound.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  if (sweep.unref) sweep.unref();

  return (req, res, next) => {
    const identifier = req.user?.id || req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${identifier}`;
    const now = Date.now();

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', Math.ceil((entry.resetAt - now) / 1000));

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        error: message || `Too many requests. Try again in ${retryAfter} seconds.`,
      });
    }

    next();
  };
}

module.exports = { securityHeaders, rateLimit };
