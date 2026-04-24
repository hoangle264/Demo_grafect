"use strict";

// ═══════════════════════════════════════════════════════════════════════════════
//  RUNTIME DEBUG / PREVIEW
//  Builds runtime plans from actual diagrams without replacing legacy codegen.
// ═══════════════════════════════════════════════════════════════════════════════

function cgRuntimeGetUpstreamDoneRefs(sequenceEntry, state, mrMap) {
  if (!sequenceEntry || !sequenceEntry.inTrans) return [];
  const upstreamSteps = resolveStepsThrough(
    sequenceEntry.inTrans.id,
    'upstream',
    state.connections || [],
    state.steps || [],
    state.parallels || []
  );

  return cgRuntimeDedupeRefs(upstreamSteps.map(function(step) {
    const refs = mrMap[step.id];
    return refs ? refs.done : '';
  }));
}

function cgRuntimeAllocateStepRefs(sequenceEntries, baseMR) {
  const mrMap = {};
  (sequenceEntries || []).forEach(function(sequenceEntry, index) {
    const base = baseMR + index * 2;
    mrMap[sequenceEntry.step.id] = {
      exec: '@MR' + String(base).padStart(3, '0'),
      done: '@MR' + String(base + 1).padStart(3, '0')
    };
  });
  return mrMap;
}

function cgRuntimeBuildDiagramPlan(diagId, baseMR, runtimeOptions) {
  const diagMeta = (project.diagrams || []).find(function(diag) { return diag.id === diagId; });
  const loaded = typeof loadDiagramData === 'function' ? loadDiagramData(diagId) : null;
  if (!diagMeta || !loaded || !loaded.state) {
    throw new Error('Cannot load diagram data for ' + diagId + '.');
  }

  const state = loaded.state;
  const sequenceEntries = cgResolveSequence(state);
  const mrMap = cgRuntimeAllocateStepRefs(sequenceEntries, baseMR);
  const resolverOptions = cgRuntimeBuildResolverOptions(runtimeOptions || {});

  const stepPlans = sequenceEntries.map(function(sequenceEntry) {
    const stepRefs = mrMap[sequenceEntry.step.id] || {};
    const prevDoneRefs = cgRuntimeGetUpstreamDoneRefs(sequenceEntry, state, mrMap);
    return cgBuildStepRuntimePlan(sequenceEntry, Object.assign({}, resolverOptions, {
      vars: state.vars || [],
      unitId: diagMeta.unitId || '',
      mode: diagMeta.mode || 'Auto',
      prevDoneRefs: prevDoneRefs,
      prevDoneRef: prevDoneRefs[0] || '',
      executeBitRef: stepRefs.exec || '',
      doneBitRef: stepRefs.done || ''
    }));
  });

  return {
    diagram: {
      id: diagMeta.id,
      name: diagMeta.name || diagMeta.id,
      mode: diagMeta.mode || 'Auto',
      unitId: diagMeta.unitId || ''
    },
    baseMR: baseMR,
    stepPlans: stepPlans,
    outputBindingPlan: cgBuildOutputBindingPlan(stepPlans)
  };
}

function cgBuildRuntimeDebugPreview(diagIds, previewOptions) {
  const options = previewOptions || {};
  let mrOffset = options.baseMR || 100;

  const diagrams = (diagIds || []).map(function(diagId) {
    const diagramPlan = cgRuntimeBuildDiagramPlan(diagId, mrOffset, options);
    mrOffset += Math.max((diagramPlan.stepPlans || []).length * 2, 2) + 2;
    return diagramPlan;
  });

  const summary = {
    project: project.name || '',
    baseMR: options.baseMR || 100,
    diagrams: diagrams,
    stats: {
      diagramCount: diagrams.length,
      stepCount: diagrams.reduce(function(total, diagramPlan) {
        return total + (diagramPlan.stepPlans || []).length;
      }, 0)
    }
  };

  return {
    code: JSON.stringify(summary, null, 2),
    stats: summary.stats.diagramCount + ' diagram(s) · ' + summary.stats.stepCount + ' runtime step(s) [debug]'
  };
}
