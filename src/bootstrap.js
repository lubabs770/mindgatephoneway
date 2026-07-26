/**
 * One-time (occasional) interactive login. Run headful so you can see/clear
 * any Google challenge. Once you land on the messages view, the persistent
 * profile holds the session and the headless daemon can take over.
 *
 *   npm run bootstrap
 */
const cfg = require('../config');
const { launch, needsLogin } = require('./browser');
const log = require('./log');

(async () => {
  const { browser, page } = await launch({ headless: false });
  await page.goto(cfg.gvoice.messagesUrl, { waitUntil: 'domcontentloaded' });

  log.info('Complete the Google login in the opened window if prompted.');
  log.info('Waiting for the Voice messages view to render…');

  try {
    await page.waitForSelector(cfg.gvoice.readySelector, { timeout: 5 * 60_000 });
    if (needsLogin(page)) throw new Error('still on login page');
    log.info('✅ Logged in. Profile saved to ' + cfg.browser.userDataDir);
    log.info('You can now run: npm start');
  } catch (e) {
    log.error('Bootstrap did not reach the messages view: ' + e.message);
  } finally {
    // Give the profile a beat to flush to disk before closing.
    await page.waitForTimeout(2000).catch(() => {});
    await browser.close();
  }
})();
