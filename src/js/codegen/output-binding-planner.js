"use strict";

// ═══════════════════════════════════════════════════════════════════════════════
//  OUTPUT BINDING PLANNER
//  Aggregates step execute bits by physical output with OR semantics.
// ═══════════════════════════════════════════════════════════════════════════════

function cgBuildOutputBindingPlan(stepRuntimePlans) {
  const bindingMap = {};
  const diagnostics = [];

  (stepRuntimePlans || []).forEach(function(stepPlan) {
    if (!stepPlan || !stepPlan.executeBitRef) return;

    (stepPlan.outputBindings || []).forEach(function(binding) {
      if (!binding || !binding.physicalOutputRef) {
        diagnostics.push({
          level: 'warning',
          code: 'missing-physical-output-ref',
          message: 'Skipped output binding without physicalOutputRef.'
        });
        return;
      }

      const physicalOutputRef = binding.physicalOutputRef;
      if (!bindingMap[physicalOutputRef]) {
        bindingMap[physicalOutputRef] = {
          physicalOutputRef: physicalOutputRef,
          sourceExecuteBitRefs: [],
          sourceSteps: [],
          aggregationMode: 'OR'
        };
      }

      const outputPlan = bindingMap[physicalOutputRef];
      if (!outputPlan.sourceExecuteBitRefs.includes(stepPlan.executeBitRef)) {
        outputPlan.sourceExecuteBitRefs.push(stepPlan.executeBitRef);
      }
      if (!outputPlan.sourceSteps.includes(stepPlan.stepId)) {
        outputPlan.sourceSteps.push(stepPlan.stepId);
      }
    });
  });

  return {
    bindings: Object.keys(bindingMap).sort().map(function(key) {
      return bindingMap[key];
    }),
    diagnostics: diagnostics
  };
}

function cgRenderOutputBindingPlan(bindingPlan) {
  const lines = [];
  (bindingPlan && bindingPlan.bindings || []).forEach(function(binding) {
    (binding.sourceExecuteBitRefs || []).forEach(function(executeBitRef, index) {
      const instruction = index === 0 ? 'LD   ' : 'OR   ';
      lines.push(instruction + executeBitRef);
    });
    lines.push('OUT  ' + binding.physicalOutputRef);
    lines.push('');
  });
  return lines;
}
