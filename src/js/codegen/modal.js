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
        gap:20px;align-items:center;flex-wrap:wrap;flex-shrink:0;background:var(--s2);">

        <!-- Target PLC -->
        <div>
          <div style="font-size:9px;color:var(--text3);letter-spacing:1px;margin-bottom:5px;">TARGET PLC</div>
          <select id="cg-target" onchange="cgUpdatePreview()"
            style="background:var(--bg);border:1px solid var(--border);color:var(--cyan);
            font-family:'JetBrains Mono',monospace;font-size:11px;padding:4px 8px;
            border-radius:3px;outline:none;">
            <option value="unit-config">🟣 Unit Config JSON</option>
            <option value="runtime-plan">🟤 Runtime Plan [debug]</option>
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

        <!-- Unit + Diagram selector (ẩn khi dùng unit-config) -->
        <div id="cg-unit-wrap" style="flex:1;min-width:220px;">
          <div style="font-size:9px;color:var(--text3);letter-spacing:1px;margin-bottom:5px;">UNIT</div>
          <div id="cg-unit-list" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;"></div>
          <div id="cg-unit-diag-section" style="display:none;">
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
      </div>

      <!-- Unit Config JSON Files (collapsible, hiện khi usesUC) -->
      <div id="cg-uc-files-bar" style="display:none;border-top:1px solid var(--border);background:var(--s2);flex-shrink:0;">
        <div style="padding:6px 20px;display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;"
          onclick="cgToggleUCFiles()">
          <span style="font-size:9px;letter-spacing:1px;color:var(--text3);">📁 JSON FILES</span>
          <span id="uc-files-chevron" style="font-size:9px;color:var(--text3);">▶</span>
          <span id="uc-files-summary" style="font-size:9px;color:var(--text3);margin-left:4px;"></span>
          <span style="flex:1;"></span>
          <label style="font-size:9px;color:var(--text3);display:flex;align-items:center;gap:4px;"
            onclick="event.stopPropagation()">
            Address Mode:
            <select id="uc-addr-mode" onchange="cgUpdatePreview()"
              style="background:var(--bg);border:1px solid var(--border);color:var(--cyan);
              font-family:'JetBrains Mono',monospace;font-size:10px;padding:2px 6px;
              border-radius:3px;outline:none;">
              <option value="linear">Linear — MR100, MR102, MR104…</option>
              <option value="block">Block — MR100…MR115, MR200…MR215…</option>
            </select>
          </label>
        </div>
        <div id="cg-uc-files-body" style="display:none;padding:8px 20px 10px 20px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <label style="font-size:9px;color:var(--text3);width:110px;flex-shrink:0;">Unit Config: <span style="color:var(--cyan)">*</span></label>
              <input type="file" id="uc-unit-file" accept=".json"
                style="font-size:10px;color:var(--cyan);background:var(--bg);
                border:1px solid var(--border);border-radius:3px;padding:2px 6px;flex:1;min-width:0;"
                onchange="cgUCLoadFile('uc-unit-file', function(d){ UC_UNIT_CONFIG=d; cgUCUpdateStatus(); cgUCBuildUnitSelector(); cgUpdatePreview(); })">
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <label style="font-size:9px;color:var(--text3);width:110px;flex-shrink:0;">Cylinder Types: <span style="font-size:8px;">(optional)</span></label>
              <input type="file" id="uc-cyl-file" accept=".json"
                style="font-size:10px;color:var(--cyan);background:var(--bg);
                border:1px solid var(--border);border-radius:3px;padding:2px 6px;flex:1;min-width:0;"
                onchange="cgUCLoadFile('uc-cyl-file', function(d){ UC_CYLINDER_TYPES=d; cgUCUpdateStatus(); cgUpdatePreview(); })">
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <label style="font-size:9px;color:var(--text3);width:110px;flex-shrink:0;">Device Library: <span style="font-size:8px;">(optional)</span></label>
              <input type="file" id="uc-devlib-file" accept=".json"
                style="font-size:10px;color:var(--cyan);background:var(--bg);
                border:1px solid var(--border);border-radius:3px;padding:2px 6px;flex:1;min-width:0;"
                onchange="cgUCLoadFile('uc-devlib-file', function(d){ cgLoadDeviceLibrary(d); cgUCUpdateStatus(); cgUpdatePreview(); })">
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <label style="font-size:9px;color:var(--text3);width:110px;flex-shrink:0;">Runtime Metadata: <span style="font-size:8px;">(optional)</span></label>
              <input type="file" id="uc-runtime-meta-file" accept=".json"
                style="font-size:10px;color:var(--cyan);background:var(--bg);
                border:1px solid var(--border);border-radius:3px;padding:2px 6px;flex:1;min-width:0;"
                onchange="cgUCLoadFile('uc-runtime-meta-file', function(d){ UC_RUNTIME_DEVICE_META=d; cgUCUpdateStatus(); cgUpdatePreview(); })">
            </div>
          </div>
          <!-- Unit selector từ project canvas -->
          <div id="uc-unit-selector" style="display:none;margin-top:8px;">
            <div style="font-size:9px;color:var(--text3);margin-bottom:4px;">CHỌN UNIT TRONG PROJECT</div>
            <div id="uc-unit-radio-list" style="display:flex;flex-wrap:wrap;gap:5px;"></div>
          </div>
          <div id="uc-status" style="font-size:9px;color:var(--text3);margin-top:6px;"></div>
        </div>
      </div>

      <!-- Template Manager (collapsible) -->
      <div style="border-top:1px solid var(--border);background:var(--s2);flex-shrink:0;">
        <div style="padding:6px 20px;display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;"
          onclick="cgToggleTemplateManager()">
          <span style="font-size:9px;letter-spacing:1px;color:var(--text3);">⚙ TEMPLATE MANAGER</span>
          <span id="tpl-manager-chevron" style="font-size:9px;color:var(--text3);">▶</span>
          <span style="flex:1;"></span>
          <label style="font-size:9px;color:var(--cyan);cursor:pointer;"
            onclick="event.stopPropagation()">
            + Nạp .hbs
            <input type="file" multiple accept=".hbs" style="display:none"
              onchange="tmHandleFileUpload(this.files); this.value=''">
          </label>
        </div>
        <div id="tpl-manager-body" style="display:none;padding:0 20px 10px 20px;">
          <div id="tpl-manager-list" style="margin-top:4px;"></div>
          <div style="margin-top:6px;font-size:9px;color:var(--text3);">
            Hỗ trợ Unit Config: <code style="color:var(--cyan)">error.hbs</code>,
            <code style="color:var(--cyan)">manual.hbs</code>,
            <code style="color:var(--cyan)">origin.hbs</code>,
            <code style="color:var(--cyan)">auto.hbs</code>,
            <code style="color:var(--cyan)">main-output.hbs</code>,
            <code style="color:var(--cyan)">output.hbs</code>,
            <code style="color:var(--cyan)">step-body.hbs</code>,
            <code style="color:var(--cyan)">cylinder.hbs</code>,
            <code style="color:var(--cyan)">servo.hbs</code>,
            <code style="color:var(--cyan)">motor.hbs</code>.
            <br>Legacy vẫn hỗ trợ: <code style="color:var(--cyan)">kv_main.hbs</code>,
            <code style="color:var(--cyan)">kv_step.hbs</code>,
            <code style="color:var(--cyan)">st_main.hbs</code>.
            <br>Ghi chú: upload theo đúng tên file, không cần giữ path thư mục như <code style="color:var(--cyan)">devices/...</code>.
            <br>Ghi chú: <code style="color:var(--cyan)">kv_step.hbs</code> dùng cú pháp
            <code>${"$"}{prevStepDone}</code>/<code>${"$"}{stepExe}</code>/<code>${"$"}{stepDone}</code>.
            Phân tách block activation và feedback bằng dòng <code>;;;</code> (3 dấu chấm phẩy).
          </div>
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
  cgBuildUnitList();
  cgUCBuildUnitSelector();
  tmRenderManagerList();
  cgUpdatePreview();
}

// ─── Build unit selector cho Unit Config mode ─────────────────────────────────
function cgUCBuildUnitSelector() {
  const wrap    = document.getElementById('uc-unit-radio-list');
  const section = document.getElementById('uc-unit-selector');
  if (!wrap) return;
  wrap.innerHTML = '';

  const units    = (project && project.units) || [];
  const allDiags = (project && project.diagrams) || [];
  const hasOrphans = allDiags.some(d => !d.unitId);

  const items = [];
  units.forEach(u => {
    const count = allDiags.filter(d => d.unitId === u.id).length;
    items.push({ id: u.id, label: u.name || u.id, count });
  });
  if (hasOrphans) {
    items.push({ id: '__none__', label: '(No unit)', count: allDiags.filter(d => !d.unitId).length });
  }

  if (!items.length) {
    // Fallback: lấy từ project.unitConfig khi project.units chưa có
    const unitCfg = (typeof project !== 'undefined' && project.unitConfig) || {};
    Object.keys(unitCfg).forEach(function(key) {
      items.push({ id: key, label: key, count: 0 });
    });
  }

  if (!items.length) {
    if (section) section.style.display = 'none';
    return;
  }

  items.forEach((item, i) => {
    const lbl = document.createElement('label');
    lbl.className = 'cg-radio-lbl';
    lbl.innerHTML = `<input type="radio" name="uc-unit-radio" value="${item.id}"
      onchange="cgUpdatePreview()">${esc2(item.label)}
      <span style="color:var(--text3);font-size:8px;margin-left:2px;">(${item.count})</span>`;
    wrap.appendChild(lbl);
    if (i === 0) {
      lbl.querySelector('input').checked = true;
    }
  });

  if (section) section.style.display = '';
}

// ─── Lấy unitId đang chọn trong UC unit selector ─────────────────────────────
function cgUCGetSelectedUnitId() {
  const radio = document.querySelector('#uc-unit-radio-list input[name="uc-unit-radio"]:checked');
  return radio ? radio.value : null;
}

// ─── Build unit radio list ────────────────────────────────────────────────────
function cgBuildUnitList() {
  const wrap = document.getElementById('cg-unit-list');
  if (!wrap) return;
  wrap.innerHTML = '';

  const units = project.units || [];
  const allDiags = project.diagrams || [];
  const hasOrphans = allDiags.some(d => !d.unitId);

  if (!units.length && !hasOrphans) {
    wrap.innerHTML = '<span style="font-size:10px;color:var(--text3)">No units found</span>';
    return;
  }

  let firstId = null;

  units.forEach((u, i) => {
    const count = allDiags.filter(d => d.unitId === u.id).length;
    const lbl = document.createElement('label');
    lbl.className = 'cg-radio-lbl';
    lbl.innerHTML = `<input type="radio" name="cg-unit-radio" value="${u.id}"
      onchange="cgOnUnitSelect('${u.id}')">${esc2(u.name || u.id)}
      <span style="color:var(--text3);font-size:8px;margin-left:2px;">(${count})</span>`;
    wrap.appendChild(lbl);
    if (i === 0) firstId = u.id;
  });

  if (hasOrphans) {
    const count = allDiags.filter(d => !d.unitId).length;
    const lbl = document.createElement('label');
    lbl.className = 'cg-radio-lbl';
    lbl.innerHTML = `<input type="radio" name="cg-unit-radio" value="__none__"
      onchange="cgOnUnitSelect('__none__')">(No unit)
      <span style="color:var(--text3);font-size:8px;margin-left:2px;">(${count})</span>`;
    wrap.appendChild(lbl);
    if (!firstId) firstId = '__none__';
  }

  // Pre-select first unit and render its diagrams
  if (firstId) {
    const radio = wrap.querySelector(`input[value="${firstId}"]`);
    if (radio) radio.checked = true;
    cgBuildDiagForUnit(firstId);
  }
}

// ─── Called when user selects a unit radio button ────────────────────────────
function cgOnUnitSelect(unitId) {
  cgBuildDiagForUnit(unitId);
  cgUpdatePreview();
}

// ─── Build diagram checkboxes for the selected unit ──────────────────────────
function cgBuildDiagForUnit(unitId) {
  const listWrap = document.getElementById('cg-diag-list');
  const section  = document.getElementById('cg-unit-diag-section');
  if (!listWrap) return;
  listWrap.innerHTML = '';

  const diags = (project.diagrams || []).filter(d =>
    unitId === '__none__' ? !d.unitId : d.unitId === unitId
  );

  if (section) section.style.display = diags.length ? '' : 'none';

  diags.forEach(d => {
    const modeName = d.mode || 'Auto';
    const lbl = document.createElement('label');
    lbl.className = 'cg-diag-chip';
    lbl.dataset.diagId = d.id;
    lbl.innerHTML = `<input type="checkbox" value="${d.id}" checked
      onchange="cgUpdatePreview()" style="margin-right:4px;">
      <span>${esc2(d.name || d.id)}</span>
      <span style="color:var(--text3);font-size:8px;margin-left:2px;">[${modeName}]</span>`;
    listWrap.appendChild(lbl);
  });
}

function cgSelectAll(val) {
  document.querySelectorAll('#cg-diag-list input[type=checkbox]')
    .forEach(c => { c.checked = val; });
  cgUpdatePreview();
}

function cgUCGetTemplateHealth() {
  if (typeof tmGetUnitConfigTemplateHealth !== 'function') {
    return { valid: true, errors: [], entries: [] };
  }
  return tmGetUnitConfigTemplateHealth(cgUCGetSelectedUnitId());
}

function cgUCFormatTemplateHealth(health) {
  const lines = ['; ⚠ Template library is blocking generation.'];
  (health.errors || []).forEach(function(message) {
    lines.push('; - ' + message);
  });
  if (!health.errors || !health.errors.length) {
    lines.push('; - Unknown template validation error.');
  }
  lines.push('; Kiểm tra Template Manager để sửa hoặc reset template lỗi.');
  return lines.join('\n');
}

function cgUCBlockInvalidTemplates(pre, stat, health) {
  if (pre) pre.textContent = cgUCFormatTemplateHealth(health);
  if (stat) stat.textContent = 'Template Manager blocked generation';
  if (typeof tmRenderManagerList === 'function') tmRenderManagerList();
}

function cgUCEnsureTemplateHealth(actionLabel) {
  const health = cgUCGetTemplateHealth();
  if (health.valid) return health;
  toast('⚠ Không thể ' + actionLabel + ': template library đang lỗi.');
  if (typeof tmRenderManagerList === 'function') tmRenderManagerList();
  return null;
}

function cgUCGetEffectiveConfig(selectedUnitId) {
  if (UC_UNIT_CONFIG) return UC_UNIT_CONFIG;
  const hasUnitConfig = (typeof project !== 'undefined' && project.unitConfig && Object.keys(project.unitConfig).length > 0);
  if (!hasUnitConfig || typeof ucBuildSyntheticConfig !== 'function') return null;
  return ucBuildSyntheticConfig(selectedUnitId);
}

// ─── Live preview ─────────────────────────────────────────────────────────────
function cgUpdatePreview() {
  const target = document.getElementById('cg-target')?.value || 'kv-5500';
  const isUC = (target === 'unit-config');
  const usesUC = (target === 'unit-config' || target === 'runtime-plan');

  // Show/hide panels
  const baseMRWrap  = document.getElementById('cg-base-mr-wrap');
  const ucFilesBar  = document.getElementById('cg-uc-files-bar');
  const unitWrap    = document.getElementById('cg-unit-wrap');
  if (baseMRWrap) baseMRWrap.style.display = isUC ? 'none' : '';
  if (ucFilesBar) {
    const wasHidden = ucFilesBar.style.display === 'none';
    ucFilesBar.style.display = usesUC ? '' : 'none';
    // Auto-mở khi lần đầu hiện và chưa có file nào được load
    if (wasHidden && usesUC && !UC_UNIT_CONFIG) {
      const body    = document.getElementById('cg-uc-files-body');
      const chevron = document.getElementById('uc-files-chevron');
      if (body)    body.style.display    = '';
      if (chevron) chevron.textContent   = '▼';
    }
  }
  if (unitWrap)   unitWrap.style.display   = isUC ? 'none' : '';

  const pre  = document.getElementById('cg-preview');
  const stat = document.getElementById('cg-stat');
  if (!pre) return;

  // ── Unit Config JSON engine ───────────────────────────────────────────────
  if (isUC) {
    const selectedUnitId = cgUCGetSelectedUnitId();
    const effectiveConfig = cgUCGetEffectiveConfig(selectedUnitId);

    if (!effectiveConfig) {
      pre.textContent = '; Vui lòng load Unit Config JSON (infeed-unit.json)\n; hoặc import đủ dữ liệu Unit CSV + thiết bị để tạo config.';
      if (stat) stat.textContent = 'Unit Config mode — thiếu cấu hình Unit';
      return;
    }
    const health = cgUCGetTemplateHealth();
    if (!health.valid) {
      cgUCBlockInvalidTemplates(pre, stat, health);
      return;
    }
    const profile  = PLC_PROFILES['kv-5500'];
    const addrMode = document.getElementById('uc-addr-mode')?.value || 'linear';
    try {
      const result  = cgGenerateFromUnitConfig(effectiveConfig, null, profile, selectedUnitId, {
        strictTemplates: true,
        addressMode: addrMode,
        requireUnitBindings: true
      });
      pre.textContent = result.code;
      if (stat) stat.textContent = result.stats;
      // Syntax highlight
      cgUCHighlight(pre, profile);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      pre.textContent = '; ⚠ Lỗi khi sinh mã: ' + msg + '\n; Kiểm tra template hoặc dữ liệu unit config.';
      if (stat) stat.textContent = 'Lỗi sinh mã';
      console.error('[modal] cgGenerateFromUnitConfig error:', e);
    }
    return;
  }

  // ── Runtime Plan debug preview ───────────────────────────────────────────
  if (target === 'runtime-plan') {
    const baseMR = parseInt(document.getElementById('cg-base-mr')?.value || '100', 10);
    const selected = Array.from(
      document.querySelectorAll('#cg-diag-list input[type=checkbox]:checked')
    ).map(c => c.value);

    if (!selected.length) {
      pre.textContent = '{\n  "error": "No diagrams selected."\n}';
      if (stat) stat.textContent = '';
      return;
    }

    try {
      const result = cgBuildRuntimeDebugPreview(selected, {
        baseMR,
        unitConfig: UC_UNIT_CONFIG,
        runtimeTypeConfig: UC_RUNTIME_DEVICE_META || UC_CYLINDER_TYPES
      });
      pre.textContent = result.code;
      if (stat) stat.textContent = result.stats;
    } catch (e) {
      pre.textContent = JSON.stringify({
        error: e && e.message ? e.message : String(e)
      }, null, 2);
      if (stat) stat.textContent = 'Runtime plan debug failed';
      console.error('[modal] cgBuildRuntimeDebugPreview error:', e);
    }
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
  const selectedUnitId = typeof cgUCGetSelectedUnitId === 'function' ? cgUCGetSelectedUnitId() : null;
  const effectiveConfig = cgUCGetEffectiveConfig(selectedUnitId);
  if (effectiveConfig) {
    const cfg = effectiveConfig;
    const label = cfg.unit?.label || 'loaded';
    // v3: devices[] / v2: cylinders[]
    const devCount = Array.isArray(cfg.devices)
      ? cfg.devices.length
      : (cfg.cylinders?.length || 0);
    const schemaVer = (cfg.unit?.overrides != null || cfg.devices != null) ? 'v3' : 'v2';
    const idxStr = cfg.unit?.unitIndex != null ? ' idx=' + cfg.unit.unitIndex : '';
    const sourceLabel = UC_UNIT_CONFIG ? 'Unit Config' : 'Unit CSV';
    parts.push(`✓ ${sourceLabel} [${schemaVer}]: ${label}${idxStr}  (${devCount} device(s))`);
  }
  if (UC_CYLINDER_TYPES) {
    parts.push('Cylinder Types: ' + Object.keys(UC_CYLINDER_TYPES).filter(k => !k.startsWith('_')).length + ' types (optional)');
  }
  if (UC_RUNTIME_DEVICE_META) {
    parts.push('Runtime Metadata: ' + Object.keys(UC_RUNTIME_DEVICE_META).filter(k => !k.startsWith('_')).length + ' type(s) loaded');
  }
  // v3: hiển thị trạng thái Device Library
  const libKeys = Object.keys(DEVICE_LIBRARY || {}).filter(k => !k.startsWith('_'));
  if (libKeys.length) {
    parts.push(`Device Library: ${libKeys.length} type(s) loaded`);
  }
  el.textContent = parts.length ? parts.join('  |  ') : 'Load Unit Config JSON hoặc import Unit CSV để bắt đầu';
  el.style.color = effectiveConfig ? 'var(--cyan)' : 'var(--text3)';

  // Cập nhật summary trên header của collapsible bar
  const summary = document.getElementById('uc-files-summary');
  if (summary) {
    if (effectiveConfig) {
      const label = effectiveConfig.unit?.label || 'loaded';
      const extras = [UC_CYLINDER_TYPES ? 'Cyl' : null,
                      Object.keys(DEVICE_LIBRARY || {}).filter(k => !k.startsWith('_')).length ? 'DevLib' : null,
                      UC_RUNTIME_DEVICE_META ? 'Meta' : null].filter(Boolean);
      summary.textContent = '✓ ' + label + (UC_UNIT_CONFIG ? '' : ' (CSV)') + (extras.length ? '  +' + extras.join(', ') : '');
      summary.style.color = 'var(--cyan)';
    } else {
      summary.textContent = 'Chưa load file';
      summary.style.color = 'var(--text3)';
    }
  }
}

// ─── Download / Copy ──────────────────────────────────────────────────────────
function cgDownloadCode() {
  const target = document.getElementById('cg-target')?.value || 'kv-5500';

  // ── Unit Config engine ────────────────────────────────────────────────────
  if (target === 'unit-config') {
    const selectedUnitId = cgUCGetSelectedUnitId();
    const effectiveConfig = cgUCGetEffectiveConfig(selectedUnitId);
    if (!effectiveConfig) {
      toast('⚠ Load Unit Config JSON hoặc import Unit CSV trước');
      return;
    }
    if (!cgUCEnsureTemplateHealth('download code')) return;
    const profile  = PLC_PROFILES['kv-5500'];
    const addrMode = document.getElementById('uc-addr-mode')?.value || 'linear';
    const result  = cgGenerateFromUnitConfig(effectiveConfig, null, profile, selectedUnitId, {
      strictTemplates: true,
      addressMode: addrMode,
      requireUnitBindings: true
    });
    const label   = (effectiveConfig.unit?.label || 'unit').replace(/\s+/g, '_');
    const blob = new Blob([result.code], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = label + '_code.mnm';
    a.click();
    toast('✓ Downloaded ' + label + '_code.mnm');
    return;
  }

  if (target === 'runtime-plan') {
    const baseMR = parseInt(document.getElementById('cg-base-mr')?.value || '100', 10);
    const selected = Array.from(
      document.querySelectorAll('#cg-diag-list input[type=checkbox]:checked')
    ).map(c => c.value);
    if (!selected.length) { toast('⚠ No diagrams selected'); return; }

    const result = cgBuildRuntimeDebugPreview(selected, {
      baseMR,
      unitConfig: UC_UNIT_CONFIG,
      runtimeTypeConfig: UC_RUNTIME_DEVICE_META || UC_CYLINDER_TYPES
    });
    const safe = (project.name || 'grafcet').replace(/\s+/g, '_');
    const blob = new Blob([result.code], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = safe + '_runtime_plan.json';
    a.click();
    toast('✓ Downloaded ' + safe + '_runtime_plan.json');
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
  const target = document.getElementById('cg-target')?.value || 'kv-5500';
  if (target === 'unit-config' && !cgUCEnsureTemplateHealth('copy code')) {
    return;
  }
  const pre = document.getElementById('cg-preview');
  if (!pre) return;
  navigator.clipboard.writeText(pre.textContent).then(() => toast('✓ Copied to clipboard'));
}

// ─── JSON Files panel toggle ─────────────────────────────────────────────────
function cgToggleUCFiles() {
  const body    = document.getElementById('cg-uc-files-body');
  const chevron = document.getElementById('uc-files-chevron');
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display    = open ? 'none' : '';
  if (chevron) chevron.textContent = open ? '▶' : '▼';
}

// ─── Template Manager toggle ──────────────────────────────────────────────────
function cgToggleTemplateManager() {
  const body = document.getElementById('tpl-manager-body');
  const chevron = document.getElementById('tpl-manager-chevron');
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : '';
  if (chevron) chevron.textContent = open ? '▶' : '▼';
  if (!open) tmRenderManagerList();
}

