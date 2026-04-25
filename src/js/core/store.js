"use strict";
// ═══════════════════════════════════════════════════════════
//  store.js — Grafcet Studio
//  Project state singleton + localStorage persistence.
//  Must be loaded BEFORE grafcet-studio-v2.js and grafcet-codegen.js.
//
//  NOTE: saveDiagramData / flushState reference runtime globals
//  (state, nextId, nextStepNum, viewX, viewY, viewScale) that are
//  declared in grafcet-studio-v2.js. This is intentional — those are
//  diagram-render globals and belong with the canvas layer. They are
//  only accessed at call-time (not parse-time), so load order is safe.
// ═══════════════════════════════════════════════════════════

// ── Project state ────────────────────────────────────────────
let project = {
  id:'proj-1',
  name:'My Project',
  machineName:'Machine',   // top-level machine name
  units:[],                // [{id, name, open}]
  diagrams:[],             // [{id, name, unitId, folderId (legacy), mode, diagramType, machine, unit}]
  folders:[],              // legacy virtual folders (kept for compat)
  devices:[],              // [{id, name, open, signals:[{id,name,dataType,ioType,address}]}]
  excelVars:[],            // [{label, format, signalAddresses:{...}, comment, _source:'excel'}]
  unitConfig:{}            // {[unitLabel]: {label, unitIndex, originBaseAddr, autoBaseAddr, flags, io}}
};
let openTabs = [];         // [{diagramId}]
let activeDiagramId = null;

// ── Persistence ───────────────────────────────────────────────
function saveProject() {
  try { localStorage.setItem('gf2-project', JSON.stringify(project)); } catch(e){}
}

function saveDiagramData(id, s, nid, nsn, vx, vy, vs) {
  try {
    localStorage.setItem('gf2-diag-'+id, JSON.stringify({
      state:       s   || state,
      nextId:      nid ?? nextId,
      nextStepNum: nsn ?? nextStepNum,
      viewX:       vx  ?? viewX,
      viewY:       vy  ?? viewY,
      viewScale:   vs  ?? viewScale
    }));
  } catch(e){}
}

function loadDiagramData(id) {
  try {
    const raw = localStorage.getItem('gf2-diag-'+id);
    if (raw) return JSON.parse(raw);
  } catch(e){}
  return null;
}

function deleteDiagramData(id) {
  try { localStorage.removeItem('gf2-diag-'+id); } catch(e){}
}

const PROJECT_UNIT_STRUCT_SIGNALS = [
  { id:'originBaseAddr', name:'OriginBase', dataType:'Word', varType:'Var',    comment:'Origin base address' },
  { id:'autoBaseAddr',   name:'AutoBase',   dataType:'Word', varType:'Var',    comment:'Auto base address' },
  { id:'flagOrigin',     name:'OriginFlag', dataType:'Bool', varType:'Var',    comment:'Origin mode flag' },
  { id:'flagAuto',       name:'AutoFlag',   dataType:'Bool', varType:'Var',    comment:'Auto mode flag' },
  { id:'flagManual',     name:'ManualFlag', dataType:'Bool', varType:'Var',    comment:'Manual mode flag' },
  { id:'flagError',      name:'ErrorFlag',  dataType:'Bool', varType:'Var',    comment:'Error flag' },
  { id:'btnStart',       name:'Start',      dataType:'Bool', varType:'Input',  comment:'Start input' },
  { id:'hmiStop',        name:'Stop',       dataType:'Bool', varType:'Input',  comment:'Stop input' },
  { id:'btnReset',       name:'Reset',      dataType:'Bool', varType:'Input',  comment:'Reset input' },
  { id:'eStop',          name:'EStop',      dataType:'Bool', varType:'Input',  comment:'Emergency stop input' },
  { id:'outHomed',       name:'HomeDone',   dataType:'Bool', varType:'Output', comment:'Homed output' }
];

function ensureStructDataType(name, signals, categoryId) {
  if (!name) return false;
  if (!project.devices) project.devices = [];
  if (project.devices.some(function(d) { return d && d.name === name; })) return false;
  project.devices.push({
    id: 'dev-sync-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now(),
    name: name,
    categoryId: categoryId || 'cat-other',
    open: true,
    signals: (signals || []).map(function(sig, idx) {
      return {
        id: sig.id || ('sig-sync-' + idx),
        name: sig.name || sig.id || ('Signal' + (idx + 1)),
        dataType: sig.dataType || 'Bool',
        varType: sig.varType || 'Var',
        comment: sig.comment || 'Auto-synced from Global Variables'
      };
    })
  });
  return true;
}

function syncStructDataFromProjectData() {
  let changed = false;
  const excelVars = project.excelVars || [];
  const unitConfigs = project.unitConfig || {};

  if (
    excelVars.some(function(v) { return v && v.format === 'Cylinder'; }) &&
    !(project.devices || []).some(function(d) { return d && d.name === 'Cylinder'; }) &&
    typeof ucEnsureCylinderDeviceType === 'function'
  ) {
    ucEnsureCylinderDeviceType();
    changed = true;
  }

  if (Object.keys(unitConfigs).length) {
    changed = ensureStructDataType('Unit Station', PROJECT_UNIT_STRUCT_SIGNALS, 'cat-other') || changed;
  }

  excelVars.forEach(function(v) {
    const formatName = (v && v.format || '').trim();
    if (!formatName || formatName === 'Cylinder') return;
    if ((project.devices || []).some(function(d) { return d && d.name === formatName; })) return;

    const signalIds = Object.keys((v && v.signalAddresses) || {});
    const genericSignals = signalIds.map(function(sigId) {
      return {
        id: sigId,
        name: sigId,
        dataType: 'Bool',
        varType: 'Var',
        comment: 'Auto-synced from Global Variables'
      };
    });
    changed = ensureStructDataType(formatName, genericSignals, 'cat-other') || changed;
  });

  return changed;
}

// ── Project load ──────────────────────────────────────────────
function loadProject() {
  try {
    const raw = localStorage.getItem('gf2-project');
    if (raw) {
      project = JSON.parse(raw);
      if (!project.folders)       project.folders = [];
      if (!project.units)         project.units = [];
      if (!project.devices)       project.devices = [];
      if (!project.devCategories) project.devCategories = [];
      if (!project.machineName)   project.machineName = project.name || 'Machine';
      if (!project.excelVars)     project.excelVars = [];
      if (!project.unitConfig)    project.unitConfig = {};
      if (syncStructDataFromProjectData()) {
        saveProject();
      }
      // Migrate old diagrams that have folderId but no unitId
      project.diagrams.forEach(d=>{
        if(!d.mode)        d.mode = 'Auto';
        if(!d.diagramType) d.diagramType = 'Main';
        if(!d.machine)     d.machine = project.machineName;
        if(!d.unit)        d.unit = '';
      });
      const lastId = localStorage.getItem('gf2-active');
      if (lastId && project.diagrams.find(d=>d.id===lastId)) {
        openTab(lastId);
      } else if (project.diagrams.length > 0) {
        openTab(project.diagrams[0].id);
      } else {
        addDiagram(true);
      }
    } else {
      addDiagram(true);
      // Auto-seed standard device templates cho project mới
      addStandardDeviceTemplates();
    }
  } catch(e) { addDiagram(true); }
}

// ── Flush active diagram to localStorage ──────────────────────
function flushState() {
  if (!activeDiagramId || activeDiagramId === '__vars__') return;
  saveDiagramData(activeDiagramId);
  markModified(activeDiagramId, false);
}
