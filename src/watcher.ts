/**
 * Event-driven trigger — NO blind polling.
 *
 * We inject a MutationObserver into the page that watches the thread list for
 * changes (new message => DOM mutates). When it fires, it calls back into Node
 * via an exposed function. The daemon reacts only when something actually
 * changed. A slow `resyncEveryMs` timer is the only periodic fallback, purely
 * as a safety net if a mutation is ever missed.
 */
import type { Page } from 'puppeteer';
import cfg from '../config';
import log from './log';

export type ChangeReason = 'mutation' | 'resync';
export type OnChange = (reason: ChangeReason) => void | Promise<void>;

export async function attach(page: Page, onChange: OnChange): Promise<() => void> {
  // Bridge: page -> Node
  await page.exposeFunction('__mgpOnMutation', (reason: string) => {
    log.debug('dom mutation:', reason);
    void onChange('mutation');
  });

  // Install the observer (re-installed on every navigation via the init script).
  const installObserver = (): void => {
    const sel = 'gv-thread-list, [gv-id="thread-list"], .thread-list, body';
    const target = (document.querySelector(sel) as (Element & { __mgpObserved?: boolean }) | null) || document.body;
    const t = target as Element & { __mgpObserved?: boolean };
    if (!t || t.__mgpObserved) return;
    t.__mgpObserved = true;
    const obs = new MutationObserver((muts) => {
      if (muts.some((m) => m.addedNodes && m.addedNodes.length)) {
        (window as unknown as { __mgpOnMutation?: (r: string) => void }).__mgpOnMutation?.('childList');
      }
    });
    obs.observe(t, { childList: true, subtree: true });
  };

  // Run now and on every future document (SPA navigations, reloads).
  await page.evaluate(installObserver);
  await page.evaluateOnNewDocument(installObserver);

  // Safety-net resync (rare, long interval — this is not the primary path).
  const timer = setInterval(() => void onChange('resync'), cfg.capture.resyncEveryMs);
  timer.unref?.();

  log.info(`watcher attached (event-driven; safety resync every ${cfg.capture.resyncEveryMs}ms)`);
  return () => clearInterval(timer);
}
