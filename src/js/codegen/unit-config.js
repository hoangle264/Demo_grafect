"use strict";

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

// ═══════════════════════════════════════════════════════════════════════════════
//  HANDLEBARS TEMPLATE ENGINE INTEGRATION
//  Tải các file .hbs từ thư mục templates/ để sinh code IL thay thế cho
//  các hàm generator hardcode.  User có thể chỉnh sửa file .hbs mà không
//  cần sửa logic JavaScript.
// ═══════════════════════════════════════════════════════════════════════════════

/** Cache: { error, manual, origin, auto, output } → compiled Handlebars function */
const UC_TEMPLATE_CACHE = {};

/**
 * Đăng ký các Handlebars helpers dùng trong template.
 * Gọi một lần trước khi compile template.
 */
function ucRegisterHandlebarsHelpers() {
  if (typeof Handlebars === 'undefined') return;
  if (Handlebars.__ucHelpersRegistered) return;
  Handlebars.registerHelper('pad', function(addr) {
    return new Handlebars.SafeString(String(addr || '').padEnd(12));
  });
  Handlebars.__ucHelpersRegistered = true;
}

/**
 * Tải tất cả file .hbs từ thư mục templates/ (relative URL), compile và cache.
 * Trả về Promise. Khi resolve, UC_TEMPLATE_CACHE đã có đủ 5 template.
 */
function ucLoadTemplates() {
  if (typeof Handlebars === 'undefined') {
    return Promise.reject(new Error('Handlebars not available'));
  }
  ucRegisterHandlebarsHelpers();
  const names = ['error', 'manual', 'origin', 'auto', 'output'];
  const base = 'templates/';
  const promises = names.map(function(name) {
    return fetch(base + name + '.hbs')
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' loading ' + name + '.hbs');
        return res.text();
      })
      .then(function(src) {
        UC_TEMPLATE_CACHE[name] = Handlebars.compile(src);
      });
  });
  return Promise.all(promises);
}

/** Kiểm tra tất cả 5 template đã được cache chưa */
function ucTemplatesReady() {
  return !!(UC_TEMPLATE_CACHE.error && UC_TEMPLATE_CACHE.manual &&
            UC_TEMPLATE_CACHE.origin && UC_TEMPLATE_CACHE.auto &&
            UC_TEMPLATE_CACHE.output);
}

/**
 * Áp dụng một template đã cache lên templateCtx.
 * Trả về mảng string (lines) như các hàm cgUCGenerate*.
 * Collapse consecutive blank lines (giữ nhiều nhất 1 dòng trắng liên tiếp).
 */
function ucApplyTemplate(name, tplCtx) {
  const tmpl = UC_TEMPLATE_CACHE[name];
  if (!tmpl) return null;
  const text = tmpl(tplCtx);
  const raw = text.split('\n').map(function(l) { return l.trimEnd(); });
  const result = [];
  let prevBlank = false;
  for (let i = 0; i < raw.length; i++) {
    const blank = raw[i].trim() === '';
    if (blank && prevBlank) continue;
    result.push(raw[i]);
    prevBlank = blank;
  }
  return result;
}

// ─── Helper: tính stack instruction cho ALT block (Manual) ────────────────────
function ucAltStackInst(i, n) {
  if (n <= 1) return '';
  if (i === 0) return 'MPS';
  if (i === n - 2) return 'MPP';
  if (i === n - 1) return '';
  return 'MRD';
}

// ─── Helper: tính action label từ step object ────────────────────────────────
function ucComputeActionLabel(step) {
  if (!step) return '';
  return (step.actions && step.actions.length)
    ? step.actions.map(function(a) {
        return (a.devLabel || '') + ' ' + ucDirFromSigName(a.sigName || '');
      }).join(', ')
    : (step.label || '');
}

/**
 * cgUCBuildTemplateContext(ctx)
 * Nhận ctx từ cgUCBuildContext và bổ sung các trường tính toán sẵn
 * (stack instructions, pre-computed labels, booleans) để các file .hbs
 * có thể dùng trực tiếp mà không cần logic JS trong template.
 */
function cgUCBuildTemplateContext(ctx) {
  const u = ctx.unit;
  const cys = ctx.cylinders;

  // ── originBase (cho ZRES ở Manual section) ───────────────────────────────
  const originBase = (ctx.originSteps && ctx.originSteps.length)
    ? ctx.originSteps[0].addr : '';

  // ── Enrich cylinders với altStackInst + trường output ────────────────────
  const cylinders = cys.map(function(cy, i) {
    const enrichedStepsDirB = (cy.stepsForDirB || []).map(function(s, si) {
      const sLabel = (s.actions && s.actions.length)
        ? (s.actions[0].devLabel || '') + ' ' + ucDirFromSigName(s.actions[0].sigName || '')
        : (s.label || '');
      return Object.assign({}, s, { sLabel: sLabel, needsORL: si > 0 });
    });
    const hasOutput     = !!(cy.outDirA || cy.outDirB);
    const hasDirAOutput = !!(cy.stepDirA && cy.outDirA);
    const hasDirBOutput = !!(enrichedStepsDirB.length > 0 && cy.outDirB);
    return Object.assign({}, cy, {
      altStackInst:      ucAltStackInst(i, cys.length),
      enrichedStepsDirB: enrichedStepsDirB,
      singleStepDirB:    enrichedStepsDirB.length === 1,
      multiStepDirB:     enrichedStepsDirB.length > 1,
      hasOutput:         hasOutput,
      hasDirAOutput:     hasDirAOutput,
      hasDirBOutput:     hasDirBOutput,
      errTimerDirA:      !!(cy.outDirA && cy.sensorDirA && cy.errFlagDirA),
      errTimerDirB:      !!(cy.outDirB && cy.sensorDirB && cy.errFlagDirB),
    });
  });

  // ── cysWithOut: cylinders có địa chỉ output, bổ sung stack instructions ──
  const cysWithOut = cylinders.filter(function(cy) {
    return cy.outDirA || cy.outDirB;
  });
  const cysWithOutEnriched = cysWithOut.map(function(cy, i) {
    const isLast = i === cysWithOut.length - 1;
    return Object.assign({}, cy, {
      stackBeforeDirB: isLast ? 'MPP' : 'MRD',
      stackAfterDirB:  isLast ? ''    : 'MRD',
    });
  });

  // ── Enrich originSteps với prevStep info và actionLabel ────────────────────
  const originSteps = (ctx.originSteps || []).map(function(step, i) {
    return Object.assign({}, step, {
      actionLabel:     ucComputeActionLabel(step),
      isFirst:         i === 0,
      prevCmpAddr:     i > 0 ? ctx.originSteps[i - 1].cmpAddr : '',
      prevActionLabel: i > 0 ? ucComputeActionLabel(ctx.originSteps[i - 1]) : '',
    });
  });
  const lastOriginStep = originSteps.length > 0
    ? originSteps[originSteps.length - 1] : null;

  // ── Enrich stationFlows ───────────────────────────────────────────────────
  const stationFlows = (ctx.stationFlows || []).map(function(flow) {
    const steps = flow.steps.map(function(step, i) {
      return Object.assign({}, step, {
        actionLabel:     ucComputeActionLabel(step),
        isFirst:         i === 0,
        prevCmpAddr:     i > 0 ? flow.steps[i - 1].cmpAddr : '',
        prevActionLabel: i > 0 ? ucComputeActionLabel(flow.steps[i - 1]) : '',
      });
    });
    const lastStep = steps.length > 0 ? steps[steps.length - 1] : null;
    const resetEndNum  = flow.baseNum + Math.max(15, flow.steps.length * 2 + 6);
    const resetEndAddr = '@MR' + String(resetEndNum).padStart(3, '0');
    return Object.assign({}, flow, {
      steps:        steps,
      lastStep:     lastStep,
      resetEndAddr: resetEndAddr,
    });
  });

  const firstCyLabel = cys.length > 0 ? cys[0].label : 'CY';

  return {
    unit:              u,
    cylinders:         cylinders,
    cysWithOut:        cysWithOutEnriched,
    hasCylinders:      cys.length > 0,
    isSingleCylinder:  cys.length === 1,
    hasCysWithOut:     cysWithOut.length > 0,
    cysWithOutMultiple: cysWithOut.length > 1,
    showManBtnZres:    !!(u.hmiManBtnBase && u.hmiManBtnEnd),
    originBase:        originBase,
    originSteps:       originSteps,
    hasOriginSteps:    originSteps.length > 0,
    lastOriginStep:    lastOriginStep,
    stationFlows:      stationFlows,
    firstCyLabel:      firstCyLabel,
  };
}

// ─── Tự động tải templates khi page load ─────────────────────────────────────
if (typeof window !== 'undefined') {
  window.addEventListener('load', function() {
    ucLoadTemplates().catch(function(err) {
      console.warn('[unit-config] Handlebars templates not loaded (fallback to JS generators):', err.message);
    });
  });
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

  // 5 sections: dùng Handlebars templates nếu đã load, fallback sang JS generators
  if (ucTemplatesReady()) {
    const tplCtx = cgUCBuildTemplateContext(ctx);
    lines.push(...(ucApplyTemplate('error',  tplCtx) || cgUCGenerateError(ctx)));
    lines.push(...(ucApplyTemplate('manual', tplCtx) || cgUCGenerateManual(ctx)));
    lines.push(...(ucApplyTemplate('origin', tplCtx) || cgUCGenerateOrigin(ctx)));
    lines.push(...(ucApplyTemplate('auto',   tplCtx) || cgUCGenerateAuto(ctx)));
    lines.push(...(ucApplyTemplate('output', tplCtx) || cgUCGenerateOutput(ctx)));
  } else {
    lines.push(...cgUCGenerateError(ctx));
    lines.push(...cgUCGenerateManual(ctx));
    lines.push(...cgUCGenerateOrigin(ctx));
    lines.push(...cgUCGenerateAuto(ctx));
    lines.push(...cgUCGenerateOutput(ctx));
  }

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
