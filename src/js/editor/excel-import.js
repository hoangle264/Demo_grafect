"use strict";

// ── Validate địa chỉ KV (MR, LR, DM, CR, AR, WR, HR) ──────────────────────
const EI_KV_ADDR_RE = /^@?(MR|LR|DM|CR|AR|WR|HR)\d+$/i;

function eiValidateAddr(addr) {
  if (!addr || !addr.trim()) return true;
  return EI_KV_ADDR_RE.test(addr.trim());
}

// ── Parse CSV text → string[][] ────────────────────────────────────────────
function eiParseCSV(text) {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const result = [];
  lines.forEach(function (line) {
    if (!line.trim()) return;
    const delim = line.includes('\t') ? '\t' : ',';
    const cols = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQuote = false; }
        else cur += ch;
      } else {
        if (ch === '"') inQuote = true;
        else if (ch === delim) { cols.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
    }
    cols.push(cur.trim());
    result.push(cols);
  });
  return result;
}

// ── Parse CSV → Unit Station configs ──────────────────────────────────────
function eiParseUnitCSV(rows) {
  const configs = [], errors = [];

  function normHeader(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function looksLikeAddr(v) { return EI_KV_ADDR_RE.test(String(v || '').trim()); }

  const firstRow = rows[0] || [];
  const firstRowNorm = firstRow.map(normHeader);
  const hasHeader = firstRowNorm.includes('unitname') || firstRowNorm.includes('unit') || firstRowNorm.includes('label');
  const headerIndexMap = {};
  if (hasHeader) {
    firstRowNorm.forEach(function (name, idx) {
      if (name && headerIndexMap[name] == null) headerIndexMap[name] = idx;
    });
  }

  function getByHeader(cols, names) {
    for (let i = 0; i < names.length; i++) {
      const idx = headerIndexMap[names[i]];
      if (idx != null) return cols[idx] || '';
    }
    return '';
  }

  rows.forEach(function (cols, rowIdx) {
    if (rowIdx === 0 && hasHeader) return;
    if (rowIdx === 0 && !hasHeader && isNaN(parseInt(cols[1], 10)) && !looksLikeAddr(cols[1])) return;
    if (!cols[0] || !cols[0].trim()) return;

    const unitName = (hasHeader ? getByHeader(cols, ['unitname', 'unit', 'label']) : cols[0]).trim();
    if (!unitName) return;

    const unitIndexRaw = hasHeader
      ? getByHeader(cols, ['unitindex', 'index'])
      : (looksLikeAddr(cols[1]) ? '' : cols[1] || '');
    const parsedUnitIndex = parseInt(unitIndexRaw, 10);
    const unitIndex = Number.isNaN(parsedUnitIndex) ? configs.length : parsedUnitIndex;

    const noIndexLayout = !hasHeader && looksLikeAddr(cols[1]) && looksLikeAddr(cols[2]);

    function col(headerNames, legacyIdx) {
      return hasHeader ? getByHeader(cols, headerNames) : (cols[legacyIdx] || '');
    }

    const io = {
      originBaseAddr: col(['originbase', 'originbaseaddr'], noIndexLayout ? 4 : 2),
      autoBaseAddr:   col(['autobase',   'autobaseaddr'],   noIndexLayout ? 5 : 3),
      flagOrigin:     col(['originflag', 'flagorigin'],     noIndexLayout ? 1 : 2),
      flagAuto:       col(['autoflag',   'flagauto'],       noIndexLayout ? 2 : 3),
      flagManual:     col(['manualflag', 'flagmanual'],     noIndexLayout ? 3 : 4),
      flagError:      col(['errorflag',  'flagerror'],      noIndexLayout ? 6 : 5),
      btnStart:       col(['start',      'btnstart'],       noIndexLayout ? 7 : 6),
      hmiStop:        col(['stop',       'hmistop', 'btnstop'], noIndexLayout ? 8 : 7),
      btnReset:       col(['reset',      'btnreset'],       noIndexLayout ? 9 : 8),
      eStop:          col(['estop'],                        noIndexLayout ? 10 : 9),
      outHomed:       col(['homedone',   'outhomed'],       noIndexLayout ? 11 : 10),
    };

    let hasError = false;
    Object.keys(io).forEach(function (key) {
      if (key === 'originBaseAddr' || key === 'autoBaseAddr') return;
      if (io[key] && !eiValidateAddr(io[key])) {
        errors.push('Dòng ' + (rowIdx + 1) + ' [' + unitName + '.' + key + ']: địa chỉ không hợp lệ "' + io[key] + '"');
        hasError = true;
      }
    });

    if (!hasError) {
      configs.push({
        label:          unitName,
        unitIndex:      unitIndex,
        originBaseAddr: io.originBaseAddr || '@MR100',
        autoBaseAddr:   io.autoBaseAddr   || '@MR300',
        flags: {
          flagOrigin: io.flagOrigin,
          flagAuto:   io.flagAuto,
          flagManual: io.flagManual,
          flagError:  io.flagError,
        },
        io: {
          btnStart: io.btnStart,
          hmiStop:  io.hmiStop,
          btnReset: io.btnReset,
          eStop:    io.eStop,
          outHomed: io.outHomed,
        }
      });
    }
  });

  return { configs, errors };
}

// ── Parse CSV → Struct Data instances (bao gồm Cylinder) ──────────────────
function eiParseStructCSV(rows, structTypeName) {
  const structType = (project.devices || []).find(function (d) { return d.name === structTypeName; });
  if (!structType) return { vars: [], errors: ['Không tìm thấy Struct Data "' + structTypeName + '".'] };

  const signals = structType.signals || [];
  if (!signals.length) return { vars: [], errors: ['Struct Data "' + structTypeName + '" chưa có signal.'] };

  const vars = [], errors = [];

  function normHeader(v) { return String(v || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase(); }

  const firstRow = rows[0] || [];
  const hasHeader = firstRow.length > 1 && !EI_KV_ADDR_RE.test(firstRow[1]);
  const headerMap = {};
  if (hasHeader) {
    firstRow.forEach(function (h, idx) {
      const key = normHeader(h);
      if (key && headerMap[key] == null) headerMap[key] = idx;
    });
  }

  rows.forEach(function (cols, rowIdx) {
    if (hasHeader && rowIdx === 0) return;
    if (!cols[0] || !cols[0].trim()) return;

    const id = cols[0].trim();
    const signalMap = {};
    let hasError = false;

    signals.forEach(function (sig, i) {
      const sigId  = sig.id   || ('sig-' + i);
      const colIdx = hasHeader ? headerMap[normHeader(sig.name || sigId)] : (i + 1);
      const addr   = (colIdx != null ? cols[colIdx] : '') || '';
      signalMap[sigId] = addr;
      if (addr && !eiValidateAddr(addr)) {
        errors.push('Dòng ' + (rowIdx + 1) + ' [' + id + '.' + (sig.name || sigId) + ']: địa chỉ không hợp lệ "' + addr + '"');
        hasError = true;
      }
    });

    if (!hasError) {
      vars.push({
        label:           id,
        format:          structTypeName,
        address:         '',
        comment:         'Excel import',
        signalAddresses: signalMap,
        _sigExpanded:    true,
        _source:         'excel',
      });
    }
  });

  return { vars, errors };
}

// ── Entry point ────────────────────────────────────────────────────────────
function eiImportFromCSVText(csvText, csvType, options) {
  const rows = eiParseCSV(csvText);
  if (!rows.length) return { ok: false, message: 'File CSV trống hoặc không đọc được.', added: 0 };

  // ── Unit Station ──
  if (csvType === 'unit') {
    const { configs, errors } = eiParseUnitCSV(rows);
    if (errors.length) return { ok: false, message: 'Lỗi validate:\n' + errors.join('\n'), added: 0 };
    if (!configs.length) return { ok: false, message: 'Không tìm thấy dòng Unit Station hợp lệ.', added: 0 };

    if (!project.unitConfig) project.unitConfig = {};
    configs.forEach(function (cfg) { project.unitConfig[cfg.label] = cfg; });

    if (typeof syncStructDataFromProjectData === 'function') syncStructDataFromProjectData();
    if (typeof saveProject === 'function') saveProject();
    return { ok: true, message: 'Import thành công ' + configs.length + ' unit station.', added: configs.length };
  }

  // ── Struct Data (bao gồm Cylinder) ──
  const selectedStructType = (options && options.structType) || '';
  if (!selectedStructType) return { ok: false, message: 'Vui lòng chọn Struct Data trước khi import.', added: 0 };

  const { vars, errors } = eiParseStructCSV(rows, selectedStructType);
  if (errors.length) return { ok: false, message: 'Lỗi validate:\n' + errors.join('\n'), added: 0 };
  if (!vars.length) return { ok: false, message: 'Không tìm thấy dòng dữ liệu hợp lệ cho "' + selectedStructType + '".', added: 0 };

  if (typeof ensureProjectVariables === 'function') ensureProjectVariables();
  if (!project.excelVars) project.excelVars = [];
  vars.forEach(function (v) {
    if (typeof upsertProjectVariable === 'function') {
      upsertProjectVariable('imported', v);
    } else {
      const idx = project.excelVars.findIndex(function (e) { return e.label === v.label && e.format === v.format; });
      if (idx >= 0) project.excelVars[idx] = v;
      else project.excelVars.push(v);
    }
  });

  if (typeof syncStructDataFromProjectData === 'function') syncStructDataFromProjectData();
  if (typeof saveProject === 'function') saveProject();
  return { ok: true, message: 'Import thành công ' + vars.length + ' instance "' + selectedStructType + '".', added: vars.length };
}

// ── Modal ──────────────────────────────────────────────────────────────────
function showExcelImportModal() {
  const existing = document.getElementById('modal-excel-import');
  if (existing) existing.remove();

  const structTypes  = (project.devices || []).map(function (d) { return d.name; });
  const structOptions = structTypes.length
    ? structTypes.map(function (n) { return '<option value="' + n + '">' + n + '</option>'; }).join('')
    : '<option value="">(Chưa có Struct Data)</option>';

  const unitCount = Object.keys(project.unitConfig || {}).length;
  const varCount  = (project.excelVars || []).length;

  const el = document.createElement('div');
  el.id = 'modal-excel-import';
  el.className = 'modal-bg show';
  el.innerHTML = `
    <div class="modal" style="min-width:500px;max-width:90vw;max-height:88vh;
      display:flex;flex-direction:column;padding:0;overflow:hidden;">

      <div style="padding:12px 20px;background:var(--s3);border-bottom:1px solid var(--border);
        display:flex;align-items:center;gap:10px;flex-shrink:0;">
        <span style="font-size:14px;">📥</span>
        <span style="font-size:12px;letter-spacing:2px;font-family:'Orbitron',monospace;">EXCEL IMPORT</span>
        <span style="flex:1;"></span>
        <button class="btn" onclick="closeModal('modal-excel-import')">✕</button>
      </div>

      <div style="padding:10px 20px;background:var(--s2);border-bottom:1px solid var(--border);
        font-size:10px;color:var(--text3);flex-shrink:0;display:flex;align-items:center;gap:12px;">
        Hiện có:
        <span style="color:var(--cyan);">${varCount} biến</span>
        <span style="color:var(--cyan);">${unitCount} unit station</span>
        ${varCount > 0
          ? '<button class="btn" onclick="eiClearExcelVars()" style="font-size:9px;padding:2px 8px;border-color:#f87171;color:#f87171;">🗑 Xoá tất cả</button>'
          : ''}
      </div>

      <div style="padding:16px 20px;flex:1;overflow-y:auto;">
        <div style="margin-bottom:14px;">
          <div style="font-size:9px;color:var(--text3);letter-spacing:1px;margin-bottom:6px;">LOẠI DỮ LIỆU</div>
          <div style="display:flex;gap:16px;">
            <label style="font-size:10px;color:var(--cyan);display:flex;align-items:center;gap:4px;cursor:pointer;">
              <input type="radio" name="ei-import-type" value="unit" onchange="eiOnImportTypeChange()"> Unit Station
            </label>
            <label style="font-size:10px;color:var(--cyan);display:flex;align-items:center;gap:4px;cursor:pointer;">
              <input type="radio" name="ei-import-type" value="struct" checked onchange="eiOnImportTypeChange()"> Struct Data
            </label>
          </div>
        </div>

        <div id="ei-struct-wrap" style="margin-bottom:14px;">
          <div style="font-size:9px;color:var(--text3);letter-spacing:1px;margin-bottom:6px;">STRUCT DATA TYPE</div>
          <select id="ei-struct-type"
            style="width:100%;font-size:10px;color:var(--cyan);background:var(--bg);
            border:1px solid var(--border);border-radius:3px;padding:4px 8px;">
            ${structOptions}
          </select>
          <div style="margin-top:4px;font-size:9px;color:var(--text3);">
            Col 0 = Label · Col 1..N map theo thứ tự signal của Struct Data đã chọn
          </div>
        </div>

        <div style="margin-bottom:14px;">
          <div style="font-size:9px;color:var(--text3);letter-spacing:1px;margin-bottom:6px;">FILE CSV</div>
          <input type="file" id="ei-file-input" accept=".csv,.txt"
            style="font-size:10px;color:var(--cyan);background:var(--bg);
            border:1px solid var(--border);border-radius:3px;padding:4px 8px;width:100%;box-sizing:border-box;"
            onchange="eiPreviewFile(this)">
        </div>

        <div id="ei-preview" style="display:none;margin-bottom:14px;">
          <div style="font-size:9px;color:var(--text3);letter-spacing:1px;margin-bottom:6px;">XEM TRƯỚC</div>
          <pre id="ei-preview-text" style="font-size:10px;font-family:'JetBrains Mono',monospace;
            background:var(--bg);border:1px solid var(--border);border-radius:3px;
            padding:8px;max-height:180px;overflow:auto;color:var(--text2);margin:0;"></pre>
        </div>

        <div id="ei-schema-hint" style="font-size:9px;color:var(--text3);line-height:1.6;">
          <b style="color:var(--cyan);">Struct Data CSV</b>: Label | Signal1 | Signal2 | ...
        </div>
      </div>

      <div style="padding:10px 20px;border-top:1px solid var(--border);
        display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;background:var(--s3);">
        <span id="ei-stat" style="flex:1;font-size:9px;color:var(--text3);align-self:center;"></span>
        <button class="btn" onclick="closeModal('modal-excel-import')">Đóng</button>
        <button class="btn a" id="ei-import-btn" onclick="eiDoImport()" disabled>↓ Import</button>
      </div>
    </div>`;

  document.body.appendChild(el);
}

// ── Xử lý thay đổi loại import ────────────────────────────────────────────
function eiOnImportTypeChange() {
  const radio = document.querySelector('input[name="ei-import-type"]:checked');
  const type  = radio ? radio.value : 'struct';
  const structWrap = document.getElementById('ei-struct-wrap');
  const schemaHint = document.getElementById('ei-schema-hint');

  if (structWrap) structWrap.style.display = type === 'struct' ? '' : 'none';
  if (schemaHint) {
    schemaHint.innerHTML = type === 'unit'
      ? '<b style="color:var(--cyan);">Unit Station CSV</b>: UnitName · OriginFlag · AutoFlag · ManualFlag · OriginBase · AutoBase · ErrorFlag · Start · Stop · Reset · EStop · HomeDone'
      : '<b style="color:var(--cyan);">Struct Data CSV</b>: Label | Signal1 | Signal2 | ...';
  }

  if (_eiPendingText) {
    const rows = eiParseCSV(_eiPendingText);
    const st   = document.getElementById('ei-struct-type');
    const stat = document.getElementById('ei-stat');
    if (stat) stat.textContent = 'Mode: ' + (type === 'unit' ? 'Unit Station' : 'Struct Data' + (st ? ' (' + st.value + ')' : '')) + '  (' + rows.length + ' dòng)';
  }
}

// ── Preview file ───────────────────────────────────────────────────────────
let _eiPendingText = null;

function eiPreviewFile(inputEl) {
  _eiPendingText = null;
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    _eiPendingText = e.target.result;

    const previewEl  = document.getElementById('ei-preview');
    const previewTxt = document.getElementById('ei-preview-text');
    const importBtn  = document.getElementById('ei-import-btn');
    const stat       = document.getElementById('ei-stat');

    if (previewEl)  previewEl.style.display = '';
    if (importBtn)  importBtn.disabled = false;
    if (previewTxt) {
      const lines = _eiPendingText.split(/\r?\n/).slice(0, 10);
      previewTxt.textContent = lines.join('\n') + (lines.length >= 10 ? '\n...' : '');
    }
    if (stat) {
      const radio  = document.querySelector('input[name="ei-import-type"]:checked');
      const type   = radio ? radio.value : 'struct';
      const st     = document.getElementById('ei-struct-type');
      const rows   = eiParseCSV(_eiPendingText);
      const label  = type === 'unit' ? 'Unit Station' : 'Struct Data' + (st ? ' (' + st.value + ')' : '');
      stat.textContent = 'Mode: ' + label + '  (' + rows.length + ' dòng)';
    }
  };
  reader.readAsText(file);
}

// ── Thực hiện import ───────────────────────────────────────────────────────
function eiDoImport() {
  if (!_eiPendingText) return;

  const radio            = document.querySelector('input[name="ei-import-type"]:checked');
  const csvType          = radio ? radio.value : 'struct';
  const structTypeSel    = document.getElementById('ei-struct-type');
  const selectedStructType = structTypeSel ? structTypeSel.value : '';
  const result           = eiImportFromCSVText(_eiPendingText, csvType, { structType: selectedStructType });

  const stat = document.getElementById('ei-stat');
  if (stat) stat.textContent = result.message;

  if (result.ok) {
    if (typeof toast === 'function') toast('✓ ' + result.message);
    if (typeof renderVarTable === 'function') renderVarTable();
    if (typeof renderTree === 'function') renderTree();
    _eiPendingText = null;
    setTimeout(function () { closeModal('modal-excel-import'); showExcelImportModal(); }, 400);
  } else {
    if (typeof toast === 'function') toast('⚠ ' + result.message.split('\n')[0]);
    console.error('[excel-import]', result.message);
  }
}

// ── Xoá toàn bộ dữ liệu đã import ────────────────────────────────────────
function eiClearExcelVars() {
  if (!confirm('Xoá toàn bộ dữ liệu Excel đã import?\nHành động này không thể hoàn tác.')) return;
  project.excelVars = [];
  project.unitConfig = {};
  if (typeof saveProject === 'function') saveProject();
  if (typeof toast === 'function') toast('✓ Đã xoá dữ liệu Excel import');
  if (typeof renderVarTable === 'function') renderVarTable();
  closeModal('modal-excel-import');
  showExcelImportModal();
}
