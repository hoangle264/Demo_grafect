"use strict";

// ═══════════════════════════════════════════════════════════
//  EXCEL-DRIVEN UNIT CONFIGURATION — excel-import.js  (v1.0)
//
//  Pipeline: Excel CSV → project.excelVars + project.unitConfig
//            → Code Engine tự động sinh PLC IL code
//
//  CSV Cylinder Schema (12 cột cố định, không dùng header name):
//    Col 0 : ID          — nhãn thiết bị (VD: CY1)
//    Col 1 : LSH         — địa chỉ sensor extended  (VD: MR1000)
//    Col 2 : LSL         — địa chỉ sensor retracted  (VD: MR1001)
//    Col 3 : LockA       — interlock coil A
//    Col 4 : LockB       — interlock coil B
//    Col 5 : DisSnsLSH   — bypass sensor LSH flag
//    Col 6 : DisSnsLSL   — bypass sensor LSL flag
//    Col 7 : State       — trạng thái cylinder (Bool)
//    Col 8 : ErrorA      — error flag coil A direction
//    Col 9 : ErrorB      — error flag coil B direction
//    Col 10: CoilA       — output coil A (extend)
//    Col 11: CoilB       — output coil B (retract)
//
//  CSV Unit Station Schema (11 cột cố định):
//    Col 0 : UnitName    — nhãn unit (VD: Infeed)
//    Col 1 : UnitIndex   — số thứ tự unit (0, 1, 2, ...)
//    Col 2 : OriginFlag  — @MR địa chỉ origin flag
//    Col 3 : AutoFlag    — @MR địa chỉ auto flag
//    Col 4 : ManualFlag  — @MR địa chỉ manual flag
//    Col 5 : ErrorFlag   — @MR địa chỉ error flag
//    Col 6 : Start       — địa chỉ button start
//    Col 7 : Stop        — địa chỉ button stop
//    Col 8 : Reset       — địa chỉ button reset
//    Col 9 : EStop       — địa chỉ emergency stop
//    Col 10: HomeDone    — địa chỉ output homed
//
//  Quy tắc validate địa chỉ KV:
//    /^@?(MR|LR|DM|CR|AR|WR|HR)\d+$/i — bắt buộc khớp (hoặc để trống)
// ═══════════════════════════════════════════════════════════

/** Regex validate địa chỉ KV (MR, LR, DM, CR, AR, WR, HR) */
const EI_KV_ADDR_RE = /^@?(MR|LR|DM|CR|AR|WR|HR)\d+$/i;

/**
 * Validate một địa chỉ KV.
 * @param {string} addr
 * @returns {boolean}
 */
function eiValidateAddr(addr) {
  if (!addr || !addr.trim()) return true; // trống là hợp lệ (optional)
  return EI_KV_ADDR_RE.test(addr.trim());
}

/**
 * Parse CSV text thành mảng các mảng string (rows × cols).
 * Hỗ trợ quoted fields, dấu phẩy và tab làm delimiter.
 * @param {string} text
 * @returns {string[][]}
 */
function eiParseCSV(text) {
  // Normalize line endings
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const result = [];
  lines.forEach(function(line) {
    if (!line.trim()) return; // bỏ dòng trắng
    const cols = [];
    // Detect delimiter: tab hoặc comma
    const delim = line.includes('\t') ? '\t' : ',';
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQuote = false;
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') { inQuote = true; }
        else if (ch === delim) { cols.push(cur.trim()); cur = ''; }
        else { cur += ch; }
      }
    }
    cols.push(cur.trim());
    result.push(cols);
  });
  return result;
}

/**
 * Parse CSV dạng Cylinder (12 cột cố định).
 * Trả về array kết quả + errors.
 * @param {string[][]} rows
 * @returns {{ vars: object[], errors: string[] }}
 */
function eiParseCylinderCSV(rows) {
  const vars   = [];
  const errors = [];

  rows.forEach(function(cols, rowIdx) {
    // Bỏ qua dòng header (nếu col[0] không phải địa chỉ và col[1] không phải KV addr)
    if (rowIdx === 0 && cols.length > 1 && !EI_KV_ADDR_RE.test(cols[1])) return;
    if (cols.length < 1 || !cols[0].trim()) return;

    const id = cols[0].trim();
    if (!id) return;

    // Map cột → signal id (theo UC_CYLINDER_DEVICE_DEF)
    const signalMap = {
      cyl_lsh:     cols[1]  || '',
      cyl_lsl:     cols[2]  || '',
      cyl_lockA:   cols[3]  || '',
      cyl_lockB:   cols[4]  || '',
      cyl_disSnsH: cols[5]  || '',
      cyl_disSnsL: cols[6]  || '',
      cyl_state:   cols[7]  || '',
      cyl_errA:    cols[8]  || '',
      cyl_errB:    cols[9]  || '',
      cyl_coilA:   cols[10] || '',
      cyl_coilB:   cols[11] || '',
      cyl_hmiMan:  '',       // không có trong CSV — tính theo index
    };

    // Validate từng địa chỉ
    let hasError = false;
    Object.keys(signalMap).forEach(function(sigId) {
      const addr = signalMap[sigId];
      if (addr && !eiValidateAddr(addr)) {
        errors.push('Dòng ' + (rowIdx + 1) + ' [' + id + '.' + sigId + ']: địa chỉ không hợp lệ "' + addr + '"');
        hasError = true;
      }
    });

    if (!hasError) {
      vars.push({
        label:          id,
        format:         'Cylinder',
        address:        '',
        comment:        'Excel import',
        signalAddresses: signalMap,
        _sigExpanded:   false,
        _source:        'excel'
      });
    }
  });

  return { vars: vars, errors: errors };
}

/**
 * Parse CSV dạng Unit Station (11 cột cố định).
 * Trả về array kết quả + errors.
 * @param {string[][]} rows
 * @returns {{ configs: object[], errors: string[] }}
 */
function eiParseUnitCSV(rows) {
  const configs = [];
  const errors  = [];

  rows.forEach(function(cols, rowIdx) {
    // Bỏ qua dòng header (nếu col[1] không phải số)
    if (rowIdx === 0 && isNaN(parseInt(cols[1], 10))) return;
    if (cols.length < 1 || !cols[0].trim()) return;

    const unitName  = cols[0].trim();
    const unitIndex = parseInt(cols[1], 10);
    if (!unitName || isNaN(unitIndex)) return;

    const io = {
      originBaseAddr:  cols[2]  || '',
      autoBaseAddr:    cols[3]  || '',
      flagOrigin:      cols[2]  || '',
      flagAuto:        cols[3]  || '',
      flagManual:      cols[4]  || '',
      flagError:       cols[5]  || '',
      btnStart:        cols[6]  || '',
      hmiStop:         cols[7]  || '',
      btnReset:        cols[8]  || '',
      eStop:           cols[9]  || '',
      outHomed:        cols[10] || '',
    };

    // Validate địa chỉ
    let hasError = false;
    Object.keys(io).forEach(function(key) {
      if (key === 'originBaseAddr' || key === 'autoBaseAddr') return; // cho phép @MR dạng base
      const addr = io[key];
      if (addr && !eiValidateAddr(addr)) {
        errors.push('Dòng ' + (rowIdx + 1) + ' [' + unitName + '.' + key + ']: địa chỉ không hợp lệ "' + addr + '"');
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
          flagOrigin:  io.flagOrigin  || '',
          flagAuto:    io.flagAuto    || '',
          flagManual:  io.flagManual  || '',
          flagError:   io.flagError   || '',
        },
        io: {
          btnStart:  io.btnStart  || '',
          hmiStop:   io.hmiStop   || '',
          btnReset:  io.btnReset  || '',
          eStop:     io.eStop     || '',
          outHomed:  io.outHomed  || '',
        }
      });
    }
  });

  return { configs: configs, errors: errors };
}

/**
 * eiDetectCSVType(rows)
 * Phát hiện tự động loại CSV: 'cylinder' nếu ≥12 cột; 'unit' nếu ≥11 cột.
 * Dùng dòng data đầu tiên (bỏ qua header).
 */
function eiDetectCSVType(rows) {
  const dataRow = rows.find(function(r, i) {
    if (i === 0) return false; // bỏ qua header
    return r.some(function(c) { return c.trim(); });
  }) || rows[0];
  if (!dataRow) return 'unknown';
  if (dataRow.length >= 12) return 'cylinder';
  if (dataRow.length >= 11) return 'unit';
  return 'unknown';
}

/**
 * eiImportFromCSVText(csvText, csvType)
 * Import CSV vào project.excelVars / project.unitConfig.
 * @param {string} csvText  — nội dung file CSV
 * @param {string} csvType  — 'cylinder' | 'unit' | 'auto'
 * @returns {{ ok: boolean, message: string, added: number }}
 */
function eiImportFromCSVText(csvText, csvType) {
  const rows = eiParseCSV(csvText);
  if (!rows.length) {
    return { ok: false, message: 'File CSV trống hoặc không đọc được.', added: 0 };
  }

  const detectedType = csvType === 'auto' ? eiDetectCSVType(rows) : csvType;

  if (detectedType === 'cylinder') {
    // Đảm bảo device type Cylinder đã tồn tại
    if (typeof ucEnsureCylinderDeviceType === 'function') {
      ucEnsureCylinderDeviceType();
    }

    const { vars, errors } = eiParseCylinderCSV(rows);
    if (errors.length) {
      return { ok: false, message: 'Lỗi validate:\n' + errors.join('\n'), added: 0 };
    }
    if (!vars.length) {
      return { ok: false, message: 'Không tìm thấy dòng dữ liệu Cylinder hợp lệ.', added: 0 };
    }

    // Merge vào project.excelVars (override nếu cùng label)
    if (!project.excelVars) project.excelVars = [];
    vars.forEach(function(v) {
      const idx = project.excelVars.findIndex(function(e) { return e.label === v.label; });
      if (idx >= 0) project.excelVars[idx] = v;
      else project.excelVars.push(v);
    });

    if (typeof saveProject === 'function') saveProject();
    return { ok: true, message: 'Import thành công ' + vars.length + ' cylinder.', added: vars.length };

  } else if (detectedType === 'unit') {
    const { configs, errors } = eiParseUnitCSV(rows);
    if (errors.length) {
      return { ok: false, message: 'Lỗi validate:\n' + errors.join('\n'), added: 0 };
    }
    if (!configs.length) {
      return { ok: false, message: 'Không tìm thấy dòng dữ liệu Unit Station hợp lệ.', added: 0 };
    }

    if (!project.unitConfig) project.unitConfig = {};
    configs.forEach(function(cfg) {
      project.unitConfig[cfg.label] = cfg;
    });

    if (typeof saveProject === 'function') saveProject();
    return { ok: true, message: 'Import thành công ' + configs.length + ' unit station.', added: configs.length };

  } else {
    return { ok: false, message: 'Không nhận dạng được loại CSV. Cần ≥12 cột (Cylinder) hoặc ≥11 cột (Unit Station).', added: 0 };
  }
}

// ─── Modal UI: Hiển thị dialog import Excel ───────────────────────────────────
function showExcelImportModal() {
  let el = document.getElementById('modal-excel-import');
  if (el) el.remove();

  el = document.createElement('div');
  el.id = 'modal-excel-import';
  el.className = 'modal-bg show';

  const cylinderCount = (project.excelVars || []).filter(function(v) { return v.format === 'Cylinder'; }).length;
  const unitCount     = Object.keys(project.unitConfig || {}).length;

  el.innerHTML = `
    <div class="modal" style="min-width:520px;max-width:90vw;max-height:88vh;
      display:flex;flex-direction:column;padding:0;overflow:hidden;">

      <!-- Header -->
      <div style="padding:12px 20px;background:var(--s3);border-bottom:1px solid var(--border);
        display:flex;align-items:center;gap:10px;flex-shrink:0;">
        <span style="font-size:14px;">📥</span>
        <span style="font-size:12px;letter-spacing:2px;font-family:'Orbitron',monospace;">EXCEL IMPORT</span>
        <span style="flex:1;"></span>
        <button class="btn" onclick="closeModal('modal-excel-import')" style="padding:2px 10px;">✕</button>
      </div>

      <!-- Status -->
      <div style="padding:10px 20px;background:var(--s2);border-bottom:1px solid var(--border);
        font-size:10px;color:var(--text3);flex-shrink:0;">
        Hiện có:
        <span style="color:var(--cyan);margin-right:12px;">${cylinderCount} cylinder</span>
        <span style="color:var(--cyan);">${unitCount} unit station</span>
        ${cylinderCount > 0 ? '<button class="btn" onclick="eiClearExcelVars()" style="margin-left:12px;font-size:9px;padding:2px 8px;border-color:#f87171;color:#f87171;">🗑 Xoá tất cả</button>' : ''}
      </div>

      <!-- Content -->
      <div style="padding:16px 20px;flex:1;overflow-y:auto;">
        <!-- CSV Type selector -->
        <div style="margin-bottom:14px;">
          <div style="font-size:9px;color:var(--text3);letter-spacing:1px;margin-bottom:6px;">LOẠI CSV</div>
          <div style="display:flex;gap:10px;">
            <label style="font-size:11px;display:flex;align-items:center;gap:5px;cursor:pointer;">
              <input type="radio" name="ei-csv-type" value="auto" checked> Tự động nhận dạng
            </label>
            <label style="font-size:11px;display:flex;align-items:center;gap:5px;cursor:pointer;">
              <input type="radio" name="ei-csv-type" value="cylinder"> Cylinder (12 cột)
            </label>
            <label style="font-size:11px;display:flex;align-items:center;gap:5px;cursor:pointer;">
              <input type="radio" name="ei-csv-type" value="unit"> Unit Station (11 cột)
            </label>
          </div>
        </div>

        <!-- File picker -->
        <div style="margin-bottom:14px;">
          <div style="font-size:9px;color:var(--text3);letter-spacing:1px;margin-bottom:6px;">FILE CSV</div>
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="file" id="ei-file-input" accept=".csv,.txt"
              style="font-size:10px;color:var(--cyan);background:var(--bg);
              border:1px solid var(--border);border-radius:3px;padding:4px 8px;flex:1;"
              onchange="eiPreviewFile(this)">
          </div>
        </div>

        <!-- Preview area -->
        <div id="ei-preview" style="display:none;margin-bottom:14px;">
          <div style="font-size:9px;color:var(--text3);letter-spacing:1px;margin-bottom:6px;">XEM TRƯỚC</div>
          <pre id="ei-preview-text" style="font-size:10px;font-family:'JetBrains Mono',monospace;
            background:var(--bg);border:1px solid var(--border);border-radius:3px;
            padding:8px;max-height:200px;overflow:auto;color:var(--text2);margin:0;"></pre>
        </div>

        <!-- Schema hint -->
        <div style="font-size:9px;color:var(--text3);line-height:1.6;">
          <b style="color:var(--cyan);">Cylinder CSV</b> (12 cột): ID | LSH | LSL | LockA | LockB | DisSnsLSH | DisSnsLSL | State | ErrorA | ErrorB | CoilA | CoilB<br>
          <b style="color:var(--cyan);">Unit Station CSV</b> (11 cột): UnitName | UnitIndex | OriginFlag | AutoFlag | ManualFlag | ErrorFlag | Start | Stop | Reset | EStop | HomeDone
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:10px 20px;border-top:1px solid var(--border);
        display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;background:var(--s3);">
        <span id="ei-stat" style="flex:1;font-size:9px;color:var(--text3);align-self:center;"></span>
        <button class="btn" onclick="closeModal('modal-excel-import')">Đóng</button>
        <button class="btn a" id="ei-import-btn" onclick="eiDoImport()" disabled>↓ Import</button>
      </div>
    </div>`;

  document.body.appendChild(el);
}

// ─── Preview file trước khi import ───────────────────────────────────────────
let _eiPendingText = null;

function eiPreviewFile(inputEl) {
  _eiPendingText = null;
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    _eiPendingText = e.target.result;
    const previewEl = document.getElementById('ei-preview');
    const previewText = document.getElementById('ei-preview-text');
    const importBtn = document.getElementById('ei-import-btn');
    if (previewEl) previewEl.style.display = '';
    if (previewText) {
      // Hiển thị 10 dòng đầu
      const lines = _eiPendingText.split(/\r?\n/).slice(0, 10);
      previewText.textContent = lines.join('\n') + (lines.length >= 10 ? '\n...' : '');
    }
    if (importBtn) importBtn.disabled = false;

    // Auto-detect và hiển thị hint
    const rows = eiParseCSV(_eiPendingText);
    const det = eiDetectCSVType(rows);
    const stat = document.getElementById('ei-stat');
    if (stat) stat.textContent = 'Phát hiện: ' + (det === 'cylinder' ? 'Cylinder CSV' : det === 'unit' ? 'Unit Station CSV' : 'Chưa nhận ra loại') + '  (' + rows.length + ' dòng)';
  };
  reader.readAsText(file);
}

// ─── Thực hiện import ─────────────────────────────────────────────────────────
function eiDoImport() {
  if (!_eiPendingText) return;
  const typeRadio = document.querySelector('#modal-excel-import input[name="ei-csv-type"]:checked');
  const csvType   = typeRadio ? typeRadio.value : 'auto';
  const result    = eiImportFromCSVText(_eiPendingText, csvType);

  const stat = document.getElementById('ei-stat');
  if (stat) stat.textContent = result.message;

  if (result.ok) {
    if (typeof toast === 'function') toast('✓ ' + result.message);
    // Refresh var table nếu đang mở
    if (typeof renderVarTable === 'function') renderVarTable();
    // Re-render tree để cập nhật
    if (typeof renderTree === 'function') renderTree();
    // Reset pending
    _eiPendingText = null;
    const importBtn = document.getElementById('ei-import-btn');
    if (importBtn) importBtn.disabled = true;
    // Cập nhật status bar
    const statusEl = document.querySelector('#modal-excel-import .modal-bg + div, #modal-excel-import [style*="border-bottom"]');
    // Re-open modal để refresh count
    setTimeout(function() { closeModal('modal-excel-import'); showExcelImportModal(); }, 400);
  } else {
    if (typeof toast === 'function') toast('⚠ ' + result.message.split('\n')[0]);
    console.error('[excel-import]', result.message);
  }
}

// ─── Xoá toàn bộ excelVars ───────────────────────────────────────────────────
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
