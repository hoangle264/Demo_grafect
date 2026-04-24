"use strict";

// ═══════════════════════════════════════════════════════════════════════════════
//  STEP RUNTIME PLANNER
//  Combines sequence facts with one-step execution facts.
// ═══════════════════════════════════════════════════════════════════════════════

function cgRuntimeDedupeRefs(refList) {
  const seen = new Set();
  const results = [];
  (refList || []).forEach(function(ref) {
    if (!ref || seen.has(ref)) return;
    seen.add(ref);
    results.push(ref);
  });
  return results;
}

function cgRuntimeResolveConditionRef(condition, vars) {
  const raw = String(condition || '').trim();
  if (!raw || raw === '1' || raw.toLowerCase() === 'true') return '';

  if (typeof cgResolveAddrFull === 'function') {
    return cgResolveAddrFull(raw, vars) || raw;
  }

  return raw;
}

function cgRuntimeNormalizeActions(step) {
  if (typeof getStepActions === 'function') {
    return getStepActions(step);
  }
  return Array.isArray(step && step.actions) ? step.actions : [];
}

function cgBuildStepRuntimePlan(sequenceEntry, planOptions) {
  const options = planOptions || {};
  const step = sequenceEntry && sequenceEntry.step || null;
  const vars = options.vars || [];
  const diagnostics = [];
  const prevDoneRefs = cgRuntimeDedupeRefs(options.prevDoneRefs || (options.prevDoneRef ? [options.prevDoneRef] : []));

  if (!step) {
    return {
      validation: {
        status: 'error',
        errors: ['Missing step in sequence entry.'],
        warnings: []
      },
      diagnostics: [{
        level: 'error',
        code: 'missing-step',
        message: 'Sequence entry does not contain a step.'
      }]
    };
  }

  const actions = cgRuntimeNormalizeActions(step).filter(function(action) {
    return ((action && action.qualifier) || 'N') === 'N' && (action.variable || action.address);
  });

  const resolverResults = actions.map(function(action) {
    return cgRuntimeResolveAction(action, vars, options);
  });

  resolverResults.forEach(function(result) {
    (result.diagnostics || []).forEach(function(item) {
      diagnostics.push(item);
    });
  });

  if (!resolverResults.length) {
    diagnostics.push({
      level: 'warning',
      code: 'no-runtime-actions',
      message: 'Step has no qualifier N actions for runtime planning.'
    });
  }

  const feedbackRefs = cgRuntimeDedupeRefs(
    resolverResults.flatMap(function(result) {
      return (result.feedbackSignals || [])
        .filter(function(signal) { return signal.required !== false; })
        .map(function(signal) { return signal.address; });
    })
  );

  const outputBindings = [];
  resolverResults.forEach(function(result) {
    (result.outputBindings || []).forEach(function(binding) {
      if (!binding.physicalOutputRef) return;
      const exists = outputBindings.find(function(existing) {
        return existing.physicalOutputRef === binding.physicalOutputRef;
      });
      if (exists) return;
      outputBindings.push({
        physicalOutputRef: binding.physicalOutputRef,
        bindingMode: binding.bindingMode || 'normal',
        sourceExecuteBitRef: options.executeBitRef || ''
      });
    });
  });

  const errors = diagnostics.filter(function(item) {
    return item.level === 'error';
  }).map(function(item) {
    return item.message;
  });
  const warnings = diagnostics.filter(function(item) {
    return item.level === 'warning';
  }).map(function(item) {
    return item.message;
  });

  return {
    stepId: step.id,
    stepNumber: step.number,
    stepLabel: step.label || '',
    unitId: options.unitId || '',
    mode: options.mode || '',
    prevDoneRefs: prevDoneRefs,
    prevDoneRef: prevDoneRefs[0] || '',
    transitionRef: options.transitionRef || cgRuntimeResolveConditionRef(sequenceEntry && sequenceEntry.inTrans && sequenceEntry.inTrans.condition, vars),
    executeBitRef: options.executeBitRef || '',
    doneBitRef: options.doneBitRef || '',
    resolverResults: resolverResults,
    feedbackRefs: feedbackRefs,
    feedbackAggregation: options.feedbackAggregation || 'AND',
    outputBindings: outputBindings,
    validation: {
      status: errors.length ? 'error' : (warnings.length ? 'warning' : 'ok'),
      errors: errors,
      warnings: warnings
    },
    diagnostics: diagnostics
  };
}

function cgBuildStepRuntimePlans(sequenceEntries, planOptions) {
  return (sequenceEntries || []).map(function(sequenceEntry, index) {
    const options = Object.assign({}, planOptions || {});
    if (Array.isArray(options.stepRefs)) {
      const refs = options.stepRefs[index] || {};
      options.prevDoneRefs = refs.prevDoneRefs || options.prevDoneRefs;
      options.prevDoneRef = refs.prevDoneRef || options.prevDoneRef;
      options.transitionRef = refs.transitionRef || options.transitionRef;
      options.executeBitRef = refs.executeBitRef || options.executeBitRef;
      options.doneBitRef = refs.doneBitRef || options.doneBitRef;
    }
    return cgBuildStepRuntimePlan(sequenceEntry, options);
  });
}
