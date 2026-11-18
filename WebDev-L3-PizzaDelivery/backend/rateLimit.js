// A small in-memory limiter for FAILED login attempts (no extra package needed).
// After `max` failures from one key (the visitor's IP) inside `windowMs`, further attempts are refused
// until the window ends. A successful login clears the count.
// It resets when the server restarts, which is fine for a single server.
function failLimiter({ max = 8, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs).unref();

  return {
    // Seconds to wait if the key is blocked, otherwise 0.
    check(key) {
      const h = hits.get(key);
      const now = Date.now();
      return h && h.reset > now && h.count >= max ? Math.ceil((h.reset - now) / 1000) : 0;
    },
    fail(key) {
      const now = Date.now();
      let h = hits.get(key);
      if (!h || h.reset <= now) {
        h = { count: 0, reset: now + windowMs };
        hits.set(key, h);
      }
      h.count++;
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

module.exports = { failLimiter };
