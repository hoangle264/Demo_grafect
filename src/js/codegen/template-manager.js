"use strict";

// ═══════════════════════════════════════════════════════════════════════════════
//  TEMPLATE MANAGER — Dynamic .hbs template loader
//
//  Allows users to load custom .hbs files from their computer to override
//  the default code generation templates for any PLC target.
//
//  localStorage keys: custom_tpl_<filename> or registry-backed custom_tpl_uc_*
//
//  Template classification:
//    kv_main.hbs, kv_step.hbs       → KV5500 / KV mnemonic generator
//    auto.hbs, manual.hbs,
//    step-body.hbs, error.hbs,
//    origin.hbs, output.hbs,
//    main-output.hbs                → Unit Config JSON generator
//    st_main.hbs                    → Structured Text generator
//
//  Unit Config templates now use an explicit registry so upload validation,
//  localStorage persistence, partial registration, and UI rendering all use
//  the same source of truth.
// ═══════════════════════════════════════════════════════════════════════════════

const TM_STORAGE_PREFIX = 'custom_tpl_';

const TM_UNIT_CONFIG_TEMPLATE_REGISTRY = [
  {
    id: 'uc.error',
    scope: 'unit-config',
    group: 'sections',
    category: 'section',
    uploadName: 'error.hbs',
    storageKey: 'custom_tpl_uc_error',
    cacheKey: 'error',
    partialName: null,
    bundledSourceType: 'template',
    bundledSourceKey: 'error',
    description: 'Section Error',
    order: 10,
  },
  {
    id: 'uc.manual',
    scope: 'unit-config',
    group: 'sections',
    category: 'section',
    uploadName: 'manual.hbs',
    storageKey: 'custom_tpl_uc_manual',
    cacheKey: 'manual',
    partialName: null,
    bundledSourceType: 'template',
    bundledSourceKey: 'manual',
    description: 'Section Manual',
    order: 20,
  },
  {
    id: 'uc.origin',
    scope: 'unit-config',
    group: 'sections',
    category: 'section',
    uploadName: 'origin.hbs',
    storageKey: 'custom_tpl_uc_origin',
    cacheKey: 'origin',
    partialName: null,
    bundledSourceType: 'template',
    bundledSourceKey: 'origin',
    description: 'Section Origin',
    order: 30,
  },
  {
    id: 'uc.auto',
    scope: 'unit-config',
    group: 'sections',
    category: 'section',
    uploadName: 'auto.hbs',
    storageKey: 'custom_tpl_uc_auto',
    cacheKey: 'auto',
    partialName: null,
    bundledSourceType: 'template',
    bundledSourceKey: 'auto',
    description: 'Section Auto',
    order: 40,
  },
  {
    id: 'uc.mainOutput',
    scope: 'unit-config',
    group: 'sections',
    category: 'section',
    uploadName: 'main-output.hbs',
    storageKey: 'custom_tpl_uc_main_output',
    cacheKey: 'main-output',
    partialName: null,
    bundledSourceType: 'template',
    bundledSourceKey: 'main-output',
    description: 'Section Main Output',
    order: 50,
  },
  {
    id: 'uc.outputLegacy',
    scope: 'unit-config',
    group: 'sections',
    category: 'section',
    uploadName: 'output.hbs',
    storageKey: 'custom_tpl_uc_output',
    cacheKey: 'output',
    partialName: null,
    bundledSourceType: 'template',
    bundledSourceKey: 'output',
    description: 'Legacy Output fallback',
    order: 60,
  },
  {
    id: 'uc.stepBody',
    scope: 'unit-config',
    group: 'sections',
    category: 'partial',
    uploadName: 'step-body.hbs',
    storageKey: 'custom_tpl_uc_step_body',
    cacheKey: null,
    partialName: 'step_body',
    bundledSourceType: 'partial',
    bundledSourceKey: 'step_body',
    description: 'Shared partial for step completion',
    order: 70,
    acceptAliases: ['step_body.hbs'],
  },
  {
    id: 'uc.deviceCylinder',
    scope: 'unit-config',
    group: 'device-partials',
    category: 'partial',
    uploadName: 'cylinder.hbs',
    storageKey: 'custom_tpl_uc_device_cylinder',
    cacheKey: null,
    partialName: 'device_cylinder',
    bundledSourceType: 'partial',
    bundledSourceKey: 'device_cylinder',
    description: 'Device partial for cylinders',
    order: 80,
    acceptAliases: ['devices/cylinder.hbs'],
  },
  {
    id: 'uc.deviceServo',
    scope: 'unit-config',
    group: 'device-partials',
    category: 'partial',
    uploadName: 'servo.hbs',
    storageKey: 'custom_tpl_uc_device_servo',
    cacheKey: null,
    partialName: 'device_servo',
    bundledSourceType: 'partial',
    bundledSourceKey: 'device_servo',
    description: 'Device partial for servos',
    order: 90,
    acceptAliases: ['devices/servo.hbs'],
  },
  {
    id: 'uc.deviceMotor',
    scope: 'unit-config',
    group: 'device-partials',
    category: 'partial',
    uploadName: 'motor.hbs',
    storageKey: 'custom_tpl_uc_device_motor',
    cacheKey: null,
    partialName: 'device_motor',
    bundledSourceType: 'partial',
    bundledSourceKey: 'device_motor',
    description: 'Device partial for motors',
    order: 100,
    acceptAliases: ['devices/motor.hbs'],
  },
  {
    id: 'uc.deviceGeneric',
    scope: 'unit-config',
    group: 'device-partials',
    category: 'partial',
    uploadName: 'generic.hbs',
    storageKey: 'custom_tpl_uc_device_generic',
    cacheKey: null,
    partialName: 'device_generic',
    bundledSourceType: 'partial',
    bundledSourceKey: 'device_generic',
    description: 'Fallback device partial for unknown device kinds',
    order: 110,
    acceptAliases: ['devices/generic.hbs', 'device_generic.hbs'],
  },
];

const TM_LEGACY_ALLOWED_FILES = {
  'kv_main.hbs': 'KV5500 Mnemonic',
  'kv_step.hbs': 'KV5500 step partial',
  'st_main.hbs': 'Structured Text',
};

const TM_REGISTRY_BY_UPLOAD_NAME = Object.create(null);
const TM_REGISTRY_BY_STORAGE_KEY = Object.create(null);
const TM_REGISTRY_UPLOAD_NAMES = new Set();
const TM_REGISTRY_LEGACY_FILENAMES = new Set();
const TM_TEMPLATE_SESSION_ISSUES = Object.create(null);

TM_UNIT_CONFIG_TEMPLATE_REGISTRY.forEach(function(entry) {
  TM_REGISTRY_BY_UPLOAD_NAME[entry.uploadName.toLowerCase()] = entry;
  TM_REGISTRY_BY_STORAGE_KEY[entry.storageKey] = entry;
  TM_REGISTRY_UPLOAD_NAMES.add(entry.uploadName);
  (entry.acceptAliases || []).forEach(function(alias) {
    TM_REGISTRY_BY_UPLOAD_NAME[alias.toLowerCase()] = entry;
    TM_REGISTRY_LEGACY_FILENAMES.add(alias);
  });
});

function tmReadDynamicDevicePartial(info) {
  return info ? localStorage.getItem(info.storageKey) : null;
}

function tmListDynamicDevicePartials() {
  const result = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(TM_STORAGE_PREFIX + 'uc_device_')) continue;
    const templateKey = tmNormalizeDeviceTemplateKey(key.slice((TM_STORAGE_PREFIX + 'uc_device_').length));
    if (!templateKey || ['cylinder', 'servo', 'motor', 'generic'].includes(templateKey)) continue;
    result.push({
      uploadName: 'device_' + templateKey + '.hbs',
      storageKey: key,
      partialName: 'device_' + templateKey,
      templateKey: templateKey,
      description: 'Custom device partial for ' + templateKey
    });
  }
  return result.sort(function(a, b) { return a.uploadName.localeCompare(b.uploadName); });
}

// ─── Public API ───────────────────────────────────────────────────────────────

function tmNormalizeFilename(filename) {
  return String(filename || '').trim().replace(/^.*[\\/]/, '');
}

function tmNormalizeDeviceTemplateKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\.hbs$/i, '')
    .replace(/^device[_-]/i, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function tmGetDynamicDevicePartialInfo(filename) {
  const normalized = tmNormalizeFilename(filename);
  if (!/\.hbs$/i.test(normalized)) return null;
  const base = normalized.replace(/\.hbs$/i, '');
  const rawKey = /^device[_-]/i.test(base) ? base : '';
  if (!rawKey) return null;
  const templateKey = tmNormalizeDeviceTemplateKey(rawKey);
  if (!templateKey || ['cylinder', 'servo', 'motor', 'generic'].includes(templateKey)) return null;
  return {
    uploadName: 'device_' + templateKey + '.hbs',
    storageKey: TM_STORAGE_PREFIX + 'uc_device_' + templateKey,
    partialName: 'device_' + templateKey,
    templateKey: templateKey,
    description: 'Custom device partial for ' + templateKey
  };
}

function tmGetRegistryEntry(filename) {
  const raw = String(filename || '').trim();
  return TM_REGISTRY_BY_UPLOAD_NAME[raw.toLowerCase()] ||
    TM_REGISTRY_BY_UPLOAD_NAME[tmNormalizeFilename(raw).toLowerCase()] ||
    null;
}

function tmGetLegacyStorageKeys(entry) {
  const keys = [TM_STORAGE_PREFIX + entry.uploadName];
  (entry.acceptAliases || []).forEach(function(alias) {
    keys.push(TM_STORAGE_PREFIX + alias);
    keys.push(TM_STORAGE_PREFIX + tmNormalizeFilename(alias));
  });
  return Array.from(new Set(keys));
}

function tmReadRegistryTemplate(entry) {
  if (!entry) return null;
  return localStorage.getItem(entry.storageKey) ||
    tmGetLegacyStorageKeys(entry).map(function(key) {
      return localStorage.getItem(key);
    }).find(Boolean) || null;
}

function tmRemoveRegistryTemplate(entry) {
  if (!entry) return;
  localStorage.removeItem(entry.storageKey);
  tmGetLegacyStorageKeys(entry).forEach(function(key) {
    localStorage.removeItem(key);
  });
}

function tmListRegistryEntries() {
  return TM_UNIT_CONFIG_TEMPLATE_REGISTRY.slice().sort(function(a, b) {
    return a.order - b.order;
  });
}

function tmListTemplateEntries() {
  return tmListRegistryEntries().concat(tmListDynamicDevicePartials().map(function(info) {
    return Object.assign({
      id: 'uc.dynamicDevice.' + info.templateKey,
      scope: 'unit-config',
      group: 'device-partials',
      category: 'partial',
      cacheKey: null,
      bundledSourceType: null,
      bundledSourceKey: null,
      order: 1000
    }, info);
  }));
}

function tmGetRegistryEntryByPartialName(partialName) {
  return tmListTemplateEntries().find(function(entry) {
    return entry.partialName === partialName;
  }) || null;
}

function tmSetTemplateIssue(filename, type, message) {
  const entry = tmGetRegistryEntry(filename);
  const key = entry ? entry.id : tmNormalizeFilename(filename);
  TM_TEMPLATE_SESSION_ISSUES[key] = {
    type: type || 'error',
    message: message || 'Unknown template issue'
  };
}

function tmClearTemplateIssue(filename) {
  const entry = tmGetRegistryEntry(filename);
  const key = entry ? entry.id : tmNormalizeFilename(filename);
  delete TM_TEMPLATE_SESSION_ISSUES[key];
}

function tmGetTemplateIssue(filenameOrEntry) {
  const entry = typeof filenameOrEntry === 'string'
    ? tmGetRegistryEntry(filenameOrEntry)
    : filenameOrEntry;
  const key = entry ? entry.id : tmNormalizeFilename(filenameOrEntry || '');
  return TM_TEMPLATE_SESSION_ISSUES[key] || null;
}

function tmGetBundledTemplateSource(entry) {
  if (!entry) return '';
  if (entry.bundledSourceType === 'template' && typeof UC_TEMPLATE_BUNDLE !== 'undefined') {
    return UC_TEMPLATE_BUNDLE[entry.bundledSourceKey] || '';
  }
  if (entry.bundledSourceType === 'partial' && typeof UC_PARTIAL_BUNDLE !== 'undefined') {
    return UC_PARTIAL_BUNDLE[entry.bundledSourceKey] || '';
  }
  return '';
}

function tmGetActiveTemplateSource(entry) {
  return tmReadTemplateEntry(entry) || tmGetBundledTemplateSource(entry) || '';
}

function tmTemplateUsesPartial(src, partialName) {
  if (!src || !partialName) return false;
  const escaped = String(partialName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const directCall = new RegExp('{{\\s*>\\s*' + escaped + '(?=[\\s}])');
  return directCall.test(String(src));
}

function tmGetPartialConsumerEntries(entry) {
  if (!entry || !entry.partialName) return [];
  const sectionIds = entry.partialName === 'step_body'
    ? ['uc.origin', 'uc.auto']
    : ['uc.mainOutput', 'uc.outputLegacy'];
  return tmListTemplateEntries().filter(function(item) {
    return sectionIds.includes(item.id);
  });
}

function tmGetPartialUsageInfo(entry) {
  if (!entry || entry.category !== 'partial' || !entry.partialName) {
    return { isReferenced: true, message: '' };
  }

  const consumers = tmGetPartialConsumerEntries(entry).filter(function(sectionEntry) {
    return !!tmGetActiveTemplateSource(sectionEntry);
  });

  if (!consumers.length) {
    return { isReferenced: true, message: '' };
  }

  const referencedBy = consumers.filter(function(sectionEntry) {
    return tmTemplateUsesPartial(tmGetActiveTemplateSource(sectionEntry), entry.partialName);
  });

  if (referencedBy.length) {
    return { isReferenced: true, message: '' };
  }

  const consumerNames = consumers.map(function(sectionEntry) {
    return sectionEntry.uploadName;
  }).join(', ');

  return {
    isReferenced: false,
    message: 'Không được template đang hoạt động gọi tới (' + consumerNames + '), nên thay đổi ở đây sẽ không ảnh hưởng code gen.'
  };
}

function tmDeviceNeedsPartial(partialName, tplCtx) {
  if (!partialName || !tplCtx || !Array.isArray(tplCtx.devices)) return false;
  return tplCtx.devices.some(function(dev) {
    return dev && (dev.partialName === partialName || dev.outputPartial === partialName);
  });
}

function tmHasUnknownDeviceFallback(tplCtx) {
  return !!(tplCtx && Array.isArray(tplCtx.devices) && tplCtx.devices.some(function(dev) {
    return dev && dev.usesGenericPartial;
  }));
}

function tmIsRegistryEntryRequired(entry, tplCtx) {
  if (!entry) return false;
  if (entry.id === 'uc.outputLegacy') return false;
  const usageInfo = tmGetPartialUsageInfo(entry);
  if (entry.id === 'uc.deviceGeneric') {
    return usageInfo.isReferenced && tmHasUnknownDeviceFallback(tplCtx);
  }
  if (entry.group === 'device-partials') {
    return usageInfo.isReferenced && tmDeviceNeedsPartial(entry.partialName, tplCtx);
  }
  if (entry.id === 'uc.stepBody') {
    return usageInfo.isReferenced;
  }
  return true;
}

function tmBuildUnitConfigTemplateContext(selectedUnitId) {
  if (typeof cgUCBuildContext !== 'function' || typeof cgUCBuildTemplateContext !== 'function') {
    return null;
  }
  const unitConfig = typeof cgUCGetEffectiveConfig === 'function'
    ? cgUCGetEffectiveConfig(selectedUnitId)
    : UC_UNIT_CONFIG;
  if (!unitConfig) return null;
  const ctx = cgUCBuildContext(unitConfig, selectedUnitId);
  return cgUCBuildTemplateContext(ctx);
}

function tmParseMissingPartialName(message) {
  if (!message) return '';
  const match = String(message).match(/partial\s+([A-Za-z0-9_-]+)\s+could not be found/i);
  return match ? match[1] : '';
}

function tmProbeTemplateRender(entry, tplCtx) {
  const src = tmGetActiveTemplateSource(entry);
  if (!src) return null;
  try {
    Handlebars.compile(src)(tplCtx);
    return null;
  } catch (e) {
    return e && e.message ? e.message : String(e);
  }
}

function tmCreateHealthEntry(entry, tplCtx) {
  const customSrc = tmReadTemplateEntry(entry);
  const bundledSrc = tmGetBundledTemplateSource(entry);
  const issue = tmGetTemplateIssue(entry);
  const usageInfo = tmGetPartialUsageInfo(entry);
  const required = tmIsRegistryEntryRequired(entry, tplCtx);
  const source = customSrc || bundledSrc || '';
  const healthEntry = {
    id: entry.id,
    entry: entry,
    required: required,
    sourceType: customSrc ? 'custom' : 'bundled',
    status: customSrc ? 'Custom' : 'Bundled',
    message: '',
    hasSource: !!source,
  };

  if (!source) {
    healthEntry.status = required ? 'Missing' : 'Bundled';
    healthEntry.message = required ? 'Thiếu template khả dụng cho entry này.' : '';
    return healthEntry;
  }

  const compileErr = tmValidateTemplate(source);
  if (compileErr) {
    healthEntry.status = 'Invalid';
    healthEntry.message = compileErr;
    return healthEntry;
  }

  if (issue) {
    healthEntry.status = issue.type === 'missing' ? 'Missing' : 'Invalid';
    healthEntry.message = issue.message;
  }

  if (!healthEntry.message && usageInfo.message) {
    healthEntry.message = usageInfo.message;
  }

  return healthEntry;
}

function tmGetUnitConfigTemplateHealth(selectedUnitId) {
  const contextError = [];
  let tplCtx = null;
  const effectiveConfig = typeof cgUCGetEffectiveConfig === 'function'
    ? cgUCGetEffectiveConfig(selectedUnitId)
    : UC_UNIT_CONFIG;
  if (effectiveConfig) {
    try {
      tplCtx = tmBuildUnitConfigTemplateContext(selectedUnitId);
    } catch (e) {
      contextError.push(e && e.message ? e.message : String(e));
    }
  }

  const entryMap = Object.create(null);
  const errors = [];
  tmListTemplateEntries().forEach(function(entry) {
    entryMap[entry.id] = tmCreateHealthEntry(entry, tplCtx);
    if ((entryMap[entry.id].status === 'Missing' || entryMap[entry.id].status === 'Invalid') && entryMap[entry.id].required) {
      errors.push(entry.uploadName + ': ' + entryMap[entry.id].message);
    }
  });

  if (!contextError.length && tplCtx && typeof Handlebars !== 'undefined') {
    tmListTemplateEntries().filter(function(entry) {
      return entry.category === 'partial';
    }).forEach(function(entry) {
      const src = tmGetActiveTemplateSource(entry);
      if (src && entry.partialName) {
        Handlebars.registerPartial(entry.partialName, src);
      }
    });

    tmListTemplateEntries().filter(function(entry) {
      return entry.category === 'section' && tmIsRegistryEntryRequired(entry, tplCtx);
    }).forEach(function(entry) {
      const current = entryMap[entry.id];
      if (!current || current.status === 'Invalid' || current.status === 'Missing') return;
      const renderErr = tmProbeTemplateRender(entry, tplCtx);
      if (!renderErr) return;

      const missingPartialName = tmParseMissingPartialName(renderErr);
      if (missingPartialName) {
        const partialEntry = tmGetRegistryEntryByPartialName(missingPartialName);
        if (partialEntry) {
          entryMap[partialEntry.id].status = 'Missing';
          entryMap[partialEntry.id].message = renderErr;
          if (entryMap[partialEntry.id].required) {
            errors.push(partialEntry.uploadName + ': ' + renderErr);
          }
          return;
        }
      }

      current.status = 'Invalid';
      current.message = renderErr;
      errors.push(entry.uploadName + ': ' + renderErr);
    });
  }

  contextError.forEach(function(message) {
    errors.push('Context: ' + message);
  });

  return {
    valid: errors.length === 0,
    entries: tmListTemplateEntries().map(function(entry) { return entryMap[entry.id]; }),
    errors: Array.from(new Set(errors)),
    contextError: contextError,
    hasContext: !!tplCtx,
  };
}

function tmGetHealthEntry(health, entryId) {
  return (health && health.entries || []).find(function(item) {
    return item && item.id === entryId;
  }) || null;
}

function tmRenderHealthSummary(list, health) {
  if (!list || !health) return;
  const box = document.createElement('div');
  const isValid = !!health.valid;
  box.style.cssText = 'margin:0 0 8px 0;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:' +
    (isValid ? 'var(--bg)' : 'rgba(239, 68, 68, 0.08)') + ';';
  const headline = document.createElement('div');
  headline.style.cssText = 'font-size:9px;color:' + (isValid ? 'var(--cyan)' : '#fca5a5') + ';letter-spacing:1px;';
  headline.textContent = isValid ? 'TEMPLATE HEALTH: OK' : 'TEMPLATE HEALTH: BLOCKED';
  box.appendChild(headline);
  if (!isValid) {
    const details = document.createElement('div');
    details.style.cssText = 'margin-top:4px;font-size:9px;color:var(--text2);white-space:pre-wrap;';
    details.textContent = health.errors.slice(0, 4).join('\n');
    box.appendChild(details);
  }
  list.appendChild(box);
}

function tmMigrateLegacyUnitConfigTemplates() {
  tmListRegistryEntries().forEach(function(entry) {
    const stored = localStorage.getItem(entry.storageKey);
    if (stored) return;
    const legacyKey = tmGetLegacyStorageKeys(entry).find(function(key) {
      return localStorage.getItem(key);
    });
    if (!legacyKey) return;
    const src = localStorage.getItem(legacyKey);
    if (!src) return;
    localStorage.setItem(entry.storageKey, src);
    tmGetLegacyStorageKeys(entry).forEach(function(key) {
      localStorage.removeItem(key);
    });
  });
}

/**
 * Return the custom template string stored for the given filename,
 * or null if no custom template has been loaded.
 * @param {string} filename  e.g. 'auto.hbs'
 * @returns {string|null}
 */
function tmGetCustomTemplate(filename) {
  const entry = tmGetRegistryEntry(filename);
  if (entry) return tmReadRegistryTemplate(entry);
  const dynamicInfo = tmGetDynamicDevicePartialInfo(filename);
  if (dynamicInfo) return tmReadDynamicDevicePartial(dynamicInfo);
  return localStorage.getItem(TM_STORAGE_PREFIX + tmNormalizeFilename(filename));
}

/**
 * Save a custom template string for the given filename.
 * @param {string} filename
 * @param {string} src
 */
function tmSetCustomTemplate(filename, src) {
  const entry = tmGetRegistryEntry(filename);
  if (entry) {
    tmRemoveRegistryTemplate(entry);
    localStorage.setItem(entry.storageKey, src);
    return;
  }
  const dynamicInfo = tmGetDynamicDevicePartialInfo(filename);
  if (dynamicInfo) {
    localStorage.setItem(dynamicInfo.storageKey, src);
    return;
  }
  localStorage.setItem(TM_STORAGE_PREFIX + tmNormalizeFilename(filename), src);
}

/**
 * Remove the custom template for the given filename (revert to default).
 * @param {string} filename
 */
function tmResetTemplate(filename) {
  const entry = tmGetRegistryEntry(filename);
  if (entry) {
    tmRemoveRegistryTemplate(entry);
    return;
  }
  const dynamicInfo = tmGetDynamicDevicePartialInfo(filename);
  if (dynamicInfo) {
    localStorage.removeItem(dynamicInfo.storageKey);
    return;
  }
  localStorage.removeItem(TM_STORAGE_PREFIX + tmNormalizeFilename(filename));
}

/**
 * Return a list of all currently loaded custom template filenames.
 * @returns {string[]}
 */
function tmListCustomTemplates() {
  const results = new Set();
  tmListRegistryEntries().forEach(function(entry) {
    if (tmReadRegistryTemplate(entry)) {
      results.add(entry.uploadName);
    }
  });
  tmListDynamicDevicePartials().forEach(function(info) {
    if (tmReadDynamicDevicePartial(info)) results.add(info.uploadName);
  });
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(TM_STORAGE_PREFIX)) continue;
    if (TM_REGISTRY_BY_STORAGE_KEY[key]) continue;
    const filename = key.slice(TM_STORAGE_PREFIX.length);
    if (TM_REGISTRY_UPLOAD_NAMES.has(filename) || TM_REGISTRY_LEGACY_FILENAMES.has(filename)) continue;
    results.add(filename);
  }
  return Array.from(results);
}

function tmListLegacyLoadedTemplates() {
  return tmListCustomTemplates().filter(function(filename) {
    return !tmGetRegistryEntry(filename) && !tmGetDynamicDevicePartialInfo(filename);
  }).sort();
}

function tmIsAcceptedUpload(filename) {
  const normalized = tmNormalizeFilename(filename);
  return !!tmGetRegistryEntry(filename) || !!tmGetDynamicDevicePartialInfo(filename) || !!TM_LEGACY_ALLOWED_FILES[normalized];
}

function tmGetUploadTargetName(filename) {
  const entry = tmGetRegistryEntry(filename);
  if (entry) return entry.uploadName;
  const dynamicInfo = tmGetDynamicDevicePartialInfo(filename);
  return dynamicInfo ? dynamicInfo.uploadName : tmNormalizeFilename(filename);
}

function tmRegisterCustomPartial(filename, src) {
  if (typeof Handlebars === 'undefined') return;
  const entry = tmGetRegistryEntry(filename);
  if (entry && entry.partialName) {
    Handlebars.registerPartial(entry.partialName, src);
    return;
  }
  const dynamicInfo = tmGetDynamicDevicePartialInfo(filename);
  if (dynamicInfo) {
    Handlebars.registerPartial(dynamicInfo.partialName, src);
    return;
  }
  const base = tmNormalizeFilename(filename).replace(/\.hbs$/i, '');
  const partialName = base.replace(/-/g, '_');
  if (base.toLowerCase().includes('body') || base.toLowerCase().includes('partial')) {
    Handlebars.registerPartial(partialName, src);
  }
}

function tmRestoreBundledTemplate(entry) {
  if (!entry) return;
  if (entry.bundledSourceType === 'template' && typeof UC_TEMPLATE_BUNDLE !== 'undefined' && typeof UC_TEMPLATE_CACHE !== 'undefined') {
    const defaultSrc = UC_TEMPLATE_BUNDLE[entry.bundledSourceKey];
    if (defaultSrc) {
      UC_TEMPLATE_CACHE[entry.cacheKey] = Handlebars.compile(defaultSrc);
    } else if (entry.cacheKey) {
      delete UC_TEMPLATE_CACHE[entry.cacheKey];
    }
    return;
  }
  if (entry.bundledSourceType === 'partial' && typeof UC_PARTIAL_BUNDLE !== 'undefined' && entry.partialName) {
    const defaultPartial = UC_PARTIAL_BUNDLE[entry.bundledSourceKey];
    if (defaultPartial) Handlebars.registerPartial(entry.partialName, defaultPartial);
  }
}

function tmCreateManagerRow(name, description, statusText, statusKind, canReset, onReset) {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';

  const nameSpan = document.createElement('span');
  nameSpan.style.cssText = 'font-size:10px;color:var(--cyan);font-family:\'JetBrains Mono\',monospace;min-width:140px;';
  nameSpan.textContent = name;

  const descSpan = document.createElement('span');
  descSpan.style.cssText = 'flex:1;font-size:9px;color:var(--text3);';
  descSpan.textContent = description;

  const statusSpan = document.createElement('span');
  const statusColor = statusKind === 'invalid'
    ? '#fca5a5'
    : statusKind === 'missing'
      ? 'var(--amber)'
      : statusKind === 'custom'
        ? 'var(--amber)'
        : 'var(--text3)';
  statusSpan.style.cssText = 'font-size:9px;color:' + statusColor + ';min-width:58px;text-align:right;';
  statusSpan.textContent = statusText;

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.style.cssText = 'padding:1px 7px;font-size:9px;';
  btn.textContent = '↺ Reset';
  btn.disabled = !canReset;
  btn.addEventListener('click', onReset);

  row.appendChild(nameSpan);
  row.appendChild(descSpan);
  row.appendChild(statusSpan);
  row.appendChild(btn);
  return row;
}

function tmReadTemplateEntry(entry) {
  if (!entry) return null;
  return entry.storageKey && entry.id && entry.id.indexOf('uc.dynamicDevice.') === 0
    ? tmReadDynamicDevicePartial(entry)
    : tmReadRegistryTemplate(entry);
}

function tmRenderRegistryGroup(list, groupKey, title, health) {
  const entries = tmListTemplateEntries().filter(function(entry) {
    return entry.group === groupKey;
  });
  if (!entries.length) return;

  const heading = document.createElement('div');
  heading.style.cssText = 'margin:8px 0 4px 0;font-size:9px;color:var(--text3);letter-spacing:1px;';
  heading.textContent = title;
  list.appendChild(heading);

  entries.forEach(function(entry) {
    const healthEntry = tmGetHealthEntry(health, entry.id);
    const isCustom = !!tmReadTemplateEntry(entry);
    const canReset = isCustom || !!(healthEntry && healthEntry.message);
    const statusText = healthEntry ? healthEntry.status : (isCustom ? 'Custom' : 'Bundled');
    const statusKind = statusText === 'Invalid'
      ? 'invalid'
      : statusText === 'Missing'
        ? 'missing'
        : isCustom
          ? 'custom'
          : 'bundled';
    const desc = healthEntry && healthEntry.message
      ? entry.description + ' — ' + healthEntry.message
      : entry.description;
    list.appendChild(tmCreateManagerRow(
      entry.uploadName,
      desc,
      statusText,
      statusKind,
      canReset,
      function() { tmResetAndRefresh(entry.uploadName); }
    ));
  });
}

function tmRenderLegacyGroup(list) {
  const loaded = tmListLegacyLoadedTemplates();
  if (!loaded.length) return;

  const heading = document.createElement('div');
  heading.style.cssText = 'margin:8px 0 4px 0;font-size:9px;color:var(--text3);letter-spacing:1px;';
  heading.textContent = 'OTHER TEMPLATES';
  list.appendChild(heading);

  loaded.forEach(function(filename) {
    list.appendChild(tmCreateManagerRow(
      filename,
      tmDescribeFile(filename),
      'Custom',
      'custom',
      true,
      function() { tmResetAndRefresh(filename); }
    ));
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Validate that a string is a compilable Handlebars template.
 * Returns null if valid, or an error message string if invalid.
 * @param {string} src
 * @returns {string|null}
 */
function tmValidateTemplate(src) {
  if (typeof Handlebars === 'undefined') return null; // can't validate without Handlebars
  try {
    Handlebars.compile(src);
    return null;
  } catch (e) {
    return e.message || String(e);
  }
}

/**
 * If the filename contains "body" or "partial", register/update the
 * Handlebars partial for that name (derived from the filename without .hbs).
 * @param {string} filename
 * @param {string} src
 */
function tmMaybeRegisterPartial(filename, src) {
  tmRegisterCustomPartial(filename, src);
}

// ─── File loading ─────────────────────────────────────────────────────────────

/**
 * Handle a FileList (from an <input type="file"> change event).
 * Reads each .hbs file using FileReader, validates it, saves to localStorage,
 * and refreshes the Template Manager UI.
 *
 * @param {FileList} files
 */
function tmHandleFileUpload(files) {
  if (!files || !files.length) return;
  Array.from(files).forEach(function(file) {
    const uploadName = tmGetUploadTargetName(file.name);
    if (!file.name.endsWith('.hbs')) return;
    if (!tmIsAcceptedUpload(file.name)) {
      toast('⚠ Không hỗ trợ template: ' + escHtml(file.name));
      return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      const src = e.target.result;
      const err = tmValidateTemplate(src);
      if (err) {
        // Show a safe, truncated error message; log the full message for debugging
        tmSetTemplateIssue(uploadName, 'syntax', err);
        console.warn('[template-manager] syntax error in', uploadName, ':', err);
        toast('⚠ Template "' + escHtml(uploadName) + '" có lỗi cú pháp. Xem console để biết chi tiết.');
        tmRenderManagerList();
        return;
      }
      tmClearTemplateIssue(uploadName);
      tmSetCustomTemplate(uploadName, src);
      tmMaybeRegisterPartial(uploadName, src);
      toast('✓ Đã nạp template: ' + uploadName);
      tmRenderManagerList();
      // Re-apply to UC_TEMPLATE_CACHE so the next preview reflects the change
      tmApplyCustomTemplatesToCache();
      if (typeof cgUpdatePreview === 'function') cgUpdatePreview();
    };
    reader.readAsText(file);
  });
}

// ─── Apply custom templates to cache ─────────────────────────────────────────

/**
 * Apply all custom templates currently in localStorage to:
 *   - UC_TEMPLATE_CACHE (for unit-config generator)
 *   - Handlebars partials
 */
function tmApplyCustomTemplatesToCache() {
  if (typeof Handlebars === 'undefined') return;
  if (typeof UC_TEMPLATE_CACHE === 'undefined') return;

  // Ensure helpers are registered
  if (typeof ucRegisterHandlebarsHelpers === 'function') {
    ucRegisterHandlebarsHelpers();
  }

  tmListRegistryEntries().forEach(function(entry) {
    var src = tmReadRegistryTemplate(entry);
    if (!src) return;

    // Auto-migrate device partials stored with old "../unit." path traversal.
    // In Handlebars, partials do not inherit the caller's context stack, so
    // "../unit." inside a partial always resolves to undefined. The correct
    // path is "unit." (unit is now passed explicitly via hash arg).
    if (entry.partialName && src.indexOf('../unit.') !== -1) {
      src = src.replace(/\.\.\/unit\./g, 'unit.');
      try { localStorage.setItem(entry.storageKey, src); } catch (e) {}
    }

    if (entry.partialName) {
      Handlebars.registerPartial(entry.partialName, src);
    }

    if (entry.cacheKey) {
      try {
        UC_TEMPLATE_CACHE[entry.cacheKey] = Handlebars.compile(src);
      } catch (e) {
        console.warn('[template-manager] compile error for', entry.uploadName, e);
      }
    }
  });

  tmListDynamicDevicePartials().forEach(function(info) {
    var src = tmReadDynamicDevicePartial(info);
    if (!src) return;
    if (src.indexOf('../unit.') !== -1) {
      src = src.replace(/\.\.\/unit\./g, 'unit.');
      try { localStorage.setItem(info.storageKey, src); } catch (e) {}
    }
    Handlebars.registerPartial(info.partialName, src);
  });
}

// ─── UI: Template Manager panel ───────────────────────────────────────────────

/**
 * Render (or re-render) the list of loaded custom templates inside
 * the #tpl-manager-list element.
 */
function tmRenderManagerList() {
  const list = document.getElementById('tpl-manager-list');
  if (!list) return;
  const selectedUnitId = typeof cgUCGetSelectedUnitId === 'function' ? cgUCGetSelectedUnitId() : null;
  const health = tmGetUnitConfigTemplateHealth(selectedUnitId);
  list.innerHTML = '';
  tmRenderHealthSummary(list, health);
  tmRenderRegistryGroup(list, 'sections', 'SECTIONS', health);
  tmRenderRegistryGroup(list, 'device-partials', 'DEVICE PARTIALS', health);
  tmRenderLegacyGroup(list);
}

/**
 * Reset a custom template and refresh the UI + preview.
 * @param {string} filename
 */
function tmResetAndRefresh(filename) {
  const entry = tmGetRegistryEntry(filename);
  tmResetTemplate(filename);
  tmClearTemplateIssue(filename);
  if (entry) tmRestoreBundledTemplate(entry);
  toast('↺ Đã khôi phục template mặc định: ' + tmGetUploadTargetName(filename));
  tmRenderManagerList();
  if (typeof cgUpdatePreview === 'function') cgUpdatePreview();
}

/**
 * Return a human-readable description for a template filename.
 * @param {string} filename
 * @returns {string}
 */
function tmDescribeFile(filename) {
  const entry = tmGetRegistryEntry(filename);
  if (entry) return '→ ' + entry.description;
  const kvFiles = ['kv_main.hbs', 'kv_step.hbs'];
  const stFiles = ['st_main.hbs'];
  if (kvFiles.includes(filename)) return '→ KV5500 Mnemonic';
  if (stFiles.includes(filename)) return '→ Structured Text';
  return '→ Custom';
}

// ─── Small HTML escape helpers ────────────────────────────────────────────────

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

// ─── Boot: apply any templates saved in localStorage on page load ─────────────
// Runs after UC_TEMPLATE_CACHE is available (this script loads after
// templates-bundle.js and unit-config.js in index.html).
(function tmBoot() {
  // Defer until the rest of the page scripts have run.
  // Using a zero-timeout ensures UC_TEMPLATE_CACHE is defined.
  setTimeout(function() {
    tmMigrateLegacyUnitConfigTemplates();
    tmApplyCustomTemplatesToCache();
  }, 0);
})();
