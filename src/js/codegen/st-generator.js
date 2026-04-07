"use strict";

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

