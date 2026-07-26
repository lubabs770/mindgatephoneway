/**
 * Event-driven trigger — NO blind polling.
 *
 * We inject a MutationObserver into the page that watches the thread list for
 * changes (new message => DOM mutates). When it fires, it calls back into Node
 * via an exposed function. The daemon reacts only when something actually
 * changed. A slow `resyncEveryMs` timer is the only periodic fallback, purely
 * as a safety net if a mutation is ever missed.
 */
const cfg = require('../config');
const log = require('./log');

async function attach(page, onChange) {
  // Bridge: page -> Node
  await page.exposeFunction('__mgpOnMutation', (reason) => {
    log.debug('dom mutation:', reason);
    onChange('mutation');
  });

  // Install the observer (re-installed on every navigation via the init script).
  const installObserver = () => {
    const sel = 'gv-thread-list, [gv-id="thread-list"], .thread-list, body';
    const target = document.querySelector(sel) || document.body;
    if (!target || target.__mgpObserved) return;
    target.__mgpObserved = true;
    const obs = new MutationObserver((muts) => {
      // Coalesce bursts: only signal on childList/added nodes.
      if (muts.some((m) => m.addedNodes && m.addedNodes.length)) {
        // eslint-disable-next-line no-undef
        window.__mgpOnMutation && window.__mgpOnMutation('childList');
      }
    });
    obs.observe(target, { childList: true, subtree: true });
  };

  // Run now and on every future document (SPA navigations, reloads).
  await page.evaluate(installObserver);
  await page.evaluateOnNewDocument(installObserver);

  // Safety-net resync (rare, long interval — this is not the primary path).
  const timer = setInterval(() => onChange('resync'), cfg.capture.resyncEveryMs);
  timer.unref?.();

  log.info(`watcher attached (event-driven; safety resync every ${cfg.capture.resyncEveryMs}ms)`);
  return () => clearInterval(timer);
}

module.exports = { attach };
