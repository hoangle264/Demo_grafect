"use strict";

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
    // ;<h1> bookmark lines are KV Studio-specific markers — keep them as-is
    // (they are not valid IL instructions and not standard comments).
    if (/^;<h1>/.test(line)) return line;
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

