/**
 * Launches a persistent, stealth Chrome. Same profile every run => login
 * survives restarts. Used by both bootstrap (headful) and the daemon (headless).
 */
import puppeteer from 'puppeteer-extra';
import Stealth from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';
import cfg from '../config';
import log from './log';

puppeteer.use(Stealth());

export interface Session {
  browser: Browser;
  page: Page;
}

export async function launch({ headless }: { headless?: boolean } = {}): Promise<Session> {
  const useHeadless = headless === undefined ? cfg.browser.headless : headless;
  log.info(`launching chrome (headless=${useHeadless}, profile=${cfg.browser.userDataDir})`);

  const browser = (await puppeteer.launch({
    headless: useHeadless ? ('new' as unknown as boolean) : false,
    channel: cfg.browser.channel as never,
    userDataDir: cfg.browser.userDataDir,
    args: cfg.browser.args,
    defaultViewport: null,
  })) as unknown as Browser;

  const [page] = await browser.pages();
  page.setDefaultTimeout(cfg.browser.timeout);
  return { browser, page };
}

/** True if the current page bounced us to the Google login flow. */
export function needsLogin(page: Page): boolean {
  return page.url().includes(cfg.gvoice.loginHostMatch);
}
