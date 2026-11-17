// Persisted display settings for the composer capsules. Stored next to the
// sidecar's own data so it survives plugin updates and restarts.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULTS = {
  context: true,
  speed: true,
  quota5h: true,
  quotaWeekly: true,
  contextSide: 'left',
  contextStyle: 'classic',
  speedSide: 'left',
  quotaSide: 'left',
  order: ['context', 'speed', 'quota'],
};

export function dataDir() {
  return (
    process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR ||
    join(homedir(), '.gemini', 'antigravity', 'sidecar_data', 'agy-capsule', 'agy_capsule', 'data')
  );
}

function settingsPath() {
  return join(dataDir(), 'settings.json');
}

function normalize(raw) {
  const s = raw || {};
  const side = (v) => (v === 'right' ? 'right' : 'left');
  const order = Array.isArray(s.order) ? s.order.filter((key) => DEFAULTS.order.includes(key)) : [];
  return {
    context: s.context !== false,
    speed: s.speed !== false,
    quota5h: s.quota5h !== false,
    quotaWeekly: s.quotaWeekly !== false,
    contextSide: side(s.contextSide),
    contextStyle: s.contextStyle === 'ring' ? 'ring' : 'classic',
    speedSide: side(s.speedSide),
    quotaSide: side(s.quotaSide),
    order: [...new Set([...order, ...DEFAULTS.order])],
  };
}

let cache = null;
const listeners = new Set();

export function onSettingsChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSettings() {
  if (cache) return cache;
  let raw = {};
  try {
    raw = JSON.parse(readFileSync(settingsPath(), 'utf-8'));
  } catch {
    raw = {};
  }
  cache = normalize({ ...DEFAULTS, ...raw });
  return cache;
}

export function saveSettings(patch) {
  const next = normalize({ ...getSettings(), ...(patch || {}) });
  if (JSON.stringify(next) === JSON.stringify(cache)) return cache;
  try {
    mkdirSync(dataDir(), { recursive: true });
    writeFileSync(settingsPath(), JSON.stringify(next, null, 2) + '\n');
  } catch (e) {
    console.error('[settings] save failed:', e.message);
    throw e;
  }
  cache = next;
  for (const listener of listeners) {
    try { listener(next); } catch (e) { console.error('[settings] update failed:', e.message); }
  }
  return next;
}
