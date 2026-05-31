"use strict";

// ═══════════════════════════════════════════════════════════════════════════════
//  STEP ADDRESSING
//  Stable per-flow step address assignment used by every JS payload/generator.
//  C# consumers must read execAddress/doneAddress from the payload and must not
//  re-derive addresses from step order.
// ═══════════════════════════════════════════════════════════════════════════════

const CG_STEP_BOOL_STRIDE = 2;
const CG_STEP_BOOL_BLOCK_WIDTH = 16;
const CG_STEP_DEFAULT_BASE_MR = 100;
const CG_STEP_DEFAULT_FLOW_GAP = 64;
const CG_STEP_WORD_BITS = 16;
const CG_STEP_WORD_MAX_STEPS = 32;

function cgNormalizeAddressMode(flow) {
  const mode = String((flow && flow.addressMode) || 'bool').toLowerCase();
  return mode === 'word' ? 'word' : 'bool';
}

function cgNormalizeBoolAddressLayout(flow) {
  const raw = String(
    (flow && (flow.addressLayout || flow.boolAddressMode || flow.boolMode || flow.mrMode)) ||
    'linear'
  ).toLowerCase();
  return raw === 'block' ? 'block' : 'linear';
}

function cgFormatMr(num) {
  const n = Number(num) || 0;
  return '@MR' + String(n).padStart(3, '0');
}

function cgParseMrNumber(value) {
  const match = String(value == null ? '' : value).match(/MR\s*0*(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

function cgBoolLinearMr(baseMr, offset) {
  return (Number(baseMr) || 0) + offset;
}

function cgBoolBlockMr(baseMr, offset) {
  const base = Number(baseMr) || 0;
  const bankBase = Math.floor(base / 100);
  const bitBase = base % 100;
  const absoluteBit = bitBase + offset;
  return (bankBase + Math.floor(absoluteBit / CG_STEP_BOOL_BLOCK_WIDTH)) * 100 +
    (absoluteBit % CG_STEP_BOOL_BLOCK_WIDTH);
}

function cgResolveBoolAddress(step, flow) {
  const number = Number(step && step.number);
  const baseMr = (flow && flow.baseMr != null && flow.baseMr !== '') ? Number(flow.baseMr) : CG_STEP_DEFAULT_BASE_MR;
  const bitOffset = (number - 1) * CG_STEP_BOOL_STRIDE;
  const layout = cgNormalizeBoolAddressLayout(flow);
  const execMr = layout === 'block'
    ? cgBoolBlockMr(baseMr, bitOffset)
    : cgBoolLinearMr(baseMr, bitOffset);
  const doneMr = layout === 'block'
    ? cgBoolBlockMr(baseMr, bitOffset + 1)
    : cgBoolLinearMr(baseMr, bitOffset + 1);
  return {
    execAddress: cgFormatMr(execMr),
    doneAddress: cgFormatMr(doneMr)
  };
}

function cgParseWordAddress(word) {
  const raw = String(word == null ? '' : word).trim() || 'DM0';
  const match = raw.match(/^(@?)([A-Za-z]+)\s*0*(\d+)$/);
  if (!match) {
    throw new Error('Invalid word address: ' + raw);
  }
  const numberText = raw.match(/\d+$/)?.[0] || '0';
  return {
    at: match[1] || '',
    prefix: match[2].toUpperCase(),
    number: parseInt(match[3], 10),
    width: numberText.length
  };
}

function cgFormatWordAddress(baseWord, stepNumber) {
  const parsed = cgParseWordAddress(baseWord);
  const zeroBased = Number(stepNumber) - 1;
  const wordOffset = Math.floor(zeroBased / CG_STEP_WORD_BITS);
  const bit = zeroBased % CG_STEP_WORD_BITS;
  const width = Math.max(parsed.width, String(parsed.number + wordOffset).length);
  return parsed.at + parsed.prefix + String(parsed.number + wordOffset).padStart(width, '0') + '.' + bit;
}

function cgResolveWordAddress(step, flow) {
  return {
    execAddress: cgFormatWordAddress((flow && flow.activeWord) || 'DM0', step.number),
    doneAddress: cgFormatWordAddress((flow && flow.completeWord) || 'DM100', step.number)
  };
}

function resolveStepAddress(step, flow) {
  const number = Number(step && step.number);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error('Step number must be a unique integer >= 1.');
  }
  if (cgNormalizeAddressMode(flow) === 'word') {
    if (number > CG_STEP_WORD_MAX_STEPS) {
      throw new Error('Word address mode supports at most 32 steps per flow.');
    }
    return cgResolveWordAddress(step, flow);
  }
  return cgResolveBoolAddress(step, flow);
}

function cgGetFlowMaxStepNumber(steps) {
  return (steps || []).reduce(function(max, step) {
    const n = Number(step && step.number);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
}

function cgGetFlowStepNumbers(steps) {
  const seen = new Set();
  const duplicates = new Set();
  const invalid = [];
  (steps || []).forEach(function(step) {
    const n = Number(step && step.number);
    if (!Number.isInteger(n) || n < 1) {
      invalid.push(step && step.id ? step.id : String(n));
      return;
    }
    if (seen.has(n)) duplicates.add(n);
    seen.add(n);
  });
  return { seen, duplicates: Array.from(duplicates), invalid };
}

function cgBoolFlowRange(flow, steps) {
  const baseMr = (flow && flow.baseMr != null && flow.baseMr !== '') ? Number(flow.baseMr) : CG_STEP_DEFAULT_BASE_MR;
  const maxStep = Math.max(cgGetFlowMaxStepNumber(steps), 1);
  const endOffset = maxStep * CG_STEP_BOOL_STRIDE - 1;
  if (cgNormalizeBoolAddressLayout(flow) === 'block') {
    return {
      start: cgBoolBlockMr(baseMr, 0),
      end: cgBoolBlockMr(baseMr, endOffset),
      layout: 'block'
    };
  }
  return { start: baseMr, end: baseMr + endOffset, layout: 'linear' };
}

function cgBoolRangesOverlap(a, b) {
  if (!a || !b) return false;
  return a.start <= b.end && b.start <= a.end;
}

function cgNormalizeWordResource(word) {
  const parsed = cgParseWordAddress(word);
  return parsed.at + parsed.prefix + String(parsed.number);
}

function cgGetUnitFlowDescriptors(unitId) {
  return ((typeof project !== 'undefined' && project.diagrams) || []).filter(function(diag) {
    const diagUnit = diag.unitId || null;
    return (unitId || null) === diagUnit;
  });
}

function cgGetDiagramSteps(diagId) {
  if (typeof loadDiagramData !== 'function') return [];
  const data = loadDiagramData(diagId);
  return (data && data.state && data.state.steps) || [];
}

function cgFindNextBaseMrForUnit(unitId, stepCapacity) {
  const capacity = Math.max(Number(stepCapacity) || 16, 1);
  const needed = capacity * CG_STEP_BOOL_STRIDE;
  let candidate = CG_STEP_DEFAULT_BASE_MR;
  const ranges = cgGetUnitFlowDescriptors(unitId)
    .filter(function(diag) { return cgNormalizeAddressMode(diag) === 'bool' && diag.baseMr != null; })
    .map(function(diag) { return cgBoolFlowRange(diag, cgGetDiagramSteps(diag.id)); });

  while (ranges.some(function(range) {
    return cgBoolRangesOverlap({ start: candidate, end: candidate + needed - 1 }, range);
  })) {
    candidate += CG_STEP_DEFAULT_FLOW_GAP;
  }
  return candidate;
}

function cgEnsureFlowAddressConfig(flow) {
  if (!flow) return false;
  let changed = false;
  if (!flow.addressMode) {
    flow.addressMode = 'bool';
    changed = true;
  }
  if (cgNormalizeAddressMode(flow) === 'bool') {
    if (flow.baseMr == null || flow.baseMr === '') {
      flow.baseMr = cgFindNextBaseMrForUnit(flow.unitId || null);
      changed = true;
    }
    if (!flow.addressLayout) {
      flow.addressLayout = cgNormalizeBoolAddressLayout(flow);
      changed = true;
    }
  } else {
    if (!flow.activeWord) { flow.activeWord = 'DM0'; changed = true; }
    if (!flow.completeWord) { flow.completeWord = 'DM100'; changed = true; }
  }
  return changed;
}

function cgMigrateFlowAddressConfigs() {
  if (typeof project === 'undefined' || !project.diagrams) return false;
  let changed = false;
  (project.diagrams || []).forEach(function(flow) {
    changed = cgEnsureFlowAddressConfig(flow) || changed;
  });
  return changed;
}

function cgValidateFlowAddressConfig(flow, steps) {
  const errors = [];
  const nums = cgGetFlowStepNumbers(steps || []);
  nums.invalid.forEach(function(id) { errors.push('Invalid step.number in ' + (flow.name || flow.id) + ': ' + id); });
  nums.duplicates.forEach(function(n) { errors.push('Duplicate step.number in ' + (flow.name || flow.id) + ': ' + n); });

  if (cgNormalizeAddressMode(flow) === 'word' && cgGetFlowMaxStepNumber(steps || []) > CG_STEP_WORD_MAX_STEPS) {
    errors.push('Word address mode supports at most 32 steps in ' + (flow.name || flow.id) + '.');
  }

  const sameUnit = cgGetUnitFlowDescriptors(flow.unitId || null).filter(function(other) {
    return other.id !== flow.id;
  });

  if (cgNormalizeAddressMode(flow) === 'bool') {
    const range = cgBoolFlowRange(flow, steps || []);
    sameUnit.forEach(function(other) {
      if (cgNormalizeAddressMode(other) !== 'bool') return;
      const otherRange = cgBoolFlowRange(other, cgGetDiagramSteps(other.id));
      if (cgBoolRangesOverlap(range, otherRange)) {
        errors.push('Bool MR range overlaps with ' + (other.name || other.id) + ': MR' + range.start + '-MR' + range.end + '.');
      }
    });
  } else {
    let own;
    try {
      own = [cgNormalizeWordResource(flow.activeWord || 'DM0'), cgNormalizeWordResource(flow.completeWord || 'DM100')];
    } catch (e) {
      errors.push(e.message || String(e));
      own = [];
    }
    sameUnit.forEach(function(other) {
      if (cgNormalizeAddressMode(other) !== 'word') return;
      let otherWords = [];
      try {
        otherWords = [cgNormalizeWordResource(other.activeWord || 'DM0'), cgNormalizeWordResource(other.completeWord || 'DM100')];
      } catch (e) {
        return;
      }
      if (own.some(function(word) { return otherWords.includes(word); })) {
        errors.push('Word address overlaps with ' + (other.name || other.id) + '.');
      }
    });
  }

  return { valid: errors.length === 0, errors: errors };
}

function cgBuildAddressedStepPayload(step, flow) {
  const addr = resolveStepAddress(step, flow);
  return Object.assign({}, step, {
    execAddress: addr.execAddress,
    doneAddress: addr.doneAddress
  });
}

function cgBuildFlowStepAddressMap(sequenceEntries, flow) {
  const map = {};
  (sequenceEntries || []).forEach(function(entry) {
    if (!entry || !entry.step) return;
    const addr = resolveStepAddress(entry.step, flow || {});
    map[entry.step.id] = {
      exec: addr.execAddress,
      done: addr.doneAddress
    };
  });
  return map;
}

function cgBuildCSharpFlow(diagId) {
  const flow = (((typeof project !== 'undefined' && project.diagrams) || [])).find(function(diag) { return diag.id === diagId; });
  const loaded = typeof loadDiagramData === 'function' ? loadDiagramData(diagId) : null;
  if (!flow || !loaded || !loaded.state) {
    throw new Error('Cannot load diagram data for ' + diagId + '.');
  }
  cgEnsureFlowAddressConfig(flow);
  const validation = cgValidateFlowAddressConfig(flow, loaded.state.steps || []);
  if (!validation.valid) {
    throw new Error(validation.errors.join('\n'));
  }
  const sequence = typeof cgResolveSequence === 'function'
    ? cgResolveSequence(loaded.state)
    : (loaded.state.steps || []).map(function(step) { return { step: step, inTrans: null, outTrans: null }; });
  return {
    id: flow.id,
    name: flow.name || flow.id,
    unitId: flow.unitId || '',
    mode: flow.mode || 'Auto',
    addressMode: flow.addressMode || 'bool',
    addressLayout: flow.addressLayout || cgNormalizeBoolAddressLayout(flow),
    baseMr: flow.baseMr,
    activeWord: flow.activeWord || '',
    completeWord: flow.completeWord || '',
    steps: sequence.map(function(entry) {
      const step = cgBuildAddressedStepPayload(entry.step, flow);
      return {
        id: step.id,
        number: step.number,
        label: step.label || '',
        initial: !!step.initial,
        execAddress: step.execAddress,
        doneAddress: step.doneAddress,
        actions: step.actions || [],
        inTransitionId: entry.inTrans ? entry.inTrans.id : '',
        outTransitionId: entry.outTrans ? entry.outTrans.id : ''
      };
    }),
    transitions: loaded.state.transitions || [],
    connections: loaded.state.connections || [],
    parallels: loaded.state.parallels || [],
    vars: loaded.state.vars || []
  };
}
