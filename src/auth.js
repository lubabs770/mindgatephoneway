/**
 * SAPISIDHASH helper — only needed if you go the direct-HTTP route instead of
 * driving the browser. Builds the Authorization header Google's internal
 * endpoints expect:  "SAPISIDHASH <ts>_<sha1(ts SP sapisid SP origin)>"
 *
 * Grab the SAPISID cookie from a logged-in session (browser.cookies() or your
 * profile) and pass it in. No MFA involved — it's derived from the cookie.
 */
const crypto = require('crypto');
const cfg = require('../config');

function sapisidHash(sapisidValue, { origin = cfg.auth.hashOrigin, nowSec } = {}) {
  const ts = nowSec ?? Math.floor(Date.now() / 1000);
  const digest = crypto
    .createHash('sha1')
    .update(`${ts} ${sapisidValue} ${origin}`)
    .digest('hex');
  return `SAPISIDHASH ${ts}_${digest}`;
}

/** Pull the SAPISID value out of a puppeteer cookie array. */
function sapisidFromCookies(cookies) {
  const c = cookies.find((c) => c.name === cfg.auth.sapisidCookie);
  return c ? c.value : null;
}

module.exports = { sapisidHash, sapisidFromCookies };
