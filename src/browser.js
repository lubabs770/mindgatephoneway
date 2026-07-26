/**
 * Launches a persistent, stealth Chrome. Same profile every run => login
 * survives restarts. Used by both bootstrap (headful) and the daemon (headless).
 */
const puppeteer = require('puppeteer-extra');
const Stealth = require('puppeteer-extra-plugin-stealth');
const cfg = require('../config');
const log = require('./log');

puppeteer.use(Stealth());

async function launch({ headless } = {}) {
  const useHeadless = headless === undefined ? cfg.browser.headless : headless;
  log.info(`launching chrome (headless=${useHeadless}, profile=${cfg.browser.userDataDir})`);

  const browser = await puppeteer.launch({
    headless: useHeadless ? 'new' : false,
    channel: cfg.browser.channel,
    userDataDir: cfg.browser.userDataDir,
    args: cfg.browser.args,
    defaultViewport: null,
  });

  const [page] = await browser.pages();
  page.setDefaultTimeout(cfg.browser.timeout);
  return { browser, page };
}

/** True if the current page bounced us to the Google login flow. */
function needsLogin(page) {
  return page.url().includes(cfg.gvoice.loginHostMatch);
}

module.exports = { launch, needsLogin };
