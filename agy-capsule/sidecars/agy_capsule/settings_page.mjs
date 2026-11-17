// Settings pane registered as a Sidecar UI view (Overview panel → Extensions).
const POS_ICON = (side) =>
  '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
  (side === 'left'
    ? '<path d="M11.5 7H2.5"/><path d="M6 3.5 2.5 7 6 10.5"/>'
    : '<path d="M2.5 7h9"/><path d="M8 3.5 11.5 7 8 10.5"/>') +
  '</svg>';

const ROWS = [
  ['context', 'Context', 'Used window and token breakdown'],
  ['speed', 'Speed', 'Overall, streaming and TTFT'],
  ['quota5h', '5 hour quota', 'Rolling window remaining'],
  ['quotaWeekly', 'Weekly quota', 'Weekly window remaining'],
];

const SWITCH_HTML = ROWS.map(
  ([key, label, hint]) => `      <div class="row">
        <div class="row-main">
          <div class="row-label">${label}</div>
          <div class="row-hint">${hint}</div>
        </div>
        <button class="switch" data-key="${key}" role="switch" aria-checked="true" aria-label="${label} capsule"></button>
      </div>`
).join('\n');

const POS_HTML = [
  ['context', 'Context'],
  ['speed', 'Speed'],
  ['quota', 'Quota'],
]
  .map(
    ([key, label]) => `      <div class="row">
        <div class="row-main"><div class="row-label">${label}</div></div>
        <div class="pos" data-key="${key}">
          <button data-v="left" aria-pressed="true" aria-label="Near the left controls" title="Near the left controls">${POS_ICON('left')}</button>
          <button data-v="right" aria-pressed="false" aria-label="Near the right controls" title="Near the right controls">${POS_ICON('right')}</button>
        </div>
      </div>`
  )
  .join('\n');

export const SETTINGS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>agy-capsule settings</title>
<script src="/preload.js"></script>
<style>
  :root { color-scheme: dark light; --row-h: 46px; }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    padding: 18px 18px 28px;
    background: var(--background, #070708);
    color: var(--foreground, #e6e6ea);
    font-family: var(--font-sans, system-ui, -apple-system, "Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif);
    font-size: 13px;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
    user-select: none;
  }
  .title { font-size: 14px; font-weight: 500; }
  .sub { color: var(--muted-foreground, #87888f); font-size: 12px; margin-top: 3px; }
  .section { margin-top: 22px; }
  .section-label {
    color: var(--muted-foreground, #87888f);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .card {
    background: var(--card, #15151a);
    border: 1px solid var(--border, #303034);
    border-radius: var(--radius, 0.5rem);
    overflow: hidden;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--row-h);
    padding: 0 10px 0 12px;
  }
  .row + .row { border-top: 1px solid var(--border, #303034); }
  .row-main { min-width: 0; flex: 1 1 auto; }
  .row-label { font-size: 13px; }
  .row-hint { color: var(--muted-foreground, #87888f); font-size: 11.5px; margin-top: 1px; }
  .pos {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    flex: 0 0 auto;
    border-radius: calc(var(--radius, 0.5rem) - 3px);
    background: color-mix(in srgb, var(--foreground, #e6e6ea) 9%, transparent);
  }
  .pos button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--muted-foreground, #87888f);
    cursor: pointer;
    transition: background 120ms ease-out, color 120ms ease-out;
  }
  .pos button:hover { color: var(--foreground, #e6e6ea); }
  .pos button[aria-pressed="true"] {
    background: var(--accent, #26262b);
    color: var(--accent-foreground, var(--foreground, #e6e6ea));
  }
  .pos svg { width: 14px; height: 14px; }
  .switch {
    position: relative;
    flex: 0 0 auto;
    width: 32px;
    height: 18px;
    border-radius: 999px;
    border: none;
    padding: 0;
    cursor: pointer;
    background: color-mix(in srgb, var(--foreground, #e6e6ea) 22%, transparent);
    transition: background 140ms ease-out;
  }
  .switch::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--background, #070708);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
    transition: transform 140ms ease-out, background 140ms ease-out;
  }
  .switch[aria-checked="true"] { background: var(--primary, var(--foreground, #e6e6ea)); }
  .switch[aria-checked="true"]::after {
    transform: translateX(14px);
    background: var(--primary-foreground, var(--background, #070708));
  }
  .switch:focus-visible, .pos button:focus-visible {
    outline: 2px solid var(--ring, var(--border, #303034));
    outline-offset: 2px;
  }
  .note { margin-top: 18px; color: var(--muted-foreground, #87888f); font-size: 11.5px; }
  .note.failed { color: var(--danger, #f09595); }
  @media (prefers-reduced-motion: reduce) {
    .switch, .switch::after, .pos button { transition: none; }
  }
</style>
</head>
<body>
  <div class="title">agy-capsule</div>
  <div class="sub">Toggle each readout, or place it near the left or right controls.</div>

  <div class="section">
    <div class="section-label">Capsules</div>
    <div class="card">
${SWITCH_HTML}
    </div>
  </div>

  <div class="section">
    <div class="section-label">Position</div>
    <div class="card">
${POS_HTML}
    </div>
  </div>

  <div class="note" id="note"></div>

<script>
  const token =
    new URLSearchParams(location.search).get('token') || window.sidecar?.token || '';
  const note = document.getElementById('note');
  let state = {};
  let saveQueue = Promise.resolve();
  let revision = 0;
  let confirmed = {};

  function paint() {
    for (const btn of document.querySelectorAll('.switch')) {
      btn.setAttribute('aria-checked', String(state[btn.dataset.key] !== false));
    }
    for (const pos of document.querySelectorAll('.pos')) {
      const side = state[pos.dataset.key + 'Side'] === 'right' ? 'right' : 'left';
      for (const btn of pos.querySelectorAll('button')) {
        btn.setAttribute('aria-pressed', String(btn.dataset.v === side));
      }
    }
  }

  async function load() {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      confirmed = await res.json();
      state = { ...confirmed, ...state };
      paint();
    } catch (e) {
      note.textContent = 'Could not load settings.';
      note.classList.add('failed');
    }
  }

  function save(patch) {
    state = { ...state, ...patch };
    paint();
    const currentRevision = ++revision;
    note.textContent = 'Saving…';
    saveQueue = saveQueue.then(async () => {
      try {
        const res = await fetch('/api/settings/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Sidecar-Token': token } : {}) },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        confirmed = await res.json();
        if (currentRevision !== revision) return;
        state = { ...confirmed };
        paint();
        note.textContent = 'Saved. The composer updates within a second.';
        note.classList.remove('failed');
      } catch (e) {
        if (currentRevision !== revision) return;
        state = { ...confirmed };
        paint();
        note.textContent = 'Save failed: ' + e.message;
        note.classList.add('failed');
      }
    });
    return saveQueue;
  }

  for (const btn of document.querySelectorAll('.switch')) {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      save({ [key]: state[key] === false });
    });
  }
  for (const pos of document.querySelectorAll('.pos')) {
    const key = pos.dataset.key + 'Side';
    for (const btn of pos.querySelectorAll('button')) {
      btn.addEventListener('click', () => save({ [key]: btn.dataset.v }));
    }
  }

  load();
</script>
</body>
</html>`;
