// api/debug/index.js
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

module.exports = async function (context, req) {
  const secret = process.env.JWT_SECRET;
  const signalr = process.env.AZURE_SIGNALR_CONNECTION_STRING || null;
  const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
  let token = null, decoded = null, verifyError = null, verifyOk = false;

  if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.slice(7);

  try {
    decoded = token ? jwt.decode(token, { complete: true }) : null;
  } catch (e) {
    decoded = { decodeError: e.message };
  }

  try {
    if (token) {
      jwt.verify(token, secret, { algorithms: ['HS256'] }); // adjust algs if you use others
      verifyOk = true;
    }
  } catch (e) {
    verifyError = e.message;
  }

  const secretHash = secret ? crypto.createHash('sha256').update(secret).digest('hex') : null;
  const nowSeconds = Math.floor(Date.now() / 1000);

  context.log('DBG secret length:', secret ? secret.length : 'MISSING');
  context.log('DBG secret sha256:', secretHash);
  context.log('DBG signalr present:', !!signalr);
  context.log('DBG auth header present:', !!authHeader);
  context.log('DBG token present:', !!token);
  context.log('DBG decoded header/payload:', decoded);
  context.log('DBG verifyError:', verifyError);
  context.log('DBG serverTime:', new Date().toISOString());

  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      serverTimeISO: new Date().toISOString(),
      jwtSecretLength: secret ? secret.length : 'MISSING',
      jwtSecretSha256: secretHash,
      signalRConfigured: !!signalr,
      authHeaderPresent: !!authHeader,
      tokenPresent: !!token,
      tokenDecoded: decoded,
      tokenVerify: verifyOk ? { ok: true } : { ok: false, error: verifyError },
      nowSeconds,
      tokenExpSeconds: decoded && decoded.payload && decoded.payload.exp ? decoded.payload.exp : null,
      tokenExpISO: decoded && decoded.payload && decoded.payload.exp ? new Date(decoded.payload.exp * 1000).toISOString() : null
    }
  };
};
