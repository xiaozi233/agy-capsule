// Deck injector: mounts a compact metrics strip into the Antigravity composer
// footer (next to the model selector) via the local DevTools (CDP) endpoint.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { getSettings, onSettingsChange } from './settings.mjs';

const INTERVAL_MS = 1000;
const INSTANCE_TS = Date.now();
const MOUNT_KEY = '__deckMount_' + INSTANCE_TS;
const PORT_FILE =
  process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support', 'Antigravity', 'DevToolsActivePort')
    : process.platform === 'win32'
      ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Antigravity', 'DevToolsActivePort')
      : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'Antigravity', 'DevToolsActivePort');

const sockets = new Map(); // targetId -> { ws, pending: Map, nextId }
let lastErr = '';

function logOnce(msg) {
  if (msg !== lastErr) {
    lastErr = msg;
    console.error('[deck]', msg);
  }
}

function readCdpPort() {
  try {
    return readFileSync(PORT_FILE, 'utf-8').split('\n')[0].trim();
  } catch {
    return '';
  }
}

async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const entry = { ws, pending: new Map(), nextId: 1 };
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ws timeout')), 3000);
    ws.onopen = () => {
      clearTimeout(t);
      resolve();
    };
    ws.onerror = () => {
      clearTimeout(t);
      reject(new Error('ws error'));
    };
  });
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      const cb = entry.pending.get(msg.id);
      if (cb) {
        entry.pending.delete(msg.id);
        cb(msg);
      }
    } catch {}
  };
  ws.onclose = () => { if (sockets.get(target.id) === entry) sockets.delete(target.id); };
  sockets.set(target.id, entry);
  return entry;
}

function evaluate(entry, expression) {
  return new Promise((resolve, reject) => {
    const id = entry.nextId++;
    const t = setTimeout(() => {
      entry.pending.delete(id);
      reject(new Error('CDP evaluation timeout'));
    }, 3000);
    entry.pending.set(id, (msg) => {
      clearTimeout(t);
      const error = msg.error?.message || msg.result?.exceptionDetails?.exception?.description || msg.result?.exceptionDetails?.text;
      if (error) reject(new Error(error));
      else resolve(msg?.result?.result?.value);
    });
    entry.ws.send(
      JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true },
      })
    );
  });
}

// Self-contained function executed inside the Antigravity renderer page.
function pageMount(d) {
  if (window.__deckOwnerTs && d.instanceTs && d.instanceTs < window.__deckOwnerTs) {
    return 'superseded';
  }
  if (d.instanceTs) {
    window.__deckOwnerTs = d.instanceTs;
  }
  const footer = Array.from(document.querySelectorAll('.agy-composer-footer')).find((el) => el.getClientRects().length > 0);
  const footerLeft = footer?.firstElementChild;
  if (!footerLeft) return 'no-footer';

  let root = document.getElementById('deck-metrics-strip');
  if (!root) {
    root = document.createElement('div');
    root.id = 'deck-metrics-strip';
  }
  if (window.__deckMetricsRoot && window.__deckMetricsRoot !== root) window.__deckMetricsRoot._dispose?.();
  window.__deckMetricsRoot = root;
  // Second strip: capsules whose position setting is "right".
  let rootR = document.getElementById('deck-metrics-strip-r');
  if (!rootR) {
    rootR = document.createElement('div');
    rootR.id = 'deck-metrics-strip-r';
  }

  const settingsKey = JSON.stringify(d.settings || {});
  const settingsChanged = root._settingsKey !== settingsKey;
  const previousCapsules = new Map();
  const snapshotPill = (pill) => {
    const clone = pill.cloneNode(true);
    const copies = clone.querySelectorAll('.dk-val, .dk-q-pair');
    pill.querySelectorAll('.dk-val, .dk-q-pair').forEach((el, index) => {
      // Exit snapshots leave their strip, so preserve any readouts hidden by
      // settings or responsive classes instead of briefly showing them again.
      if (getComputedStyle(el).display === 'none') copies[index].style.display = 'none';
    });
    return clone;
  };
  if (settingsChanged) {
    // Read all current visual positions before cancelling any motion. A new
    // destination continues from the frame on screen, including a fading exit.
    for (const strip of [root, rootR]) {
      for (const grp of strip.querySelectorAll('.dk-grp')) {
        const pill = grp.querySelector('.dk-pill');
        const rect = pill.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) previousCapsules.set(grp.dataset.el, { rect, opacity: getComputedStyle(pill).opacity, pill: snapshotPill(pill) });
      }
    }
    for (const ghost of root._animationLayer?.children || []) {
      if (!previousCapsules.has(ghost.dataset.dkKey)) previousCapsules.set(ghost.dataset.dkKey, { rect: ghost.getBoundingClientRect(), opacity: getComputedStyle(ghost).opacity, pill: ghost.cloneNode(true) });
    }
    for (const pill of [...root.querySelectorAll('.dk-pill'), ...rootR.querySelectorAll('.dk-pill')]) {
      pill._deckMotion?.cancel();
      pill.style.willChange = '';
    }
    for (const ghost of root._animationLayer?.children || []) for (const motion of ghost.getAnimations()) motion.cancel();
    root._animationLayer?.replaceChildren();
  }

  // Upgrade or initialize DOM structure in-place
  if (root.getAttribute('data-deck-ver') !== '56' || rootR.getAttribute('data-deck-ver') !== '56') {
    root._dispose?.();
    root.setAttribute('data-deck-ver', '56');
    rootR.setAttribute('data-deck-ver', '56');
    root.style.cssText = [
      'display: inline-flex',
      'align-items: center',
      'flex-shrink: 0',
      'gap: 2px',
      'font: inherit',
      'font-variation-settings: normal',
      'font-variant-ligatures: normal',
      'line-height: normal',
      'color: var(--secondary-foreground, var(--foreground, #3f3f46))',
      'user-select: none',
      'position: relative',
      '-webkit-font-smoothing: antialiased',
    ].join(';');

    root.innerHTML = `
      <style>
        .agy-composer-footer.dk-composer-footer > .dk-native-left { flex: 0 1 auto; min-width: 0; }
        .agy-composer-footer.dk-composer-footer > .dk-native-right { flex-shrink: 0; margin-left: auto; }
        #deck-metrics-dock { display: flex; align-items: center; flex: 1 1 0%; min-width: 0; gap: 0; }
        #deck-metrics-spacer { flex: 1 1 8px; min-width: 8px; }
        #deck-metrics-dock.dk-dock-empty { display: none; }
        [id^="deck-metrics-strip"], [id^="deck-metrics-strip"] * { box-sizing: border-box; }
        [id^="deck-metrics-strip"] .dk-grp {
          display: inline-flex;
          align-items: center;
          /* Anchor each popover to its own capsule. */
          position: relative;
        }
        [id^="deck-metrics-strip"] .dk-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: var(--dk-control-height, 28px);
          padding: 0 var(--dk-control-padding, 6px);
          border-radius: var(--dk-control-radius, 6px);
          font: inherit;
          color: inherit;
          line-height: inherit;
          cursor: default;
          position: relative;
          background: transparent;
          border: none;
          white-space: nowrap;
          transition: background 0.12s ease, color 0.12s ease;
        }
        [id^="deck-metrics-strip"] .dk-grp:hover .dk-pill,
        [id^="deck-metrics-strip"] .dk-grp:focus-within .dk-pill {
          background: var(--accent, var(--secondary, rgba(128, 128, 128, 0.12)));
          color: var(--accent-foreground, var(--foreground, inherit));
        }
        [id^="deck-metrics-strip"] .dk-pill:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }
        [id^="deck-metrics-strip"] .dk-grp:hover .dk-val,
        [id^="deck-metrics-strip"] .dk-grp:hover .dk-svg {
          color: var(--accent-foreground, var(--foreground, inherit));
        }
        [id^="deck-metrics-strip"] .dk-pill-quota {
          gap: 10px;
        }
        [id^="deck-metrics-strip"].dk-hide-speed [data-el="grpSpeed"] {
          display: none;
        }
        [id^="deck-metrics-strip"].dk-hide-wk [data-el="pairWk"],
        [id^="deck-metrics-strip"].dk-hide-5h [data-el="pair5h"],
        [id^="deck-metrics-strip"].dk-off-wk [data-el="pairWk"],
        [id^="deck-metrics-strip"].dk-off-5h [data-el="pair5h"] {
          display: none;
        }
        [id^="deck-metrics-strip"].dk-hide-wk .dk-pill-quota,
        [id^="deck-metrics-strip"].dk-hide-5h .dk-pill-quota,
        [id^="deck-metrics-strip"].dk-off-wk .dk-pill-quota,
        [id^="deck-metrics-strip"].dk-off-5h .dk-pill-quota {
          gap: 0;
        }
        [id^="deck-metrics-strip"].dk-hide-qval [data-el="grpQuota"] .dk-val {
          display: none;
        }
        [id^="deck-metrics-strip"].dk-hide-qval [data-el="grpQuota"] .dk-q-pair {
          gap: 0;
        }
        [id^="deck-metrics-strip"].dk-hide-cval [data-el="grpCtx"] .dk-val {
          display: none;
        }
        [id^="deck-metrics-strip"].dk-hide-cval [data-el="grpCtx"] .dk-pill {
          gap: 0;
        }
        [id^="deck-metrics-strip"].dk-hide-quota [data-el="grpQuota"] {
          display: none;
        }
        /* Per-capsule switches come from the plugin settings page. */
        [id^="deck-metrics-strip"].dk-off-ctx [data-el="grpCtx"],
        [id^="deck-metrics-strip"].dk-off-speed [data-el="grpSpeed"],
        [id^="deck-metrics-strip"].dk-off-quota [data-el="grpQuota"],
        [id^="deck-metrics-strip"].dk-off-all,
        [id^="deck-metrics-strip"].dk-hide-all {
          display: none !important;
        }
        /* A capsule assigned to the other side is hidden in this strip, and a
           strip left with nothing to show keeps out of the layout entirely. */
        [id^="deck-metrics-strip"].dk-away-ctx [data-el="grpCtx"],
        [id^="deck-metrics-strip"].dk-away-speed [data-el="grpSpeed"],
        [id^="deck-metrics-strip"].dk-away-quota [data-el="grpQuota"],
        [id^="deck-metrics-strip"].dk-empty {
          display: none !important;
        }
        .dk-fl-squeezed {
          min-width: 0 !important;
          flex-shrink: 1 !important;
        }
        .dk-model-squeezed {
          min-width: 0 !important;
          flex: 0 1 auto !important;
          overflow: hidden !important;
          max-width: 100% !important;
        }
        .dk-model-squeezed .dk-squeeze-box,
        .dk-model-squeezed .dk-squeeze-item {
          min-width: 0 !important;
          max-width: 100% !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        }
        .dk-model-squeezed .dk-squeeze-box,
        .dk-model-squeezed-hard .dk-squeeze-item {
          flex-shrink: 1 !important;
        }
        .dk-model-squeezed svg {
          flex-shrink: 0 !important;
        }
        [id^="deck-metrics-strip"] .dk-ctx-pair,
        [id^="deck-metrics-strip"] .dk-q-pair {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        [id^="deck-metrics-strip"] .dk-svg {
          width: var(--dk-icon-size, 16px);
          height: var(--dk-icon-size, 16px);
          color: inherit;
          flex-shrink: 0;
          transition: color 0.12s ease;
        }
        [id^="deck-metrics-strip"] .dk-val {
          font-weight: inherit;
          color: inherit;
          font-variant-numeric: tabular-nums;
          transition: color 0.12s ease;
        }
        /* Animate only vertically: measuring an animated scale shifts the anchor. */
        [id^="deck-metrics-strip"] .dk-pop {
          position: absolute;
          bottom: calc(100% + 8px);
          left: 0;
          width: max-content;
          max-width: calc(100vw - 16px);
          overflow: auto;
          scrollbar-width: thin;
          scrollbar-color: var(--muted-foreground, #8e8e93) transparent;
          background: var(--popover, var(--card, #131317));
          border: 1px solid var(--border, rgba(128, 128, 128, 0.28));
          border-radius: var(--radius, 0.5rem);
          padding: 10px 12px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.12), 0 2px 4px -2px rgba(0, 0, 0, 0.12);
          z-index: 999999;
          color: var(--popover-foreground, var(--muted-foreground, #9a9aa3));
          font-family: inherit;
          font-size: var(--dk-pop-font-size, 13px);
          line-height: 1.35;
          pointer-events: none;
          opacity: 0;
          visibility: hidden;
          transform: translateY(var(--dk-enter-y, 4px));
          transition:
            opacity 150ms ease-out,
            transform 150ms ease-out,
            visibility 0s linear 150ms;
        }
        [id^="deck-metrics-strip"] .dk-grp[data-open="true"] .dk-pop {
          opacity: 1;
          visibility: visible;
          transform: none;
          transition-delay: 0s;
          pointer-events: auto;
        }
        @media (prefers-reduced-motion: reduce) {
          [id^="deck-metrics-strip"] .dk-pill,
          [id^="deck-metrics-strip"] .dk-svg,
          [id^="deck-metrics-strip"] .dk-val,
          [id^="deck-metrics-strip"] .dk-seg { transition: none; }
          [id^="deck-metrics-strip"] .dk-pop {
            transition: none;
            transform: none;
          }
        }
        /* Context Popover (matches plugin UI) */
        [id^="deck-metrics-strip"] .dk-ctx-pop {
          width: max-content;
          min-width: 176px;
        }
        [id^="deck-metrics-strip"] .dk-cache-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          font-size: inherit;
          line-height: 1.35;
          margin-top: 2px;
          padding-bottom: 5px;
          margin-bottom: 7.5px;
          border-bottom: 1px solid var(--border, rgba(128, 128, 128, 0.22));
        }
        [id^="deck-metrics-strip"] .dk-cache-left {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-weight: 500;
          color: var(--foreground, #18181b);
          color: color-mix(in srgb, var(--foreground, #18181b) 88%, transparent);
          white-space: nowrap;
        }
        [id^="deck-metrics-strip"] .dk-cache-pct {
          margin-left: -2px;
          font-variant-numeric: tabular-nums;
          font-size: inherit;
          white-space: nowrap;
        }
        [id^="deck-metrics-strip"] .dk-cache-k {
          text-align: right;
          color: var(--muted-foreground, #8e8e93);
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          font-size: inherit;
          font-weight: 400;
        }
        [id^="deck-metrics-strip"] .dk-cache-k:empty {
          display: none;
        }
        [id^="deck-metrics-strip"] .dk-summary-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 12px;
          margin-bottom: 6.5px;
        }
        [id^="deck-metrics-strip"] .dk-used-pct {
          font-size: inherit;
          font-weight: 500;
          color: var(--foreground, #18181b);
          color: color-mix(in srgb, var(--foreground, #18181b) 88%, transparent);
        }
        [id^="deck-metrics-strip"] .dk-used-frac {
          font-size: inherit;
          font-weight: 500;
          color: var(--foreground, #18181b);
          color: color-mix(in srgb, var(--foreground, #18181b) 88%, transparent);
          font-variant-numeric: tabular-nums;
        }
        [id^="deck-metrics-strip"] .dk-track {
          position: relative;
          width: 100%;
          height: 4px;
          background: rgba(142, 142, 147, 0.24);
          border-radius: 999px;
          display: flex;
          gap: 1.5px;
          overflow: hidden;
          margin-bottom: 8.5px;
        }
        [id^="deck-metrics-strip"] .dk-seg {
          height: 100%;
          border-radius: 999px;
          transition: width 0.25s ease;
        }
        [id^="deck-metrics-strip"] .dk-list {
          display: grid;
          grid-template-columns: 1fr auto minmax(44px, auto);
          row-gap: 6px;
          column-gap: 8px;
          align-items: center;
        }
        [id^="deck-metrics-strip"] .dk-item-row {
          display: contents;
        }
        [id^="deck-metrics-strip"] .dk-item-left {
          display: flex;
          align-items: center;
          gap: 7px;
          color: var(--muted-foreground, #8e8e93);
          white-space: nowrap;
        }
        [id^="deck-metrics-strip"] .dk-dot {
          width: 10px;
          height: 10px;
          border-radius: 3px;
          flex-shrink: 0;
        }
        [id^="deck-metrics-strip"] .dk-item-pct {
          text-align: right;
          justify-self: end;
          color: var(--muted-foreground, #8e8e93);
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          font-size: inherit;
          margin-right: 6px;
        }
        [id^="deck-metrics-strip"] .dk-item-k {
          text-align: right;
          justify-self: end;
          color: var(--muted-foreground, #8e8e93);
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          font-size: inherit;
        }
        [id^="deck-metrics-strip"] .dk-speed-section {
          margin-top: 8px;
          padding-top: 7px;
          border-top: 1px solid var(--border, rgba(128, 128, 128, 0.22));
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        [id^="deck-metrics-strip"] .dk-speed-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-top: 4px;
        }
        [id^="deck-metrics-strip"] .dk-speed-row:first-child { margin-top: 0; }
        /* Compact speed popover has no section divider of its own. */
        [id^="deck-metrics-strip"] .dk-speed-pop {
          min-width: 138px;
        }
        [id^="deck-metrics-strip"] .dk-speed-pop .dk-speed-section {
          margin-top: 0;
          padding-top: 0;
          border-top: none;
        }
        /* Speed has its own capsule now; the full popover keeps those rows only
           when the speed capsule is folded away on a narrow composer. */
        [id^="deck-metrics-strip"] .dk-ctx-pop .dk-speed-section {
          display: none;
        }
        [id^="deck-metrics-strip"].dk-hide-speed .dk-ctx-pop .dk-speed-section {
          display: block;
        }
        [id^="deck-metrics-strip"].dk-off-speed .dk-ctx-pop .dk-speed-section { display: none; }
        /* Quota Popover (matches plugin UI) */
        [id^="deck-metrics-strip"] .dk-quota-pop {
          width: max-content;
          line-height: 1.5;
        }
        [id^="deck-metrics-strip"] .dk-q-group {
          margin-bottom: 12px;
        }
        [id^="deck-metrics-strip"] .dk-q-group:last-child {
          margin-bottom: 0;
        }
        [id^="deck-metrics-strip"] .dk-q-title {
          font-size: inherit;
          font-weight: 500;
          line-height: 1.4;
          color: var(--foreground, #18181b);
          color: color-mix(in srgb, var(--foreground, #18181b) 88%, transparent);
          margin-bottom: 4px;
        }
        [id^="deck-metrics-strip"] .dk-q-row {
          display: grid;
          grid-template-columns: minmax(max-content, 1fr) max-content minmax(4.5em, max-content);
          align-items: center;
          column-gap: 14px;
          font-size: inherit;
          font-variant-numeric: tabular-nums;
          margin-bottom: 4px;
        }
        [id^="deck-metrics-strip"] .dk-q-row:last-child {
          margin-bottom: 0;
        }
        [id^="deck-metrics-strip"] .dk-q-label {
          color: var(--muted-foreground, #8e8e93);
          white-space: nowrap;
        }
        [id^="deck-metrics-strip"] .dk-q-mid {
          text-align: right;
          color: var(--muted-foreground, #8e8e93);
          white-space: nowrap;
        }
        [id^="deck-metrics-strip"] .dk-q-right {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 7px;
          color: var(--muted-foreground, #8e8e93);
          white-space: nowrap;
        }
      </style>

      <!-- Context Capsule + Popover -->
      <div class="dk-grp" data-el="grpCtx">
        <button type="button" class="dk-pill dk-pill-context">
          <span class="dk-ctx-pair">
            <svg class="dk-svg" data-el="ctxIconSvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>
            <span class="dk-val" data-k="pillCtx">--%</span>
          </span>
        </button>
        <div class="dk-pop dk-ctx-pop">
          <div class="dk-cache-bar" data-el="rowCacheHit">
            <div class="dk-cache-left"><span class="dk-dot" data-el="dotCached" style="display:inline-flex;align-items:center;justify-content:center;background:transparent"></span><span>Cache</span><span class="dk-cache-pct" data-k="valCacheHit" data-el="valCacheHitEl">0%</span></div>
            <div class="dk-cache-k" data-k="valCacheHitK"></div>
          </div>
          <div class="dk-summary-row">
            <div class="dk-used-pct" data-k="usedPctText">0% used</div>
            <div class="dk-used-frac" data-k="usedFrac">0 / --</div>
          </div>
          <div class="dk-track">
            <div class="dk-seg" data-el="segTurn0" style="width: 0%; background: #d4940a"></div>
            <div class="dk-seg" data-el="segRead" style="width: 0%; background: #388bfd"></div>
            <div class="dk-seg" data-el="segThink" style="width: 0%; background: #00b386"></div>
            <div class="dk-seg" data-el="segOut" style="width: 0%; background: #e86a24"></div>
          </div>
          <div class="dk-list">
            <div class="dk-item-row">
              <div class="dk-item-left"><span class="dk-dot" style="background:#d4940a"></span><span>Turn0</span></div>
              <div class="dk-item-pct" data-k="valTurn0Pct">0%</div>
              <div class="dk-item-k" data-k="valTurn0K">0.0k</div>
            </div>
            <div class="dk-item-row">
              <div class="dk-item-left"><span class="dk-dot" style="background:#388bfd"></span><span>Read</span></div>
              <div class="dk-item-pct" data-k="valReadPct">0%</div>
              <div class="dk-item-k" data-k="valReadK">0.0k</div>
            </div>
            <div class="dk-item-row">
              <div class="dk-item-left"><span class="dk-dot" style="background:#00b386"></span><span>Think</span></div>
              <div class="dk-item-pct" data-k="valThinkPct">0%</div>
              <div class="dk-item-k" data-k="valThinkK">0.0k</div>
            </div>
            <div class="dk-item-row">
              <div class="dk-item-left"><span class="dk-dot" style="background:#e86a24"></span><span>Write</span></div>
              <div class="dk-item-pct" data-k="valOutPct">0%</div>
              <div class="dk-item-k" data-k="valOutK">0.0k</div>
            </div>
          </div>
          <div class="dk-speed-section" data-el="speedSection">
            <div class="dk-speed-row"><span data-k="speedLabel">Overall</span><span data-k="valSpeed">-- tok/s</span></div>
            <div class="dk-speed-row"><span>Streaming</span><span data-k="valStreamSpeed">-- tok/s</span></div>
            <div class="dk-speed-row"><span>TTFT</span><span data-k="valTtft">-- s</span></div>
          </div>
        </div>
      </div>

      <!-- Speed Capsule + Popover -->
      <div class="dk-grp" data-el="grpSpeed">
        <button type="button" class="dk-pill dk-pill-speed">
          <span class="dk-ctx-pair" data-el="speedPill">
            <svg class="dk-svg" data-el="speedIconSvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span class="dk-val" data-k="pillSpeed">-- tok/s</span>
          </span>
        </button>
        <div class="dk-pop dk-speed-pop">
          <div class="dk-speed-section">
            <div class="dk-speed-row"><span data-k="speedLabel">Overall</span><span data-k="valSpeed">-- tok/s</span></div>
            <div class="dk-speed-row"><span>Streaming</span><span data-k="valStreamSpeed">-- tok/s</span></div>
            <div class="dk-speed-row"><span>TTFT</span><span data-k="valTtft">-- s</span></div>
          </div>
        </div>
      </div>

      <!-- Merged Quota Capsule (5h + Weekly) + Popover -->
      <div class="dk-grp" data-el="grpQuota">
        <button type="button" class="dk-pill dk-pill-quota">
          <span class="dk-q-pair" data-el="pair5h">
            <svg class="dk-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
            <span class="dk-val" data-k="pill5h">--%</span>
          </span>
          <span class="dk-q-pair" data-el="pairWk">
            <svg class="dk-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span class="dk-val" data-k="pillWk">--%</span>
          </span>
        </button>
        <div class="dk-pop dk-quota-pop" data-el="quotaPop"></div>
      </div>
    `;

    // Keep one live node per capsule so moving it preserves listeners and state.
    // The shared stylesheet stays in the left strip.
    rootR.style.cssText = root.style.cssText;
    rootR.innerHTML = '';
    root._capsules = new Map(['context', 'speed', 'quota'].map((key) => [key, root.querySelector('[data-el="' + { context: 'grpCtx', speed: 'grpSpeed', quota: 'grpQuota' }[key] + '"]')]));

    const closePopover = () => {
      clearTimeout(root._openTimer);
      clearTimeout(root._closeTimer);
      const grp = root._activePopover;
      if (grp) {
        grp.removeAttribute('data-open');
        grp.querySelector('.dk-pill').setAttribute('aria-expanded', 'false');
      }
      root._activePopover = null;
    };
    const placePopover = (grp) => {
      const pop = grp.querySelector('.dk-pop');
      if (!pop) return;
      // Groups never animate. Only their buttons do, so repeated polls always
      // measure the same anchor throughout opening, closing and dock changes.
      const ar = grp.getBoundingClientRect();
      if (ar.width <= 0 || ar.height <= 0) {
        if (root._activePopover === grp) closePopover();
        return;
      }
      const currentFooter = root._footer;
      const card = currentFooter.closest('.surface-composer-card') || currentFooter.parentElement;
      const bounds = card.getBoundingClientRect();
      const minLeft = Math.max(8, bounds.left + 8);
      const maxRight = Math.min(window.innerWidth - 8, bounds.right - 8);
      pop.style.maxWidth = Math.max(0, maxRight - minLeft) + 'px';
      const above = Math.max(0, ar.top - 16);
      const below = Math.max(0, window.innerHeight - ar.bottom - 16);
      const side = pop.scrollHeight > above && below > above ? 'bottom' : 'top';
      pop.dataset.side = side;
      pop.style.maxHeight = (side === 'top' ? above : below) + 'px';
      pop.style.top = side === 'bottom' ? 'calc(100% + 8px)' : 'auto';
      pop.style.bottom = side === 'top' ? 'calc(100% + 8px)' : 'auto';
      pop.style.setProperty('--dk-enter-y', side === 'top' ? '4px' : '-4px');
      const pw = pop.offsetWidth;
      const ideal = grp.parentElement.dataset.pos === 'right'
        ? ar.right - pw : ar.left;
      const left = Math.max(minLeft, Math.min(ideal, maxRight - pw));
      pop.style.left = left - ar.left + 'px';
    };

    const placeAllPopovers = () => {
      if (root._activePopover) placePopover(root._activePopover);
    };
    root._placePopovers = placeAllPopovers;
    root._closePopover = closePopover;
    const openPopover = (grp) => {
      closePopover();
      placePopover(grp);
      root._activePopover = grp;
      grp.dataset.open = 'true';
      grp.querySelector('.dk-pill').setAttribute('aria-expanded', 'true');
    };

    for (const strip of [root, rootR]) {
      for (const grp of strip.querySelectorAll('.dk-grp')) {
        const pill = grp.querySelector('.dk-pill');
        pill.setAttribute('aria-expanded', 'false');
        pill.setAttribute('aria-label', { grpCtx: 'Context usage', grpSpeed: 'Generation speed', grpQuota: 'Model quota' }[grp.dataset.el]);
        grp.querySelector('.dk-pop').setAttribute('role', 'tooltip');
        grp.addEventListener('mouseenter', () => {
          clearTimeout(root._closeTimer);
          clearTimeout(root._openTimer);
          if (root._activePopover) openPopover(grp);
          else root._openTimer = setTimeout(() => { if (grp.isConnected && grp.matches(':hover')) openPopover(grp); }, 120);
        });
        grp.addEventListener('mouseleave', () => {
          clearTimeout(root._openTimer);
          if (!grp.contains(document.activeElement)) root._closeTimer = setTimeout(closePopover, 80);
        });
        grp.addEventListener('focusin', () => openPopover(grp));
        grp.addEventListener('focusout', (ev) => { if (!grp.contains(ev.relatedTarget)) closePopover(); });
        pill.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); closePopover(); } });
      }
    }
    const reposition = () => {
      if (!root.isConnected) { root._dispose(); return; }
      if (!root._popoverFrame) root._popoverFrame = requestAnimationFrame(() => { root._popoverFrame = 0; placeAllPopovers(); });
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    root._dispose = () => {
      closePopover();
      cancelAnimationFrame(root._popoverFrame);
      cancelAnimationFrame(root._layoutFrame);
      root._modelObserver?.disconnect();
      root._resizeObserver?.disconnect();
      root._observedFooter = null;
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      root._animationLayer?.remove();
      root._animationLayer = null;
      for (const grp of root._capsules?.values() || []) grp.querySelector('.dk-pill')._deckMotion?.cancel();
    };
  }
  root._footer = footer;
  if (settingsChanged) root._closePopover();

  // Settings arrive immediately after a save and with each telemetry refresh.
  const st = d.settings || {};
  const onCtx = st.context !== false;
  const onSpeed = st.speed !== false;
  const on5h = st.quota5h !== false;
  const onWk = st.quotaWeekly !== false;
  const sideOf = (v) => (v === 'right' ? 'right' : 'left');
  const pos = {
    ctx: sideOf(st.contextSide),
    speed: sideOf(st.speedSide),
    quota: sideOf(st.quotaSide),
  };
  const layoutKeys = ['context', 'speed', 'quota'];
  const order = [...new Set([...(Array.isArray(st.order) ? st.order.filter(key => layoutKeys.includes(key)) : []), ...layoutKeys])];
  const sideFor = (key) => key === 'context' ? pos.ctx : pos[key];
  for (const [strip, side] of [[root, 'left'], [rootR, 'right']]) {
    const groups = order.filter(key => sideFor(key) === side).map(key => root._capsules.get(key));
    // Reconcile only changed slots; unchanged telemetry updates never move DOM.
    groups.forEach((grp, index) => {
      const current = Array.from(strip.children).filter(el => el.classList.contains('dk-grp'));
      if (current[index] !== grp) strip.insertBefore(grp, current[index] || null);
    });
  }

  for (const el of [root, rootR]) {
    el.classList.toggle('dk-off-ctx', !onCtx);
    el.classList.toggle('dk-off-speed', !onSpeed);
    el.classList.toggle('dk-off-5h', !on5h);
    el.classList.toggle('dk-off-wk', !onWk);
    el.classList.toggle('dk-off-quota', !on5h && !onWk);
    el.classList.toggle('dk-off-all', !onCtx && !onSpeed && !on5h && !onWk);
  }

  // Own the space between native clusters; never insert into their button order.
  const rightHost = Array.from(footer.children).findLast((el) =>
    el !== footerLeft && el.id !== 'deck-metrics-dock' && !el.id.startsWith('deck-metrics-strip'));
  let dock = document.getElementById('deck-metrics-dock');
  if (!dock) {
    dock = document.createElement('div');
    dock.id = 'deck-metrics-dock';
  }
  let spacer = dock.querySelector('#deck-metrics-spacer');
  if (!spacer) { spacer = document.createElement('div'); spacer.id = 'deck-metrics-spacer'; }
  if (dock.parentElement !== footer || dock.nextElementSibling !== (rightHost || null)) footer.insertBefore(dock, rightHost || null);
  if (root.parentElement !== dock) dock.prepend(root);
  if (spacer.parentElement !== dock) dock.appendChild(spacer);
  if (rootR.parentElement !== dock) dock.appendChild(rootR);
  footer.classList.toggle('dk-composer-footer', onCtx || onSpeed || on5h || onWk);
  footerLeft.classList.add('dk-native-left');
  rightHost?.classList.add('dk-native-right');

  // Sample the host's text control, excluding the large circular send/voice keys.
  const nativeControl = Array.from(footerLeft.querySelectorAll('button, [role="button"]')).find((el) => el.textContent.trim());
  const controlStyle = getComputedStyle(nativeControl || footerLeft);
  const iconStyle = nativeControl?.querySelector('svg') ? getComputedStyle(nativeControl.querySelector('svg')) : null;
  const controlHeight = parseFloat(controlStyle.height);
  for (const strip of [root, rootR]) {
    strip.style.fontFamily = controlStyle.fontFamily;
    strip.style.fontSize = controlStyle.fontSize;
    strip.style.fontWeight = controlStyle.fontWeight;
    strip.style.lineHeight = controlStyle.lineHeight;
    strip.style.color = controlStyle.color;
    strip.style.setProperty('--dk-control-height', controlHeight >= 20 && controlHeight <= 40 ? controlHeight + 'px' : '28px');
    strip.style.setProperty('--dk-control-radius', nativeControl ? controlStyle.borderRadius : '6px');
    strip.style.setProperty('--dk-control-padding', nativeControl ? controlStyle.paddingLeft : '6px');
    strip.style.setProperty('--dk-icon-size', iconStyle?.width || '16px');
  }

  // Each capsule lives on one side only: hide it in the other strip.
  for (const [strip, mine] of [[root, 'left'], [rootR, 'right']]) {
    strip.dataset.pos = mine;
    let shown = 0;
    for (const key of ['ctx', 'speed', 'quota']) {
      const enabled = key === 'ctx' ? onCtx : key === 'speed' ? onSpeed : on5h || onWk;
      const away = pos[key] !== mine || !enabled;
      strip.classList.toggle('dk-away-' + key, away);
      if (!away) shown++;
    }
    strip.classList.toggle('dk-empty', shown === 0);
  }
  dock.classList.toggle('dk-dock-empty', !onCtx && !onSpeed && !on5h && !onWk);

  const strips = [root, rootR];
  const setK = (k, val) => {
    // Capsules move between strips; update their current owner.
    for (const strip of strips) {
      for (const el of strip.querySelectorAll(`[data-k="${k}"]`)) {
        if (el.textContent !== val) el.textContent = val;
      }
    }
  };

  setK('pillCtx', d.pillCtx);
  setK('pillSpeed', d.speedText);
  setK('valSpeed', d.speedText);
  setK('valStreamSpeed', d.streamSpeedText);
  setK('valTtft', d.ttftText);
  setK('speedLabel', d.speedLabel);
  // Clear native tooltips left by earlier injector versions, including hot reloads.
  for (const strip of strips) {
    for (const el of strip.querySelectorAll('[data-el="speedPill"][title], [data-el="speedSection"][title]')) {
      el.removeAttribute('title');
    }
  }
  setK('usedPctText', d.usedPctText);
  setK('usedFrac', d.usedFrac);
  setK('valCacheHit', d.valCacheHit);
  setK('valCacheHitK', d.valCacheHitK || '');
  setK('valTurn0Pct', d.valTurn0Pct);
  setK('valTurn0K', d.valTurn0K);
  setK('valReadPct', d.valReadPct);
  setK('valReadK', d.valReadK);
  setK('valThinkPct', d.valThinkPct);
  setK('valThinkK', d.valThinkK);
  setK('valOutPct', d.valOutPct);
  setK('valOutK', d.valOutK);

  // Match active model to quota pills
  root._deckQuotas = d;
  const applyModelQuota = () => {
    let mt = '';
    for (const child of footerLeft.children) {
      if (child.id !== 'deck-metrics-strip' && child.textContent) {
        mt += ' ' + child.textContent.trim();
      }
    }
    mt = mt.trim().toLowerCase();
    const q = root._deckQuotas || d;
    const groups = q.quotaSummaryGroups || [];

    let matched = null;
    // 1. Match specific non-generic group titles (e.g. "Gemini 4 Argon", "Gemini 4 Carbon", "Claude and GPT models")
    for (const g of groups) {
      if (g.title === 'Gemini') continue;
      if (
        (g.rawName.includes('claude') || g.rawName.includes('gpt')) &&
        (mt.includes('claude') || mt.includes('sonnet') || mt.includes('opus') || mt.includes('gpt'))
      ) {
        matched = g;
        break;
      }
      const tokens = g.rawName
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3 && !['gemini', 'model', 'models', 'and', 'the', 'for'].includes(t));
      if (tokens.some((t) => mt.includes(t))) {
        matched = g;
        break;
      }
    }

    // 2. Match explicit "Models within this group: ..." description list
    if (!matched) {
      const modelKeys = ['carbon', 'argon', 'hydrogen', 'flash', 'claude', 'sonnet', 'opus', 'gpt'];
      const activeKeys = modelKeys.filter((k) => mt.includes(k));
      if (activeKeys.length > 0) {
        matched = groups.find((g) => activeKeys.some((k) => g.modelsInGroup && g.modelsInGroup.includes(k))) || null;
      }
    }

    // 3. Fallback to main Gemini group (handles Ultra where Argon is part of Gemini Models)
    if (!matched) {
      matched = groups.find((g) => g.title === 'Gemini') || groups[0] || null;
    }

    const q5hVal = matched ? matched.q5h || '--%' : '--%';
    const qWkVal = matched ? matched.qWk || '--%' : '--%';
    setK('pill5h', q5hVal);
    setK('pillWk', qWkVal);
    root.dataset.preferWkOnly = q5hVal === '--%' && qWkVal !== '--%' ? '1' : '0';
    return mt;
  };
  root._applyModelQuota = applyModelQuota;
  const modelText = applyModelQuota();

  const nativeChildren = Array.from(footerLeft.children);
  const modelTargets = nativeChildren.filter((el) => el.textContent.trim());
  const syncSqueezeClasses = (compress) => {
    footerLeft.classList.toggle('dk-fl-squeezed', !!compress);
    for (const target of modelTargets) {
      target.classList.toggle('dk-model-squeezed', !!compress);
      target.classList.toggle('dk-model-squeezed-hard', compress === 'hard');
      for (const el of [target, ...target.querySelectorAll('div, span, button, a, p, label')]) {
        const text = el.textContent.trim();
        el.classList.toggle('dk-squeeze-box', !!compress && !!text && (el.children.length > 0 || text.length > 5));
        el.classList.toggle('dk-squeeze-item', !!compress && !!text && el.children.length === 0 && text.length <= 5);
      }
    }
  };
  const adjustLayout = () => {
    if (!root.isConnected) return;
    dock.style.minWidth = '0px';
    if (!onCtx && !onSpeed && !on5h && !onWk) { syncSqueezeClasses(''); root._placePopovers(); return; }
    const compact = !on5h || root.dataset.preferWkOnly === '1' ? 'dk-hide-5h' : 'dk-hide-wk';
    const modeClasses = ['dk-hide-speed', 'dk-hide-wk', 'dk-hide-5h', 'dk-hide-qval', 'dk-hide-cval', 'dk-hide-quota', 'dk-hide-all'];
    const modes = [
      { classes: [], compress: '' },
      { classes: ['dk-hide-speed'], compress: '' },
      { classes: ['dk-hide-speed', compact], compress: '' },
      { classes: ['dk-hide-speed', compact, 'dk-hide-qval'], compress: '' },
      { classes: ['dk-hide-speed', compact, 'dk-hide-qval', 'dk-hide-cval'], compress: '' },
      { classes: ['dk-hide-speed', compact, 'dk-hide-qval', 'dk-hide-cval'], compress: 'soft' },
      { classes: ['dk-hide-speed', compact, 'dk-hide-qval', 'dk-hide-cval'], compress: 'hard' },
      { classes: ['dk-hide-speed', 'dk-hide-cval', 'dk-hide-quota'], compress: 'hard' },
      { classes: ['dk-hide-all'], compress: 'hard' },
    ];
    for (const mode of modes) {
      for (const strip of strips) {
        for (const cls of modeClasses) strip.classList.toggle(cls, mode.classes.includes(cls));
      }
      syncSqueezeClasses(mode.compress);
      // Only measure layout boxes. Popover overflow and in-flight button
      // animations must not change which responsive mode fits on the next poll.
      const needed = root.offsetWidth + rootR.offsetWidth + (root.offsetWidth && rootR.offsetWidth ? 8 : 0);
      if (mode.compress) dock.style.minWidth = needed + 'px';
      const fr = footer.getBoundingClientRect();
      const rr = rightHost?.getBoundingClientRect();
      const controlsFit = !rr || rr.right <= fr.right + 1;
      const modelFits = !!mode.compress || footerLeft.scrollWidth <= footerLeft.clientWidth + 1;
      if (needed <= dock.clientWidth + 1 && controlsFit && modelFits) break;
    }
    root._placePopovers();
  };
  root._adjustLayout = adjustLayout;

  if (root._observedFooter !== footer) {
    root._modelObserver?.disconnect();
    root._resizeObserver?.disconnect();
    root._observedFooter = footer;
    const scheduleLayout = () => {
      if (root._layoutFrame) return;
      root._layoutFrame = requestAnimationFrame(() => {
        root._layoutFrame = 0;
        root._applyModelQuota();
        root._adjustLayout();
      });
    };
    root._modelObserver = new MutationObserver((mutations) => {
      if (mutations.some((m) => !dock.contains(m.target) && m.target !== dock)) scheduleLayout();
    });
    root._modelObserver.observe(footer, { subtree: true, characterData: true, childList: true });
    if (typeof ResizeObserver !== 'undefined') {
      root._resizeObserver = new ResizeObserver(scheduleLayout);
      for (const el of [footer, footerLeft, dock, rightHost]) if (el) root._resizeObserver.observe(el);
    }
  }

  // Update progress bar & cache cooling indicator in the owning strip.
  for (const strip of strips) {
    const segRead = strip.querySelector('[data-el="segRead"]');
    const segOut = strip.querySelector('[data-el="segOut"]');
    const segThink = strip.querySelector('[data-el="segThink"]');
    const segTurn0 = strip.querySelector('[data-el="segTurn0"]');
    const dotCached = strip.querySelector('[data-el="dotCached"]');
    const ctxIconSvg = strip.querySelector('[data-el="ctxIconSvg"]');

    if (segRead) segRead.style.width = d.segReadW;
    if (segOut) segOut.style.width = d.segOutW;
    if (segThink) segThink.style.width = d.segThinkW;
    if (segTurn0) segTurn0.style.width = d.segTurn0W;
    if (ctxIconSvg) ctxIconSvg.style.color = d.ctxIconColor || '';
    if (dotCached && dotCached.innerHTML !== d.cacheIconSvg) {
      dotCached.innerHTML = d.cacheIconSvg;
    }
    const valCacheHitEl = strip.querySelector('[data-el="valCacheHitEl"]');
    if (valCacheHitEl) {
      valCacheHitEl.style.color = d.cacheValColor;
      valCacheHitEl.style.textDecoration = d.cacheValDeco;
      valCacheHitEl.style.opacity = d.cacheValOp;
    }
    for (const el of strip.querySelectorAll('[data-k="valCacheHitK"]')) {
      el.style.color = d.cacheValColor;
    }

    // Update Quota Popover HTML
    const quotaPop = strip.querySelector('[data-el="quotaPop"]');
    if (quotaPop && quotaPop.innerHTML !== d.quotaHtml) {
      quotaPop.innerHTML = d.quotaHtml;
    }
  }

  adjustLayout();
  root._settingsKey = settingsKey;
  if (settingsChanged && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const visible = new Set();
    for (const strip of strips) {
      for (const grp of strip.querySelectorAll('.dk-grp')) {
        const pill = grp.querySelector('.dk-pill');
        const rect = grp.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        visible.add(grp.dataset.el);
        const previous = previousCapsules.get(grp.dataset.el);
        const dx = previous ? previous.rect.left - rect.left : 0;
        const dy = previous ? previous.rect.top - rect.top : 3;
        if (!previous || Number(previous.opacity) < 1 || Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          pill.style.willChange = 'transform, opacity';
          const motion = pill.animate([
            { opacity: previous ? previous.opacity : 0, transform: `translate3d(${dx}px, ${dy}px, 0)` },
            { opacity: 1, transform: 'none' },
          ], { duration: 160, easing: 'cubic-bezier(0.2, 0.65, 0.3, 1)' });
          pill._deckMotion = motion;
          const finish = () => { if (pill._deckMotion === motion) { pill.style.willChange = ''; pill._deckMotion = null; } };
          motion.finished.then(finish, finish);
        }
      }
    }
    for (const [key, previous] of previousCapsules) {
      if (visible.has(key)) continue;
      const ghost = previous.pill;
      ghost.dataset.dkGhost = '';
      ghost.dataset.dkKey = key;
      ghost.removeAttribute('aria-expanded');
      ghost.removeAttribute('id');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.tabIndex = -1;
      Object.assign(ghost.style, {
        position: 'fixed', left: previous.rect.left + 'px', top: previous.rect.top + 'px',
        width: previous.rect.width + 'px', height: previous.rect.height + 'px',
        pointerEvents: 'none', zIndex: '999998', margin: '0',
      });
      if (!root._animationLayer) {
        const layer = document.createElement('div');
        layer.id = 'deck-metrics-strip-animations';
        layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:999998';
        document.body.appendChild(layer);
        root._animationLayer = layer;
      }
      const layer = root._animationLayer;
      layer.style.fontFamily = controlStyle.fontFamily;
      layer.style.fontSize = controlStyle.fontSize;
      layer.style.fontWeight = controlStyle.fontWeight;
      layer.style.lineHeight = controlStyle.lineHeight;
      layer.style.color = controlStyle.color;
      for (const prop of ['--dk-control-height', '--dk-control-padding', '--dk-control-radius', '--dk-icon-size']) layer.style.setProperty(prop, root.style.getPropertyValue(prop));
      layer.appendChild(ghost);
      const animation = ghost.animate([{ opacity: previous.opacity }, { opacity: 0, transform: 'translateY(3px)' }], { duration: 120, easing: 'ease-out' });
      animation.finished.then(() => ghost.remove(), () => ghost.remove());
    }
  }

  return 'ok:' + modelText;
}

function fmtK(n) {
  const num = Number(n || 0);
  if (num < 1000) return String(num);
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
}

function fmtColK(n) {
  const num = Number(n || 0);
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  return (num / 1000).toFixed(1) + 'k';
}

function formatResetShort(isoStr) {
  if (!isoStr) return '';
  const diffMs = new Date(isoStr).getTime() - Date.now();
  if (diffMs <= 0) return 'soon';
  const totalMin = Math.floor(diffMs / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return d + 'd ' + String(h).padStart(2, '0') + 'h';
  if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
  return String(Math.max(1, m)).padStart(2, '0') + 'm';
}

function makeRingSvg(frac) {
  const clamped = Math.max(0, Math.min(1, Number(frac || 0)));
  const r = 6.5;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped);
  const color = clamped <= 0.1 ? '#ef4444' : clamped <= 0.25 ? '#f59e0b' : '#4ea84e';
  return (
    '<svg width="16" height="16" viewBox="0 0 18 18" style="transform: rotate(-90deg); flex-shrink: 0;">' +
    '<circle cx="9" cy="9" r="' + r + '" fill="none" stroke="rgba(142,142,147,0.28)" stroke-width="2.2"/>' +
    '<circle cx="9" cy="9" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="2.2" stroke-linecap="round" ' +
    'stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + offset.toFixed(2) + '"/>' +
    '</svg>'
  );
}

function formatGroupTitle(raw) {
  const s = String(raw || '').trim();
  if (s === 'Gemini Models') return 'Gemini';
  if (s.toLowerCase().startsWith('claude')) return 'Claude';
  return s;
}

// Self-contained so the sidecar page can reuse the same labels and formatting.
function speedToView(d) {
  const formatRate = (n) => Number.isFinite(n) && n > 0 ? n.toFixed(1) + ' tok/s' : '-- tok/s';
  const speedText = formatRate(d.tokensPerSecond);
  const streamSpeedText = formatRate(d.streamingTokensPerSecond);
  const ttftText = Number.isFinite(d.timeToFirstTokenSeconds) && d.timeToFirstTokenSeconds >= 0
    ? d.timeToFirstTokenSeconds.toFixed(2) + ' s' : '-- s';
  return {
    speedText,
    streamSpeedText,
    ttftText,
    speedLabel: d.speedFromPreviousGeneration ? 'Overall (prev.)' : 'Overall',
  };
}

function toView(d) {
  const maxCtx = d.maxContextTokens || 0;
  const ctx = d.contextTokens || 0;
  const cached = d.cachedIn || 0;
  const out = d.totalOutputTokens || 0;
  const think = d.totalThinkingTokens || 0;
  const turn0 = d.turn0Tokens || 0;
  const read = Math.max(0, ctx - turn0 - out - think);

  const hasMax = maxCtx > 0;
  const usedPctRound = hasMax ? Math.round((ctx / maxCtx) * 100) : 0;
  const usedPctExact = hasMax ? Math.min(100, (ctx / maxCtx) * 100) : 0;
  const compSum = read + out + think + turn0;
  const scale = compSum > 0 ? usedPctExact / compSum : 0;

  const segReadW = (read * scale).toFixed(2) + '%';
  const segOutW = (out * scale).toFixed(2) + '%';
  const segThinkW = (think * scale).toFixed(2) + '%';
  const segTurn0W = (turn0 * scale).toFixed(2) + '%';

  const pctStr = (val) => (hasMax ? Math.round((val / maxCtx) * 100) + '%' : (ctx === 0 ? '0%' : '--%'));
  const readPct = pctStr(read);
  const outPct = pctStr(out);
  const thinkPct = pctStr(think);
  const turn0Pct = pctStr(turn0);
  const cacheHitPct = ctx > 0 ? Math.round((cached / ctx) * 100) : 0;

  const idleSec = ctx > 0 && d.lastStepEpochMs ? Math.max(0, Math.floor((Date.now() - d.lastStepEpochMs) / 1000)) : 0;
  let cacheIconSvg =
    '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6.5 4.8 9.2 10 3"/></svg>';
  let cacheValColor = '';
  let cacheValDeco = 'none';
  let cacheValOp = '1';
  let valCacheHit = cacheHitPct + '%';
  let valCacheHitK = '';
  let ctxIconColor = '';

  if (idleSec >= 240) {
    cacheIconSvg =
      '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#e06c75" stroke-width="2" stroke-linecap="round"><line x1="2.2" y1="2.2" x2="9.8" y2="9.8"/><line x1="9.8" y1="2.2" x2="2.2" y2="9.8"/></svg>';
    cacheValDeco = 'line-through';
    cacheValOp = '0.5';
    ctxIconColor = 'rgba(208, 122, 128, 0.88)';
  } else if (idleSec >= 180) {
    const remMin = Math.max(1, Math.ceil((240 - idleSec) / 60));
    cacheIconSvg =
      '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#d4940a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="4.8"/><polyline points="6 3.5 6 6 7.8 7.2"/></svg>';
    cacheValColor = '#d4940a';
    valCacheHitK = '~' + remMin + 'm';
    ctxIconColor = 'rgba(206, 168, 92, 0.88)';
  }

  const quotaSummaryGroups = [];
  let quotaHtml = '';
  const windowOrder = { '5h': 0, weekly: 1 };
  for (const g of d.quotaGroups || []) {
    const rawName = String(g.displayName || '').trim().toLowerCase();
    const title = formatGroupTitle(g.displayName);
    const descMatch = String(g.description || '').match(/models within this group:\s*([^\n.]+)/i);
    const modelsInGroup = descMatch ? descMatch[1].toLowerCase() : '';
    let q5h = '--%';
    let qWk = '--%';

    quotaHtml += '<div class="dk-q-group">';
    quotaHtml += '<div class="dk-q-title">' + title + '</div>';
    const buckets = [...(g.buckets || [])].sort(
      (a, b) => (windowOrder[a.window] ?? 2) - (windowOrder[b.window] ?? 2)
    );
    for (const b of buckets) {
      const baseLabel =
        b.window === 'weekly'
          ? 'Weekly'
          : b.window === '5h'
            ? '5 Hours'
            : String(b.displayName || b.window || '')
                .replace(/\s*limit\b/gi, '')
                .replace(/\b5h(?:ours)?\b/gi, '5 Hours')
                .trim();
      const resetShort = formatResetShort(b.resetTime);
      const pctLeft = Math.round((b.remainingFraction || 0) * 100);
      const pctStr = pctLeft + '%';

      if (b.window === '5h') q5h = pctStr;
      if (b.window === 'weekly') qWk = pctStr;

      quotaHtml += '<div class="dk-q-row">';
      quotaHtml += '  <span class="dk-q-label">' + baseLabel + '</span>';
      quotaHtml += '  <span class="dk-q-right"><span>' + pctLeft + '%</span>' + makeRingSvg(b.remainingFraction) + '</span>';
      quotaHtml += '  <span class="dk-q-mid">' + resetShort + '</span>';
      quotaHtml += '</div>';
    }
    quotaHtml += '</div>';
    quotaSummaryGroups.push({ title, rawName, modelsInGroup, q5h, qWk });
  }

  return {
    pillCtx: hasMax ? usedPctRound + '%' : (ctx === 0 ? '0%' : '--%'),
    ...speedToView(d),
    ctxIconColor,
    usedPctText: hasMax ? usedPctRound + '% used' : (ctx === 0 ? '0% used' : '--% used'),
    usedFrac: fmtK(ctx) + ' / ' + (hasMax ? fmtK(maxCtx) : '--'),
    segReadW,
    segOutW,
    segThinkW,
    segTurn0W,
    cacheIconSvg,
    cacheValColor,
    cacheValDeco,
    cacheValOp,
    valCacheHit,
    valCacheHitK,
    valTurn0Pct: turn0Pct,
    valTurn0K: fmtColK(turn0),
    valReadPct: readPct,
    valReadK: fmtColK(read),
    valThinkPct: thinkPct,
    valThinkK: fmtColK(think),
    valOutPct: outPct,
    valOutK: fmtColK(out),
    valRead: readPct + ' · ' + fmtK(read),
    valOut: outPct + ' · ' + fmtK(out),
    valThink: thinkPct + ' · ' + fmtK(think),
    valTurn0: turn0Pct + ' · ' + fmtK(turn0),
    quotaSummaryGroups,
    quotaHtml,
    settings: getSettings(),
    instanceTs: INSTANCE_TS,
  };
}

function render(entry, view) {
  entry.view = view;
  entry.renderPending = true;
  if (entry.rendering) return entry.rendering;
  entry.rendering = (async () => {
    while (entry.renderPending) {
      entry.renderPending = false;
      // Always use the latest settings, even when an older telemetry read or
      // renderer update was already in flight when the user clicked.
      const argument = JSON.stringify({ ...entry.view, settings: getSettings() });
      const key = JSON.stringify(MOUNT_KEY);
      let res = await evaluate(entry, `typeof window[${key}]==='function'?window[${key}](${argument}):'needs-install'`);
      if (res === 'needs-install') {
        // Compile once per renderer document; routine updates send only data.
        res = await evaluate(entry, `(window[${key}]=(${pageMount.toString()}))(${argument})`);
      }
      if (res === 'superseded') process.exit(0);
      if (res?.startsWith('ok')) lastErr = '';
    }
  })().finally(() => { entry.rendering = null; });
  return entry.rendering;
}

async function tick(inspect, isActive) {
  const port = readCdpPort();
  if (!port) return logOnce('DevToolsActivePort not found');
  let targets;
  try {
    targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  } catch (e) {
    return logOnce('CDP list failed: ' + e.message);
  }
  const pages = targets.filter(
    (t) => t.type === 'page' && /^https?:\/\/127\.0\.0\.1/.test(t.url || '') && t.webSocketDebuggerUrl
  );
  for (const t of pages) {
    if (!isActive()) return;
    try {
      const entry = sockets.get(t.id) || (await connect(t));
      const path = (await evaluate(entry, 'location.pathname')) || '';
      const m = path.match(/\/c\/([0-9a-f-]{36})/);
      const data = await inspect(m ? m[1] : '', true);
      if (!isActive()) return;
      if (data?.error) continue;
      await render(entry, toView(data));
    } catch (e) {
      sockets.delete(t.id);
      logOnce('page ' + t.id + ': ' + e.message);
    }
  }
}

export { pageMount, toView, speedToView };

export function startDeckInjector(inspect) {
  let busy = false;
  let stopped = false;
  const poll = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      await tick(inspect, () => !stopped);
    } finally {
      busy = false;
    }
  };
  // Layout changes bypass telemetry polling and any slow quota fetch. Pending
  // updates coalesce per renderer instead of replaying obsolete destinations.
  const unsubscribe = onSettingsChange(() => {
    for (const [id, entry] of sockets) {
      if (entry.view) render(entry, entry.view).catch(e => {
        if (sockets.get(id) === entry) sockets.delete(id);
        logOnce('settings update: ' + e.message);
      });
    }
  });
  const timer = setInterval(poll, INTERVAL_MS);
  void poll();
  console.log('[deck] injector started, port file:', PORT_FILE);
  return () => {
    stopped = true;
    clearInterval(timer);
    unsubscribe();
    for (const entry of sockets.values()) entry.ws.close();
    sockets.clear();
  };
}
