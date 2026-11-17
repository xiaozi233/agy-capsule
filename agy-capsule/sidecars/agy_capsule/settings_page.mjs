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
    ([key, label]) => `      <div class="row layout-row" data-layout-key="${key}" draggable="true">
        <span class="drag-handle" aria-hidden="true">⠿</span>
        <div class="row-main"><div class="row-label">${label}</div></div>
        <div class="order-controls">
          <button data-move="-1" aria-label="Move ${label} earlier" title="Move earlier"><svg viewBox="0 0 14 14"><path d="m3.5 8.5 3.5-3.5 3.5 3.5"/></svg></button>
          <button data-move="1" aria-label="Move ${label} later" title="Move later"><svg viewBox="0 0 14 14"><path d="m3.5 5.5 3.5 3.5 3.5-3.5"/></svg></button>
        </div>
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
  .section-hint { margin: -2px 0 10px; color: var(--muted-foreground, #87888f); font-size: 11.5px; }
  .layout-label { margin: 10px 0 5px; color: var(--muted-foreground, #87888f); font-size: 11.5px; }
  .layout-list { min-height: var(--row-h); }
  .layout-list:empty::after { content: 'Drop a capsule here'; display: block; padding: 14px 12px; color: var(--muted-foreground, #87888f); font-size: 11.5px; }
  .drag-handle { color: var(--muted-foreground, #87888f); cursor: grab; font-size: 18px; }
  .layout-row.dragging { opacity: 0.45; }
  .layout-row.drop-before { box-shadow: inset 0 2px var(--foreground, #e6e6ea); }
  .layout-row.drop-after { box-shadow: inset 0 -2px var(--foreground, #e6e6ea); }
  .layout-list.drag-over { outline: 1px solid var(--ring, var(--foreground, #e6e6ea)); outline-offset: -1px; }
  .order-controls { display: inline-flex; gap: 1px; }
  .order-controls button { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 24px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--muted-foreground, #87888f); cursor: pointer; }
  .order-controls button:hover:enabled { background: var(--accent, #26262b); color: var(--foreground, #e6e6ea); }
  .order-controls button:disabled { opacity: 0.25; cursor: default; }
  .order-controls svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
  .pos, .style-options {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    flex: 0 0 auto;
    border-radius: calc(var(--radius, 0.5rem) - 3px);
    background: color-mix(in srgb, var(--foreground, #e6e6ea) 9%, transparent);
  }
  .pos button, .style-options button {
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
  .style-options button { width: auto; min-width: 52px; padding: 0 8px; gap: 5px; font: inherit; font-size: 12px; }
  .style-options svg { width: 16px; height: 16px; }
  .pos button:hover, .style-options button:hover { color: var(--foreground, #e6e6ea); }
  .pos button[aria-pressed="true"], .style-options button[aria-pressed="true"] {
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
  .switch:focus-visible, .pos button:focus-visible, .order-controls button:focus-visible, .style-options button:focus-visible {
    outline: 2px solid var(--ring, var(--border, #303034));
    outline-offset: 2px;
  }
  .note { margin-top: 18px; color: var(--muted-foreground, #87888f); font-size: 11.5px; }
  .note.failed { color: var(--danger, #f09595); }
  @media (prefers-reduced-motion: reduce) {
    .switch, .switch::after, .pos button, .style-options button { transition: none; }
  }
</style>
</head>
<body>
  <div class="title">agy-capsule</div>
  <div class="sub">Choose what appears in the composer and where.</div>

  <div class="section">
    <div class="section-label">Capsules</div>
    <div class="card">
${SWITCH_HTML}
    </div>
  </div>

  <div class="section">
    <div class="section-label">Appearance</div>
    <div class="card">
      <div class="row">
        <div class="row-main">
          <div class="row-label">Context style</div>
          <div class="row-hint">Fill: context used · Color: cache state</div>
        </div>
        <div class="style-options" role="group" aria-label="Context style">
          <button data-context-style="classic" aria-pressed="true">Value</button>
          <button data-context-style="ring" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9.5" opacity="0.2"/><g transform="rotate(-90 12 12)" stroke-linecap="round"><circle cx="12" cy="12" r="9.5" pathLength="100" stroke-dasharray="35 100"/></g></svg>Ring</button>
        </div>
      </div>
    </div>
    <div class="section-hint" style="margin:6px 0 0">Progress turns amber after 3 minutes, red after 4 minutes.</div>
  </div>

  <div class="section">
    <div class="section-label">Layout</div>
    <div class="section-hint">Drag to reorder or change sides. Arrows move earlier / later from left to right.</div>
    <div class="layout-label">Near the left controls</div>
    <div class="card layout-list" data-side="left">
${POS_HTML}
    </div>
    <div class="layout-label">Near the right controls</div>
    <div class="card layout-list" data-side="right"></div>
  </div>

  <div class="note" id="note"></div>

<script>
  const token =
    new URLSearchParams(location.search).get('token') || window.sidecar?.token || '';
  const note = document.getElementById('note');
  let state = {};
  let saveQueue = Promise.resolve();
  let confirmed = {};
  let confirmedRevision = 0;
  let pendingPatch = {};
  let saving = false;
  const layoutKeys = ['context', 'speed', 'quota'];
  function orderOf() {
    return [...new Set([...(Array.isArray(state.order) ? state.order.filter(k => layoutKeys.includes(k)) : []), ...layoutKeys])];
  }

  function paint() {
    const focused = document.activeElement;
    for (const btn of document.querySelectorAll('.switch')) {
      btn.setAttribute('aria-checked', String(state[btn.dataset.key] !== false));
    }
    for (const btn of document.querySelectorAll('[data-context-style]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.contextStyle === (state.contextStyle === 'ring' ? 'ring' : 'classic')));
    }
    for (const pos of document.querySelectorAll('.pos')) {
      const side = state[pos.dataset.key + 'Side'] === 'right' ? 'right' : 'left';
      for (const btn of pos.querySelectorAll('button')) {
        btn.setAttribute('aria-pressed', String(btn.dataset.v === side));
      }
    }
    for (const list of document.querySelectorAll('.layout-list')) {
      const keys = orderOf().filter(key => (state[key + 'Side'] === 'right' ? 'right' : 'left') === list.dataset.side);
      keys.forEach((key, index) => {
        const row = document.querySelector('[data-layout-key="' + key + '"]');
        if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
        row.querySelector('[data-move="-1"]').disabled = index === 0;
        row.querySelector('[data-move="1"]').disabled = index === keys.length - 1;
      });
    }
    if (focused?.isConnected && document.activeElement !== focused) {
      const target = focused.disabled ? focused.closest('.layout-row')?.querySelector('.order-controls button:enabled, .pos button[aria-pressed="true"]') : focused;
      target?.focus({ preventScroll: true });
    }
  }

  async function load() {
    const beforeLoad = confirmedRevision;
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const loaded = await res.json();
      if (confirmedRevision === beforeLoad) confirmed = loaded;
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
    pendingPatch = { ...pendingPatch, ...patch };
    note.textContent = 'Saving…';
    note.classList.remove('failed');
    if (!saving) saveQueue = flushSaves();
    return saveQueue;
  }

  async function flushSaves() {
    saving = true;
    while (Object.keys(pendingPatch).length) {
      const patch = pendingPatch;
      pendingPatch = {};
      try {
        const res = await fetch('/api/settings/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Sidecar-Token': token } : {}) },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        confirmed = await res.json();
        confirmedRevision++;
        note.textContent = Object.keys(pendingPatch).length ? 'Saving…' : 'Saved.';
        note.classList.remove('failed');
      } catch (e) {
        note.textContent = 'Save failed: ' + e.message;
        note.classList.add('failed');
      }
      state = { ...confirmed, ...pendingPatch };
      paint();
    }
    saving = false;
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
      btn.addEventListener('click', () => { if (state[key] !== btn.dataset.v) save({ [key]: btn.dataset.v }); });
    }
  }

  for (const btn of document.querySelectorAll('[data-context-style]')) {
    btn.addEventListener('click', () => { if (state.contextStyle !== btn.dataset.contextStyle) save({ contextStyle: btn.dataset.contextStyle }); });
  }

  function move(key, side, target, after = false) {
    if (key === target) return;
    const order = orderOf().filter(k => k !== key);
    const index = order.indexOf(target);
    order.splice(index < 0 ? order.length : index + Number(after), 0, key);
    save({ [key + 'Side']: side, order });
  }
  let dragKey = '';
  function clearDrop() {
    for (const el of document.querySelectorAll('.drop-before, .drop-after, .drag-over')) el.classList.remove('drop-before', 'drop-after', 'drag-over');
  }
  for (const row of document.querySelectorAll('.layout-row')) {
    for (const btn of row.querySelectorAll('[data-move]')) btn.addEventListener('click', () => {
      const key = row.dataset.layoutKey;
      const side = state[key + 'Side'] === 'right' ? 'right' : 'left';
      const keys = orderOf().filter(k => (state[k + 'Side'] === 'right' ? 'right' : 'left') === side);
      const direction = Number(btn.dataset.move);
      const target = keys[keys.indexOf(key) + direction];
      if (target) move(key, side, target, direction > 0);
    });
    row.addEventListener('dragstart', ev => {
      dragKey = row.dataset.layoutKey;
      ev.dataTransfer.setData('text/plain', dragKey);
      ev.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => { dragKey = ''; row.classList.remove('dragging'); clearDrop(); });
  }
  for (const list of document.querySelectorAll('.layout-list')) {
    list.addEventListener('dragover', ev => {
      if (!dragKey) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      clearDrop();
      list.classList.add('drag-over');
      const row = ev.target.closest('.layout-row');
      if (row && row.dataset.layoutKey !== dragKey) row.classList.add(ev.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2 ? 'drop-after' : 'drop-before');
    });
    list.addEventListener('dragleave', ev => { if (!list.contains(ev.relatedTarget)) clearDrop(); });
    list.addEventListener('drop', ev => {
      if (!dragKey) return;
      ev.preventDefault();
      const row = ev.target.closest('.layout-row');
      const after = row && ev.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
      move(dragKey, list.dataset.side, row?.dataset.layoutKey, after);
      clearDrop();
    });
  }

  load();
</script>
</body>
</html>`;
