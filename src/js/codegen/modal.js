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

