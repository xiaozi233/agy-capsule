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
  speedSide: 'left',
  quotaSide: 'left',
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
  return {
    context: s.context !== false,
    speed: s.speed !== false,
    quota5h: s.quota5h !== false,
    quotaWeekly: s.quotaWeekly !== false,
    contextSide: side(s.contextSide),
    speedSide: side(s.speedSide),
    quotaSide: side(s.quotaSide),
  };
}

let cache = null;

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
  try {
    mkdirSync(dataDir(), { recursive: true });
    writeFileSync(settingsPath(), JSON.stringify(next, null, 2) + '\n');
  } catch (e) {
    console.error('[settings] save failed:', e.message);
    throw e;
  }
  cache = next;
  return next;
}
