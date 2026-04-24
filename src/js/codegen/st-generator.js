"use strict";

// ═══════════════════════════════════════════════════════════════════════════════
//  IEC 61131-3 ST — DEMO / STUB
// ═══════════════════════════════════════════════════════════════════════════════

// ─── StepRenderer ─────────────────────────────────────────────────────────────
// Responsible for rendering the IL/ST code blocks for a single Step.
// Separating rendering from sequence traversal means the output format can be
// changed here (e.g. SET/RST → CASE statement) without touching the generator.
const StepRenderer = {
  /**
   * Render the two logic blocks for one Step.
   *
   * Block 1 – Activation : prevDoneVars AND activationCond  → SET _StepXX_exe
   * Block 2 – Completion : _StepXX_exe AND feedbackCond    → SET _StepXX_done
   *
   * @param {Object}      params
   * @param {string}      params.stepNum           Zero-padded step number ('01', '02', …)
   * @param {string[]}    params.prevDoneVars       Done-flags of all preceding steps (empty for initial step)
   * @param {string|null} params.activationCond     Transition condition string (single resolved address)
   * @param {string|null} params.feedbackCond       Device feedback / sensor signal that closes the step
   * @param {string}      [params.stepLabel]        Optional human-readable label for comments
   * @returns {string[]} Array of IL code lines
   */
  renderStepLogic({ stepNum, prevDoneVars, activationCond, feedbackCond, stepLabel }) {
    const execVar = `_Step${stepNum}_exe`;
    const doneVar = `_Step${stepNum}_done`;
    const lines = [];

    const labelSuffix = stepLabel ? ` — ${stepLabel}` : '';
    lines.push(`(* --- Step ${stepNum}${labelSuffix} --- *)`);

    // Block 1: Activation ─────────────────────────────────────────────────────
    // Build a list of all conditions that must be AND-ed for activation.
    // prevDoneVars covers one or more predecessor done-flags (parallel joins).
    // activationCond is the outgoing transition condition of those predecessors.
    const allActivationConds = [...(prevDoneVars || [])];
    if (activationCond) allActivationConds.push(activationCond);

    if (allActivationConds.length > 0) {
      lines.push(`LD  ${allActivationConds[0]}`);
      allActivationConds.slice(1).forEach(c => lines.push(`AND ${c}`));
    } else {
      lines.push(`LD  TRUE`);
    }
    lines.push(`SET ${execVar}`);
    lines.push('');

    // Block 2: Execution & Feedback ───────────────────────────────────────────
    lines.push(`LD  ${execVar}`);
    if (feedbackCond) {
      lines.push(`AND ${feedbackCond}`);
    }
    lines.push(`SET ${doneVar}`);
    lines.push('');

    return lines;
  },

  /**
   * Render a cleanup block that resets all _exe and _done flags when the
   * last step's done-flag is set, clearing the cycle for the next run.
   *
   * @param {string}   triggerVar  Done-flag of the final step (e.g. '_Step05_done')
   * @param {string[]} allVars     All _exe and _done variable names to reset
   * @returns {string[]} Array of IL code lines
   */
  renderCleanupBlock(triggerVar, allVars) {
    const lines = [];
    lines.push('(* --- Cleanup: Reset all Step flags at end of cycle --- *)');
    lines.push(`LD  ${triggerVar}`);
    allVars.forEach(v => lines.push(`RST ${v}`));
    lines.push('');
    return lines;
  },
};

// ─── Generator ────────────────────────────────────────────────────────────────
// Acts as the orchestrator: walks the sequence and delegates rendering to
// StepRenderer.  No step-level formatting lives here.

function generateSTDemo(diagIds, opts) {
  // ── Custom st_main.hbs: if loaded, delegate entirely to Handlebars ────────
  if (typeof tmGetCustomTemplate === 'function') {
    const stMainSrc = tmGetCustomTemplate('st_main.hbs');
    if (stMainSrc && typeof Handlebars !== 'undefined') {
      try {
        const stMainFn = Handlebars.compile(stMainSrc);
        const diagrams = diagIds.map(function(diagId) {
          const diag = (project.diagrams || []).find(function(d) { return d.id === diagId; });
          if (!diag) return null;
          const data = loadDiagramData(diagId);
          if (!data || !data.state) return null;
          const s = data.state;
          const sequence = cgResolveSequence(s);
          const steps = sequence.map(function(item) {
            return {
              number:   String(item.step.number).padStart(2, '0'),
              label:    item.step.label || '',
              initial:  !!item.step.initial,
              inCond:   item.inTrans  ? (item.inTrans.condition  || '1') : '1',
              outCond:  item.outTrans ? (item.outTrans.condition || '1') : '1',
              actions:  item.step.actions || [],
            };
          });
          const unitName = (project.units || []).find(function(u) { return u.id === diag.unitId; });
          return {
            id:       diag.id,
            name:     diag.name || diag.id,
            mode:     diag.mode || 'Auto',
            unitName: (unitName && unitName.name) || '',
            steps:    steps,
          };
        }).filter(Boolean);

        const ctx = {
          project:  { name: project.name || '' },
          diagrams: diagrams,
          baseMR:   opts.baseMR || 0,
        };
        const code = stMainFn(ctx);
        return {
          code: code,
          stats: '[custom st_main.hbs] ' + diagIds.length + ' diagram(s)'
        };
      } catch (e) {
        console.warn('[st-generator] st_main.hbs render error:', e);
        if (typeof toast === 'function') {
          toast('⚠ st_main.hbs lỗi khi render: ' + (e.message || String(e)) + ' — dùng generator mặc định.');
        }
      }
    }
  }

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

    // Collect all flag variables for the end-of-cycle cleanup block.
    const allStepVars = [];

    sequence.forEach((sequenceItem) => {
      const { step, inTrans, outTrans } = sequenceItem;
      const sn = String(step.number).padStart(2, '0');

      // ── Determine prevDoneVars ─────────────────────────────────────────────
      let prevDoneVars = [];
      if (!step.initial && inTrans) {
        const prevSteps = resolveStepsThrough(
          inTrans.id, 'upstream', s.connections || [], s.steps || [], s.parallels || []
        );
        prevDoneVars = prevSteps.map(
          ps => `_Step${String(ps.number).padStart(2, '0')}_done`
        );
      }

      // ── Determine activationCond ───────────────────────────────────────────
      let activationCond = null;
      if (step.initial) {
        // Initial step: combine auto/mode bit with the optional start transition.
        // The mode bit acts as the activation gate; the transition condition
        // (if any) is an additional AND condition.
        const modeBit = cgFindModeBit(vars);
        const cond = inTrans?.condition?.trim();
        const parts = [];
        if (modeBit) parts.push(modeBit.replace(/%/g, '').replace(/\./g, '_'));
        if (cond && cond !== '1') {
          parts.push(resolveAddr(cond)?.replace(/%/g, '').replace(/\./g, '_') || cond);
        }
        // For the initial step there are no prevDoneVars, so push all parts as
        // activationCond (renderStepLogic will load the first part with LD).
        activationCond = parts.length ? parts.join(' AND ') : null;
      } else {
        const transCond = inTrans?.condition?.trim();
        if (transCond && transCond !== '1') {
          activationCond = resolveAddr(transCond)?.replace(/%/g, '').replace(/\./g, '_') || transCond;
        }
      }

      // ── Determine feedbackCond ─────────────────────────────────────────────
      let feedbackCond = null;
      if (outTrans) {
        const cond = outTrans.condition?.trim();
        if (cond && cond !== '1') {
          feedbackCond = resolveAddr(cond)?.replace(/%/g, '').replace(/\./g, '_') || cond;
        }
      }

      // ── Delegate rendering to StepRenderer ────────────────────────────────
      const stepLines = StepRenderer.renderStepLogic({
        stepNum: sn,
        prevDoneVars,
        activationCond,
        feedbackCond,
        stepLabel: step.label,
      });
      lines.push(...stepLines);

      allStepVars.push(`_Step${sn}_exe`, `_Step${sn}_done`);
    });

    // ── End-of-cycle cleanup block ─────────────────────────────────────────
    if (sequence.length > 0) {
      const lastStep = sequence[sequence.length - 1].step;
      const lastSn = String(lastStep.number).padStart(2, '0');
      const cleanupLines = StepRenderer.renderCleanupBlock(
        `_Step${lastSn}_done`,
        allStepVars
      );
      lines.push(...cleanupLines);
    }

    mrOffset += sequence.length * 2 + 2;
  });

  lines.push('(* ── END ── *)');

  return {
    code: lines.join('\n'),
    stats: `[DEMO] ${diagIds.length} diagram(s) · IEC ST`
  };
}
