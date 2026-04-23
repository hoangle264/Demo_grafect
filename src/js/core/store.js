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
  if (!activeDiagramId) return;
  saveDiagramData(activeDiagramId);
  markModified(activeDiagramId, false);
}
