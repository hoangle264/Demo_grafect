"use strict";

// ═══════════════════════════════════════════════════════════════════════════════
//  KEYENCE KV MNEMONIC IL GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

// Section order for the generated file: Error → Manual → Origin → Auto → Output
// '_other' covers any mode name that does not match the four standard modes.
const KV_SECTION_ORDER = ['Error', 'Manual', 'Origin', 'Auto'];

// Width of the unit banner separator line (number of ═ characters).
const UNIT_BANNER_WIDTH = 56;

// Column width used to right-pad PLC addresses before inline comments.
const ADDR_COLUMN_WIDTH = 12;

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


// ─── Default Step Templates ───────────────────────────────────────────────────
// Each template is a multi-line string with ${key} placeholders rendered by
// cgApplyOutputTemplate.  Lines whose placeholder resolves to an empty string
// are automatically dropped (e.g. "AND  ${inTransition}" disappears when the
// transition condition is trivial / unconditional).
//
// STEP_ACTIVATION_TEMPLATE — logic that sets the step execute bit.
//   ${prevStepDone}  Full LD/AND block for the previous step(s) done bit(s).
//                    For a parallel join the value contains multiple lines
//                    (first line: address only; remaining lines: "AND  addr")
//                    so that the template's leading "LD   " prefix stays correct.
//   ${inTransition}  Incoming transition condition address (empty = trivial/none).
//   ${stepExe}       Step execute (exec) MR address.
//   ${stepNum}       Step number string, zero-padded to 2 digits by the generator.
//   ${stepLabel}     Step label text (available for custom templates; may be empty).
const STEP_ACTIVATION_TEMPLATE =
  'LD   ${prevStepDone}\n' +
  'AND  ${inTransition}\n' +
  'SET  ${stepExe}';

// STEP_FEEDBACK_TEMPLATE — logic that sets the step done bit when the outgoing
// transition fires.
//   ${stepExe}       Step execute MR address.
//   ${outTransition} Outgoing transition condition address (empty = trivial/none).
//   ${stepDone}      Step done MR address.
//   ${stepNum}       Step number string, zero-padded to 2 digits by the generator.
const STEP_FEEDBACK_TEMPLATE =
  'LD   ${stepExe}\n' +
  'AND  ${outTransition}\n' +
  'SET  ${stepDone}';

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

  // ── Custom kv_main.hbs: if loaded, delegate entirely to Handlebars ────────
  if (typeof tmGetCustomTemplate === 'function') {
    const kvMainSrc = tmGetCustomTemplate('kv_main.hbs');
    if (kvMainSrc && typeof Handlebars !== 'undefined') {
      try {
        // Register kv_step partial if kv_step.hbs was also loaded
        const kvStepSrc = tmGetCustomTemplate('kv_step.hbs');
        if (kvStepSrc) Handlebars.registerPartial('kv_step', kvStepSrc);

        const kvMainFn = Handlebars.compile(kvMainSrc);

        // Build context: collect all diagram data
        const diagrams = diagIds.map(function(diagId) {
          const diag = (project.diagrams || []).find(function(d) { return d.id === diagId; });
          if (!diag) return null;
          const data = loadDiagramData(diagId);
          if (!data || !data.state) return null;
          const s = data.state;
          const sequence = cgResolveSequence(s);
          const mrBase = opts.baseMR || 0;
          const steps = sequence.map(function(item, i) {
            const base = mrBase + i * 2;
            return {
              number:    String(item.step.number).padStart(2, '0'),
              label:     item.step.label || '',
              execAddr:  '@MR' + String(base).padStart(3, '0'),
              doneAddr:  '@MR' + String(base + 1).padStart(3, '0'),
              actions:   item.step.actions || [],
              inCond:    item.inTrans ? (item.inTrans.condition || '1') : '1',
              outCond:   item.outTrans ? (item.outTrans.condition || '1') : '1',
            };
          });
          return {
            id:      diag.id,
            name:    diag.name || diag.id,
            mode:    diag.mode || 'Auto',
            unitId:  diag.unitId || '',
            steps:   steps,
          };
        }).filter(Boolean);

        const ctx = {
          project:   { name: project.name || '' },
          target:    profile.label,
          timestamp: timestamp,
          diagrams:  diagrams,
          baseMR:    opts.baseMR || 0,
        };

        const code = kvMainFn(ctx);
        const stepCount = diagrams.reduce(function(n, d) { return n + d.steps.length; }, 0);
        return {
          code: cgApplyProfile(code, profile),
          stats: diagIds.length + ' diagram(s) · ' + stepCount + ' step(s) [custom kv_main.hbs] · ' + profile.label
        };
      } catch (e) {
        // Fall through to default generator if custom template errors
        console.warn('[kv-generator] kv_main.hbs render error:', e);
      }
    }
  }

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

/**
 * Build the "prevStepDone" value for STEP_ACTIVATION_TEMPLATE.
 *
 * For a single previous step the return value is just the done-bit address
 * (with inline comment), so that the template's "LD   ${prevStepDone}" line
 * expands correctly to a single LD instruction.
 *
 * For a parallel join (AND-join) the first entry is the bare address and each
 * subsequent entry is prefixed "AND  " so the substitution result looks like:
 *   LD   @MR001      ; S01 complete
 *   AND  @MR003      ; S02 complete
 *
 * @param {Array}  prevSteps  Ordered array of step objects from resolveStepsThrough.
 * @param {Object} mrMap      stepId → {exec, done}
 * @returns {string}  Single or multi-line block (empty string if prevSteps is empty).
 */
function cgBuildPrevStepBlock(prevSteps, mrMap) {
  if (!prevSteps.length) return '';
  return prevSteps.map((ps, pi) => {
    const pm   = mrMap[ps.id];
    const addr = pm ? pm.done : '???';
    const comment = `; ${cgStepRef(ps)} complete`;
    if (pi === 0) {
      return `${addr.padEnd(ADDR_COLUMN_WIDTH)}${comment}`;
    }
    return `AND  ${addr.padEnd(ADDR_COLUMN_WIDTH)}${comment}`;
  }).join('\n');
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

  // ── Resolve step templates (opts override or defaults) ───────────────────
  // Check for custom kv_step.hbs from localStorage
  let activationTemplate = (opts.stepTemplates && opts.stepTemplates.activation) || STEP_ACTIVATION_TEMPLATE;
  let feedbackTemplate   = (opts.stepTemplates && opts.stepTemplates.feedback)   || STEP_FEEDBACK_TEMPLATE;
  if (typeof tmGetCustomTemplate === 'function') {
    const kvStepSrc = tmGetCustomTemplate('kv_step.hbs');
    if (kvStepSrc) {
      // kv_step.hbs uses ${…} placeholder syntax matching cgApplyOutputTemplate.
      // Split by a divider comment line ";;;" (triple semicolon) if two blocks
      // (activation + feedback) are provided; otherwise use for activation only.
      const parts = kvStepSrc.split(/^;;;$/m);
      activationTemplate = parts[0].trim();
      if (parts[1]) feedbackTemplate = parts[1].trim();
    }
  }

  // ── Generate code per sequence item ──────────────────────────────────────
  sequence.forEach((item, idx) => {
    const { step, inTrans, outTrans, branchType } = item;
    const mr = mrMap[step.id];
    const stepNum = String(step.number).padStart(2, '0');
    const stepLbl = step.label ? ` — ${step.label}` : '';

    lines.push(`; ─── Step ${stepNum}${stepLbl} ${'─'.repeat(Math.max(0, 40 - stepLbl.length - 8))}`);

    // ── Activation condition ───────────────────────────────────────────────
    // Build template variables: ${prevStepDone} and ${inTransition}.
    let prevStepDoneVal;
    let inTransitionVal;

    if (step.initial) {
      // Initial step: activated by mode bit or first-scan pulse.
      const modeBit = cgFindModeBit(vars);
      prevStepDoneVal = modeBit
        ? `${modeBit.padEnd(ADDR_COLUMN_WIDTH)}; Initial step — mode active`
        : `CR2002        ; Initial step — 1st scan pulse`;
      inTransitionVal = '';
    } else if (inTrans) {
      // Normal step: activated by previous step(s) done bit via incoming transition.
      const prevSteps = resolveStepsThrough(
        inTrans.id, 'upstream', connections, steps, parallels
      );
      // For a parallel join (AND-join) cgBuildPrevStepBlock builds a multi-line
      // LD/AND block that expands inline inside the "LD   ${prevStepDone}" line.
      prevStepDoneVal = cgBuildPrevStepBlock(prevSteps, mrMap);
      const cond = inTrans.condition?.trim();
      inTransitionVal = (cond && cond !== '1' && cond !== 'true')
        ? `${(resolveAddr(cond) || cond).padEnd(ADDR_COLUMN_WIDTH)}; transition: ${esc2(cond)}`
        : '';
    } else {
      lines.push(`; WARNING: no incoming transition found for step ${stepNum}`);
      prevStepDoneVal = 'CR2002';
      inTransitionVal = '';
    }

    const activationVars = {
      prevStepDone: prevStepDoneVal,
      inTransition: inTransitionVal,
      stepExe:      mr.exec,
      stepNum:      stepNum,
      stepLabel:    step.label || ''
    };
    cgApplyOutputTemplate(activationTemplate, activationVars)
      .split('\n').forEach(l => lines.push(l));
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
    // Build ${outTransition}: empty for trivial/unconditional (drops AND line).
    const outCond = outTrans?.condition?.trim();
    const outTransitionVal = (outCond && outCond !== '1' && outCond !== 'true')
      ? `${(resolveAddr(outCond) || outCond).padEnd(ADDR_COLUMN_WIDTH)}; ${esc2(outCond)}`
      : '';

    const feedbackVars = {
      stepExe:       mr.exec,
      outTransition: outTransitionVal,
      stepDone:      mr.done,
      stepNum:       stepNum
    };
    cgApplyOutputTemplate(feedbackTemplate, feedbackVars)
      .split('\n').forEach(l => lines.push(l));
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

