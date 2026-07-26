/**
 * SAPISIDHASH helper — only needed if you go the direct-HTTP route instead of
 * driving the browser. Builds the Authorization header Google's internal
 * endpoints expect:  "SAPISIDHASH <ts>_<sha1(ts SP sapisid SP origin)>"
 *
 * Grab the SAPISID cookie from a logged-in session (browser.cookies() or your
 * profile) and pass it in. No MFA involved — it's derived from the cookie.
 */
import * as crypto from 'crypto';
import cfg from '../config';

interface CookieLike {
  name: string;
  value: string;
}

export function sapisidHash(
  sapisidValue: string,
  { origin = cfg.auth.hashOrigin, nowSec }: { origin?: string; nowSec?: number } = {},
): string {
  const ts = nowSec ?? Math.floor(Date.now() / 1000);
  const digest = crypto.createHash('sha1').update(`${ts} ${sapisidValue} ${origin}`).digest('hex');
  return `SAPISIDHASH ${ts}_${digest}`;
}

/** Pull the SAPISID value out of a puppeteer cookie array. */
export function sapisidFromCookies(cookies: CookieLike[]): string | null {
  const c = cookies.find((c) => c.name === cfg.auth.sapisidCookie);
  return c ? c.value : null;
}
