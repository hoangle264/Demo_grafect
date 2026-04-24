"use strict";

// ═══════════════════════════════════════════════════════════════════════════════
//  RUNTIME RESOLVER
//  Resolves one step action into explicit execute/feedback/output facts.
//  This layer is intentionally sequence-agnostic.
// ═══════════════════════════════════════════════════════════════════════════════

function cgRuntimeBuildDeviceInstanceIndex(deviceList) {
  const index = {};
  (deviceList || []).forEach(function(deviceDef) {
    if (!deviceDef || !deviceDef.id) return;
    index[deviceDef.id] = deviceDef;
  });
  return index;
}

function cgRuntimeGetDeviceTypeMeta(typeName, options) {
  const typeMap = options && options.deviceTypeMetaByName;
  if (!typeMap || !typeName) return null;
  return typeMap[typeName] || null;
}

function cgRuntimeGetDeviceInstanceMeta(deviceId, options) {
  const instanceMap = options && options.deviceInstanceMetaById;
  if (!instanceMap || !deviceId) return null;
  return instanceMap[deviceId] || null;
}

function cgRuntimeFindProjectDeviceType(typeName) {
  return (project.devices || []).find(function(deviceType) {
    return deviceType.name === typeName;
  }) || null;
}

function cgRuntimeFindVarByLabel(vars, label) {
  return (vars || []).find(function(variableDef) {
    return variableDef.label === label;
  }) || null;
}

function cgRuntimeFindSignalDef(deviceType, signalName) {
  return (deviceType && deviceType.signals || []).find(function(signalDef) {
    return signalDef.name === signalName;
  }) || null;
}

function cgRuntimeResolveSignalAddress(deviceVar, deviceType, signalName) {
  if (!deviceVar || !deviceVar.signalAddresses || !signalName) return '';
  const signalDef = cgRuntimeFindSignalDef(deviceType, signalName);
  if (!signalDef) return '';
  return deviceVar.signalAddresses[signalDef.id] || '';
}

function cgRuntimeParseActionSymbol(action) {
  const raw = (action && (action.variable || action.address) || '').trim();
  if (!raw) return null;

  if (raw.includes('.')) {
    const dotIndex = raw.indexOf('.');
    return {
      raw: raw,
      deviceId: raw.substring(0, dotIndex),
      signalName: raw.substring(dotIndex + 1)
    };
  }

  return {
    raw: raw,
    deviceId: null,
    signalName: null
  };
}

function cgRuntimeMergeExecuteMeta(typeExecuteMeta, instanceExecuteMeta) {
  if (!typeExecuteMeta && !instanceExecuteMeta) return null;
  return Object.assign({}, typeExecuteMeta || {}, instanceExecuteMeta || {});
}

function cgRuntimeGetExecuteMeta(signalName, deviceTypeMeta, deviceInstanceMeta) {
  const typeExecuteMeta = deviceTypeMeta && deviceTypeMeta.signals && deviceTypeMeta.signals.execute
    ? deviceTypeMeta.signals.execute[signalName]
    : null;

  const instanceExecuteMeta = deviceInstanceMeta && deviceInstanceMeta.signalOverrides && deviceInstanceMeta.signalOverrides.execute
    ? deviceInstanceMeta.signalOverrides.execute[signalName]
    : null;

  return cgRuntimeMergeExecuteMeta(typeExecuteMeta, instanceExecuteMeta);
}

function cgRuntimeGetFeedbackMeta(signalName, deviceTypeMeta, deviceInstanceMeta) {
  const typeFeedbackMeta = deviceTypeMeta && deviceTypeMeta.signals && deviceTypeMeta.signals.feedback
    ? deviceTypeMeta.signals.feedback[signalName]
    : null;

  const instanceFeedbackMeta = deviceInstanceMeta && deviceInstanceMeta.signalOverrides && deviceInstanceMeta.signalOverrides.feedback
    ? deviceInstanceMeta.signalOverrides.feedback[signalName]
    : null;

  return Object.assign({}, typeFeedbackMeta || {}, instanceFeedbackMeta || {});
}

function cgRuntimeResolveFeedbackSignals(deviceVar, deviceType, executeMeta, deviceTypeMeta, deviceInstanceMeta, diagnostics) {
  const feedbackEntries = [];
  const feedbackKeys = [];

  if (Array.isArray(executeMeta && executeMeta.feedbacks)) {
    feedbackKeys.push.apply(feedbackKeys, executeMeta.feedbacks);
  } else if (executeMeta && executeMeta.feedback) {
    feedbackKeys.push(executeMeta.feedback);
  }

  if (!feedbackKeys.length) {
    diagnostics.push({
      level: 'error',
      code: 'missing-feedback-mapping',
      message: 'Action is missing explicit feedback metadata.'
    });
    return feedbackEntries;
  }

  feedbackKeys.forEach(function(feedbackKey) {
    const feedbackMeta = cgRuntimeGetFeedbackMeta(feedbackKey, deviceTypeMeta, deviceInstanceMeta);
    const feedbackAddress = cgRuntimeResolveSignalAddress(deviceVar, deviceType, feedbackKey);
    if (!feedbackAddress) {
      diagnostics.push({
        level: 'error',
        code: 'missing-feedback-address',
        message: 'Cannot resolve address for feedback signal ' + feedbackKey + '.'
      });
    }
    feedbackEntries.push({
      signalKey: feedbackKey,
      address: feedbackAddress || '',
      role: feedbackMeta.role || 'completion',
      required: feedbackMeta.required !== false,
      semantic: feedbackMeta.semantic || ''
    });
  });

  return feedbackEntries;
}

function cgRuntimeResolveOutputBindings(executeAddress, executeMeta, diagnostics) {
  const explicitBindings = Array.isArray(executeMeta && executeMeta.outputBindings)
    ? executeMeta.outputBindings.slice()
    : [];

  if (explicitBindings.length) {
    return explicitBindings.map(function(binding) {
      return {
        physicalOutputRef: binding.physicalOutputRef || binding.address || '',
        bindingMode: binding.bindingMode || 'normal'
      };
    }).filter(function(binding) {
      if (binding.physicalOutputRef) return true;
      diagnostics.push({
        level: 'error',
        code: 'missing-output-binding',
        message: 'Output binding is missing physicalOutputRef.'
      });
      return false;
    });
  }

  if (!executeAddress) {
    diagnostics.push({
      level: 'error',
      code: 'missing-execute-address',
      message: 'Cannot infer output binding because the execute signal has no address.'
    });
    return [];
  }

  return [{
    physicalOutputRef: executeAddress,
    bindingMode: 'normal'
  }];
}

function cgRuntimeResolvePlainAddressAction(action) {
  return {
    status: 'error',
    actionSymbol: (action && (action.variable || action.address)) || '',
    qualifier: (action && action.qualifier) || 'N',
    device: null,
    execute: {
      signalKey: null,
      address: (action && action.address) || ''
    },
    feedbackSignals: [],
    outputBindings: [],
    timeoutMs: 0,
    completionMode: 'all-feedback-on',
    diagnostics: [{
      level: 'error',
      code: 'plain-address-unsupported',
      message: 'Direct PLC address actions are not supported by the explicit runtime resolver without device metadata.'
    }]
  };
}

function cgRuntimeResolveAction(action, vars, options) {
  const diagnostics = [];
  const parsedAction = cgRuntimeParseActionSymbol(action);
  const qualifier = (action && action.qualifier) || 'N';

  if (!parsedAction) {
    return {
      status: 'error',
      actionSymbol: '',
      qualifier: qualifier,
      device: null,
      execute: { signalKey: null, address: '' },
      feedbackSignals: [],
      outputBindings: [],
      timeoutMs: 0,
      completionMode: 'all-feedback-on',
      diagnostics: [{
        level: 'error',
        code: 'missing-action-symbol',
        message: 'Action has no variable or address to resolve.'
      }]
    };
  }

  if (qualifier !== 'N') {
    return {
      status: 'warning',
      actionSymbol: parsedAction.raw,
      qualifier: qualifier,
      device: null,
      execute: { signalKey: parsedAction.signalName, address: '' },
      feedbackSignals: [],
      outputBindings: [],
      timeoutMs: 0,
      completionMode: 'all-feedback-on',
      diagnostics: [{
        level: 'warning',
        code: 'unsupported-qualifier',
        message: 'Runtime resolver currently models qualifier N only.'
      }]
    };
  }

  if (!parsedAction.deviceId || !parsedAction.signalName) {
    return cgRuntimeResolvePlainAddressAction(action);
  }

  const deviceVar = cgRuntimeFindVarByLabel(vars, parsedAction.deviceId);
  if (!deviceVar) {
    return {
      status: 'error',
      actionSymbol: parsedAction.raw,
      qualifier: qualifier,
      device: null,
      execute: { signalKey: parsedAction.signalName, address: '' },
      feedbackSignals: [],
      outputBindings: [],
      timeoutMs: 0,
      completionMode: 'all-feedback-on',
      diagnostics: [{
        level: 'error',
        code: 'missing-device-instance',
        message: 'Cannot find variable-table device instance for ' + parsedAction.deviceId + '.'
      }]
    };
  }

  const deviceType = cgRuntimeFindProjectDeviceType(deviceVar.format || '');
  if (!deviceType) {
    return {
      status: 'error',
      actionSymbol: parsedAction.raw,
      qualifier: qualifier,
      device: {
        id: parsedAction.deviceId,
        kind: null,
        type: deviceVar.format || '',
        label: deviceVar.label || parsedAction.deviceId
      },
      execute: { signalKey: parsedAction.signalName, address: '' },
      feedbackSignals: [],
      outputBindings: [],
      timeoutMs: 0,
      completionMode: 'all-feedback-on',
      diagnostics: [{
        level: 'error',
        code: 'missing-device-type',
        message: 'Cannot find project device type definition for ' + (deviceVar.format || '') + '.'
      }]
    };
  }

  const deviceTypeMeta = cgRuntimeGetDeviceTypeMeta(deviceType.name, options) || {};
  const deviceInstanceMeta = cgRuntimeGetDeviceInstanceMeta(parsedAction.deviceId, options) || {};
  const executeMeta = cgRuntimeGetExecuteMeta(parsedAction.signalName, deviceTypeMeta, deviceInstanceMeta);
  if (!executeMeta) {
    diagnostics.push({
      level: 'error',
      code: 'missing-execute-meta',
      message: 'No explicit execute-to-feedback mapping found for signal ' + parsedAction.signalName + '.'
    });
  }

  const executeAddress = cgRuntimeResolveSignalAddress(deviceVar, deviceType, parsedAction.signalName);
  if (!executeAddress) {
    diagnostics.push({
      level: 'error',
      code: 'missing-execute-address',
      message: 'Cannot resolve address for execute signal ' + parsedAction.signalName + '.'
    });
  }

  const feedbackSignals = executeMeta
    ? cgRuntimeResolveFeedbackSignals(deviceVar, deviceType, executeMeta, deviceTypeMeta, deviceInstanceMeta, diagnostics)
    : [];
  const outputBindings = cgRuntimeResolveOutputBindings(executeAddress, executeMeta || {}, diagnostics);

  const errorCount = diagnostics.filter(function(item) {
    return item.level === 'error';
  }).length;

  return {
    status: errorCount ? 'error' : 'ok',
    actionSymbol: parsedAction.raw,
    qualifier: qualifier,
    device: {
      id: parsedAction.deviceId,
      kind: deviceInstanceMeta.kind || null,
      type: deviceType.name,
      label: deviceVar.label || parsedAction.deviceId
    },
    execute: {
      signalKey: parsedAction.signalName,
      address: executeAddress || ''
    },
    feedbackSignals: feedbackSignals,
    outputBindings: outputBindings,
    timeoutMs: executeMeta && executeMeta.timeoutMs || 0,
    completionMode: executeMeta && executeMeta.completionMode || 'all-feedback-on',
    diagnostics: diagnostics
  };
}
