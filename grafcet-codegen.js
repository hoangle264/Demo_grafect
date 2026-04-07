"use strict";
// ═══════════════════════════════════════════════════════════
//  GRAFCET Code Generator — grafcet-codegen.js
//  Target: Keyence KV Mnemonic IL (.mnm)
//  Planned: IEC 61131-3 ST (.st) — demo/stub only
//
//  Reads from global: project, loadDiagramData(), flushState(),
//  resolveStepsThrough(), toast(), esc2()
// ═══════════════════════════════════════════════════════════

// ─── Entry Point ─────────────────────────────────────────────────────────────
function showGenerateCodeModal() {
  // Cho phép mở modal ngay cả khi không có diagram — unit-config mode không cần diagram
  if (activeDiagramId && typeof flushState === 'function') flushState();

  let el = document.getElementById('modal-codegen');
  if (el) el.remove();
  el = document.createElement('div');
  el.id = 'modal-codegen';
  el.className = 'modal-bg show';

  el.innerHTML = `
    <div class="modal" style="min-width:720px;max-width:96vw;max-height:92vh;
      display:flex;flex-direction:column;padding:0;overflow:hidden;">

      <!-- Header -->
      <div style="padding:12px 20px;background:var(--s3);border-bottom:1px solid var(--border);
        display:flex;align-items:center;gap:10px;flex-shrink:0;">
        <span style="font-size:14px;">⟨/⟩</span>
        <span style="font-size:12px;letter-spacing:2px;font-family:'Orbitron',monospace;">GENERATE CODE</span>
        <span style="flex:1;"></span>
        <button class="btn" onclick="closeModal('modal-codegen')" style="padding:2px 10px;">✕</button>
      </div>

      <!-- Options row -->
      <div style="padding:10px 20px;border-bottom:1px solid var(--border);display:flex;
        gap:20px;align-items:flex-end;flex-wrap:wrap;flex-shrink:0;background:var(--s2);">

        <!-- Target PLC -->
        <div>
          <div style="font-size:9px;color:var(--text3);letter-spacing:1px;margin-bottom:5px;">TARGET PLC</div>
          <select id="cg-target" onchange="cgUpdatePreview()"
            style="background:var(--bg);border:1px solid var(--border);color:var(--cyan);
            font-family:'JetBrains Mono',monospace;font-size:11px;padding:4px 8px;
            border-radius:3px;outline:none;">
            <option value="kv-5500">🔵 Keyence KV-5500 / 5000 / 3000</option>
            <option value="kv-8000">🔵 Keyence KV-8000 / 7500</option>
            <option value="melsec">🟠 Mitsubishi MELSEC iQ-R / F / L</option>
            <option value="omron">🟢 Omron CJ / CS / NJ / NX</option>
            <option value="siemens">🟡 Siemens S7-1200 / 1500 (AWL)</option>
            <option value="st">⬜ IEC 61131-3 ST [demo]</option>
            <option value="unit-config">🟣 Unit Config JSON</option>
          </select>
        </div>

        <!-- Base MR address (ẩn khi dùng unit-config) -->
        <div id="cg-base-mr-wrap">
          <div style="font-size:9px;color:var(--text3);letter-spacing:1px;margin-bottom:5px;">
            BASE ADDRESS <span style="color:var(--cyan);">@MR</span>
          </div>
          <input id="cg-base-mr" type="number" min="0" max="9999" value="100" step="2"
            style="width:80px;background:var(--bg);border:1px solid var(--border);
            color:var(--cyan);font-family:'JetBrains Mono',monospace;font-size:12px;
            padding:4px 8px;border-radius:3px;outline:none;"
            oninput="cgUpdatePreview()">
        </div>

        <!-- Unit Config JSON file pickers (chỉ hiện khi target = unit-config) -->
        <div id="cg-uc-panel" style="display:none;flex-direction:column;gap:6px;">
          <div style="font-size:9px;color:var(--text3);letter-spacing:1px;margin-bottom:3px;">
            UNIT CONFIG JSON
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <label style="font-size:9px;color:var(--text3);width:110px;">Unit Config: <span style="color:var(--cyan)">*</span></label>
            <input type="file" id="uc-unit-file" accept=".json"
              style="font-size:10px;color:var(--cyan);background:var(--bg);
              border:1px solid var(--border);border-radius:3px;padding:2px 6px;"
              onchange="cgUCLoadFile('uc-unit-file', function(d){ UC_UNIT_CONFIG=d; cgUCUpdateStatus(); cgUpdatePreview(); })">
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <label style="font-size:9px;color:var(--text3);width:110px;">Cylinder Types: <span style="font-size:8px;">(optional)</span></label>
            <input type="file" id="uc-cyl-file" accept=".json"
              style="font-size:10px;color:var(--cyan);background:var(--bg);
              border:1px solid var(--border);border-radius:3px;padding:2px 6px;"
              onchange="cgUCLoadFile('uc-cyl-file', function(d){ UC_CYLINDER_TYPES=d; cgUCUpdateStatus(); cgUpdatePreview(); })">
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <label style="font-size:9px;color:var(--text3);width:110px;">Device Library: <span style="font-size:8px;">(optional)</span></label>
            <input type="file" id="uc-devlib-file" accept=".json"
              style="font-size:10px;color:var(--cyan);background:var(--bg);
              border:1px solid var(--border);border-radius:3px;padding:2px 6px;"
              onchange="cgUCLoadFile('uc-devlib-file', function(d){ cgLoadDeviceLibrary(d); cgUCUpdateStatus(); cgUpdatePreview(); })">
          </div>
          <div id="uc-status" style="font-size:9px;color:var(--text3);margin-top:2px;"></div>
        </div>

        <!-- Diagram selector (ẩn khi dùng unit-config) -->
        <div id="cg-diag-wrap" style="flex:1;min-width:200px;">
          <div style="font-size:9px;color:var(--text3);letter-spacing:1px;margin-bottom:5px;">
            DIAGRAMS
            <button onclick="cgSelectAll(true)"
              style="margin-left:8px;background:none;border:none;color:var(--cyan);
              font-size:9px;cursor:pointer;padding:0;">all</button>
            <button onclick="cgSelectAll(false)"
              style="background:none;border:none;color:var(--text3);
              font-size:9px;cursor:pointer;padding:0;">none</button>
          </div>
          <div id="cg-diag-list" style="display:flex;flex-wrap:wrap;gap:5px;"></div>
        </div>
      </div>

      <!-- Code preview -->
      <div style="flex:1;overflow:auto;padding:0;">
        <pre id="cg-preview"
          style="margin:0;padding:14px 18px;font-family:'JetBrains Mono',monospace;
          font-size:11px;line-height:1.7;color:var(--text2);background:var(--bg);
          min-height:300px;white-space:pre;tab-size:4;"></pre>
      </div>

      <!-- Footer actions -->
      <div style="padding:10px 20px;border-top:1px solid var(--border);
        display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;background:var(--s3);">
        <span id="cg-stat" style="flex:1;font-size:9px;color:var(--text3);align-self:center;"></span>
        <button class="btn" onclick="cgCopyCode()">⎘ Copy</button>
        <button class="btn a" onclick="cgDownloadCode()">↓ Download</button>
      </div>
    </div>`;

  document.body.appendChild(el);
  cgBuildDiagList();
  cgUpdatePreview();
}

// ─── Build diagram checkbox list ─────────────────────────────────────────────
function cgBuildDiagList() {
  const wrap = document.getElementById('cg-diag-list');
  if (!wrap) return;
  wrap.innerHTML = '';
  (project.diagrams || []).forEach(d => {
    const unitName = (project.units || []).find(u => u.id === d.unitId)?.name || d.unit || '';
    const label = (unitName ? unitName + ' / ' : '') + (d.name || d.id);
    const chk = document.createElement('label');
    chk.className = 'cg-diag-chip';
    chk.dataset.diagId = d.id;
    chk.innerHTML = `<input type="checkbox" value="${d.id}" checked
      onchange="cgUpdatePreview()" style="margin-right:4px;">
      <span>${esc2(label)}</span>`;
    wrap.appendChild(chk);
  });
}

function cgSelectAll(val) {
  document.querySelectorAll('#cg-diag-list input[type=checkbox]')
    .forEach(c => { c.checked = val; });
  cgUpdatePreview();
}

// ─── Live preview ─────────────────────────────────────────────────────────────
function cgUpdatePreview() {
  const target = document.getElementById('cg-target')?.value || 'kv-5500';
  const isUC = (target === 'unit-config');

  // Show/hide panels
  const baseMRWrap  = document.getElementById('cg-base-mr-wrap');
  const ucPanel     = document.getElementById('cg-uc-panel');
  const diagWrap    = document.getElementById('cg-diag-wrap');
  if (baseMRWrap) baseMRWrap.style.display = isUC ? 'none' : '';
  if (ucPanel)    ucPanel.style.display    = isUC ? 'flex' : 'none';
  if (diagWrap)   diagWrap.style.display   = isUC ? 'none' : '';

  const pre  = document.getElementById('cg-preview');
  const stat = document.getElementById('cg-stat');
  if (!pre) return;

  // ── Unit Config JSON engine ───────────────────────────────────────────────
  if (isUC) {
    if (!UC_UNIT_CONFIG) {
      pre.textContent = '; Vui lòng load Unit Config JSON   (infeed-unit.json)';
      if (stat) stat.textContent = 'Unit Config mode — chờ load file JSON';
      return;
    }
    const profile = PLC_PROFILES['kv-5500'];
    const result  = cgGenerateFromUnitConfig(UC_UNIT_CONFIG, null, profile);
    pre.textContent = result.code;
    if (stat) stat.textContent = result.stats;
    // Syntax highlight
    cgUCHighlight(pre, profile);
    return;
  }

  // ── Canvas engine (gốc) ──────────────────────────────────────────────────
  const baseMR = parseInt(document.getElementById('cg-base-mr')?.value || '100', 10);
  const selected = Array.from(
    document.querySelectorAll('#cg-diag-list input[type=checkbox]:checked')
  ).map(c => c.value);

  if (!selected.length) {
    pre.textContent = '; No diagrams selected.';
    if (stat) stat.textContent = '';
    return;
  }

  const profile = PLC_PROFILES[target];
  const result = profile
    ? generateKVAll(selected, { baseMR, profile })
    : generateSTDemo(selected, { baseMR });

  pre.textContent = result.code;
  if (stat) stat.textContent = result.stats;

  // Syntax highlight pass (minimal — colorize comments and instructions)
  const commentPfx = profile ? profile.comment : ';';
  const commentRe = commentPfx === '//'
    ? /^(\/\/.*)$/gm
    : /^(;.*)$/gm;
  // HTML-escape raw text before injecting into innerHTML so that ;<h1> bookmark
  // markers (which contain < and >) are not parsed as HTML tags.
  const escaped = pre.textContent.replace(/[&<>]/g, c =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;');
  pre.innerHTML = escaped
    // ;<h1> bookmarks — highlight as section headings (match the escaped form)
    .replace(/^(;&lt;h1&gt;.*)$/gm, '<span style="color:var(--amber);font-weight:bold">$1</span>')
    .replace(commentRe, '<span style="color:var(--text3)">$1</span>')
    .replace(/\b(LD|LDI|LD NOT|AND|ANI|AND NOT|AND LD|OR|ORI|OR NOT|OR LD|SET|RST|RSET|OUT|ANB|ORB|LDNOT|ANDNOT|ORNOT|MPS|MRD|MPP|ULD|OLD|TMRON|ONDL|TIM|TMRA|S\b|R\b|U\b|UN\b|O\b|ON\b|=\b)\b/g,
      '<span style="color:var(--cyan)">$1</span>')
    .replace(/@MR\d+/g, '<span style="color:var(--amber)">$&</span>')
    .replace(/\bMR\d+\b/g, '<span style="color:#4ade80">$&</span>');
}

// ─── Syntax highlight cho Unit Config output ──────────────────────────────────
function cgUCHighlight(pre, profile) {
  const commentPfx = profile ? profile.comment : ';';
  const commentRe = commentPfx === '//' ? /^(\/\/.*)$/gm : /^(;.*)$/gm;
  const escaped = pre.textContent.replace(/[&<>]/g, c =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;');
  pre.innerHTML = escaped
    .replace(/^(;&lt;h1\/&gt;.*)$/gm, '<span style="color:var(--amber);font-weight:bold">$1</span>')
    .replace(commentRe, '<span style="color:var(--text3)">$1</span>')
    .replace(/\b(LDP|LDB|ANP|ANF|ALT|DIFU|ZRES|CON|MPS|MRD|MPP|LD|SET|RES|RST|OUT|AND|ANB|OR|ORL|ANL|ONDL|MOV)\b/g,
      '<span style="color:var(--cyan)">$1</span>')
    .replace(/@MR\d+/g, '<span style="color:var(--amber)">$&</span>')
    .replace(/\bMR\d+\b/g, '<span style="color:#4ade80">$&</span>')
    .replace(/\bLR\d+\b/g, '<span style="color:#f472b6">$&</span>');
}

// ─── Status badge cho file load ───────────────────────────────────────────────
function cgUCUpdateStatus() {
  const el = document.getElementById('uc-status');
  if (!el) return;
  const parts = [];
  if (UC_UNIT_CONFIG) {
    const cfg = UC_UNIT_CONFIG;
    const label = cfg.unit?.label || 'loaded';
    // v3: devices[] / v2: cylinders[]
    const devCount = Array.isArray(cfg.devices)
      ? cfg.devices.length
      : (cfg.cylinders?.length || 0);
    const schemaVer = (cfg.unit?.overrides != null || cfg.devices != null) ? 'v3' : 'v2';
    const idxStr = cfg.unit?.unitIndex != null ? ' idx=' + cfg.unit.unitIndex : '';
    parts.push(`✓ Unit Config [${schemaVer}]: ${label}${idxStr}  (${devCount} device(s))`);
  }
  if (UC_CYLINDER_TYPES) {
    parts.push('Cylinder Types: ' + Object.keys(UC_CYLINDER_TYPES).filter(k => !k.startsWith('_')).length + ' types (optional)');
  }
  // v3: hiển thị trạng thái Device Library
  const libKeys = Object.keys(DEVICE_LIBRARY || {}).filter(k => !k.startsWith('_'));
  if (libKeys.length) {
    parts.push(`Device Library: ${libKeys.length} type(s) loaded`);
  }
  el.textContent = parts.length ? parts.join('  |  ') : 'Load Unit Config JSON để bắt đầu';
  el.style.color = UC_UNIT_CONFIG ? 'var(--cyan)' : 'var(--text3)';
}

// ─── Download / Copy ──────────────────────────────────────────────────────────
function cgDownloadCode() {
  const target = document.getElementById('cg-target')?.value || 'kv-5500';

  // ── Unit Config engine ────────────────────────────────────────────────────
  if (target === 'unit-config') {
    if (!UC_UNIT_CONFIG) {
      toast('⚠ Load Unit Config JSON trước');
      return;
    }
    const profile = PLC_PROFILES['kv-5500'];
    const result  = cgGenerateFromUnitConfig(UC_UNIT_CONFIG, null, profile);
    const label   = (UC_UNIT_CONFIG.unit?.label || 'unit').replace(/\s+/g, '_');
    const blob = new Blob([result.code], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = label + '_code.mnm';
    a.click();
    toast('✓ Downloaded ' + label + '_code.mnm');
    return;
  }

  // ── Canvas engine ─────────────────────────────────────────────────────────
  const baseMR = parseInt(document.getElementById('cg-base-mr')?.value || '100', 10);
  const selected = Array.from(
    document.querySelectorAll('#cg-diag-list input[type=checkbox]:checked')
  ).map(c => c.value);
  if (!selected.length) { toast('⚠ No diagrams selected'); return; }

  const profile = PLC_PROFILES[target];
  const result = profile
    ? generateKVAll(selected, { baseMR, profile })
    : generateSTDemo(selected, { baseMR });

  const ext = profile ? (profile.fileExt || '.mnm') : '.st';
  const safe = (project.name || 'grafcet').replace(/\s+/g, '_');
  const blob = new Blob([result.code], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = safe + '_code' + ext;
  a.click();
  toast('✓ Downloaded ' + safe + '_code' + ext);
}

function cgCopyCode() {
  const pre = document.getElementById('cg-preview');
  if (!pre) return;
  navigator.clipboard.writeText(pre.textContent).then(() => toast('✓ Copied to clipboard'));
}

// ═══════════════════════════════════════════════════════════════════════════════
//  KEYENCE KV MNEMONIC IL GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

// Section order for the generated file: Error → Manual → Origin → Auto → Output
// '_other' covers any mode name that does not match the four standard modes.
const KV_SECTION_ORDER = ['Error', 'Manual', 'Origin', 'Auto'];

// Width of the unit banner separator line (number of ═ characters).
const UNIT_BANNER_WIDTH = 56;

// Matches Keyence KV / IEC address literals such as Y0.00, @MR100, %QX0.0
const KV_ADDR_RE = /^[%@]|^[A-Z]{1,3}\d/;

// ─── PLC Target Profiles ──────────────────────────────────────────────────────
// Each profile maps the KV-5500 instruction set to a target PLC.
// 'kv-5500' is the native format (no translation needed).
// timerFn(ms, timerAddr) returns the on-delay timer instruction string.
const PLC_PROFILES = {
  'kv-5500': {
    label: 'Keyence KV-5500 / 5000 / 3000',
    fileExt: '.mnm',
    comment: ';',
    LD: 'LD', LDNOT: 'LDNOT', AND: 'AND', ANDNOT: 'ANDNOT',
    OR: 'OR', ORNOT: 'ORNOT', ANB: 'ANB', ORB: 'ORB',
    SET: 'SET', RST: 'RST', OUT: 'OUT',
    timerFn: (ms, addr) => `ONDL #${ms} ${addr}`,
  },
  'kv-8000': {
    label: 'Keyence KV-8000 / 7500',
    fileExt: '.mnm',
    comment: ';',
    LD: 'LD', LDNOT: 'LDNOT', AND: 'AND', ANDNOT: 'ANDNOT',
    OR: 'OR', ORNOT: 'ORNOT', ANB: 'ANB', ORB: 'ORB',
    SET: 'SET', RST: 'RST', OUT: 'OUT',
    timerFn: (ms, addr) => `TMRON ${addr} #${ms}`,
  },
  'melsec': {
    label: 'Mitsubishi MELSEC iQ-R / F / L',
    fileExt: '.gxw',
    comment: '//',
    LD: 'LD', LDNOT: 'LDI', AND: 'AND', ANDNOT: 'ANI',
    OR: 'OR', ORNOT: 'ORI', ANB: 'ANB', ORB: 'ORB',
    SET: 'SET', RST: 'RST', OUT: 'OUT',
    timerFn: (ms, addr) => `OUT  ${addr} K${Math.round(ms / 100)}`,
  },
  'omron': {
    label: 'Omron CJ / CS / NJ / NX',
    fileExt: '.cxp',
    comment: '//',
    LD: 'LD', LDNOT: 'LD NOT', AND: 'AND', ANDNOT: 'AND NOT',
    OR: 'OR', ORNOT: 'OR NOT', ANB: 'AND LD', ORB: 'OR LD',
    SET: 'SET', RST: 'RSET', OUT: 'OUT',
    timerFn: (ms, addr) => `TIM  ${addr} #${Math.round(ms / 10)}`,
  },
  'siemens': {
    label: 'Siemens S7-1200 / 1500 (AWL/STL)',
    fileExt: '.awl',
    comment: '//',
    LD: 'U', LDNOT: 'UN', AND: 'U', ANDNOT: 'UN',
    OR: 'O', ORNOT: 'ON', ANB: 'ULD', ORB: 'OLD',
    SET: 'S', RST: 'R', OUT: '=',
    timerFn: (ms, addr) => `L   S5T#${ms}MS\nSD  ${addr}`,
  },
};

// ─── Device Library ──────────────────────────────────────────────────────────
// Maps device type name → template configuration for the Output section.
// Populate via cgLoadDeviceLibrary(config) before generating code, or leave
// empty to fall back to the built-in LD…OUT default template for every signal.
//
// Expected structure (JSON example):
// {
//   "Cylinder_Standard": {
//     "templates": {
//       "Extend_SOL": "LD ${execMR}\nANDNOT ${interlock}\n${manual_logic}\nOUT ${physAddr} ; ${devLabel}.${sigName}",
//       "Retract_SOL": "...",
//       "default": "..."          // fallback for signals not listed above
//     },
//     "manual_logic": "AND MR_ManualMode"   // optional shared manual-mode gate
//   }
// }
let DEVICE_LIBRARY = {};

/**
 * Load (or replace) the Device Library from an object.
 * Pass in a plain JS object or a parsed JSON/YAML config.
 * @param {Object} config
 */
function cgLoadDeviceLibrary(config) {
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    DEVICE_LIBRARY = config;
  } else {
    // Reset to empty on invalid input so stale data is never left in place.
    DEVICE_LIBRARY = {};
  }
}

function generateKVAll(diagIds, opts) {
  const lines = [];
  let totalSteps = 0;
  const timestamp = new Date().toLocaleString('vi-VN');
  const profile = opts.profile || PLC_PROFILES['kv-5500'];

  // ── File header ─────────────────────────────────────────────────────────
  const targetLabel = profile.label.padEnd(41);
  lines.push('; ╔══════════════════════════════════════════════════════╗');
  lines.push(`; ║  GRAFCET Studio — ${targetLabel}║`);
  lines.push(`; ║  Project : ${(project.name || '').padEnd(42)}║`);
  lines.push(`; ║  Generated: ${timestamp.padEnd(41)}║`);
  lines.push('; ╚══════════════════════════════════════════════════════╝');
  lines.push('');

  // ── Pass 1: load all diagrams, allocate MR addresses, group by unit ─────
  // MR address allocation is global (continuous) across all units so that
  // addresses never overlap even when units are edited independently.
  let mrOffset = opts.baseMR;

  // unitDiagMap: unitId → entry[]
  // orphanEntries: diagrams that have no unitId
  const unitDiagMap = {};
  const orphanEntries = [];

  diagIds.forEach(diagId => {
    const diag = (project.diagrams || []).find(d => d.id === diagId);
    if (!diag) return;
    const data = loadDiagramData(diagId);
    if (!data?.state) return;
    const s = data.state;
    const mode = diag.mode || 'Auto';

    // Build sequence and pre-allocate MR addresses for this diagram.
    // Each step needs 2 MR bits (exec + done).  The trailing +2 leaves a gap
    // between diagrams to simplify manual editing in KV Studio.
    const sequence = cgResolveSequence(s);
    const mrMap = {};
    sequence.forEach((item, i) => {
      const base = mrOffset + i * 2;
      mrMap[item.step.id] = {
        exec: '@MR' + String(base).padStart(3, '0'),
        done: '@MR' + String(base + 1).padStart(3, '0')
      };
    });
    mrOffset += Math.max(sequence.length * 2, 2) + 2;

    const entry = { diag, s, mode, sequence, mrMap };
    const uid = diag.unitId || '_none';
    if (uid === '_none') {
      orphanEntries.push(entry);
    } else {
      if (!unitDiagMap[uid]) unitDiagMap[uid] = [];
      unitDiagMap[uid].push(entry);
    }
  });

  // ── Pass 2: emit code grouped by unit ───────────────────────────────────
  // Within each unit the code is organised into ;<h1> bookmark sections:
  //   ;<h1>Error   — all Error-mode diagrams
  //   ;<h1>Manual  — all Manual-mode diagrams
  //   ;<h1>Origin  — all Origin-mode diagrams
  //   ;<h1><diagram name>  — one bookmark per Auto-mode diagram (and other modes)
  //   ;<h1>Output  — device output logic aggregated from all diagrams in the unit

  function emitUnit(unitName, entries) {
    if (!entries.length) return;

    // ── Unit header ────────────────────────────────────────────────────────
    lines.push('');
    lines.push(`; ${'═'.repeat(UNIT_BANNER_WIDTH)}`);
    lines.push(`; Unit: ${unitName}`);
    lines.push(`; ${'═'.repeat(UNIT_BANNER_WIDTH)}`);

    // ── Build signal→action map for this unit's Output section ───────────
    // Maps physicalAddr → [{execMR, mode, stepNum, stepLabel, varLabel,
    //                        devLabel, sigName, devTypeName}]
    // devLabel/sigName/devTypeName are populated for dot-notation actions
    // (e.g. "Cyl1.Extend_SOL") to support Template Engine lookups.
    const signalActionMap = {};
    entries.forEach(({ s, mode, sequence, mrMap }) => {
      const vars = s.vars || [];
      sequence.forEach(({ step }) => {
        const mr = mrMap[step.id];
        if (!mr) return;
        (step.actions || []).forEach(act => {
          if (!act.variable && !act.address) return;
          if ((act.qualifier || 'N') !== 'N') return;
          const info = cgResolveSignalInfo(act.address || act.variable, vars);
          if (!info?.physAddr) return;
          const { physAddr, devLabel, sigName, devTypeName } = info;
          if (!signalActionMap[physAddr]) signalActionMap[physAddr] = [];
          signalActionMap[physAddr].push({
            execMR: mr.exec,
            mode,
            stepNum: step.number,
            stepLabel: step.label || '',
            varLabel: act.variable || physAddr,
            devLabel: devLabel || null,
            sigName:  sigName  || null,
            devTypeName: devTypeName || null
          });
        });
      });
    });

    // ── Emit Error, Manual, Origin sections (one ;<h1> per mode) ─────────
    ['Error', 'Manual', 'Origin'].forEach(sectionMode => {
      const sectionEntries = entries.filter(e => e.mode === sectionMode);
      if (!sectionEntries.length) return;

      lines.push('');
      lines.push(`;<h1>${sectionMode}`);

      sectionEntries.forEach(({ diag, s, sequence, mrMap }) => {
        const firstMR = sequence.length ? mrMap[sequence[0].step.id]?.exec : '?';
        lines.push('');
        lines.push(`; ─── ${diag.name || diag.id}  (base @MR: ${firstMR}) ${'─'.repeat(12)}`);
        lines.push('');
        const result = generateKVDiagram(diag, s, { ...opts, mrMap, separateOutputs: true, profile });
        lines.push(...result.lines);
        totalSteps += result.stepCount;
      });
    });

    // ── Emit Auto-mode diagrams — one ;<h1><name> bookmark each ──────────
    // Additional non-standard modes (not Error/Manual/Origin/Auto) are also
    // placed here, each under their own ;<h1><diagram name> bookmark.
    const nonStandardModes = new Set(['Error', 'Manual', 'Origin']);
    const autoAndOther = entries.filter(e => !nonStandardModes.has(e.mode));
    autoAndOther.forEach(({ diag, s, mode, sequence, mrMap }) => {
      const bookmarkTitle = diag.name || mode;
      const firstMR = sequence.length ? mrMap[sequence[0].step.id]?.exec : '?';

      lines.push('');
      lines.push(`;<h1>${bookmarkTitle}`);
      lines.push('');
      lines.push(`; Mode: ${mode}  |  Base @MR: ${firstMR}`);
      lines.push('');

      const result = generateKVDiagram(diag, s, { ...opts, mrMap, separateOutputs: true, profile });
      lines.push(...result.lines);
      totalSteps += result.stepCount;
    });

    // ── Output section for this unit ──────────────────────────────────────
    lines.push('');
    lines.push(';<h1>Output');
    lines.push('');
    lines.push(...generateKVOutputSection(entries, signalActionMap));
  }

  // Emit units in project order
  (project.units || []).forEach(unit => {
    const entries = unitDiagMap[unit.id] || [];
    if (entries.length) emitUnit(unit.name, entries);
  });

  // Emit orphan diagrams (no unit assigned)
  if (orphanEntries.length) {
    emitUnit('(No Unit)', orphanEntries);
  }

  lines.push('');
  lines.push('; ── END OF FILE ──────────────────────────────────────────');

  const rawCode = lines.join('\n');
  return {
    code: cgApplyProfile(rawCode, profile),
    stats: `${diagIds.length} diagram(s) · ${totalSteps} step(s) · base @MR${opts.baseMR} · ${profile.label}`
  };
}

// ─── Section banner ──────────────────────────────────────────────────────────
function cgSectionBanner(title) {
  const inner = `  ${title}  `;
  const width = 54;
  const padded = inner.padEnd(width);
  return [
    `; ╔${'═'.repeat(width)}╗`,
    `; ║${padded}║`,
    `; ╚${'═'.repeat(width)}╝`
  ];
}

// ─── Full address resolver (handles dot-notation "Cyl1.Extend_SOL") ──────────
function cgResolveAddrFull(varOrAddr, vars) {
  if (!varOrAddr) return null;
  // Already a PLC address literal
  if (KV_ADDR_RE.test(varOrAddr)) return varOrAddr;
  // Dot-notation: DeviceInstance.SignalName
  if (varOrAddr.includes('.')) {
    const dotIdx = varOrAddr.indexOf('.');
    const devLabel = varOrAddr.substring(0, dotIdx);
    const sigName  = varOrAddr.substring(dotIdx + 1);
    const v = (vars || []).find(x => x.label === devLabel);
    if (v && v.signalAddresses) {
      const devType = (project.devices || []).find(d => d.name === (v.format || ''));
      const sig = (devType?.signals || []).find(s => s.name === sigName);
      if (sig) {
        const addr = v.signalAddresses[sig.id];
        if (addr) return addr;
      }
    }
    return null;
  }
  // Simple label lookup
  const v = (vars || []).find(x => x.label === varOrAddr);
  if (v?.address) return v.address;
  return null;
}

// ─── Signal info resolver (forward + device metadata) ────────────────────────
// Like cgResolveAddrFull but also returns device instance metadata so that the
// Template Engine can look up the correct template in DEVICE_LIBRARY.
// Returns: { physAddr, devLabel, sigName, devTypeName } or null.
function cgResolveSignalInfo(varOrAddr, vars) {
  if (!varOrAddr) return null;
  // Already a PLC address literal — no device context
  if (KV_ADDR_RE.test(varOrAddr)) {
    return { physAddr: varOrAddr, devLabel: null, sigName: null, devTypeName: null };
  }
  // Dot-notation: DeviceInstance.SignalName
  if (varOrAddr.includes('.')) {
    const dotIdx   = varOrAddr.indexOf('.');
    const devLabel = varOrAddr.substring(0, dotIdx);
    const sigName  = varOrAddr.substring(dotIdx + 1);
    const v = (vars || []).find(x => x.label === devLabel);
    if (v && v.signalAddresses) {
      const devType = (project.devices || []).find(d => d.name === (v.format || ''));
      const sig     = (devType?.signals || []).find(s => s.name === sigName);
      if (sig) {
        const physAddr = v.signalAddresses[sig.id];
        if (physAddr) {
          return { physAddr, devLabel, sigName, devTypeName: devType?.name || null };
        }
      }
    }
    return null;
  }
  // Simple label lookup (plain BOOL var with .address)
  const v = (vars || []).find(x => x.label === varOrAddr);
  if (v?.address) {
    return { physAddr: v.address, devLabel: null, sigName: null, devTypeName: null };
  }
  return null;
}

// ─── Reverse lookup: physAddr → device instance info ─────────────────────────
// Searches all vars for a device instance whose signalAddresses contains addr.
// Returns: { devLabel, sigName, devTypeName } or null.
function cgFindDeviceByAddr(physAddr, vars) {
  for (const v of (vars || [])) {
    if (!v.signalAddresses) continue;
    const devType = (project.devices || []).find(d => d.name === (v.format || ''));
    if (!devType) continue;
    for (const sig of (devType.signals || [])) {
      if (v.signalAddresses[sig.id] === physAddr) {
        return { devLabel: v.label, sigName: sig.name, devTypeName: devType.name };
      }
    }
  }
  return null;
}

// ─── Template Engine helpers ──────────────────────────────────────────────────

/**
 * Build the LD / OR ladder block for one physical output.
 * Each entry in `actions` represents one GRAFCET step that activates the signal.
 * @param  {Array}  actions  [{execMR, mode, stepNum, stepLabel}, …]
 * @returns {string}         Multi-line IL block ready for ${execMR} substitution.
 */
function cgBuildExecMRBlock(actions) {
  if (!actions.length) return '';
  return actions.map((a, i) => {
    const inst = i === 0 ? 'LD  ' : 'OR  ';
    return `${inst} ${a.execMR.padEnd(12)}; ${a.mode} / ${cgStepComment(a.stepNum, a.stepLabel)}`;
  }).join('\n');
}

/**
 * Apply a template string, replacing ${key} placeholders with values from
 * `vars`.  Lines where ANY placeholder resolved to an empty string are
 * silently dropped so that optional clauses (ANDNOT ${interlock},
 * ${manual_logic}, …) disappear cleanly when no value is provided.
 *
 * Multi-line values (e.g. ${execMR} with several LD/OR rows) are inlined
 * correctly because substitution is done on the full string before splitting.
 *
 * @param  {string} template  Template text with ${key} markers.
 * @param  {Object} vars      Key → replacement string.
 * @returns {string}
 */
function cgApplyOutputTemplate(template, vars) {
  return template.split('\n').map(line => {
    let hasEmpty = false;
    const substituted = line.replace(/\$\{(\w+)\}/g, (_, key) => {
      // Treat null, undefined, false, 0, and '' all as "empty" so that lines
      // such as "ANDNOT ${interlock}" are dropped cleanly when no value is set.
      const raw = vars[key];
      const val = (raw != null && raw !== false && raw !== 0) ? String(raw) : '';
      if (val === '') hasEmpty = true;
      return val;
    });
    // Drop the line if any placeholder resolved to empty (makes optional
    // clauses like "ANDNOT ${interlock}" disappear when there is no interlock).
    return hasEmpty ? null : substituted;
  }).filter(line => line !== null).join('\n');
}

// ─── Output section: 4-phase pipeline (Setup→Analysis→Mapping→Generation) ────
function generateKVOutputSection(loadedDiags, signalActionMap) {
  const lines = [];

  // ══ Phase 1 — Setup ══════════════════════════════════════════════════════
  // Default output template used when no DEVICE_LIBRARY entry is found.
  // Lines whose ${…} placeholder resolves to empty are dropped automatically
  // by cgApplyOutputTemplate, so optional clauses (ANDNOT ${interlock},
  // ${manual_logic}) vanish cleanly when no value is configured.
  const DEFAULT_OUTPUT_TEMPLATE =
    '${execMR}\n' +
    'ANDNOT ${interlock}\n' +
    '${manual_logic}\n' +
    'OUT  ${physAddr}';

  // Same template with a device-signal comment on the OUT line.
  const DEFAULT_OUTPUT_TEMPLATE_DEVICE =
    '${execMR}\n' +
    'ANDNOT ${interlock}\n' +
    '${manual_logic}\n' +
    'OUT  ${physAddr}               ; ${devLabel}.${sigName}';

  // ══ Phase 2 — Analysis ═══════════════════════════════════════════════════
  // Collect all device-instance vars from all loaded diagrams.
  // devVarMap: devLabel → {devTypeName, signalAddresses, signals}
  const devVarMap = {};
  loadedDiags.forEach(({ s }) => {
    (s.vars || []).forEach(v => {
      if (!v.signalAddresses || devVarMap[v.label]) return;
      const devType = (project.devices || []).find(d => d.name === (v.format || ''));
      if (devType) {
        devVarMap[v.label] = {
          devTypeName: devType.name,
          signalAddresses: v.signalAddresses,
          signals: devType.signals || []
        };
      }
    });
  });

  // Shared vars list used for reverse-lookup fallback (ungrouped outputs).
  const anyVars = loadedDiags.flatMap(d => d.s.vars || []);

  // Error/fault interlock bit — inserted into every output block.
  const errorBit = cgFindErrorBit(anyVars);

  // ══ Phase 3 — Mapping ════════════════════════════════════════════════════
  // Track emitted physical addresses to guarantee each coil appears only once
  // (Double Coil prevention).  Device-grouped outputs are emitted first; any
  // remaining addresses in signalActionMap are emitted as "Other outputs".
  const emitted = new Set();

  // ══ Phase 4 — Generation ═════════════════════════════════════════════════

  // ── Device-grouped outputs ───────────────────────────────────────────────
  Object.entries(devVarMap).forEach(([devLabel, { devTypeName, signalAddresses, signals }]) => {
    const outputSignals = signals.filter(sig => sig.varType === 'Output');
    if (!outputSignals.length) return;

    lines.push(`; ─── ${devLabel} [${devTypeName}] ${'─'.repeat(Math.max(2, 44 - devLabel.length - devTypeName.length))}`);

    outputSignals.forEach(sig => {
      const physAddr = signalAddresses[sig.id];
      if (!physAddr) {
        lines.push(`; ${devLabel}.${sig.name} — address not assigned`);
        lines.push('');
        return;
      }

      // ── Double Coil guard ────────────────────────────────────────────────
      emitted.add(physAddr);

      const actions = signalActionMap[physAddr] || [];
      lines.push(`; ${devLabel}.${sig.name}  →  ${physAddr}${sig.comment ? '  (' + sig.comment + ')' : ''}`);

      // ── Template lookup (DEVICE_LIBRARY → signal name → "default") ───────
      const devConfig = DEVICE_LIBRARY[devTypeName];
      const template  =
        devConfig?.templates?.[sig.name] ||
        devConfig?.templates?.default    ||
        DEFAULT_OUTPUT_TEMPLATE_DEVICE;

      // ── Build template variable map ───────────────────────────────────────
      const execMRBlock = cgBuildExecMRBlock(actions);
      const templateVars = {
        execMR:       execMRBlock,
        physAddr,
        interlock:    errorBit              || '',
        manual_logic: devConfig?.manual_logic || '',
        devLabel,
        sigName:      sig.name,
        mode:         actions[0]?.mode      || ''
      };

      if (actions.length) {
        const rendered = cgApplyOutputTemplate(template, templateVars);
        rendered.split('\n').forEach(l => lines.push(l));
      } else {
        // No GRAFCET steps activate this signal yet.
        // Use the template engine with a TODO stub as the execMR block so the
        // output format stays consistent with the templated path above.
        const stubVars = Object.assign({}, templateVars, {
          execMR: `LD   FALSE         ; TODO: add control conditions for ${devLabel}.${sig.name}`
        });
        const rendered = cgApplyOutputTemplate(template, stubVars);
        rendered.split('\n').forEach(l => lines.push(l));
      }
      lines.push('');
    });
  });

  // ── Ungrouped outputs (plain BOOL vars or direct-address actions) ─────────
  const ungroupedAddrs = Object.keys(signalActionMap).filter(addr => !emitted.has(addr));
  if (ungroupedAddrs.length) {
    lines.push('; ─── Other outputs ──────────────────────────────────────');
    ungroupedAddrs.forEach(addr => {
      const actions = signalActionMap[addr];
      // Try to find a friendly label via reverse lookup.
      const devInfo    = cgFindDeviceByAddr(addr, anyVars);
      const anyVar     = anyVars.find(v => v.address === addr);
      const labelHint  = devInfo
        ? `${devInfo.devLabel}.${devInfo.sigName}`
        : (anyVar?.label || '');
      const labelComment = labelHint ? `  ; ${labelHint}` : '';

      lines.push(`; ${addr}${labelComment}`);

      const execMRBlock = cgBuildExecMRBlock(actions);
      const templateVars = {
        execMR:    execMRBlock,
        physAddr:  addr,
        interlock: errorBit || '',
        // No device context — optional device placeholders left empty so their
        // template lines are skipped by cgApplyOutputTemplate.
        manual_logic: '',
        devLabel:     '',
        sigName:      ''
      };
      const rendered = cgApplyOutputTemplate(DEFAULT_OUTPUT_TEMPLATE, templateVars);
      rendered.split('\n').forEach(l => lines.push(l));
      lines.push('');
    });
  }

  if (!lines.length) {
    lines.push('; (no output signals found — add device instances to the variable table)');
  }
  return lines;
}

// ─── Single diagram → Keyence KV IL ──────────────────────────────────────────
function generateKVDiagram(diagMeta, s, opts) {
  const lines = [];
  const steps = s.steps || [];
  const transitions = s.transitions || [];
  const connections = s.connections || [];
  const parallels = s.parallels || [];
  const vars = s.vars || [];

  if (!steps.length) {
    lines.push('; (no steps in this diagram)');
    return { lines, stepCount: 0 };
  }

  // Build ordered sequence: [{step, outTrans, inTrans}]
  const sequence = cgResolveSequence(s);

  // Use pre-allocated mrMap from opts if available (multi-diagram pass),
  // otherwise allocate locally from opts.mrOffset / opts.baseMR.
  const mrMap = opts.mrMap || (() => {
    const map = {};
    const base0 = opts.mrOffset != null ? opts.mrOffset : (opts.baseMR || 0);
    sequence.forEach((item, i) => {
      const base = base0 + i * 2;
      map[item.step.id] = {
        exec: '@MR' + String(base).padStart(3, '0'),
        done: '@MR' + String(base + 1).padStart(3, '0')
      };
    });
    return map;
  })();

  // Helper: resolve address for a variable name (supports dot-notation)
  function resolveAddr(varOrAddr) {
    if (!varOrAddr) return null;
    // Already looks like a PLC address literal
    if (KV_ADDR_RE.test(varOrAddr)) return varOrAddr;
    // Dot-notation: DeviceInstance.SignalName
    if (varOrAddr.includes('.')) {
      const addr = cgResolveAddrFull(varOrAddr, vars);
      return addr || varOrAddr;
    }
    // Simple label lookup
    const v = vars.find(x => x.label === varOrAddr);
    if (v?.address) return v.address;
    // Device type instance without single address — return as-is
    return varOrAddr;
  }

  // ── Generate code per sequence item ──────────────────────────────────────
  sequence.forEach((item, idx) => {
    const { step, inTrans, outTrans, branchType } = item;
    const mr = mrMap[step.id];
    const stepNum = String(step.number).padStart(2, '0');
    const stepLbl = step.label ? ` — ${step.label}` : '';

    lines.push(`; ─── Step ${stepNum}${stepLbl} ${'─'.repeat(Math.max(0, 40 - stepLbl.length - 8))}`);

    // ── Activation condition ───────────────────────────────────────────────
    if (step.initial) {
      // Initial step: activated by start condition or always on if first scan
      // Use a mode flag from vars if available (first BOOL var as "Auto/Start")
      const modeBit = cgFindModeBit(vars);
      if (modeBit) {
        lines.push(`LD   ${modeBit.padEnd(12)}; Initial step — mode active`);
      } else {
        lines.push(`LD   CR2002        ; Initial step — 1st scan pulse`);
      }
    } else {
      // Activated by previous step done bit
      if (inTrans) {
        const prevSteps = resolveStepsThrough(
          inTrans.id, 'upstream', connections, steps, parallels
        );
        if (prevSteps.length === 1) {
          const pm = mrMap[prevSteps[0].id];
          if (pm) lines.push(`LD   ${pm.done.padEnd(12)}; ${cgStepRef(prevSteps[0])} complete`);
          else    lines.push(`LD   ???           ; previous step`);
        } else if (prevSteps.length > 1) {
          // AND-join: all previous branches must be done
          prevSteps.forEach((ps, pi) => {
            const pm = mrMap[ps.id];
            const inst = pi === 0 ? 'LD  ' : 'AND ';
            if (pm) lines.push(`${inst} ${pm.done.padEnd(12)}; ${cgStepRef(ps)} complete`);
          });
        }
        // AND transition condition
        const cond = inTrans.condition?.trim();
        if (cond && cond !== '1' && cond !== 'true') {
          const addr = resolveAddr(cond);
          lines.push(`AND  ${(addr||cond).padEnd(12)}; transition: ${esc2(cond)}`);
        }
      } else {
        lines.push(`; WARNING: no incoming transition found for step ${stepNum}`);
        lines.push(`LD   CR2002`);
      }
    }
    lines.push(`SET  ${mr.exec.padEnd(12)}; Step ${stepNum} execute`);
    lines.push('');

    // ── Actions while step is active ──────────────────────────────────────
    const actions = step.actions || [];
    if (actions.length) {
      actions.forEach(act => {
        if (!act.variable && !act.address) return;
        const addr = resolveAddr(act.address || act.variable);
        if (!addr) return;
        const q = act.qualifier || 'N';

        // When separateOutputs is true, N-qualified outputs that resolve to a
        // physical address are aggregated in the Output section instead of here.
        if (q === 'N' && opts.separateOutputs) {
          const resolved = cgResolveAddrFull(act.address || act.variable, vars) || addr;
          if (KV_ADDR_RE.test(resolved)) {
            lines.push(`; [N] ${esc2(act.variable||addr)} → ${resolved}  (see OUTPUT section)`);
            return;
          }
        }

        lines.push(`LD   ${mr.exec.padEnd(12)}; Step ${stepNum} active`);
        if (q === 'N')  lines.push(`OUT  ${addr.padEnd(12)}; [N] ${esc2(act.variable||addr)}`);
        if (q === 'S')  lines.push(`SET  ${addr.padEnd(12)}; [S] ${esc2(act.variable||addr)}`);
        if (q === 'R')  lines.push(`RST  ${addr.padEnd(12)}; [R] ${esc2(act.variable||addr)}`);
        if (q === 'P')  { lines.push(`ANDNOT ${(addr+'_prev').padEnd(8)}; [P] rising edge`); lines.push(`OUT  ${addr.padEnd(12)}`); }
        if (q === 'P0') { lines.push(`ANDNOT ${addr.padEnd(8)}; [P0] falling edge`); lines.push(`OUT  ${(addr+'_p0').padEnd(12)}`); }
        if (q === 'L' || q === 'D' || q === 'SD' || q === 'DS' || q === 'SL') {
          const timerProfile = opts.profile || PLC_PROFILES['kv-5500'];
          // Extract numeric milliseconds from formats like 't#500ms', '500', 'T#1500MS'
          const timeMs = parseFloat((act.time || '0').match(/[\d.]+/)?.[0] || '0') || 0;
          const timerAddr = `T${String(idx).padStart(3,'0')}`;
          lines.push(`; [${q}] time-limited action — timer ${act.time||'?'}`);
          lines.push(timerProfile.timerFn(timeMs, timerAddr));
          lines.push(`OUT  ${addr.padEnd(12)}`);
        }
      });
      lines.push('');
    }

    // ── Step completion: outgoing transition → set done bit ───────────────
    if (outTrans) {
      const cond = outTrans.condition?.trim();
      lines.push(`LD   ${mr.exec.padEnd(12)}; Step ${stepNum} active`);
      if (cond && cond !== '1' && cond !== 'true') {
        const addr = resolveAddr(cond);
        lines.push(`AND  ${(addr||cond).padEnd(12)}; ${esc2(cond)}`);
      }
      lines.push(`SET  ${mr.done.padEnd(12)}; Step ${stepNum} complete`);
    } else {
      // Last step — reset done to allow restart (optional cycle)
      lines.push(`LD   ${mr.exec.padEnd(12)}; Step ${stepNum} — last step`);
      lines.push(`SET  ${mr.done.padEnd(12)}; Mark complete`);
    }
    lines.push('');
  });

  // ── MR Address map comment ────────────────────────────────────────────────
  lines.push('; ── MR Address Allocation ─────────────────────────────');
  sequence.forEach(item => {
    const mr = mrMap[item.step.id];
    if (mr) {
      lines.push(`; ${mr.exec} = Step ${String(item.step.number).padStart(2,'0')} execute  |  ${mr.done} = Step ${String(item.step.number).padStart(2,'0')} complete`);
    }
  });
  lines.push('');

  return { lines, stepCount: sequence.length };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SEQUENCE RESOLUTION — topological walk through connections
// ═══════════════════════════════════════════════════════════════════════════════

function cgResolveSequence(s) {
  const steps       = s.steps       || [];
  const transitions = s.transitions || [];
  const connections = s.connections || [];
  const parallels   = s.parallels   || [];

  const result  = [];   // [{step, inTrans, outTrans}]
  const visited = new Set();

  // Find initial step
  const initialStep = steps.find(st => st.initial)
    || (steps.length ? [...steps].sort((a,b)=>a.number-b.number)[0] : null);
  if (!initialStep) return result;

  function getDownstreamTransition(stepId) {
    const conn = connections.find(c => c.from === stepId);
    if (!conn) return null;
    return transitions.find(t => t.id === conn.to) || null;
  }

  function getUpstreamTransition(stepId) {
    const conn = connections.find(c => c.to === stepId);
    if (!conn) return null;
    return transitions.find(t => t.id === conn.from) || null;
  }

  function getDownstreamSteps(transId) {
    return resolveStepsThrough(transId, 'downstream', connections, steps, parallels);
  }

  function walk(step, inTrans) {
    if (visited.has(step.id)) return;
    visited.add(step.id);

    const outTrans = getDownstreamTransition(step.id);
    result.push({ step, inTrans: inTrans || null, outTrans: outTrans || null });

    if (!outTrans) return;

    const nextSteps = getDownstreamSteps(outTrans.id);
    nextSteps.forEach(ns => walk(ns, outTrans));
  }

  // Get incoming transition for initial step (if any — usually none)
  const initInTrans = getUpstreamTransition(initialStep.id);
  walk(initialStep, initInTrans);

  // Catch any disconnected steps (not reachable from initial)
  steps
    .slice()
    .sort((a,b) => a.number - b.number)
    .forEach(st => {
      if (!visited.has(st.id)) {
        const inT  = getUpstreamTransition(st.id);
        const outT = getDownstreamTransition(st.id);
        result.push({ step: st, inTrans: inT, outTrans: outT });
        visited.add(st.id);
      }
    });

  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cgStepRef(step) {
  return `S${String(step.number).padStart(2,'0')}${step.label ? ' ' + step.label : ''}`;
}

// Format a step number+label for use in output-section comments.
function cgStepComment(stepNum, stepLabel) {
  return `Step ${String(stepNum).padStart(2, '0')}${stepLabel ? ' ' + stepLabel : ''}`;
}

function cgFindModeBit(vars) {
  // Heuristic: find the first BOOL var that looks like a mode/auto flag
  const candidates = ['Auto','auto','AUTO','Start','start','Mode','mode','Run','run'];
  for (const name of candidates) {
    const v = (vars || []).find(x => x.label === name);
    if (v?.address) return v.address;
  }
  // Fall back to first BOOL output-ish var
  const first = (vars || []).find(x =>
    (x.format || '').toUpperCase() === 'BOOL' && x.address);
  return first?.address || null;
}

function cgFindErrorBit(vars) {
  // Heuristic: finds a BOOL var whose label matches common error/fault naming.
  // If the project uses a different convention (e.g. 'Alarm', 'Emergency'),
  // add it to the candidates list below or assign the address explicitly.
  const candidates = ['Error','error','ERROR','Fault','fault','FAULT','Err','err'];
  for (const name of candidates) {
    const v = (vars || []).find(x => x.label === name);
    if (v?.address) return v.address;
  }
  return null;
}

// ─── Profile translation: converts KV-5500 IL output to the target PLC format ─
// All code is generated in KV-5500 format first, then post-processed here.
// The timer instruction is handled at generation time via profile.timerFn.
function cgApplyProfile(code, profile) {
  if (!profile || profile === PLC_PROFILES['kv-5500']) return code;
  const base = PLC_PROFILES['kv-5500'];

  // Build replacement pairs ordered longest-first to prevent partial matches
  // (e.g. ANDNOT must be replaced before AND).
  const instrPairs = [
    [base.ANDNOT, profile.ANDNOT],
    [base.LDNOT,  profile.LDNOT],
    [base.ORNOT,  profile.ORNOT],
    [base.ANB,    profile.ANB],
    [base.ORB,    profile.ORB],
    [base.AND,    profile.AND],
    [base.OR,     profile.OR],
    [base.LD,     profile.LD],
    [base.SET,    profile.SET],
    [base.RST,    profile.RST],
    [base.OUT,    profile.OUT],
  ];

  return code.split('\n').map(line => {
    // ;<h1> bookmark lines are KV Studio-specific markers — keep them as-is
    // (they are not valid IL instructions and not standard comments).
    if (/^;<h1>/.test(line)) return line;
    // Translate comment prefix ';' → '//'
    if (profile.comment !== ';' && /^\s*;/.test(line)) {
      return line.replace(/^(\s*);/, `$1${profile.comment}`);
    }
    // Replace instruction mnemonic at the start of the line
    const indent = (line.match(/^(\s*)/) || ['',''])[1];
    const rest = line.trimStart();
    for (const [kvInstr, targetInstr] of instrPairs) {
      // Match if line starts with the instruction followed by whitespace or EOL
      if (rest.startsWith(kvInstr) &&
          (rest.length === kvInstr.length || /\s/.test(rest[kvInstr.length]))) {
        return indent + targetInstr + rest.slice(kvInstr.length);
      }
    }
    return line;
  }).join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  IEC 61131-3 ST — DEMO / STUB
// ═══════════════════════════════════════════════════════════════════════════════

function generateSTDemo(diagIds, opts) {
  const lines = [];
  lines.push('(* ═══════════════════════════════════════════════════════');
  lines.push('   GRAFCET Studio — IEC 61131-3 Structured Text [DEMO]');
  lines.push(`   Project: ${project.name || ''}`);
  lines.push('   NOTE: ST generation is a preview — review before use.');
  lines.push('   ═══════════════════════════════════════════════════════ *)');
  lines.push('');

  let mrOffset = opts.baseMR;

  diagIds.forEach(diagId => {
    const diag = (project.diagrams || []).find(d => d.id === diagId);
    if (!diag) return;
    const data = loadDiagramData(diagId);
    if (!data?.state) return;
    const s = data.state;
    const unitName = (project.units || []).find(u => u.id === diag.unitId)?.name || diag.unit || '';
    const diagLabel = (unitName ? unitName + ' / ' : '') + (diag.name || diagId);

    lines.push(`(* ─── ${diagLabel} ─── *)`);
    lines.push('');

    const sequence = cgResolveSequence(s);
    const vars = s.vars || [];

    function resolveAddr(varOrAddr) {
      if (!varOrAddr) return null;
      if (/^[%@]/.test(varOrAddr)) return varOrAddr;
      const v = vars.find(x => x.label === varOrAddr);
      return v?.address || varOrAddr;
    }

    sequence.forEach((item, idx) => {
      const { step, inTrans, outTrans } = item;
      const sn = String(step.number).padStart(2, '0');
      const execVar = `_Step${sn}_exec`;
      const doneVar = `_Step${sn}_done`;
      const lbl = step.label ? ' (* ' + step.label + ' *)' : '';

      lines.push(`(* Step ${sn}${step.label ? ' — ' + step.label : ''} *)`);

      // Activation
      if (step.initial) {
        lines.push(`IF NOT ${execVar} AND NOT ${doneVar} THEN`);
        const modeBit = cgFindModeBit(vars);
        const cond = inTrans?.condition?.trim();
        const parts = [];
        if (modeBit) parts.push(modeBit.replace(/%/g,'').replace(/\./g,'_'));
        if (cond && cond !== '1') parts.push(resolveAddr(cond)?.replace(/%/g,'').replace(/\./g,'_') || cond);
        lines.push(`  IF ${parts.length ? parts.join(' AND ') : 'TRUE'} THEN`);
      } else {
        const prevCond = inTrans ? (() => {
          const prevSteps = resolveStepsThrough(
            inTrans.id, 'upstream', s.connections||[], s.steps||[], s.parallels||[]
          );
          return prevSteps.map(ps =>
            `_Step${String(ps.number).padStart(2,'0')}_done`
          ).join(' AND ');
        })() : 'FALSE';
        const transCond = inTrans?.condition?.trim();
        const tAddr = transCond && transCond !== '1'
          ? (resolveAddr(transCond)?.replace(/%/g,'').replace(/\./g,'_') || transCond)
          : null;
        lines.push(`IF NOT ${execVar} AND NOT ${doneVar} THEN`);
        lines.push(`  IF ${prevCond}${tAddr ? ' AND ' + tAddr : ''} THEN`);
      }
      lines.push(`    ${execVar} := TRUE;`);
      lines.push(`  END_IF;`);
      lines.push(`END_IF;`);
      lines.push('');

      // Actions
      const actions = step.actions || [];
      if (actions.length) {
        lines.push(`IF ${execVar} THEN`);
        actions.forEach(act => {
          if (!act.variable && !act.address) return;
          const addr = (resolveAddr(act.address || act.variable) || act.variable || '')
            .replace(/%/g,'').replace(/\./g,'_');
          const q = act.qualifier || 'N';
          if (q === 'N')  lines.push(`  ${addr} := TRUE; (* N *)`);
          if (q === 'S')  lines.push(`  ${addr} := TRUE; (* S — Set *)`);
          if (q === 'R')  lines.push(`  ${addr} := FALSE; (* R — Reset *)`);
        });
        // Completion condition
        if (outTrans) {
          const cond = outTrans.condition?.trim();
          const ca = cond && cond !== '1'
            ? (resolveAddr(cond)?.replace(/%/g,'').replace(/\./g,'_') || cond)
            : 'TRUE';
          lines.push(`  IF ${ca} THEN`);
          lines.push(`    ${doneVar} := TRUE;`);
          lines.push(`    ${execVar} := FALSE;`);
          lines.push(`  END_IF;`);
        }
        lines.push(`END_IF;`);
        lines.push('');
      }
    });

    mrOffset += sequence.length * 2 + 2;
  });

  lines.push('(* ── END ── *)');

  return {
    code: lines.join('\n'),
    stats: `[DEMO] ${diagIds.length} diagram(s) · IEC ST`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  UNIT CONFIG JSON ENGINE — cgGenerateFromUnitConfig  (v3)
//
//  Triết lý v3:
//    - JSON chỉ là khung xương: unit info + danh sách thiết bị tối giản.
//    - Variable Table + Canvas diagrams là single source of truth cho I/O vật lý.
//    - Flags và IO hệ thống được chuẩn hóa tự động theo quy ước; user chỉ cần
//      điền overrides khi muốn override giá trị mặc định.
//    - Backward compat v2: nếu JSON cũ có cylinders[] thì engine vẫn chạy.
//
//  Schema v3 (unit-config.json):
//  {
//    "unit": {
//      "label": "Infeed",
//      "unitIndex": 0,
//      "originBaseAddr": "@MR100",
//      "autoBaseAddr":   "@MR300",
//      "autoEndPulseAddr": "@MR011",
//      "overrides": { "io": {}, "flags": {} }
//    },
//    "devices": [
//      { "kind": "cylinder", "id": "CY1", "index": 0 },
//      { "kind": "cylinder", "id": "CY2", "index": 1 }
//    ]
//  }
//
//  Quy ước Variable Table (bất biến):
//    Output SOL : {CyId}.{Dir}_SOL   VD: CY1.Up_SOL   = LR000
//    Sensor SNS : {CyId}.{Dir}_SNS   VD: CY1.Up_SNS   = MR1000
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Global storage cho JSON configs ─────────────────────────────────────────
let UC_UNIT_CONFIG    = null;   // nội dung unit-config.json (v2 hoặc v3)
let UC_CYLINDER_TYPES = null;   // không còn bắt buộc — giữ lại cho tương thích ngược

// ═══════════════════════════════════════════════════════════════════════════════
//  UC v3 — CONSTANTS & DEFAULT MAPPINGS
//  Tất cả base address đều cấu hình được tại đây — không hardcode ở chỗ khác.
// ═══════════════════════════════════════════════════════════════════════════════

/** Flags hệ thống — địa chỉ mặc định khi JSON không override. */
const UC_DEFAULT_FLAGS = {
  flagOrigin:     '@MR000',
  flagAuto:       '@MR001',
  flagManual:     '@MR002',
  flagManPEnd:    '@MR003',
  flagError:      '@MR004',
  flagErrStop:    '@MR005',
  flagResetPulse: '@MR006',
  flagResetEnd:   '@MR006',
  flagHomed:      '@MR010',
};

/**
 * IO system per unit — tính theo công thức:
 *   ioBase = IO_BASE + unitIndex * IO_STRIDE
 *
 * Mapping offset (tính từ ioBase):
 *   +0  eStop
 *   +1  btnStart
 *   +3  btnReset
 *   +10 hmiStart
 *   +11 hmiStop
 *   +12 hmiManual
 *   +20 outHomed
 *   DM(ioBase+0) errorDMAddr  (chỉ dùng nếu IO_USE_DM = true)
 */
const UC_IO_BASE   = 5000;   // địa chỉ IO đầu tiên (unit 0)
const UC_IO_STRIDE = 100;    // bước nhảy giữa các unit
const UC_IO_USE_DM = false;  // true → dùng DM(ioBase) cho errorDMAddr

// Offset map (offset từ ioBase)
const UC_IO_OFFSETS = {
  eStop:     0,
  btnStart:  1,
  btnReset:  3,
  hmiStart:  10,
  hmiStop:   11,
  hmiManual: 12,
  outHomed:  20,
};

/**
 * Admin addresses per cylinder — tính theo index thiết bị:
 *   hmiManBtn  = MR(HMI_MAN_BASE  + deviceIndex)
 *   sysManFlag = MR(SYS_MAN_BASE  + deviceIndex)
 *   lockDirA   = MR(LOCK_BASE     + deviceIndex*2 + 0)
 *   lockDirB   = MR(LOCK_BASE     + deviceIndex*2 + 1)
 *   errFlagDirA= MR(ERR_BASE      + deviceIndex*2 + 0)
 *   errFlagDirB= MR(ERR_BASE      + deviceIndex*2 + 1)
 */
const UC_HMI_MAN_BASE = 1400;  // MR1400, MR1401, … per cylinder
const UC_SYS_MAN_BASE = 1500;  // MR1500, MR1501, …
const UC_LOCK_BASE    = 1200;  // MR1200/1201 CY1, MR1202/1203 CY2, …
const UC_ERR_BASE     = 1600;  // MR1600/1601 CY1, MR1602/1603 CY2, …
const UC_ERR_TIMEOUT  = 500;   // ms mặc định cho ONDL timer

// ─── Helper: tạo địa chỉ MR dạng @MRxxx ─────────────────────────────────────
function ucMkMR(num) {
  return '@MR' + String(num).padStart(3, '0');
}
// Helper: tạo địa chỉ MR dạng MRxxx (không có @)
function ucMkMRPlain(num) {
  return 'MR' + String(num);
}
// Helper: tạo địa chỉ DM
function ucMkDM(num) {
  return 'DM' + String(num);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  UC v3 — RESOLVER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ucResolveUnitFlags(unitCfg)
 * Tính toán tất cả flags hệ thống cho một unit.
 * Ưu tiên: overrides.flags (v3) > unit.flags (v2) > UC_DEFAULT_FLAGS
 * @param {Object} unitCfg  — object "unit" trong JSON
 * @returns {Object}        — map flagName → address string
 */
function ucResolveUnitFlags(unitCfg) {
  const v2flags  = unitCfg.flags    || {};                     // v2 compat
  const v3over   = (unitCfg.overrides && unitCfg.overrides.flags) || {};
  const result   = {};
  Object.keys(UC_DEFAULT_FLAGS).forEach(function(key) {
    result[key] = v3over[key] || v2flags[key] || UC_DEFAULT_FLAGS[key];
  });
  return result;
}

/**
 * ucResolveUnitIO(unitCfg)
 * Tính toán tất cả IO hệ thống cho một unit.
 * Ưu tiên: overrides.io (v3) > unit.io (v2) > tự tính theo unitIndex
 * @param {Object} unitCfg  — object "unit" trong JSON
 * @returns {Object}        — map ioName → address string
 */
function ucResolveUnitIO(unitCfg) {
  const unitIndex = (unitCfg.unitIndex != null) ? unitCfg.unitIndex : 0;
  const ioBase    = UC_IO_BASE + unitIndex * UC_IO_STRIDE;

  // Mặc định tự tính theo ioBase
  const computed = {};
  Object.keys(UC_IO_OFFSETS).forEach(function(key) {
    computed[key] = ucMkMRPlain(ioBase + UC_IO_OFFSETS[key]);
  });
  // errorDMAddr: chỉ tính nếu UC_IO_USE_DM = true
  computed.errorDMAddr  = UC_IO_USE_DM ? ucMkDM(ioBase) : '';
  // hmiManBtnBase / hmiManBtnEnd: không tự tính — user phải override nếu cần
  computed.hmiManBtnBase = '';
  computed.hmiManBtnEnd  = '';

  // Merge: v2 io > computed; v3 overrides.io > v2 io > computed
  const v2io   = unitCfg.io || {};
  const v3over = (unitCfg.overrides && unitCfg.overrides.io) || {};

  const result = {};
  const allKeys = new Set([
    ...Object.keys(computed),
    ...Object.keys(v2io),
    ...Object.keys(v3over),
  ]);
  allKeys.forEach(function(key) {
    result[key] = v3over[key] !== undefined ? v3over[key]
                : v2io[key]   !== undefined ? v2io[key]
                : computed[key] || '';
  });
  return result;
}

/**
 * ucResolveCylinderAdminAddrs(cylDef, unitCfg)
 * Tính hmiManBtn, sysManFlag, lockDirA/B, errFlagDirA/B cho một cylinder.
 * Ưu tiên: giá trị có sẵn trong cylDef (v2 compat) > tự tính theo index.
 *
 * deviceIndex lấy từ cylDef.index (v3) hoặc vị trí trong mảng (v2).
 * Caller phải truyền index nếu dùng v2.
 *
 * @param {Object} cylDef    — phần tử trong devices[] hoặc cylinders[]
 * @param {number} devIndex  — thứ tự trong danh sách (0-based)
 * @returns {Object}
 */
function ucResolveCylinderAdminAddrs(cylDef, devIndex) {
  const idx = (cylDef.index != null) ? cylDef.index : devIndex;
  return {
    hmiManBtn:   cylDef.hmiManBtn   || ucMkMRPlain(UC_HMI_MAN_BASE + idx),
    sysManFlag:  cylDef.sysManFlag  || ucMkMRPlain(UC_SYS_MAN_BASE + idx),
    lockDirA:    cylDef.lockDirA    || ucMkMRPlain(UC_LOCK_BASE + idx * 2),
    lockDirB:    cylDef.lockDirB    || ucMkMRPlain(UC_LOCK_BASE + idx * 2 + 1),
    errFlagDirA: cylDef.errFlagDirA || ucMkMRPlain(UC_ERR_BASE  + idx * 2),
    errFlagDirB: cylDef.errFlagDirB || ucMkMRPlain(UC_ERR_BASE  + idx * 2 + 1),
    errorTimeout:cylDef.errorTimeout || UC_ERR_TIMEOUT,
  };
}

/**
 * ucScanSignalsFromVars(unitDiagsVars, deviceId)
 * Quét Variable Table (vars[]) của các diagram thuộc unit để lấy địa chỉ vật lý
 * cho tất cả signal _SOL và _SNS của thiết bị có label === deviceId.
 *
 * Sử dụng dot-notation thủ công để tránh lỗi KV_ADDR_RE match "CY1..." nhầm.
 *
 * @param {Array}  unitDiagsVars  — mảng vars[] gộp từ tất cả diagram của unit
 * @param {string} deviceId       — VD: "CY1"
 * @returns {Object}  { [sigName]: physAddr }
 *   VD: { "Up_SOL": "LR000", "Down_SOL": "LR001", "Up_SNS": "MR1000", ... }
 */
function ucScanSignalsFromVars(unitDiagsVars, deviceId) {
  const result = {};
  (unitDiagsVars || []).forEach(function(v) {
    if (v.label !== deviceId) return;
    if (!v.signalAddresses) return;
    // Lấy device type definition
    const devType = (typeof project !== 'undefined' && project.devices || [])
      .find(function(d) { return d.name === (v.format || ''); });
    if (!devType) {
      // Fallback: nếu không có devType nhưng có signalAddresses, lưu theo key
      Object.assign(result, v.signalAddresses);
      return;
    }
    (devType.signals || []).forEach(function(sig) {
      const addr = v.signalAddresses[sig.id];
      if (addr) result[sig.name] = addr;
    });
  });
  return result;  // { "Up_SOL": "LR000", "Down_SOL": "LR001", ... }
}

/**
 * ucNormalizeDeviceList(unitConfig)
 * Chuẩn hóa danh sách thiết bị từ JSON v2 hoặc v3 về dạng thống nhất.
 *
 * v3: devices[{ kind, id, index }]
 * v2: cylinders[{ id, hmiManBtn, ... }]
 * → Luôn trả về mảng [{ kind, id, index, ...rawProps }]
 *
 * @param {Object} unitConfig
 * @returns {Array}
 */
function ucNormalizeDeviceList(unitConfig) {
  // v3: có trường devices[]
  if (Array.isArray(unitConfig.devices) && unitConfig.devices.length) {
    return unitConfig.devices.map(function(d, i) {
      return Object.assign({ kind: 'cylinder', index: i }, d);
    });
  }
  // v2 compat: có trường cylinders[]
  if (Array.isArray(unitConfig.cylinders) && unitConfig.cylinders.length) {
    return unitConfig.cylinders.map(function(cy, i) {
      return Object.assign({ kind: 'cylinder', index: i }, cy);
    });
  }
  return [];
}

/**
 * ucBuildWarnings(ctx)
 * Trả về mảng các warning string nếu context thiếu dữ liệu quan trọng.
 * Được chèn vào đầu code output dưới dạng comment.
 */
function ucBuildWarnings(ctx) {
  const warns = [];
  if (!ctx.originSteps.length) {
    warns.push('WARNING: Không tìm thấy diagram Origin (Mode=Origin) — Origin section sẽ trống.');
  }
  if (!ctx.stationFlows.length) {
    warns.push('WARNING: Không tìm thấy diagram Auto/Station (Mode=Auto) — Auto section sẽ trống.');
  }
  ctx.cylinders.forEach(function(cy) {
    if (!cy.outDirA && !cy.outDirB) {
      warns.push('WARNING: ' + cy.id + ' — không tìm thấy địa chỉ output (_SOL) trong Variable Table. Kiểm tra khai báo biến CY_ID.Dir_SOL.');
    }
    if (!cy.sensorDirA && cy.dirAName) {
      warns.push('WARNING: ' + cy.id + '.' + cy.dirAName + '_SNS — không tìm thấy sensor. Kiểm tra Variable Table hoặc transition condition.');
    }
    if (!cy.sensorDirB && cy.dirBName) {
      warns.push('WARNING: ' + cy.id + '.' + cy.dirBName + '_SNS — không tìm thấy sensor.');
    }
  });
  return warns;
}

// ─── Load JSON file qua FileReader ───────────────────────────────────────────
function cgUCLoadFile(inputId, onSuccess) {
  const el = document.getElementById(inputId);
  if (!el || !el.files || !el.files.length) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      onSuccess(JSON.parse(e.target.result));
    } catch(err) {
      if (typeof toast === 'function') toast('⚠ JSON parse error: ' + err.message);
      else console.error('JSON parse error', err);
    }
  };
  reader.readAsText(el.files[0]);
}

// ─── Tính địa chỉ MR từ base string và index ─────────────────────────────────
function ucParseBase(baseStr) {
  const m = String(baseStr).match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}
function ucMRAddr(baseNum, offset) {
  return '@MR' + String(baseNum + offset).padStart(3, '0');
}

// ─── Lấy tên hướng từ sigName (VD: 'Up_SOL' → 'Up', 'Down_SNS' → 'Down') ───
function ucDirFromSigName(sigName) {
  if (!sigName) return '';
  return sigName.split('_')[0];
}

// ─── Kiểm tra sigName có phải output SOL không ────────────────────────────────
function ucIsSOL(sigName) {
  return sigName && sigName.toUpperCase().endsWith('_SOL');
}

// ─── Kiểm tra sigName có phải sensor SNS không ────────────────────────────────
function ucIsSNS(sigName) {
  return sigName && sigName.toUpperCase().endsWith('_SNS');
}

// ─── Build context object từ unitConfig + canvas diagrams ────────────────────
//  unitConfig: nội dung unit-config.json (v2 hoặc v3)
//  Dữ liệu flow đọc từ project.diagrams (global) qua loadDiagramData() và
//  cgResolveSequence() / cgResolveSignalInfo() — giống generateKVAll().
//
//  v3 changes:
//  - Flags và IO tính qua ucResolveUnitFlags / ucResolveUnitIO (không hardcode).
//  - devices[] chuẩn hóa qua ucNormalizeDeviceList (tương thích v2 cylinders[]).
//  - Admin addresses (hmiManBtn, lock, err…) tính qua ucResolveCylinderAdminAddrs.
//  - Signals (_SOL, _SNS) quét từ Variable Table qua ucScanSignalsFromVars.
function cgUCBuildContext(unitConfig) {
  const u      = unitConfig.unit;

  // ── v3: resolve flags và IO qua resolver functions ────────────────────────
  const flags  = ucResolveUnitFlags(u);
  const io     = ucResolveUnitIO(u);

  const originBaseNum = ucParseBase(u.originBaseAddr || '@MR100');
  const autoBaseNum   = ucParseBase(u.autoBaseAddr   || '@MR300');

  // ── Đọc diagrams từ canvas ────────────────────────────────────────────────
  // Tìm tất cả diagrams thuộc unit này (theo unitId hoặc unit.label)
  // Mode='Origin' → origin flow; Mode='Auto' hoặc không có → station flows
  const allDiags = (typeof project !== 'undefined' && project.diagrams) ? project.diagrams : [];

  // Tìm unit ID trong project.units theo label
  const unitObj = (typeof project !== 'undefined' && project.units || [])
    .find(function(pu) { return pu.name === u.label || pu.id === u.id; });
  const unitId = unitObj ? unitObj.id : null;

  // Lọc diagrams theo unitId (nếu có) hoặc lấy tất cả nếu project chỉ có 1 unit
  const unitDiags = unitId
    ? allDiags.filter(function(d) { return d.unitId === unitId; })
    : allDiags;

  // ── Origin flow ───────────────────────────────────────────────────────────
  const originDiag = unitDiags.find(function(d) {
    return (d.mode || '').toLowerCase() === 'origin';
  });

  // ── Auto/Station flows ────────────────────────────────────────────────────
  const stationDiags = unitDiags.filter(function(d) {
    const m = (d.mode || '').toLowerCase();
    return m === 'auto' || m === 'station' || (!m && d !== originDiag);
  });

  // ── Helper: load diagram state và resolve sequence ────────────────────────
  function loadSeq(diag) {
    if (!diag) return null;
    const data = (typeof loadDiagramData === 'function') ? loadDiagramData(diag.id) : null;
    if (!data || !data.state) return null;
    const s        = data.state;
    const sequence = cgResolveSequence(s);
    const vars     = s.vars || [];
    return { diag, s, vars, sequence };
  }

  // ── Build computed steps cho một flow sequence ────────────────────────────
  // Trả về mảng step objects với addr, cmpAddr, label, actions[], sensor
  function buildComputedSteps(seqData, baseNum) {
    if (!seqData) return [];
    const { sequence, vars } = seqData;
    return sequence.map(function(item, i) {
      const { step, inTrans, outTrans } = item;

      // Actions: lọc qualifier='N' (SET-action)
      // Lưu ý: cgResolveSignalInfo nhầm 'CY1.Down_SOL' là PLC address do KV_ADDR_RE.
      // Phải thử dot-notation trước.
      const actions = (step.actions || [])
        .filter(function(a) { return (a.qualifier || 'N') === 'N' && (a.variable || a.address); })
        .map(function(a) {
          const varStr = a.variable || a.address || '';
          // Thử dot-notation
          if (varStr.includes('.')) {
            const dotIdx   = varStr.indexOf('.');
            const devLabel = varStr.substring(0, dotIdx);
            const sigName  = varStr.substring(dotIdx + 1);
            const v = (vars || []).find(function(x) { return x.label === devLabel; });
            if (v) {
              const devType = (typeof project !== 'undefined' && project.devices || [])
                .find(function(d) { return d.name === (v.format || ''); });
              const sig = (devType && devType.signals || []).find(function(s) { return s.name === sigName; });
              const physAddr = sig ? (v.signalAddresses && v.signalAddresses[sig.id]) || '' : '';
              return {
                variable:    varStr,
                physAddr:    physAddr,
                devLabel:    devLabel,
                sigName:     sigName,
                devTypeName: devType ? devType.name : ''
              };
            }
          }
          // Fallback: cgResolveSignalInfo (cho label không có dot hoặc PLC address)
          const info = cgResolveSignalInfo(varStr, vars);
          return info ? {
            variable:    varStr,
            physAddr:    info.physAddr,
            devLabel:    info.devLabel,
            sigName:     info.sigName,
            devTypeName: info.devTypeName
          } : null;
        })
        .filter(Boolean);

      // Sensor: lấy từ transition condition RA KHỎI step này (outTrans)
      // → dùng để điền vào LD step.addr / AND sensor / SET step.cmpAddr
      // Lưu ý: cgResolveSignalInfo có thể nhầm 'CY1.Down_SNS' là PLC address literal
      // do KV_ADDR_RE = /^[A-Z]{1,3}\d/ match 'CY1'. Phải thử dot-notation trước.
      let sensor = '';
      let sensorLabel = '';
      if (outTrans && outTrans.condition && outTrans.condition.trim() &&
          outTrans.condition.trim() !== '1' && outTrans.condition.trim() !== 'true') {
        const cond = outTrans.condition.trim();
        // Thử dot-notation: DevLabel.SignalName
        if (cond.includes('.')) {
          const dotIdx   = cond.indexOf('.');
          const devLabel = cond.substring(0, dotIdx);
          const sigName  = cond.substring(dotIdx + 1);
          const v = (vars || []).find(function(x) { return x.label === devLabel; });
          if (v && v.signalAddresses) {
            const devType = (typeof project !== 'undefined' && project.devices || [])
              .find(function(d) { return d.name === (v.format || ''); });
            const sig = (devType && devType.signals || []).find(function(s) { return s.name === sigName; });
            if (sig && v.signalAddresses[sig.id]) {
              sensor      = v.signalAddresses[sig.id];
              sensorLabel = devLabel + '.' + sigName;
            }
          }
        }
        // Fallback: cgResolveSignalInfo (cho PLC address literals, plain labels)
        if (!sensor) {
          const info = cgResolveSignalInfo(cond, vars);
          if (info && info.physAddr && !cond.includes('.')) {
            sensor      = info.physAddr;
            sensorLabel = info.devLabel && info.sigName ? info.devLabel + '.' + info.sigName : cond;
          } else if (!sensor) {
            sensor      = cond;
            sensorLabel = cond;
          }
        }
      }

      // Extra condition: lấy từ transition condition VÀO step này (inTrans)
      // Nếu inTrans.condition KHÔNG phải là sensor SNS của step trước
      // → dùng làm AND trước SET step.addr
      // Ví dụ: CY2 Left activation cần "AND MR7000 ; winding output safe"
      // Rule: nếu condition có _SNS suffix hoặc là sensor của bất kỳ cylinder → skip
      let extraCondition = '';
      if (inTrans && inTrans.condition) {
        const cond = inTrans.condition.trim();
        if (cond && cond !== '1' && cond !== 'true') {
          // Nếu condition có _SNS suffix → đây là sensor của step trước → không phải extraCondition
          const isSNSCond = ucIsSNS(cond) ||
            (cond.includes('.') && ucIsSNS(cond.substring(cond.indexOf('.') + 1)));
          if (!isSNSCond) {
            // Resolve địa chỉ
            let extraAddr = '';
            if (cond.includes('.')) {
              const dotIdx   = cond.indexOf('.');
              const devLabel = cond.substring(0, dotIdx);
              const sigName  = cond.substring(dotIdx + 1);
              const v = (vars || []).find(function(x) { return x.label === devLabel; });
              if (v && v.signalAddresses) {
                const devType = (typeof project !== 'undefined' && project.devices || [])
                  .find(function(d) { return d.name === (v.format || ''); });
                const sig = (devType && devType.signals || []).find(function(s) { return s.name === sigName; });
                if (sig && v.signalAddresses[sig.id]) extraAddr = v.signalAddresses[sig.id];
              }
            } else {
              const info = cgResolveSignalInfo(cond, vars);
              if (info && info.physAddr) extraAddr = info.physAddr;
              else extraAddr = cond;
            }
            if (extraAddr) {
              extraCondition = 'AND  ' + ucPad(extraAddr) + '; ' + cond;
            }
          }
        }
      }

      return {
        addr:           ucMRAddr(baseNum, i * 2),
        cmpAddr:        ucMRAddr(baseNum, i * 2 + 1),
        label:          step.label || ('Step ' + step.number),
        actions:        actions,
        sensor:         sensor,
        sensorLabel:    sensorLabel,
        extraCondition: extraCondition,
        stepIndex:      i,
        stepId:         step.id
      };
    });
  }

  const originSeqData = loadSeq(originDiag);
  const originSteps   = buildComputedSteps(originSeqData, originBaseNum);

  const stationFlows = stationDiags.map(function(diag, fi) {
    const seqData = loadSeq(diag);
    // Mỗi station có baseNum riêng — dùng autoBaseAddr + fi*32 (tránh overlap)
    // Tuy nhiên trong thực tế project thường chỉ có 1 station → fi=0 → autoBaseNum
    const baseNum = autoBaseNum + fi * 32;
    const steps   = buildComputedSteps(seqData, baseNum);
    const endPulseAddr = u.autoEndPulseAddr || ucMRAddr(baseNum, steps.length * 2);
    return {
      label:        diag.name || ('Station ' + (fi + 1)),
      baseNum:      baseNum,
      steps:        steps,
      endPulseAddr: endPulseAddr,
      diagId:       diag.id
    };
  });

  // ── Xây dựng cylinder context từ unitConfig + thông tin từ diagrams ──────
  // v3: dùng ucNormalizeDeviceList (hỗ trợ cả v2 cylinders[] và v3 devices[]).
  // Admin addresses tính qua ucResolveCylinderAdminAddrs.
  // Signals (_SOL, _SNS) quét từ Variable Table qua ucScanSignalsFromVars.

  // Gom tất cả computed steps từ mọi flow
  const allComputedSteps = [
    ...originSteps,
    ...stationFlows.flatMap(function(f) { return f.steps; })
  ];

  // Gom tất cả vars từ mọi diagram (để lookup sensor + ucScanSignalsFromVars)
  const allVarsGlobal = (originSeqData ? originSeqData.vars : []).concat(
    stationDiags.flatMap(function(diag) {
      const sd = loadSeq(diag);
      return sd ? sd.vars : [];
    })
  );

  // ── v3: chuẩn hóa danh sách thiết bị ─────────────────────────────────────
  const deviceList = ucNormalizeDeviceList(unitConfig);

  const cylinders = deviceList
    // Hiện tại chỉ xử lý kind=cylinder; các kind khác để mở rộng sau
    .filter(function(dev) { return (dev.kind || 'cylinder') === 'cylinder'; })
    .map(function(cy, listIndex) {
      // ── v3: Quét signals từ Variable Table (ưu tiên tuyệt đối) ─────────
      // Kết quả: { "Up_SOL": "LR000", "Down_SOL": "LR001", "Up_SNS": "MR1000", ... }
      const varTableSignals = ucScanSignalsFromVars(allVarsGlobal, cy.id);

      // ── Tìm tất cả step actions có devLabel === cy.id và sigName _SOL ────
      const cyActions = [];
      allComputedSteps.forEach(function(cs) {
        cs.actions.forEach(function(act) {
          if (act.devLabel === cy.id && ucIsSOL(act.sigName)) {
            cyActions.push({ step: cs, act: act });
          }
        });
      });

      // ── Xác định dirA và dirB ────────────────────────────────────────────
      // Quy tắc: dirA = hướng CHỈ xuất hiện trong STATION (không có trong origin)
      //          dirB = hướng xuất hiện trong ORIGIN (hướng hồi về / home)
      const originCyDirs = new Set();
      originSteps.forEach(function(cs) {
        cs.actions.forEach(function(act) {
          if (act.devLabel === cy.id && ucIsSOL(act.sigName)) {
            originCyDirs.add(ucDirFromSigName(act.sigName));
          }
        });
      });

      const stationCyDirs = new Set();
      stationFlows.forEach(function(f) {
        f.steps.forEach(function(cs) {
          cs.actions.forEach(function(act) {
            if (act.devLabel === cy.id && ucIsSOL(act.sigName)) {
              stationCyDirs.add(ucDirFromSigName(act.sigName));
            }
          });
        });
      });

      const dirBCandidates = [...originCyDirs];
      const dirACandidates = [...stationCyDirs].filter(function(d) { return !originCyDirs.has(d); });

      let dirAName = dirACandidates[0] || dirBCandidates[1] || (cyActions.length ? ucDirFromSigName(cyActions[0].act.sigName) : 'DirA');
      let dirBName = dirBCandidates[0] || '';
      if (!dirACandidates.length && dirBCandidates.length >= 2) {
        dirAName = dirBCandidates[1];
        dirBName = dirBCandidates[0];
      }

      // ── Lấy địa chỉ output từ Variable Table (ưu tiên) ──────────────────
      // v3: ucScanSignalsFromVars trả về { "Up_SOL": "LR000", ... }
      // → ưu tiên over physAddr từ step.actions (để tránh nhầm)
      let outDirA = (dirAName && varTableSignals[dirAName + '_SOL']) || '';
      let outDirB = (dirBName && varTableSignals[dirBName + '_SOL']) || '';

      // Fallback: lấy từ step actions nếu Variable Table không có (VD: plain BOOL var)
      if (!outDirA || !outDirB) {
        const dirs = new Set(cyActions.map(function(ca) {
          return ucDirFromSigName(ca.act.sigName);
        }));
        dirs.forEach(function(dir) {
          const sample = cyActions.find(function(ca) {
            return ucDirFromSigName(ca.act.sigName) === dir;
          });
          if (!sample) return;
          if (dir === dirAName && !outDirA) outDirA = sample.act.physAddr;
          if (dir === dirBName && !outDirB) outDirB = sample.act.physAddr;
        });
      }

      // ── Lấy sensor từ Variable Table (ưu tiên, tránh lỗi KV_ADDR_RE) ───
      // v3: ucScanSignalsFromVars → { "Up_SNS": "MR1000", ... }
      let sensorDirA = (dirAName && varTableSignals[dirAName + '_SNS']) || '';
      let sensorDirB = (dirBName && varTableSignals[dirBName + '_SNS']) || '';

      // Fallback 1: lấy từ sensor của step (transition condition)
      if (!sensorDirA || !sensorDirB) {
        allComputedSteps.forEach(function(cs) {
          cs.actions.forEach(function(act) {
            if (act.devLabel !== cy.id || !ucIsSOL(act.sigName)) return;
            const dir = ucDirFromSigName(act.sigName);
            if (dir === dirAName && !sensorDirA && cs.sensor) sensorDirA = cs.sensor;
            if (dir === dirBName && !sensorDirB && cs.sensor) sensorDirB = cs.sensor;
          });
        });
      }

      // Fallback 2: cgResolveSignalInfo với dot-notation thủ công (an toàn)
      if (!sensorDirA && dirAName) {
        const snsSig = cy.id + '.' + dirAName + '_SNS';
        // Dot-notation thủ công — không qua KV_ADDR_RE
        const dotIdx = snsSig.indexOf('.');
        const dLabel = snsSig.substring(0, dotIdx);
        const sName  = snsSig.substring(dotIdx + 1);
        const vv = allVarsGlobal.find(function(x) { return x.label === dLabel; });
        if (vv && vv.signalAddresses) {
          const dt = (typeof project !== 'undefined' && project.devices || [])
            .find(function(d) { return d.name === (vv.format || ''); });
          const sg = (dt && dt.signals || []).find(function(s) { return s.name === sName; });
          if (sg && vv.signalAddresses[sg.id]) sensorDirA = vv.signalAddresses[sg.id];
        }
      }
      if (!sensorDirB && dirBName) {
        const snsSig = cy.id + '.' + dirBName + '_SNS';
        const dotIdx = snsSig.indexOf('.');
        const dLabel = snsSig.substring(0, dotIdx);
        const sName  = snsSig.substring(dotIdx + 1);
        const vv = allVarsGlobal.find(function(x) { return x.label === dLabel; });
        if (vv && vv.signalAddresses) {
          const dt = (typeof project !== 'undefined' && project.devices || [])
            .find(function(d) { return d.name === (vv.format || ''); });
          const sg = (dt && dt.signals || []).find(function(s) { return s.name === sName; });
          if (sg && vv.signalAddresses[sg.id]) sensorDirB = vv.signalAddresses[sg.id];
        }
      }

      // ── steps cho dirA và dirB ───────────────────────────────────────────
      const stepsForDirA = allComputedSteps.filter(function(cs) {
        return cs.actions.some(function(a) {
          return a.devLabel === cy.id && ucIsSOL(a.sigName) && ucDirFromSigName(a.sigName) === dirAName;
        });
      });
      const stepsForDirB = allComputedSteps.filter(function(cs) {
        return cs.actions.some(function(a) {
          return a.devLabel === cy.id && ucIsSOL(a.sigName) && ucDirFromSigName(a.sigName) === dirBName;
        });
      });

      // Chỉ lấy steps TRONG STATION cho dirA output block
      const stationStepsDirA = stepsForDirA.filter(function(cs) {
        return stationFlows.some(function(f) {
          return f.steps.some(function(fs) { return fs.stepId === cs.stepId; });
        });
      });

      // ── v3: Admin addresses từ ucResolveCylinderAdminAddrs ───────────────
      const adminAddrs = ucResolveCylinderAdminAddrs(cy, listIndex);

      return {
        id:           cy.id,
        label:        cy.label || cy.id,
        // Admin addresses (v3: tự tính theo index nếu không override)
        hmiManBtn:    adminAddrs.hmiManBtn,
        sysManFlag:   adminAddrs.sysManFlag,
        lockDirA:     adminAddrs.lockDirA,
        lockDirB:     adminAddrs.lockDirB,
        errFlagDirA:  adminAddrs.errFlagDirA,
        errFlagDirB:  adminAddrs.errFlagDirB,
        errorTimeout: adminAddrs.errorTimeout,
        // Physical I/O (từ Variable Table + fallback)
        outDirA:      outDirA,
        outDirB:      outDirB,
        sensorDirA:   sensorDirA,
        sensorDirB:   sensorDirB,
        dirAName:     dirAName,
        dirBName:     dirBName,
        // Steps
        stepDirA:     stationStepsDirA[0] || stepsForDirA[0] || null,
        stepsForDirB: stepsForDirB,
        allStepsDirA: stepsForDirA
      };
    });

  // ── originSeqEnd: cmpAddr của step cuối origin ────────────────────────────
  const originSeqEnd = originSteps.length
    ? originSteps[originSteps.length - 1].cmpAddr
    : flags.flagHomed;

  // ── flagsResetEnd: địa chỉ cuối cùng cần reset khi eStop/error ───────────
  // = autoBaseNum + 115 (đủ cover toàn bộ station steps + buffer)
  const flagsResetEnd = ucMkMR(autoBaseNum + 115);

  // ── Unit context object (v3: flags và io từ resolver, không hardcode) ─────
  const unit = {
    label:           u.label || '',
    // IO (v3: từ ucResolveUnitIO — tự tính theo unitIndex hoặc override)
    eStop:           io.eStop           || '',
    outHomed:        io.outHomed        || '',
    btnStart:        io.btnStart        || '',
    btnReset:        io.btnReset        || '',
    hmiStart:        io.hmiStart        || '',
    hmiStop:         io.hmiStop         || '',
    hmiManual:       io.hmiManual       || '',
    errorDMAddr:     io.errorDMAddr     || '',
    hmiManBtnBase:   io.hmiManBtnBase   || '',
    hmiManBtnEnd:    io.hmiManBtnEnd    || '',
    // Flags (v3: từ ucResolveUnitFlags — mặc định UC_DEFAULT_FLAGS)
    flagOrigin:      flags.flagOrigin,
    flagAuto:        flags.flagAuto,
    flagManual:      flags.flagManual,
    flagManPEnd:     flags.flagManPEnd,
    flagError:       flags.flagError,
    flagErrStop:     flags.flagErrStop,
    flagResetPulse:  flags.flagResetPulse,
    flagResetEnd:    flags.flagResetEnd,
    flagHomed:       flags.flagHomed,
    flagsResetEnd:   flagsResetEnd,
    originSeqEnd:    originSeqEnd,
    autoTriggerAddr: u.autoTriggerAddr  || ''
  };

  return {
    unit:         unit,
    cylinders:    cylinders,
    originSteps:  originSteps,
    stationFlows: stationFlows,
    // v3: expose warnings để entry point chèn vào output
    warnings:     ucBuildWarnings({ unit, cylinders, originSteps, stationFlows })
  };
}

// ─── p: pad address string for alignment ─────────────────────────────────────
function ucPad(addr) { return String(addr).padEnd(12); }

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION GENERATORS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ERROR section ────────────────────────────────────────────────────────────
function cgUCGenerateError(ctx) {
  const L = [];
  const u = ctx.unit;

  L.push(';<h1/>Error');

  // Dùng eStop để ZRES toàn bộ flags khi e-stop kích hoạt
  if (u.eStop) {
    L.push(`LD   ${ucPad(u.eStop)}; ${u.label}  estop`);
    L.push(`ZRES ${u.flagOrigin} ${u.flagsResetEnd} ; Origin`);
  }
  // Manual mode cũng xóa toàn bộ step MRs (từ originBase đến end)
  if (u.flagManual) {
    const originBase = (ctx.originSteps && ctx.originSteps.length) ? ctx.originSteps[0].addr : '';
    if (originBase) {
      L.push(`LD   ${ucPad(u.flagManual)}; Manual`);
      L.push(`ZRES ${originBase} ${u.flagsResetEnd} ; CY1 Down`);
    }
  }

  // MOV errorDM per cylinder (nếu có errorDMAddr)
  if (u.errorDMAddr) {
    L.push(`LD   CR2002           ; Always ON`);
    ctx.cylinders.forEach(function(cy) {
      if (cy.errFlagDirA) {
        L.push(`MOV  ${ucPad(cy.errFlagDirA)}${u.errorDMAddr}         ; Error_${cy.label}_${cy.dirAName || 'DirA'}  ${u.label}_Error`);
      }
    });
    L.push(`LD>  ${ucPad(u.errorDMAddr)}#0             ; ${u.label}_Error`);
  } else {
    // Không có DM — OR trực tiếp các error flag
    ctx.cylinders.forEach(function(cy, i) {
      const inst = i === 0 ? 'LD  ' : 'OR  ';
      if (cy.errFlagDirA) L.push(`${inst} ${ucPad(cy.errFlagDirA)}; Error_${cy.label}_${cy.dirAName || 'DirA'}`);
      if (cy.errFlagDirB) L.push(`OR   ${ucPad(cy.errFlagDirB)}; Error_${cy.label}_${cy.dirBName || 'DirB'}`);
    });
  }
  L.push(`SET  ${ucPad(u.flagError)}; Error`);
  L.push(`LD   ${ucPad(u.flagError)}; Error`);
  L.push(`SET  ${ucPad(u.flagErrStop)}; Operation Error Stop`);
  L.push(`LD   ${ucPad(u.flagErrStop)}; Operation Error Stop`);
  if (u.btnReset) L.push(`AND  ${ucPad(u.btnReset)}; btnReset`);
  if (u.flagResetPulse) {
    L.push(`DIFU ${ucPad(u.flagResetPulse)}; Reset Error`);
    L.push(`LDP  ${ucPad(u.flagResetPulse)}; Reset Error`);
    L.push(`ZRES ${u.flagError} ${u.flagResetEnd} ; Error  Reset Error`);
  }
  L.push('');

  return L;
}

// ─── MANUAL section ───────────────────────────────────────────────────────────
function cgUCGenerateManual(ctx) {
  const L = [];
  const u = ctx.unit;
  const cys = ctx.cylinders;

  L.push(';<h1/>Manual');

  // Duy trì flag Manual
  L.push(`LDB  ${ucPad(u.flagAuto)}; Auto`);
  if (u.hmiManual) L.push(`AND  ${ucPad(u.hmiManual)}; Hmi_${u.label}_Manual`);
  L.push(`OR   ${ucPad(u.flagManual)}; Manual`);
  if (u.eStop)    L.push(`ANB  ${ucPad(u.eStop)}; ${u.label}  estop`);
  L.push(`ANB  ${ucPad(u.flagManPEnd)}; Manual P end`);
  L.push(`OUT  ${ucPad(u.flagManual)}; Manual`);

  // ALT toggle block: MPS/MRD/MPP per cylinder
  // Pattern từ Code gen.txt:
  //   N=1: (không có stack)
  //   N=2: MPS, pair0; MPP, pair1
  //   N≥3: MPS, pair0; MRD, pair1; ...; MPP, pairN-2; pairN-1 (không có stack trước last)
  if (cys.length > 0) {
    L.push(`LD   ${ucPad(u.flagManual)}; Manual`);
    if (cys.length === 1) {
      L.push(`ANP  ${ucPad(cys[0].hmiManBtn)}; Hmi_man _${cys[0].label}`);
      L.push(`ALT  ${ucPad(cys[0].sysManFlag)}; sys_man_${cys[0].label}`);
    } else {
      cys.forEach(function(cy, i) {
        const isFirst  = i === 0;
        const isPenult = i === cys.length - 2;  // trước last → MPP
        const isLast   = i === cys.length - 1;
        if (isFirst)       L.push('MPS');
        else if (isPenult) L.push('MPP');
        else if (!isLast)  L.push('MRD');
        // isLast không có stack instruction
        L.push(`ANP  ${ucPad(cy.hmiManBtn)}; Hmi_man _${cy.label}`);
        L.push(`ALT  ${ucPad(cy.sysManFlag)}; sys_man_${cy.label}`);
      });
    }
  }

  // LDB flagManual block: theo dõi output để cập nhật sysManFlag
  // Chỉ xử lý các cylinder CÓ địa chỉ output (được khai báo trong Variable Table)
  // Pattern từ Code gen.txt:
  //   MPS
  //   ANP outDirA0; SET sysManFlag0
  //   MRD
  //   ANP outDirB0; RES sysManFlag0
  //   MRD
  //   ANP outDirA1; SET sysManFlag1
  //   ...
  //   MPP
  //   ANP outDirBN-1; RES sysManFlagN-1
  const cysWithOut = cys.filter(function(cy) { return cy.outDirA || cy.outDirB; });
  if (cysWithOut.length > 0) {
    L.push(`LDB  ${ucPad(u.flagManual)}; Manual`);
    if (cysWithOut.length === 1) {
      const cy0 = cysWithOut[0];
      if (cy0.outDirA) {
        L.push(`ANP  ${ucPad(cy0.outDirA)}; Out_${u.label}_${cy0.label}_${cy0.dirAName}`);
        L.push(`SET  ${ucPad(cy0.sysManFlag)}; sys_man_${cy0.label}`);
      }
      if (cy0.outDirB) {
        L.push(`ANP  ${ucPad(cy0.outDirB)}; Out_${u.label}_${cy0.label}_${cy0.dirBName}`);
        L.push(`RES  ${ucPad(cy0.sysManFlag)}; sys_man_${cy0.label}`);
      }
    } else {
      L.push('MPS');
      cysWithOut.forEach(function(cy, i) {
        const isLast = i === cysWithOut.length - 1;
        // DirA
        if (cy.outDirA) {
          L.push(`ANP  ${ucPad(cy.outDirA)}; Out_${u.label}_${cy.label}_${cy.dirAName}`);
          L.push(`SET  ${ucPad(cy.sysManFlag)}; sys_man_${cy.label}`);
        }
        // Stack instruction before DirB
        if (isLast) L.push('MPP');
        else        L.push('MRD');
        // DirB
        if (cy.outDirB) {
          L.push(`ANP  ${ucPad(cy.outDirB)}; Out_${u.label}_${cy.label}_${cy.dirBName}`);
          L.push(`RES  ${ucPad(cy.sysManFlag)}; sys_man_${cy.label}`);
        }
        // MRD after DirB (not for last cylinder)
        if (!isLast) L.push('MRD');
      });
    }
  }

  // ZRES HMI manual buttons khi thoát Manual
  L.push(`LDB  ${ucPad(u.flagManual)}; Manual`);
  if (u.hmiManBtnBase && u.hmiManBtnEnd) {
    L.push(`ZRES ${u.hmiManBtnBase} ${u.hmiManBtnEnd} ; Hmi_man _${cys.length ? cys[0].label : 'CY'}`);
  }
  // DIFU Manual P end
  L.push(`LD   ${ucPad(u.flagAuto)}; Auto`);
  L.push(`DIFU ${ucPad(u.flagManPEnd)}; Manual P end`);
  L.push('');

  return L;
}

// ─── ORIGIN section ───────────────────────────────────────────────────────────
function cgUCGenerateOrigin(ctx) {
  const L = [];
  const u = ctx.unit;
  const originSteps = ctx.originSteps;

  L.push(';<h1/>Origin');

  // Duy trì flagOrigin
  if (u.btnStart) L.push(`LDP  ${ucPad(u.btnStart)}; btnStart`);
  if (u.hmiStart) L.push(`ORP  ${ucPad(u.hmiStart)}; Hmi_${u.label}_start`);
  L.push(`ANB  ${ucPad(u.flagManual)}; Manual`);
  L.push(`ANB  ${ucPad(u.flagHomed)}; Homed`);
  L.push(`OR   ${ucPad(u.flagOrigin)}; Origin`);
  L.push(`AND  ${ucPad(u.flagError)}; Error`);
  if (u.eStop)   L.push(`ANB  ${ucPad(u.eStop)}; ${u.label}  estop`);
  if (u.hmiStop) L.push(`ANB  ${ucPad(u.hmiStop)}; Hmi ${u.label} _stop`);
  L.push(`OUT  ${ucPad(u.flagOrigin)}; Origin`);

  if (originSteps.length > 0) {
    originSteps.forEach(function(step, i) {
      const isFirst = i === 0;

      // Step label: dùng label của action (CY + dir) hoặc label canvas
      const actionLabel = step.actions.length
        ? step.actions.map(function(a) { return (a.devLabel || '') + ' ' + ucDirFromSigName(a.sigName || ''); }).join(', ')
        : step.label;
      L.push(';' + (actionLabel || step.label));

      if (isFirst) {
        L.push(`LD   ${ucPad(u.flagOrigin)}; Origin`);
        L.push(`ANB  ${ucPad(u.flagHomed)}; Homed`);
        L.push(`ANB  ${ucPad(u.flagError)}; Error`);
      } else {
        const prev = originSteps[i - 1];
        const prevLabel = prev.actions.length
          ? prev.actions.map(function(a) { return (a.devLabel || '') + ' ' + ucDirFromSigName(a.sigName || ''); }).join(', ')
          : prev.label;
        L.push(`LD   ${ucPad(prev.cmpAddr)}; ${prevLabel} Cmp`);
        L.push(`ANB  ${ucPad(u.flagError)}; Error`);
      }

      // Extra condition (ví dụ: winding output safe)
      if (step.extraCondition && step.extraCondition.trim()) {
        L.push(step.extraCondition.trim());
      }

      L.push(`SET  ${ucPad(step.addr)}; ${actionLabel || step.label}`);
      L.push(`LD   ${ucPad(step.addr)}; ${actionLabel || step.label}`);
      if (step.sensor) {
        L.push(`AND  ${ucPad(step.sensor)}; ${step.sensorLabel || step.sensor}`);
      }
      L.push(`SET  ${ucPad(step.cmpAddr)}; ${(actionLabel || step.label)} Cmp`);
    });

    // Set Homed: dựa trên step cuối của origin
    // Theo Code gen.txt: LD @MR101 (CY1 Down Cmp) → SET @MR010 → OUT MR105
    // Tức là step cuối có thể không phải step index tận cùng — có thể là step
    // trước khi Set Homed trong canvas. Hiện tại: dùng step cuối của sequence.
    const lastStep = originSteps[originSteps.length - 1];
    const lastLabel = lastStep.actions.length
      ? lastStep.actions.map(function(a) { return (a.devLabel || '') + ' ' + ucDirFromSigName(a.sigName || ''); }).join(', ')
      : lastStep.label;
    L.push(`LD   ${ucPad(lastStep.cmpAddr)}; ${lastLabel} Cmp`);
    L.push(`SET  ${ucPad(u.flagHomed)}; Homed`);
    L.push(`LD   ${ucPad(u.flagHomed)}; Homed`);
    if (u.outHomed) L.push(`OUT  ${ucPad(u.outHomed)}; ${u.label}  homed`);
  }
  L.push('');

  return L;
}

// ─── AUTO section (bao gồm các Station flows) ─────────────────────────────────
function cgUCGenerateAuto(ctx) {
  const L = [];
  const u = ctx.unit;

  L.push(';<h1/>Auto');

  // Duy trì flagAuto
  if (u.btnStart) L.push(`LDP  ${ucPad(u.btnStart)}; btnStart`);
  if (u.hmiStart) L.push(`ORP  ${ucPad(u.hmiStart)}; Hmi_${u.label}_start`);
  L.push(`AND  ${ucPad(u.flagHomed)}; Homed`);
  L.push(`OR   ${ucPad(u.flagAuto)}; Auto`);
  L.push(`AND  ${ucPad(u.flagError)}; Error`);
  if (u.eStop)   L.push(`ANB  ${ucPad(u.eStop)}; ${u.label}  estop`);
  if (u.hmiStop) L.push(`ANB  ${ucPad(u.hmiStop)}; Hmi infeed _stop`);
  L.push(`OUT  ${ucPad(u.flagAuto)}; Auto`);

  // Trigger đầu vào station (nếu cấu hình autoTriggerAddr)
  const triggerAutoMR = u.autoTriggerAddr || '';
  if (triggerAutoMR) {
    L.push(`LD   ${ucPad(u.flagHomed)}; Homed`);
    L.push(`AND  ${ucPad(u.flagAuto)}; Auto`);
    L.push(`ANB  ${ucPad(u.flagManual)}; Manual`);
    L.push(`ANB  ${ucPad(u.flagError)}; Error`);
    L.push(`SET  ${ucPad(triggerAutoMR)}`);
  }

  // Sinh code cho từng station flow (từ canvas diagrams Mode=Auto)
  ctx.stationFlows.forEach(function(flow) {
    if (!flow.steps.length) return;

    const stationLabel = flow.label;

    // Station bookmark
    L.push(`;<h1/>${stationLabel}`);

    flow.steps.forEach(function(step, i) {
      const actionLabel = step.actions.length
        ? step.actions.map(function(a) { return (a.devLabel || '') + ' ' + ucDirFromSigName(a.sigName || ''); }).join(', ')
        : step.label;
      L.push(';' + (actionLabel || step.label));

      if (i === 0) {
        // Step đầu: điều kiện là Auto + Homed + !Error
        L.push(`LD   ${ucPad(u.flagAuto)}; Auto`);
        L.push(`AND  ${ucPad(u.flagHomed)}; Homed`);
        L.push(`ANB  ${ucPad(u.flagError)}; Error`);
        L.push(`SET  ${ucPad(step.addr)}; ${actionLabel || step.label}`);
      } else {
        const prev = flow.steps[i - 1];
        const prevLabel = prev.actions.length
          ? prev.actions.map(function(a) { return (a.devLabel || '') + ' ' + ucDirFromSigName(a.sigName || ''); }).join(', ')
          : prev.label;
        L.push(`LD   ${ucPad(prev.cmpAddr)}; ${prevLabel} Cmp`);
        L.push(`ANB  ${ucPad(u.flagError)}; Error`);
        if (step.extraCondition && step.extraCondition.trim()) {
          L.push(step.extraCondition.trim());
        }
        L.push(`SET  ${ucPad(step.addr)}; ${actionLabel || step.label}`);
      }
      L.push(`LD   ${ucPad(step.addr)}; ${actionLabel || step.label}`);
      if (step.sensor) {
        L.push(`AND  ${ucPad(step.sensor)}; ${step.sensorLabel || step.sensor}`);
      }
      L.push(`SET  ${ucPad(step.cmpAddr)}; ${(actionLabel || step.label)} Cmp`);
    });

    // Kết thúc cycle: DIFU + ZRES
    const lastStep = flow.steps[flow.steps.length - 1];
    const endPulse = flow.endPulseAddr;
    const lastLabel = lastStep.actions.length
      ? lastStep.actions.map(function(a) { return (a.devLabel || '') + ' ' + ucDirFromSigName(a.sigName || ''); }).join(', ')
      : lastStep.label;
    L.push(`LD   ${ucPad(lastStep.cmpAddr)}; ${lastLabel} Cmp`);
    L.push(`DIFU ${ucPad(endPulse)}; Sequence 1 End`);
    L.push(`LD   ${ucPad(endPulse)}; Sequence 1 End`);
    // ZRES: reset từ step[0].addr đến cuối vùng đệm (16 slot = baseNum+15)
    const firstAddr   = flow.steps[0].addr;
    const resetEndNum = flow.baseNum + Math.max(15, flow.steps.length * 2 + 6);
    const resetEndAddr = '@MR' + String(resetEndNum).padStart(3, '0');
    L.push(`ZRES ${firstAddr} ${resetEndAddr} ; ${lastLabel} Cmp`);
  });

  L.push('');
  return L;
}

// ─── OUTPUT section ───────────────────────────────────────────────────────────
function cgUCGenerateOutput(ctx) {
  const L = [];
  const u = ctx.unit;

  L.push(';<h1/>Output');

  ctx.cylinders.forEach(function(cy) {
    if (!cy.outDirA && !cy.outDirB) return;  // bỏ qua cylinder không có địa chỉ output
    L.push(';' + cy.label);

    // ── dirA block: SET outDirA, RES outDirB ─────────────────────────────
    // stepDirA: step trong station flow điều khiển dirA (trong khi active)
    if (cy.stepDirA && cy.outDirA) {
      L.push(`LD   ${ucPad(u.flagAuto)}; Auto`);
      L.push(`AND  ${ucPad(cy.stepDirA.addr)}; ${cy.label} ${cy.dirAName}`);
      L.push(`ANB  ${ucPad(cy.stepDirA.cmpAddr)}; ${cy.label} ${cy.dirAName} Cmp`);
      L.push(`LD   ${ucPad(u.flagManual)}; Manual`);
      L.push(`ANP  ${ucPad(cy.sysManFlag)}; sys_man_${cy.label}`);
      L.push('ORL');
      if (cy.lockDirA) L.push(`ANB  ${ucPad(cy.lockDirA)}; ${u.label}_${cy.label}_Lock_${cy.dirAName}`);
      L.push(`SET  ${ucPad(cy.outDirA)}; Out_${u.label}_${cy.label}_${cy.dirAName}`);
      if (cy.outDirB) {
        L.push('CON');
        L.push(`RES  ${ucPad(cy.outDirB)}; Out_${u.label}_${cy.label}_${cy.dirBName}`);
      }
    }

    // ── dirB block: RES outDirA, SET outDirB ─────────────────────────────
    // stepsForDirB: tất cả steps (origin + station) điều khiển dirB
    if (cy.stepsForDirB.length > 0 && cy.outDirB) {
      L.push(`LD   ${ucPad(u.flagAuto)}; Auto`);

      if (cy.stepsForDirB.length === 1) {
        const s = cy.stepsForDirB[0];
        const sLabel = s.actions.length
          ? (s.actions[0].devLabel || '') + ' ' + ucDirFromSigName(s.actions[0].sigName || '')
          : s.label;
        L.push(`LD   ${ucPad(s.addr)}; ${sLabel}`);
        L.push(`ANB  ${ucPad(s.cmpAddr)}; ${sLabel} Cmp`);
      } else {
        // Nhiều step dirB → ORL block
        // Pattern từ Code gen.txt:
        //   LD @MR100; ANB @MR101; LD @MR304; ANB @MR305; ORL (→ ANL ở cuối)
        cy.stepsForDirB.forEach(function(s, si) {
          const sLabel = s.actions.length
            ? (s.actions[0].devLabel || '') + ' ' + ucDirFromSigName(s.actions[0].sigName || '')
            : s.label;
          L.push(`LD   ${ucPad(s.addr)}; ${sLabel}`);
          L.push(`ANB  ${ucPad(s.cmpAddr)}; ${sLabel} Cmp`);
          if (si > 0) L.push('ORL');
        });
      }
      L.push('ANL');
      L.push(`LD   ${ucPad(u.flagManual)}; Manual`);
      L.push(`ANF  ${ucPad(cy.sysManFlag)}; sys_man_${cy.label}`);
      L.push('ORL');
      if (cy.lockDirB) L.push(`ANB  ${ucPad(cy.lockDirB)}; ${u.label}_${cy.label}_Lock ${cy.dirBName}`);
      if (cy.outDirA) {
        L.push(`RES  ${ucPad(cy.outDirA)}; Out_${u.label}_${cy.label}_${cy.dirAName}`);
        L.push('CON');
      }
      L.push(`SET  ${ucPad(cy.outDirB)}; Out_${u.label}_${cy.label}_${cy.dirBName}`);
    }

    // ── Error timers ──────────────────────────────────────────────────────
    const timeout = cy.errorTimeout || 500;
    if (cy.outDirA && cy.sensorDirA && cy.errFlagDirA) {
      L.push(`LD   ${ucPad(cy.outDirA)}; Out_${u.label}_${cy.label}_${cy.dirAName}`);
      L.push(`ANB  ${ucPad(cy.sensorDirA)}; in_${u.label}_${cy.label}_${cy.dirAName}`);
      L.push(`ANB  ${ucPad(u.flagManual)}; Manual`);
      L.push(`ANB  ${ucPad(u.flagErrStop)}; Operation Error Stop`);
      L.push(`ONDL #${timeout} ${cy.errFlagDirA}   ; Error_${cy.label}_${cy.dirAName}`);
    }
    if (cy.outDirB && cy.sensorDirB && cy.errFlagDirB) {
      L.push(`LD   ${ucPad(cy.outDirB)}; Out_${u.label}_${cy.label}_${cy.dirBName}`);
      L.push(`ANB  ${ucPad(cy.sensorDirB)}; in_${u.label}_${cy.label}_${cy.dirBName}`);
      L.push(`ANB  ${ucPad(u.flagManual)}; Manual`);
      L.push(`ANB  ${ucPad(u.flagErrStop)}; Operation Error Stop`);
      L.push(`ONDL #${timeout} ${cy.errFlagDirB}   ; Error_${cy.label}_${cy.dirBName}`);
    }
  });

  L.push('');
  return L;
}

// ─── Entry point: sinh toàn bộ code IL từ JSON config + canvas diagrams ───────
// cylinderTypes không còn bắt buộc — giữ tham số để tương thích ngược với UI cũ.
function cgGenerateFromUnitConfig(unitConfig, _cylinderTypes, profile) {
  if (!unitConfig) {
    return { code: '; ERROR: unitConfig chưa được load.', stats: 'Error' };
  }

  // v3: kiểm tra schema version để hiển thị đúng trong header
  const schemaVer = unitConfig.unit?.overrides != null
    ? 'v3'
    : (unitConfig.devices != null ? 'v3' : 'v2');

  const ctx = cgUCBuildContext(unitConfig);
  const pr  = profile || PLC_PROFILES['kv-5500'];
  const timestamp = new Date().toLocaleString('vi-VN');
  const unitLabel = (ctx.unit.label || '').padEnd(39);

  const lines = [];

  // File header (v3: thêm schema version + unitIndex)
  const unitIndexStr = (unitConfig.unit?.unitIndex != null)
    ? 'unitIndex=' + unitConfig.unit.unitIndex
    : 'unitIndex=auto';
  lines.push('; ╔══════════════════════════════════════════════════════╗');
  lines.push(`; ║  GRAFCET Studio — Unit Config Engine  (${schemaVer.padEnd(3)})         ║`);
  lines.push(`; ║  Unit    : ${unitLabel}║`);
  lines.push(`; ║  Schema  : ${schemaVer.padEnd(3)}  |  ${unitIndexStr.padEnd(36)}║`);
  lines.push(`; ║  PLC     : ${pr.label.padEnd(42)}║`);
  lines.push(`; ║  Generated: ${timestamp.padEnd(41)}║`);
  lines.push('; ╚══════════════════════════════════════════════════════╝');
  lines.push('');

  // v3: chèn warnings nếu có (thiếu diagram, thiếu vars, thiếu signal address)
  if (ctx.warnings && ctx.warnings.length) {
    lines.push('; ┌─ WARNINGS (' + ctx.warnings.length + ') ─────────────────────────────────────────');
    ctx.warnings.forEach(function(w) {
      lines.push('; │ ' + w);
    });
    lines.push('; └──────────────────────────────────────────────────────');
    lines.push('');
  }

  // v3: chèn IO mapping summary để dễ kiểm tra
  lines.push('; ── IO / FLAGS SUMMARY (v3 auto-resolved) ────────────────');
  lines.push('; flags: origin=' + ctx.unit.flagOrigin + '  auto=' + ctx.unit.flagAuto +
             '  manual=' + ctx.unit.flagManual + '  error=' + ctx.unit.flagError +
             '  homed=' + ctx.unit.flagHomed);
  lines.push('; io:    eStop=' + (ctx.unit.eStop||'?') + '  btnStart=' + (ctx.unit.btnStart||'?') +
             '  btnReset=' + (ctx.unit.btnReset||'?') + '  outHomed=' + (ctx.unit.outHomed||'?'));
  ctx.cylinders.forEach(function(cy) {
    lines.push('; ' + cy.id + ':  ' +
      'outDirA(' + cy.dirAName + ')=' + (cy.outDirA||'?') +
      '  snsA=' + (cy.sensorDirA||'?') +
      '  outDirB(' + cy.dirBName + ')=' + (cy.outDirB||'?') +
      '  snsB=' + (cy.sensorDirB||'?'));
    lines.push('; ' + cy.id + ':  ' +
      'hmiManBtn=' + cy.hmiManBtn +
      '  sysManFlag=' + cy.sysManFlag +
      '  errA=' + cy.errFlagDirA +
      '  errB=' + cy.errFlagDirB);
  });
  lines.push('');

  // 5 sections
  lines.push(...cgUCGenerateError(ctx));
  lines.push(...cgUCGenerateManual(ctx));
  lines.push(...cgUCGenerateOrigin(ctx));
  lines.push(...cgUCGenerateAuto(ctx));
  lines.push(...cgUCGenerateOutput(ctx));

  lines.push('; ── END OF FILE ──────────────────────────────────────────');

  const rawCode = lines.join('\n');
  const totalCy = ctx.cylinders.length;
  const totalFlows = ctx.stationFlows.length;
  const originCount = ctx.originSteps.length;
  const warnCount = (ctx.warnings || []).length;

  return {
    code: cgApplyProfile(rawCode, pr),
    stats: `Unit Config ${schemaVer}: ${ctx.unit.label} · ${totalCy} cylinder(s) · ${originCount} origin step(s) · ${totalFlows} station(s) · ${warnCount ? warnCount + ' warning(s) · ' : ''}${pr.label}`
  };
}
