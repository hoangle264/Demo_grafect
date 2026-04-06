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
  if (!activeDiagramId) { toast('⚠ No active diagram'); return; }
  flushState();

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
          </select>
        </div>

        <!-- Base MR address -->
        <div>
          <div style="font-size:9px;color:var(--text3);letter-spacing:1px;margin-bottom:5px;">
            BASE ADDRESS <span style="color:var(--cyan);">@MR</span>
          </div>
          <input id="cg-base-mr" type="number" min="0" max="9999" value="100" step="2"
            style="width:80px;background:var(--bg);border:1px solid var(--border);
            color:var(--cyan);font-family:'JetBrains Mono',monospace;font-size:12px;
            padding:4px 8px;border-radius:3px;outline:none;"
            oninput="cgUpdatePreview()">
        </div>

        <!-- Diagram selector -->
        <div style="flex:1;min-width:200px;">
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
  const baseMR = parseInt(document.getElementById('cg-base-mr')?.value || '100', 10);
  const selected = Array.from(
    document.querySelectorAll('#cg-diag-list input[type=checkbox]:checked')
  ).map(c => c.value);

  const pre = document.getElementById('cg-preview');
  const stat = document.getElementById('cg-stat');
  if (!pre) return;

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
  pre.innerHTML = pre.textContent
    .replace(/(&amp;|&lt;|&gt;)/g, s => s) // already escaped? no — textContent is safe
    .replace(commentRe, '<span style="color:var(--text3)">$1</span>')
    .replace(/\b(LD|LDI|LD NOT|AND|ANI|AND NOT|AND LD|OR|ORI|OR NOT|OR LD|SET|RST|RSET|OUT|ANB|ORB|LDNOT|ANDNOT|ORNOT|MPS|MRD|MPP|ULD|OLD|TMRON|ONDL|TIM|TMRA|S\b|R\b|U\b|UN\b|O\b|ON\b|=\b)\b/g,
      '<span style="color:var(--cyan)">$1</span>')
    .replace(/@MR\d+/g, '<span style="color:var(--amber)">$&</span>')
    .replace(/\bMR\d+\b/g, '<span style="color:#4ade80">$&</span>');
}

// ─── Download / Copy ──────────────────────────────────────────────────────────
function cgDownloadCode() {
  const target = document.getElementById('cg-target')?.value || 'kv-5500';
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

  // ── Pass 1: load all diagrams, allocate MR, group by mode ───────────────
  const sections = {};
  KV_SECTION_ORDER.forEach(m => { sections[m] = []; });
  sections['_other'] = [];

  const loadedDiags = [];
  let mrOffset = opts.baseMR;

  diagIds.forEach(diagId => {
    const diag = (project.diagrams || []).find(d => d.id === diagId);
    if (!diag) return;
    const data = loadDiagramData(diagId);
    if (!data?.state) return;
    const s = data.state;
    const mode = diag.mode || 'Auto';

    // Build sequence and pre-allocate MR addresses for this diagram
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
    // Each step needs 2 MR bits (exec + done).  The trailing +2 leaves a gap
    // between diagrams to simplify manual editing in KV Studio.

    const entry = { diag, s, mode, sequence, mrMap };
    loadedDiags.push(entry);
    const key = KV_SECTION_ORDER.includes(mode) ? mode : '_other';
    sections[key].push(entry);
  });

  // ── Pass 2: build signal→action map for Output section ──────────────────
  // Maps physicalAddr → [{execMR, mode, stepNum, stepLabel, varLabel}]
  // Only N-qualified actions are aggregated here (they drive outputs by step state).
  const signalActionMap = {};
  loadedDiags.forEach(({ s, mode, sequence, mrMap }) => {
    const vars = s.vars || [];
    sequence.forEach(({ step }) => {
      const mr = mrMap[step.id];
      if (!mr) return;
      (step.actions || []).forEach(act => {
        if (!act.variable && !act.address) return;
        if ((act.qualifier || 'N') !== 'N') return;
        const addr = cgResolveAddrFull(act.address || act.variable, vars);
        if (!addr) return;
        if (!signalActionMap[addr]) signalActionMap[addr] = [];
        signalActionMap[addr].push({
          execMR: mr.exec,
          mode,
          stepNum: step.number,
          stepLabel: step.label || '',
          varLabel: act.variable || addr
        });
      });
    });
  });

  // ── Pass 3: generate code for each section ──────────────────────────────
  [...KV_SECTION_ORDER, '_other'].forEach(mode => {
    const diagsInSection = sections[mode];
    if (!diagsInSection.length) return;

    const sectionTitle = mode === '_other' ? 'OTHER' : mode.toUpperCase();
    lines.push('');
    lines.push(...cgSectionBanner(sectionTitle));

    diagsInSection.forEach(({ diag, s, mode: m, sequence, mrMap }) => {
      const unitName = (project.units || []).find(u => u.id === diag.unitId)?.name || diag.unit || '';
      const diagLabel = (unitName ? unitName + ' / ' : '') + (diag.name || diag.id);
      const firstMR = sequence.length ? mrMap[sequence[0].step.id]?.exec : '?';

      lines.push('');
      lines.push('; ┌──────────────────────────────────────────────────────');
      lines.push(`; │  ${diagLabel}`);
      lines.push(`; │  Mode: ${m}  |  Base @MR: ${firstMR}`);
      lines.push('; └──────────────────────────────────────────────────────');
      lines.push('');

      const result = generateKVDiagram(diag, s, { ...opts, mrMap, separateOutputs: true, profile });
      lines.push(...result.lines);
      totalSteps += result.stepCount;
    });
  });

  // ── Pass 4: Output section organised by device ───────────────────────────
  lines.push('');
  lines.push(...cgSectionBanner('OUTPUT — by device'));
  lines.push('');
  lines.push(...generateKVOutputSection(loadedDiags, signalActionMap));

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

// ─── Output section: one block per device instance, one sub-block per signal ─
function generateKVOutputSection(loadedDiags, signalActionMap) {
  const lines = [];

  // Collect all device-instance vars from all loaded diagrams
  // devVarMap: varLabel → {devTypeName, signalAddresses, signals}
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

  // Find error-flag address (for ANDNOT gate on each output)
  const anyVars = loadedDiags.flatMap(d => d.s.vars || []);
  const errorBit = cgFindErrorBit(anyVars);

  // Track which physical addresses have already been emitted
  const emitted = new Set();

  // ── Device-grouped outputs ──────────────────────────────────────────────
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
      emitted.add(physAddr);

      const actions = signalActionMap[physAddr] || [];
      lines.push(`; ${devLabel}.${sig.name}  →  ${physAddr}${sig.comment ? '  (' + sig.comment + ')' : ''}`);

      if (actions.length) {
        actions.forEach((a, i) => {
          const inst = i === 0 ? 'LD  ' : 'OR  ';
          lines.push(`${inst} ${a.execMR.padEnd(12)}; ${a.mode} / ${cgStepComment(a.stepNum, a.stepLabel)}`);
        });
      } else {
        lines.push(`LD   FALSE         ; TODO: add control conditions`);
      }
      if (errorBit) {
        lines.push(`ANDNOT ${errorBit.padEnd(12)}; not in error`);
      }
      lines.push(`OUT  ${physAddr.padEnd(12)}; ${devLabel}.${sig.name}`);
      lines.push('');
    });
  });

  // ── Ungrouped outputs (plain BOOL vars or direct addresses) ────────────
  const ungroupedAddrs = Object.keys(signalActionMap).filter(addr => !emitted.has(addr));
  if (ungroupedAddrs.length) {
    lines.push('; ─── Other outputs ──────────────────────────────────────');
    ungroupedAddrs.forEach(addr => {
      const actions = signalActionMap[addr];
      // Try to find a friendly label from any diagram vars
      const anyVar = anyVars.find(v => v.address === addr);
      const labelComment = anyVar?.label ? `  ; ${anyVar.label}` : '';

      lines.push(`; ${addr}${labelComment}`);
      actions.forEach((a, i) => {
        const inst = i === 0 ? 'LD  ' : 'OR  ';
        lines.push(`${inst} ${a.execMR.padEnd(12)}; ${a.mode} / ${cgStepComment(a.stepNum, a.stepLabel)}`);
      });
      if (errorBit) {
        lines.push(`ANDNOT ${errorBit.padEnd(12)}; not in error`);
      }
      lines.push(`OUT  ${addr.padEnd(12)}`);
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
