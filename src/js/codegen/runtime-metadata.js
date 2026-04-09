"use strict";

// ═══════════════════════════════════════════════════════════════════════════════
//  RUNTIME METADATA
//  Bridges current project/device definitions into explicit runtime metadata.
//  Explicit config wins; derived conventions are only a compatibility fallback.
// ═══════════════════════════════════════════════════════════════════════════════

function cgRuntimeGuessFeedbackSignalNames(executeSignalName) {
  if (!executeSignalName) return [];

  const results = [];
  if (executeSignalName.endsWith('_SOL')) {
    const stem = executeSignalName.slice(0, -4);
    results.push(stem + '_SNS');
  }
  if (executeSignalName.startsWith('Out_')) {
    const stem = executeSignalName.slice(4);
    results.push('In_' + stem);
    results.push(stem + '_SNS');
  }
  if (executeSignalName.endsWith('_CMD')) {
    const stem = executeSignalName.slice(0, -4);
    results.push(stem + '_FB');
    results.push(stem + '_SNS');
  }

  return Array.from(new Set(results));
}

function cgRuntimeBuildDerivedTypeMeta(deviceType) {
  const executeMeta = {};
  const feedbackMeta = {};
  const signalNames = new Set((deviceType && deviceType.signals || []).map(function(signalDef) {
    return signalDef.name;
  }));

  (deviceType && deviceType.signals || []).forEach(function(signalDef) {
    if (!signalDef || signalDef.varType !== 'Output') return;
    const feedbackCandidates = cgRuntimeGuessFeedbackSignalNames(signalDef.name);
    const matchedFeedback = feedbackCandidates.find(function(candidate) {
      return signalNames.has(candidate);
    });
    if (!matchedFeedback) return;

    executeMeta[signalDef.name] = {
      feedback: matchedFeedback,
      completionMode: 'all-feedback-on'
    };
    feedbackMeta[matchedFeedback] = {
      role: 'completion',
      required: true
    };
  });

  return {
    signals: {
      execute: executeMeta,
      feedback: feedbackMeta
    }
  };
}

function cgRuntimeMergeSignalMeta(baseMeta, overrideMeta) {
  const merged = Object.assign({}, baseMeta || {});
  const overrideSignals = overrideMeta && overrideMeta.signals || {};
  const baseSignals = merged.signals || {};

  merged.signals = {
    execute: Object.assign({}, baseSignals.execute || {}, overrideSignals.execute || {}),
    feedback: Object.assign({}, baseSignals.feedback || {}, overrideSignals.feedback || {})
  };

  return merged;
}

function cgRuntimeBuildDeviceTypeMetaByName(runtimeTypeConfig) {
  const results = {};

  (project.devices || []).forEach(function(deviceType) {
    const explicitMeta = runtimeTypeConfig && runtimeTypeConfig[deviceType.name] || null;
    const derivedMeta = cgRuntimeBuildDerivedTypeMeta(deviceType);
    results[deviceType.name] = explicitMeta
      ? cgRuntimeMergeSignalMeta(derivedMeta, explicitMeta)
      : derivedMeta;
  });

  Object.keys(runtimeTypeConfig || {}).forEach(function(typeName) {
    if (typeName.startsWith('_')) return;
    if (!results[typeName]) {
      results[typeName] = cgRuntimeMergeSignalMeta({}, runtimeTypeConfig[typeName]);
    }
  });

  return results;
}

function cgRuntimeBuildDeviceInstanceMetaById(unitConfig) {
  const results = {};
  const deviceList = (unitConfig && Array.isArray(unitConfig.devices) && unitConfig.devices)
    || (unitConfig && Array.isArray(unitConfig.cylinders) && unitConfig.cylinders)
    || [];

  deviceList.forEach(function(deviceDef, index) {
    if (!deviceDef || !deviceDef.id) return;
    results[deviceDef.id] = Object.assign({
      kind: deviceDef.kind || 'cylinder',
      index: deviceDef.index != null ? deviceDef.index : index,
      signalOverrides: {}
    }, deviceDef);
  });

  return results;
}

function cgRuntimeBuildResolverOptions(runtimeOptions) {
  const options = runtimeOptions || {};
  return {
    deviceTypeMetaByName: cgRuntimeBuildDeviceTypeMetaByName(options.runtimeTypeConfig || null),
    deviceInstanceMetaById: cgRuntimeBuildDeviceInstanceMetaById(options.unitConfig || null)
  };
}
