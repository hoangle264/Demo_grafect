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
//  CSV Unit Station Schema:
//    - Ưu tiên đọc theo header name nếu file có dòng tiêu đề.
//    - Hỗ trợ các cột quen thuộc: UnitName, UnitIndex, OriginBase, AutoBase,
//      OriginFlag, AutoFlag, ManualFlag, ErrorFlag, Start, Stop, Reset,
//      EStop, HomeDone.
//    - Nếu không có header, vẫn fallback về schema cũ theo vị trí cột.
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

  function getCylinderCsvAddrBySignalName(name, cols) {
    const key = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key === 'lsh') return cols[1] || '';
    if (key === 'lsl') return cols[2] || '';
    if (key === 'locka') return cols[3] || '';
    if (key === 'lockb') return cols[4] || '';
    if (key === 'dissnslsh' || key === 'dissnsh') return cols[5] || '';
    if (key === 'dissnslsl' || key === 'dissnsl') return cols[6] || '';
    if (key === 'state') return cols[7] || '';
    if (key === 'errora' || key === 'erra') return cols[8] || '';
    if (key === 'errorb' || key === 'errb') return cols[9] || '';
    if (key === 'coila') return cols[10] || '';
    if (key === 'coilb') return cols[11] || '';
    if (key === 'hmimanbtn' || key === 'hmiman') return '';
    return '';
  }

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

    // Nếu Struct Data "Cylinder" đang dùng signal IDs khác canonical cyl_*
    // thì map thêm theo name để các cột hiển thị/đồng bộ đúng trong Global Vars.
    const cylinderType = (project.devices || []).find(function(d) { return d && d.name === 'Cylinder'; });
    if (cylinderType && Array.isArray(cylinderType.signals)) {
      cylinderType.signals.forEach(function(sig) {
        const byNameAddr = getCylinderCsvAddrBySignalName(sig && sig.name, cols);
        if (!sig || !sig.id) return;
        if (byNameAddr) signalMap[sig.id] = byNameAddr;
      });
    }

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
        _sigExpanded:   true,
        _source:        'excel'
      });
    }
  });

  return { vars: vars, errors: errors };
}

/**
 * Parse CSV dạng Unit Station.
 * Ưu tiên map theo header name nếu có, fallback về các layout cũ theo vị trí cột.
 * Trả về array kết quả + errors.
 * @param {string[][]} rows
 * @returns {{ configs: object[], errors: string[] }}
 */
function eiParseUnitCSV(rows) {
  const configs = [];
  const errors  = [];

  function normHeader(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  const firstRow = rows[0] || [];
  const firstRowNorm = firstRow.map(normHeader);
  const hasHeader = firstRowNorm.includes('unitname') || firstRowNorm.includes('unit') || firstRowNorm.includes('label');
  const headerIndexMap = {};
  if (hasHeader) {
    firstRowNorm.forEach(function(name, idx) {
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

  function looksLikeAddr(value) {
    return EI_KV_ADDR_RE.test(String(value || '').trim());
  }

  rows.forEach(function(cols, rowIdx) {
    if (rowIdx === 0 && hasHeader) return;
    // Bỏ qua dòng header legacy (nếu col[1] không phải số và có tên cột)
    if (rowIdx === 0 && !hasHeader && isNaN(parseInt(cols[1], 10)) && !looksLikeAddr(cols[1])) return;
    if (cols.length < 1 || !cols[0].trim()) return;

    const unitName = (hasHeader
      ? getByHeader(cols, ['unitname', 'unit', 'label'])
      : (cols[0] || '')).trim();
    if (!unitName) return;

    const unitIndexRaw = hasHeader
      ? getByHeader(cols, ['unitindex', 'index'])
      : (looksLikeAddr(cols[1]) ? '' : (cols[1] || ''));
    const parsedUnitIndex = parseInt(unitIndexRaw, 10);
    const unitIndex = Number.isNaN(parsedUnitIndex) ? configs.length : parsedUnitIndex;

    const hasLegacyNoIndexLayout = !hasHeader && looksLikeAddr(cols[1]) && looksLikeAddr(cols[2]);

    const originBaseAddr = hasHeader
      ? getByHeader(cols, ['originbase', 'originbaseaddr'])
      : (hasLegacyNoIndexLayout ? (cols[4] || cols[1] || '') : (cols[2] || ''));
    const autoBaseAddr = hasHeader
      ? getByHeader(cols, ['autobase', 'autobaseaddr'])
      : (hasLegacyNoIndexLayout ? (cols[5] || cols[2] || '') : (cols[3] || ''));
    const flagOrigin = hasHeader
      ? getByHeader(cols, ['originflag', 'flagorigin'])
      : (hasLegacyNoIndexLayout ? (cols[1] || '') : (cols[2] || ''));
    const flagAuto = hasHeader
      ? getByHeader(cols, ['autoflag', 'flagauto'])
      : (hasLegacyNoIndexLayout ? (cols[2] || '') : (cols[3] || ''));
    const flagManual = hasHeader
      ? getByHeader(cols, ['manualflag', 'flagmanual'])
      : (hasLegacyNoIndexLayout ? (cols[3] || '') : (cols[4] || ''));
    const flagError = hasHeader
      ? getByHeader(cols, ['errorflag', 'flagerror'])
      : (hasLegacyNoIndexLayout ? (cols[6] || '') : (cols[5] || ''));
    const btnStart = hasHeader
      ? getByHeader(cols, ['start', 'btnstart'])
      : (hasLegacyNoIndexLayout ? (cols[7] || '') : (cols[6] || ''));
    const hmiStop = hasHeader
      ? getByHeader(cols, ['stop', 'hmistop', 'btnstop'])
      : (hasLegacyNoIndexLayout ? (cols[8] || '') : (cols[7] || ''));
    const btnReset = hasHeader
      ? getByHeader(cols, ['reset', 'btnreset'])
      : (hasLegacyNoIndexLayout ? (cols[9] || '') : (cols[8] || ''));
    const eStop = hasHeader
      ? getByHeader(cols, ['estop'])
      : (hasLegacyNoIndexLayout ? (cols[10] || '') : (cols[9] || ''));
    const outHomed = hasHeader
      ? getByHeader(cols, ['homedone', 'outhomed'])
      : (hasLegacyNoIndexLayout ? (cols[11] || '') : (cols[10] || ''));

    const io = {
      originBaseAddr:  originBaseAddr || '',
      autoBaseAddr:    autoBaseAddr   || '',
      flagOrigin:      flagOrigin     || '',
      flagAuto:        flagAuto       || '',
      flagManual:      flagManual     || '',
      flagError:       flagError      || '',
      btnStart:        btnStart       || '',
      hmiStop:         hmiStop        || '',
      btnReset:        btnReset       || '',
      eStop:           eStop          || '',
      outHomed:        outHomed       || '',
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
 * Parse CSV theo Struct Data đã chọn.
 * Col 0 = label instance, Col 1..N = address theo thứ tự signals trong struct.
 * @param {string[][]} rows
 * @param {string} structTypeName
 * @returns {{ vars: object[], errors: string[] }}
 */
function eiParseStructCSV(rows, structTypeName) {
  const vars = [];
  const errors = [];
  const structType = (project.devices || []).find(function(d) { return d.name === structTypeName; });
  const signals = (structType && structType.signals) || [];

  if (!structType) {
    return { vars: [], errors: ['Không tìm thấy Struct Data "' + structTypeName + '".'] };
  }
  if (!signals.length) {
    return { vars: [], errors: ['Struct Data "' + structTypeName + '" chưa có signal để map CSV.'] };
  }

  rows.forEach(function(cols, rowIdx) {
    if (rowIdx === 0 && cols.length > 1 && !EI_KV_ADDR_RE.test(cols[1])) return;
    if (cols.length < 1 || !cols[0].trim()) return;

    const id = cols[0].trim();
    if (!id) return;

    const signalMap = {};
    let hasError = false;

    signals.forEach(function(sig, i) {
      const sigId = sig.id || ('sig-' + i);
      const addr = cols[i + 1] || '';
      signalMap[sigId] = addr;
      if (addr && !eiValidateAddr(addr)) {
        errors.push('Dòng ' + (rowIdx + 1) + ' [' + id + '.' + sigId + ']: địa chỉ không hợp lệ "' + addr + '"');
        hasError = true;
      }
    });

    if (!hasError) {
      vars.push({
        label: id,
        format: structTypeName,
        address: '',
        comment: 'Excel import',
        signalAddresses: signalMap,
        _sigExpanded: true,
        _source: 'excel'
      });
    }
  });

  return { vars: vars, errors: errors };
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
function eiImportFromCSVText(csvText, csvType, options) {
  const rows = eiParseCSV(csvText);
  if (!rows.length) {
    return { ok: false, message: 'File CSV trống hoặc không đọc được.', added: 0 };
  }

  const selectedStructType = (options && options.structType) || '';
  const detectedType = csvType || 'struct';

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

    if (typeof syncStructDataFromProjectData === 'function') {
      syncStructDataFromProjectData();
    }
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

    if (typeof syncStructDataFromProjectData === 'function') {
      syncStructDataFromProjectData();
    }
    if (typeof saveProject === 'function') saveProject();
    return { ok: true, message: 'Import thành công ' + configs.length + ' unit station.', added: configs.length };

  } else if (detectedType === 'struct') {
    if (!selectedStructType) {
      return { ok: false, message: 'Vui lòng chọn Struct Data trước khi import.', added: 0 };
    }
    const parsed = eiParseStructCSV(rows, selectedStructType);
    const vars = parsed.vars;
    const errors = parsed.errors;

    if (errors.length) {
      return { ok: false, message: 'Lỗi validate:\n' + errors.join('\n'), added: 0 };
    }
    if (!vars.length) {
      return { ok: false, message: 'Không tìm thấy dòng dữ liệu hợp lệ cho Struct Data "' + selectedStructType + '".', added: 0 };
    }

    if (!project.excelVars) project.excelVars = [];
    vars.forEach(function(v) {
      const idx = project.excelVars.findIndex(function(e) { return e.label === v.label; });
      if (idx >= 0) project.excelVars[idx] = v;
      else project.excelVars.push(v);
    });

    if (typeof syncStructDataFromProjectData === 'function') {
      syncStructDataFromProjectData();
    }
    if (typeof saveProject === 'function') saveProject();
    return { ok: true, message: 'Import thành công ' + vars.length + ' instance cho Struct Data "' + selectedStructType + '".', added: vars.length };

  } else {
    return { ok: false, message: 'Chế độ import hiện tại chỉ hỗ trợ Struct Data. Vui lòng chọn Struct Data type để import.', added: 0 };
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
  const unitCount     = (project.excelVars || []).filter(function(v) { return v.format === 'Unit Station'; }).length;
  const structTypes = (project.devices || []).map(function(d) { return d.name; });
  const structOptions = structTypes.length
    ? structTypes.map(function(name) { return '<option value="' + name + '">' + name + '</option>'; }).join('')
    : '<option value="">(Chưa có Struct Data)</option>';

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
        <!-- Import Type selector -->
        <div style="margin-bottom:14px;">
          <div style="font-size:9px;color:var(--text3);letter-spacing:1px;margin-bottom:6px;">LOẠI DỮ LIỆU IMPORT</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <label style="font-size:10px;color:var(--cyan);display:flex;align-items:center;gap:4px;cursor:pointer;">
              <input type="radio" name="ei-import-type" value="unit" onchange="eiOnImportTypeChange()"> Unit Station
            </label>
            <label style="font-size:10px;color:var(--cyan);display:flex;align-items:center;gap:4px;cursor:pointer;">
              <input type="radio" name="ei-import-type" value="cylinder" onchange="eiOnImportTypeChange()"> Cylinder CSV
            </label>
            <label style="font-size:10px;color:var(--cyan);display:flex;align-items:center;gap:4px;cursor:pointer;">
              <input type="radio" name="ei-import-type" value="struct" checked onchange="eiOnImportTypeChange()"> Struct Data
            </label>
          </div>
        </div>

        <div id="ei-struct-wrap" style="margin-bottom:14px;">
          <div style="font-size:9px;color:var(--text3);letter-spacing:1px;margin-bottom:6px;">STRUCT DATA TYPE</div>
          <select id="ei-struct-type"
            style="width:100%;font-size:10px;color:var(--cyan);background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:4px 8px;">
            ${structOptions}
          </select>
          <div style="margin-top:4px;font-size:9px;color:var(--text3);">CSV: Col0 = Label, Col1..N map theo thứ tự signal của Struct Data đã chọn.</div>
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
        <div id="ei-schema-hint" style="font-size:9px;color:var(--text3);line-height:1.6;">
          <b style="color:var(--cyan);">Struct Data CSV</b>: Label | Signal1 | Signal2 | ... (theo thứ tự signal của struct đã chọn)
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

// ─── Xử lý thay đổi loại import ─────────────────────────────────────────────
function eiOnImportTypeChange() {
  const radio = document.querySelector('input[name="ei-import-type"]:checked');
  const type = radio ? radio.value : 'struct';
  const structWrap = document.getElementById('ei-struct-wrap');
  const schemaHint = document.getElementById('ei-schema-hint');
  if (structWrap) structWrap.style.display = (type === 'struct') ? '' : 'none';
  if (schemaHint) {
    if (type === 'unit') {
      schemaHint.innerHTML = '<b style="color:var(--cyan);">Unit Station CSV</b>: UnitName, OriginFlag, AutoFlag, ManualFlag, OriginBase, AutoBase, ErrorFlag, Start, Stop, Reset, EStop, HomeDone';
    } else if (type === 'cylinder') {
      schemaHint.innerHTML = '<b style="color:var(--cyan);">Cylinder CSV</b>: Label | địa chỉ theo thứ tự tín hiệu Cylinder';
    } else {
      schemaHint.innerHTML = '<b style="color:var(--cyan);">Struct Data CSV</b>: Label | Signal1 | Signal2 | ... (theo thứ tự signal của struct đã chọn)';
    }
  }
  // Cập nhật stat nếu đã có file
  if (_eiPendingText) {
    const stat = document.getElementById('ei-stat');
    if (stat) {
      const rows = eiParseCSV(_eiPendingText);
      const stName = (type === 'struct') ? (document.getElementById('ei-struct-type') || {value:''}).value : '';
      const label = type === 'unit' ? 'Unit Station' : type === 'cylinder' ? 'Cylinder' : 'Struct Data' + (stName ? ' (' + stName + ')' : '');
      stat.textContent = 'Mode: ' + label + '  (' + rows.length + ' dòng)';
    }
  }
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
    const stat = document.getElementById('ei-stat');
    if (stat) {
      const radio = document.querySelector('input[name="ei-import-type"]:checked');
      const type = radio ? radio.value : 'struct';
      const st = document.getElementById('ei-struct-type');
      const stName = (type === 'struct' && st) ? st.value : '';
      const label = type === 'unit' ? 'Unit Station' : type === 'cylinder' ? 'Cylinder' : 'Struct Data' + (stName ? ' (' + stName + ')' : '');
      stat.textContent = 'Mode: ' + label + '  (' + rows.length + ' dòng)';
    }
  };
  reader.readAsText(file);
}

// ─── Thực hiện import ─────────────────────────────────────────────────────────
function eiDoImport() {
  if (!_eiPendingText) return;
  const radio = document.querySelector('input[name="ei-import-type"]:checked');
  const csvType = radio ? radio.value : 'struct';
  const structTypeSel = document.getElementById('ei-struct-type');
  const selectedStructType = structTypeSel ? structTypeSel.value : '';
  const result    = eiImportFromCSVText(_eiPendingText, csvType, { structType: selectedStructType });

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
