"use strict";

// ═══════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════
const SW = 160, SH = 48;    // Step width/height (wider)
const TW = 70, TH = 8;      // Transition width/height
const PH = 8;                // Parallel bar height (per line)
const GRID = 20;
const ACT_W = 160;           // Action box width (wider)

// ═══════════════════════════════════════════════════════════
//  PROJECT STATE
// ═══════════════════════════════════════════════════════════
// project, openTabs, activeDiagramId → moved to src/js/modules/store.js

// ── Per-Diagram runtime state ──
let state = { steps:[], transitions:[], parallels:[], connections:[] };
let nextId = 1, nextStepNum = 0;
let viewX=0, viewY=0, viewScale=1;
let snapOn=true;

// ── Interaction ──
let tool='select';
let selIds = new Set();     // multi-select
let dragging=false, dragMap=new Map(); // id -> {dx,dy}
let panning=false, panSX=0, panSY=0;
let connecting=false, connFrom=null; // {id, type, port}
let selBoxing=false, selBoxSX=0, selBoxSY=0;
let resizingBar=null, resizeStartX=0, resizeStartW=0;
let ctxTarget=null;
let renameMode=null; // 'project' | 'diagram:{id}'

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
