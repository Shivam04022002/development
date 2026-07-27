// middleware/internalAuth.js
//
// Gate for server-to-server calls from the Mobile Backend gateway.
// The mobile gateway authenticates the dealer, then forwards the request to the
// Admin Backend with the shared secret in the `x-internal-api-key` header.
//
// Enforcement is conditional: if INTERNAL_API_KEY is configured on the Admin
// Backend, the header must match. If it is not configured (e.g. local dev),
// the check is skipped — this mirrors the previous merge endpoint, which did
// not enforce a key, so no existing environment is broken.
const internalAuth = (req, res, next) => {
  const expected = process.env.INTERNAL_API_KEY;

  if (!expected) {
    // No key configured on this environment — allow (dev / backward compat).
    return next();
  }

  const provided = req.headers["x-internal-api-key"];
  if (provided && provided === expected) {
    return next();
  }

  return res.status(401).json({ success: false, error: "Invalid internal API key" });
};

export default internalAuth;
