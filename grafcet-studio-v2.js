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
// ═══════════════════════════════════════════════════════════
//  ACTION QUALIFIERS — IEC 61131-3
// ═══════════════════════════════════════════════════════════
const ACT_QUALIFIERS = ['N','S','R','P','P0','L','D','SD','DS','SL'];
const ACT_QUAL_COLORS = {
  N:'#4fa3e3', S:'#39d353', R:'#e35a4f', P:'#f5a623',
  P0:'#f5a623', L:'#22d3ee', D:'#a78bfa', SD:'#39d353',
  DS:'#a78bfa', SL:'#22d3ee'
};
const ACT_TIME_NEEDED = new Set(['L','D','SD','DS','SL']);

// Get actions as [{qualifier,variable,address,time}] array
// Supports both old string format and new structured format
function getStepActions(s) {
  if(!s) return [];
  if(Array.isArray(s.actions)) return s.actions;
  // Migrate old text format: each line = "N VarName" or just "VarName"
  if(typeof s.actions === 'string' && s.actions.trim()) {
    return s.actions.split('\n').filter(l=>l.trim()).map(line=>{
      const parts = line.trim().split(/\s+/);
      const q = ACT_QUALIFIERS.includes(parts[0]) ? parts[0] : 'N';
      const v = ACT_QUALIFIERS.includes(parts[0]) ? parts.slice(1).join(' ') : line.trim();
      return {qualifier:q, variable:v, address:'', time:''};
    });
  }
  return [];
}

// Render the action editor in the right panel
function renderActEditor(s) {
  const list = document.getElementById('act-list');
  if(!list) return;
  list.innerHTML='';
  const acts = getStepActions(s);
  updateVarDatalist();
  acts.forEach((act,i)=>{
    list.appendChild(makeActRow(act, i, s.id));
  });
}

function updateVarDatalist() {
  const dl = document.getElementById('var-datalist');
  if(!dl) return;
  dl.innerHTML='';
  // Collect vars from ALL diagrams in the project (global scope)
  const seen = new Set();
  const addVar = (v, unitName) => {
    const suffix = unitName ? ` [${unitName}]` : '';
    if(v.label && !seen.has('lbl:'+v.label)){
      seen.add('lbl:'+v.label);
      const o=document.createElement('option');
      o.value=v.label;
      o.label=(v.address?v.address+' | ':'')+v.comment+suffix;
      dl.appendChild(o);
    }
    if(v.address && !seen.has('addr:'+v.address)){
      seen.add('addr:'+v.address);
      const o=document.createElement('option');
      o.value=v.address;
      o.label=(v.label?v.label+' | ':'')+v.comment+suffix;
      dl.appendChild(o);
    }
    // For device type instances: add per-signal addresses too
    if(v.signalAddresses){
      const devType=(project.devices||[]).find(d=>d.name===(v.format||''));
      if(devType){
        (devType.signals||[]).forEach(sig=>{
          const addr=v.signalAddresses[sig.id];
          const sigLabel=(v.label||'?')+'.'+sig.name;
          if(sigLabel && !seen.has('lbl:'+sigLabel)){
            seen.add('lbl:'+sigLabel);
            const o=document.createElement('option');
            o.value=sigLabel;
            o.label=(addr?addr+' | ':'')+sig.comment+suffix;
            dl.appendChild(o);
          }
          if(addr && !seen.has('addr:'+addr)){
            seen.add('addr:'+addr);
            const o=document.createElement('option');
            o.value=addr;
            o.label=(sigLabel?sigLabel+' | ':'')+sig.comment+suffix;
            dl.appendChild(o);
          }
        });
      }
    }
  };

  // Current diagram first (highest priority)
  getVars().forEach(v => addVar(v, ''));

  // All other diagrams
  (project.diagrams||[]).forEach(diag => {
    if(diag.id === activeDiagramId) return; // already added above
    const raw = loadDiagramData(diag.id);
    if(!raw?.state?.vars) return;
    const unitName = diag.unit || diag.name || '';
    raw.state.vars.forEach(v => addVar(v, unitName));
  });
}

function makeActRow(act, idx, stepId) {
  const row = document.createElement('div');
  row.className = 'act-row';
  row.dataset.idx = idx;

  // Qualifier select
  const qSel = document.createElement('select');
  qSel.className = 'act-qual';
  qSel.title = 'Action qualifier';
  ACT_QUALIFIERS.forEach(q=>{
    const o=document.createElement('option'); o.value=q; o.textContent=q;
    if(q===act.qualifier) o.selected=true;
    qSel.appendChild(o);
  });
  qSel.style.color = ACT_QUAL_COLORS[act.qualifier||'N'];
  qSel.addEventListener('change', ()=>{
    qSel.style.color = ACT_QUAL_COLORS[qSel.value];
    timeInp.classList.toggle('visible', ACT_TIME_NEEDED.has(qSel.value));
    saveActRow(stepId);
  });
  row.appendChild(qSel);

  // Variable input with datalist
  const vInp = document.createElement('input');
  vInp.type='text'; vInp.className='act-var';
  vInp.value = act.variable || act.address || '';
  vInp.placeholder = 'variable / address';
  vInp.setAttribute('list','var-datalist');
  vInp.setAttribute('autocomplete','off');
  vInp.addEventListener('input', ()=>saveActRow(stepId));
  vInp.addEventListener('keydown', e=>{
    if(e.key==='Enter'){ e.preventDefault(); actAddRow(); }
    if(e.key==='Delete'&&e.ctrlKey){ e.preventDefault(); actDelRow(stepId,idx); }
  });
  row.appendChild(vInp);

  // Time input (for L/D/SD/DS/SL)
  const timeInp = document.createElement('input');
  timeInp.type='text'; timeInp.className='act-time';
  timeInp.value=act.time||''; timeInp.placeholder='t#500ms';
  if(ACT_TIME_NEEDED.has(act.qualifier)) timeInp.classList.add('visible');
  timeInp.addEventListener('input', ()=>saveActRow(stepId));
  row.appendChild(timeInp);

  // Delete button
  const del = document.createElement('button');
  del.className='act-del'; del.textContent='✕'; del.title='Remove (Ctrl+Del)';
  del.addEventListener('click', ()=>actDelRow(stepId, idx));
  row.appendChild(del);

  // Attach refs for saveActRow
  row._qSel=qSel; row._vInp=vInp; row._timeInp=timeInp;
  return row;
}

function saveActRow(stepId) {
  const s = state.steps.find(x=>x.id===stepId);
  if(!s) return;
  const rows = document.querySelectorAll('#act-list .act-row');
  const acts = [];
  rows.forEach(row=>{
    const q=row._qSel?.value||'N';
    const v=row._vInp?.value||'';
    const t=row._timeInp?.value||'';
    // Resolve address: check if v is a label or address from var table
    const vars=getVars();
    const byLabel=vars.find(x=>x.label&&x.label===v);
    const byAddr=vars.find(x=>x.address&&x.address===v);
    acts.push({
      qualifier:q,
      variable: byLabel?byLabel.label : byAddr?byAddr.label||v : v,
      address:  byLabel?byLabel.address : byAddr?byAddr.address : '',
      time:     t
    });
  });
  s.actions = acts;
  afterChange();
}

function actAddRow() {
  const id=[...selIds][0]; if(!id) return;
  const s=state.steps.find(x=>x.id===id); if(!s) return;
  const acts=getStepActions(s);
  acts.push({qualifier:'N',variable:'',address:'',time:''});
  s.actions=acts; afterChange();
  // Re-render and focus last input
  renderActEditor(s);
  setTimeout(()=>{
    const rows=document.querySelectorAll('#act-list .act-row');
    if(rows.length){ const last=rows[rows.length-1]; const inp=last.querySelector('.act-var'); if(inp)inp.focus(); }
  },30);
}

function actDelRow(stepId, idx) {
  const s=state.steps.find(x=>x.id===stepId); if(!s) return;
  const acts=getStepActions(s);
  acts.splice(idx,1); s.actions=acts; afterChange();
  renderActEditor(s);
}

// ═══════════════════════════════════════════════════════════
//  PANEL TOGGLE
// ═══════════════════════════════════════════════════════════
const PANEL_KEY = 'gf2-panels';
let panelState = { sidebar:true, rpanel:true, proj:true, tools:true };

function loadPanelState() {
  try { const s=JSON.parse(localStorage.getItem(PANEL_KEY)||'{}'); Object.assign(panelState,s); } catch(e){}
}
function savePanelState() {
  try { localStorage.setItem(PANEL_KEY, JSON.stringify(panelState)); } catch(e){}
}

function applyPanelState() {
  // Sidebar
  const sb = document.getElementById('sidebar');
  const stb = document.getElementById('sidebar-toggle-btn');
  sb.classList.toggle('panel-closed', !panelState.sidebar);
  if(stb) stb.textContent = panelState.sidebar ? '◀' : '▶';

  // Sub panels
  ['proj','tools'].forEach(id=>{
    const sp = document.getElementById('sub-'+id);
    const pb = document.getElementById('pin-'+id);
    if(sp) sp.classList.toggle('sub-closed', !panelState[id]);
    if(pb) {
      pb.classList.toggle('pinned', panelState[id]);
      pb.textContent = panelState[id] ? '📌' : '📍';
      pb.title = panelState[id] ? 'Collapse section' : 'Expand section';
    }
  });

  // Right panel
  const rp = document.getElementById('right-panel');
  const rpb = document.getElementById('pin-rpanel');
  rp.classList.toggle('panel-closed', !panelState.rpanel);
  if(rpb) {
    rpb.classList.toggle('pinned', panelState.rpanel);
    rpb.textContent = panelState.rpanel ? '📌' : '📍';
    rpb.title = panelState.rpanel ? 'Collapse' : 'Expand';
  }
  drawGrid();
}

function toggleSidebar() {
  panelState.sidebar = !panelState.sidebar;
  savePanelState(); applyPanelState();
}

// ─── Sidebar bottom-tab switcher ───
function switchSidebarTab(tab) {
  // panels
  document.getElementById('sidebar-panel-proj').classList.toggle('active', tab === 'proj');
  document.getElementById('sidebar-panel-tools').classList.toggle('active', tab === 'tools');
  // tab buttons
  const tabProj  = document.getElementById('stab-proj');
  const tabTools = document.getElementById('stab-tools');
  tabProj.classList.toggle('active',  tab === 'proj');
  tabTools.classList.toggle('active', tab === 'tools');
  // ensure sidebar is open
  if(panelState.sidebar === false) { panelState.sidebar = true; savePanelState(); applyPanelState(); }
}
function toggleRPanel() {
  panelState.rpanel = !panelState.rpanel;
  savePanelState(); applyPanelState();
}
function toggleSubPanel(id) {
  panelState[id] = !panelState[id];
  savePanelState(); applyPanelState();
}
function pinSubPanel(id, e) {
  if(e) e.stopPropagation();
  toggleSubPanel(id);
}

function init() {
  loadPanelState();
  loadProject();
  drawGrid();
  renderTabs();
  renderTree();
  applyPanelState();
  window.addEventListener('resize', ()=>{ drawGrid(); miniMap(); });
  document.addEventListener('keydown', onKey);
  document.addEventListener('click', e=>{ if(!e.target.closest('#ctx')) hideCtx(); });
  const cw = document.getElementById('canvas-wrap');
  cw.addEventListener('wheel', onWheel, {passive:false});
  applyView();
}

// esc2() and esc() → moved to src/js/modules/utils.js

// ═══════════════════════════════════════════════════════════
//  PROJECT MANAGEMENT
//  loadProject / saveProject / saveDiagramData / loadDiagramData /
//  deleteDiagramData / flushState → moved to src/js/modules/store.js
// ═══════════════════════════════════════════════════════════

function addDiagram(isFirst=false, unitId=null, mode='Auto', folderId=null) {
  const id = 'diag-'+Date.now();
  const num = project.diagrams.length + 1;
  const unit = unitId ? (project.units.find(u=>u.id===unitId)?.name||'') : '';
  const name = isFirst ? 'GRAFCET_Main' : `GRAFCET_${mode}`;
  project.diagrams.push({
    id, name, folderId: folderId||null, unitId: unitId||null,
    mode: mode||'Auto', diagramType:'Main',
    machine: project.machineName||project.name||'Machine',
    unit: unit, description:''
  });
  const emptyState = {steps:[],transitions:[],parallels:[],connections:[],vars:[]};
  if (isFirst) { createSample(id); }
  else { saveDiagramData(id, emptyState, 1, 0, 100, 80, 1); }
  saveProject(); renderTree(); openTab(id);
}

function createSample(id) {
  // Add a sample unit if none exists
  if(!project.units) project.units=[];
  if(!project.machineName) project.machineName='Machine';
  let sampleUnit = project.units[0];
  if(!sampleUnit){
    sampleUnit={id:'unit-sample',name:'Unit_01_Sample',open:true};
    project.units.push(sampleUnit);
  }
  // Set metadata on this diagram
  const d = project.diagrams.find(x=>x.id===id);
  if(d){
    d.unitId=sampleUnit.id; d.mode='Auto'; d.diagramType='Main';
    d.machine=project.machineName; d.unit=sampleUnit.name; d.name='GRAFCET_Auto';
  }
  const s = {
    steps: [
      {id:'S1',x:200,y:60,number:0,label:'INIT',actions:[],initial:true},
      {id:'S2',x:200,y:180,number:1,label:'RUN',actions:[{qualifier:'N',variable:'Motor_FWD',address:'%QX0.0',time:''},{qualifier:'S',variable:'Output_001',address:'%QX0.1',time:''}],initial:false},
      {id:'S3',x:200,y:320,number:2,label:'STOP',actions:[{qualifier:'R',variable:'Motor_FWD',address:'%QX0.0',time:''},{qualifier:'N',variable:'Brake_ON',address:'%QX0.2',time:''}],initial:false},
    ],
    transitions: [
      {id:'T1',x:185,y:136,condition:'start',label:''},
      {id:'T2',x:185,y:276,condition:'limit_SW',label:''},
      {id:'T3',x:185,y:376,condition:'reset',label:''},
    ],
    parallels: [],
    connections: [
      {id:'C1',from:'S1',fromPort:'bottom',to:'T1',toPort:'top'},
      {id:'C2',from:'T1',fromPort:'bottom',to:'S2',toPort:'top'},
      {id:'C3',from:'S2',fromPort:'bottom',to:'T2',toPort:'top'},
      {id:'C4',from:'T2',fromPort:'bottom',to:'S3',toPort:'top'},
      {id:'C5',from:'S3',fromPort:'bottom',to:'T3',toPort:'top'},
      {id:'C6',from:'T3',fromPort:'bottom',to:'S1',toPort:'top'},
    ],
    vars:[
      {label:'Motor_FWD',format:'BOOL',address:'%QX0.0',comment:'Motor forward output'},
      {label:'Output_001',format:'BOOL',address:'%QX0.1',comment:'Output 1'},
      {label:'Brake_ON',format:'BOOL',address:'%QX0.2',comment:'Brake solenoid'},
      {label:'start',format:'BOOL',address:'%IX0.0',comment:'Start button'},
      {label:'limit_SW',format:'BOOL',address:'%IX0.1',comment:'Limit switch'},
      {label:'reset',format:'BOOL',address:'%IX0.2',comment:'Reset button'},
    ]
  };
  saveDiagramData(id, s, 10, 3, 60, 40, 1);
}

// deleteDiagramData → moved to src/js/modules/store.js

function openTab(id) {
  // Flush current state if active
  if (activeDiagramId) flushState();
  // Check if already open
  if (!openTabs.find(t=>t.id===id)) openTabs.push({id});
  activeDiagramId = id;
  localStorage.setItem('gf2-active', id);
  // Load diagram data
  const data = loadDiagramData(id);
  if (data) {
    state = data.state;
    // Migrate old format
    if (!state.parallels) state.parallels = [];
    if (!state.vars) state.vars = [];
    nextId = data.nextId || 1;
    nextStepNum = data.nextStepNum || 0;
    viewX = data.viewX ?? 60;
    viewY = data.viewY ?? 40;
    viewScale = data.viewScale ?? 1;
  } else {
    state = {steps:[],transitions:[],parallels:[],connections:[],vars:[]};
    nextId=1; nextStepNum=0; viewX=60; viewY=40; viewScale=1;
  }
  selIds.clear();
  renderTabs();
  renderTree();
  applyView();
  render();
  renderVarTable();
  vtSelRows.clear();
  updateVtDelBtn();
}

function closeTab(id, e) {
  if (e) e.stopPropagation();
  if (activeDiagramId === id) flushState();
  openTabs = openTabs.filter(t=>t.id!==id);
  if (activeDiagramId === id) {
    if (openTabs.length > 0) openTab(openTabs[openTabs.length-1].id);
    else { activeDiagramId=null; state={steps:[],transitions:[],parallels:[],connections:[],vars:[]}; render(); renderTabs(); renderVarTable(); }
  } else renderTabs();
}

// flushState → moved to src/js/modules/store.js

function saveDiagram() {
  if (!activeDiagramId) return;
  flushState();
  toast('✓ Saved');
}

function markModified(id, yes=true) {
  // Update tab UI
  const tab = document.querySelector(`.tab[data-id="${id}"]`);
  if (tab) tab.classList.toggle('modified', yes);
  const ti = document.querySelector(`.tree-item[data-id="${id}"]`);
  if (ti) ti.classList.toggle('modified', yes);
}

// ═══════════════════════════════════════════════════════════
//  RENDER TABS & TREE
// ═══════════════════════════════════════════════════════════
function renderTabs() {
  const bar = document.getElementById('tabs-bar');
  bar.innerHTML = '';
  openTabs.forEach(t => {
    const diag = project.diagrams.find(d=>d.id===t.id);
    if (!diag) return;
    const tab = document.createElement('div');
    tab.className = 'tab' + (t.id===activeDiagramId?' active':'');
    tab.dataset.id = t.id;
    tab.innerHTML = `<span class="tab-name">${diag.name}</span>${diag.mode?`<span style="font-size:8px;color:var(--text3);margin-left:2px;">[${diag.mode}]</span>`:''}<button class="tab-close" onclick="closeTab('${t.id}',event)">×</button>`;
    tab.addEventListener('click', e=>{ if(!e.target.classList.contains('tab-close')) openTab(t.id); });
    tab.addEventListener('dblclick', e=>{ if(!e.target.classList.contains('tab-close')) renameCurrentDiagram(t.id); });
    bar.appendChild(tab);
  });
  const addBtn = document.createElement('button');
  addBtn.className = 'tab-new'; addBtn.textContent = '＋'; addBtn.title = 'New Diagram';
  addBtn.onclick = ()=>addDiagram();
  bar.appendChild(addBtn);
}

function renderTree() {
  const body = document.getElementById('tree-body');
  body.innerHTML = '';
  if (!project.folders) project.folders = [];
  if (!project.units) project.units = [];
  if (!project.devices) project.devices = [];

  // ── Machine name header ──
  const machineRow = document.createElement('div');
  machineRow.className = 'tree-machine';
  machineRow.innerHTML = `
    <span style="font-size:11px;">🏭</span>
    <span class="tree-machine-name">${esc2(project.machineName||project.name)}</span>
    <button class="tree-machine-edit" onclick="renameMachine()" title="Rename machine">✎</button>`;
  body.appendChild(machineRow);

  // ── Devices section (global device type declarations) ──
  const devSection = makeDevicesSection();
  body.appendChild(devSection);

  // ── Units ──
  project.units.forEach(u=>{
    const unitEl = makeUnitItem(u);
    body.appendChild(unitEl);
  });

  // ── Orphan diagrams (no unit) — legacy or unassigned ──
  const orphans = project.diagrams.filter(d=>!d.unitId && d.mode!=='Drivers');
  if(orphans.length){
    const orphanHead = document.createElement('div');
    orphanHead.style.cssText='padding:4px 8px;font-size:8px;color:var(--text3);letter-spacing:1px;border-top:1px solid var(--border);';
    orphanHead.textContent='─ UNASSIGNED';
    body.appendChild(orphanHead);
    orphans.forEach(d=>body.appendChild(makeDiagItem(d)));
  }

  // ── Drivers section (ActiveDevices — mode='Drivers') ──
  body.appendChild(makeDriversSection());

  document.getElementById('project-name-display').textContent = project.name;
  updateAlignBtns();
}

function makeUnitItem(u) {
  const wrap = document.createElement('div');
  wrap.className = 'tree-unit'; wrap.dataset.unitId = u.id;
  const isOpen = u.open !== false;
  const diagsInUnit = project.diagrams.filter(d=>d.unitId===u.id);

  const head = document.createElement('div');
  head.className = 'tree-unit-head';
  head.innerHTML = `
    <span class="tree-unit-toggle ${isOpen?'open':'closed'}">▾</span>
    <span class="tree-unit-icon">📦</span>
    <span class="tree-unit-name">${esc2(u.name)}</span>
    <div class="tree-unit-actions">
      <button class="tree-unit-btn" onclick="addDiagramInUnit('${u.id}','Auto');event.stopPropagation()" title="Add diagram">+</button>
      <button class="tree-unit-btn" onclick="renameUnit('${u.id}');event.stopPropagation()" title="Rename">✎</button>
      <button class="tree-unit-btn del" onclick="removeUnit('${u.id}',event)" title="Delete">✕</button>
    </div>`;
  head.addEventListener('click', ()=>toggleUnitOpen(u.id));

  const children = document.createElement('div');
  children.className = 'tree-unit-children' + (isOpen?'':' hidden');

  // Group diagrams theo mode — gọi makeModeGroup() cho mỗi mode có ít nhất 1 diagram
  if(!diagsInUnit.length){
    const empty = document.createElement('div');
    empty.style.cssText='padding:3px 8px 3px 18px;font-size:9px;color:var(--text3);font-style:italic;';
    empty.textContent='no diagrams';
    children.appendChild(empty);
  } else {
    const UNIT_MODES = [
      {key:'Auto',   icon:'⚙'},
      {key:'Origin', icon:'⟳'},
      {key:'Manual', icon:'🖐'},
      {key:'Error',  icon:'⚠'},
    ];
    // Diagrams có mode thuộc danh sách UNIT_MODES → nhóm vào mode group
    const groupedModeKeys = new Set();
    UNIT_MODES.forEach(m => {
      const hasDiags = diagsInUnit.some(d=>d.mode===m.key);
      if(hasDiags){
        groupedModeKeys.add(m.key);
        children.appendChild(makeModeGroup(u, m));
      }
    });
    // Diagrams có mode không thuộc UNIT_MODES (custom hoặc legacy) → flat list ở cuối
    diagsInUnit.filter(d=>!groupedModeKeys.has(d.mode)).forEach(d=>{
      children.appendChild(makeDiagItem(d));
    });
  }

  wrap.appendChild(head); wrap.appendChild(children);
  return wrap;
}

function makeModeGroup(u, m) {
  const diagsInMode = project.diagrams.filter(d=>d.unitId===u.id && d.mode===m.key);
  const key = `${u.id}_${m.key}`;
  const isOpen = localStorage.getItem('gf2-mode-open-'+key) !== '0';

  const wrap = document.createElement('div');
  wrap.className = `tree-mode-group mode-${m.key.toLowerCase()}`;

  const head = document.createElement('div');
  head.className = 'tree-mode-head';
  head.innerHTML = `
    <span class="tree-mode-icon">${m.icon}</span>
    <span class="tree-mode-name">${m.key}</span>
    <button class="tree-mode-add" onclick="addDiagramInUnit('${u.id}','${m.key}');event.stopPropagation()" title="Add diagram">+</button>`;
  head.addEventListener('click', ()=>{
    const c=wrap.querySelector('.tree-mode-children');
    const open=c.classList.toggle('hidden');
    localStorage.setItem('gf2-mode-open-'+key, open?'0':'1');
  });

  const children = document.createElement('div');
  children.className = 'tree-mode-children' + (isOpen?'':' hidden');

  if(!diagsInMode.length){
    const empty=document.createElement('div');
    empty.style.cssText='padding:3px 8px 3px 28px;font-size:9px;color:var(--text3);font-style:italic;';
    empty.textContent='empty';
    children.appendChild(empty);
  } else {
    diagsInMode.forEach(d=>children.appendChild(makeDiagItem(d)));
  }

  wrap.appendChild(head); wrap.appendChild(children);
  return wrap;
}

function makeDriversSection() {
  const wrap = document.createElement('div');
  wrap.className = 'tree-drivers';
  const driverDiags = project.diagrams.filter(d=>d.mode==='Drivers');
  const isOpen = localStorage.getItem('gf2-drivers-open') !== '0';

  const head = document.createElement('div');
  head.className = 'tree-drivers-head mode-drivers';
  head.innerHTML = `
    <span class="tree-unit-toggle ${isOpen?'open':'closed'}">▾</span>
    <span style="margin:0 4px;font-size:11px;">⚡</span>
    <span style="flex:1;font-size:9px;letter-spacing:1px;">ActiveDevices</span>
    <button class="tree-mode-add" onclick="addDriverDiagram();event.stopPropagation()" title="Add active device diagram">+</button>`;
  head.addEventListener('click', ()=>{
    const c=wrap.querySelector('.tree-drivers-body');
    const hidden=c.classList.toggle('hidden');
    localStorage.setItem('gf2-drivers-open', hidden?'0':'1');
  });

  const body2 = document.createElement('div');
  body2.className = 'tree-mode-children' + (isOpen?'':' hidden');
  body2.style.cssText='border-left:2px solid rgba(167,139,250,.3);margin-left:12px;';
  if(!driverDiags.length){
    const empty=document.createElement('div');
    empty.style.cssText='padding:3px 8px;font-size:9px;color:var(--text3);font-style:italic;';
    empty.textContent='no driver diagrams';
    body2.appendChild(empty);
  } else {
    driverDiags.forEach(d=>body2.appendChild(makeDiagItem(d)));
  }
  body2.className = 'tree-drivers-body' + (isOpen?'':' hidden');

  wrap.appendChild(head); wrap.appendChild(body2);
  return wrap;
}

// ═══════════════════════════════════════════════════════════
//  DEVICES — Class-based device type library (flat list)
//  Each device has: name, categoryId (type tag), signals[]
//  Signals: name | dataType | variableType (Input/Output/Var) | comment
//  NO address here — address assigned in Variable Table (instance)
// ═══════════════════════════════════════════════════════════

const DEV_BUILTIN_CATS = [
  { id:'cat-cylinder', name:'Cylinder',  icon:'🔵' },
  { id:'cat-motor',    name:'Motor',     icon:'⚙️'  },
  { id:'cat-inverter', name:'Inverter',  icon:'📟' },
  { id:'cat-servo',    name:'Servo',     icon:'🎯' },
  { id:'cat-step',     name:'Step Motor',icon:'🔄' },
  { id:'cat-other',    name:'Other',     icon:'🔧' },
];

function getDevCatById(catId) {
  return DEV_BUILTIN_CATS.find(c=>c.id===catId) || {id:catId,name:catId,icon:'🔧'};
}

// ── Tree section ──────────────────────────────────────────
function makeDevicesSection() {
  if(!project.devices) project.devices = [];
  const isOpen = localStorage.getItem('gf2-devices-open') !== '0';
  const wrap = document.createElement('div');
  wrap.className = 'tree-devices-section';

  const head = document.createElement('div');
  head.className = 'tree-devices-head';
  const totalTypes = (project.devices||[]).length;
  head.innerHTML = `
    <span class="tree-dev-toggle ${isOpen?'':'closed'}">▾</span>
    <span style="font-size:11px;margin:0 4px;">🔩</span>
    <span style="flex:1;font-size:9px;letter-spacing:1.5px;font-family:'Orbitron',monospace;">DEVICES</span>
    <span style="font-size:8px;color:var(--text3);margin-right:4px;">${totalTypes}</span>
    <button class="tree-dev-add-btn" onclick="addStandardDeviceTemplates();event.stopPropagation()" title="Add standard device templates (CY_Double_Act, CY_Single_Act, Motor_FwdRev)" style="border-color:#a78bfa;color:#a78bfa;">📦</button>
    <button class="tree-dev-add-btn" onclick="openDeviceTypeModal(null);event.stopPropagation()" title="Add device type">⊕</button>`;

  const body = document.createElement('div');
  body.className = 'tree-devices-body' + (isOpen?'':' hidden');
  body.id = 'devices-body';

  head.addEventListener('click', ()=>{
    const h = body.classList.toggle('hidden');
    head.querySelector('.tree-dev-toggle').classList.toggle('closed', h);
    localStorage.setItem('gf2-devices-open', h?'0':'1');
  });

  renderDevicesList(body);
  wrap.appendChild(head);
  wrap.appendChild(body);
  return wrap;
}

function renderDevicesList(container) {
  if(!container) container = document.getElementById('devices-body');
  if(!container) return;
  container.innerHTML = '';
  const devs = project.devices||[];
  if(!devs.length){
    const e=document.createElement('div');
    e.className='tree-dev-empty';
    e.style.cssText='padding:6px 12px;font-size:9px;color:var(--text3);font-style:italic;';
    e.textContent='no device types defined';
    container.appendChild(e);
    return;
  }
  devs.forEach(dev => container.appendChild(makeDevTypeRow(dev)));
}

function makeDevTypeRow(dev) {
  const isOpen = dev.open !== false;
  const cat = getDevCatById(dev.categoryId||'cat-other');
  const wrap = document.createElement('div');
  wrap.className = 'tree-dev-type';

  const head = document.createElement('div');
  head.className = 'tree-dev-type-head';
  head.innerHTML = `
    <span class="tree-dev-toggle ${isOpen?'':'closed'}">▾</span>
    <span style="font-size:9px;color:var(--cyan);margin:0 3px;">❖</span>
    <span class="tree-dev-type-name">${esc2(dev.name)}</span>
    <span class="tree-dev-type-tag" title="${esc2(cat.name)}">${cat.icon} ${esc2(cat.name)}</span>
    <span class="tree-dev-type-meta">${(dev.signals||[]).length} sig</span>
    <div class="tree-dev-type-acts">
      <button class="tree-dev-btn" onclick="openDeviceTypeModal('${dev.id}');event.stopPropagation()" title="Edit">✎</button>
      <button class="tree-dev-btn del" onclick="removeDeviceType('${dev.id}',event)">✕</button>
    </div>`;

  const children = document.createElement('div');
  children.className = 'tree-dev-sig-list' + (isOpen?'':' hidden');

  if(!(dev.signals||[]).length){
    const e=document.createElement('div');e.className='tree-dev-empty';e.textContent='no signals';
    children.appendChild(e);
  } else {
    const hdr=document.createElement('div');
    hdr.className='tree-dev-sig-hdr';
    hdr.innerHTML='<span class="sdcol-name">SIGNAL</span><span class="sdcol-type">TYPE</span><span class="sdcol-io">VAR</span><span class="sdcol-cmt">COMMENT</span>';
    children.appendChild(hdr);
    (dev.signals||[]).forEach(sig=>{
      const row=document.createElement('div');
      row.className='tree-dev-sig-row';
      const tc={Bool:'sig-bool',Int:'sig-int',Real:'sig-real',Word:'sig-word',DWord:'sig-word',Time:'sig-word'}[sig.dataType]||'sig-bool';
      const vc={Input:'vt-input',Output:'vt-output',Var:'vt-var'}[sig.varType]||'vt-var';
      const vs={Input:'IN',Output:'OUT',Var:'VAR'}[sig.varType]||'VAR';
      row.innerHTML=`
        <span class="sdcol-name" title="${esc2(sig.name)}">${esc2(sig.name)}</span>
        <span class="sdcol-type ${tc}">${esc2(sig.dataType||'Bool')}</span>
        <span class="sdcol-io ${vc}">${vs}</span>
        <span class="sdcol-cmt" title="${esc2(sig.comment||'')}">${esc2(sig.comment||'')}</span>
        <button class="tree-dev-sig-del" onclick="removeDeviceSignal('${dev.id}','${sig.id}',event)" title="Remove">✕</button>`;
      children.appendChild(row);
    });
  }

  head.addEventListener('click',()=>{
    dev.open=!dev.open;
    children.classList.toggle('hidden',!dev.open);
    head.querySelector('.tree-dev-toggle').classList.toggle('closed',!dev.open);
    saveProject();
  });

  // show/hide action buttons on hover
  const acts = head.querySelector('.tree-dev-type-acts');
  if(acts){ acts.style.opacity='0'; head.addEventListener('mouseenter',()=>acts.style.opacity='1'); head.addEventListener('mouseleave',()=>acts.style.opacity='0'); }

  wrap.appendChild(head); wrap.appendChild(children);
  return wrap;
}

// ── Device type modal ─────────────────────────────────────
let _devModalDevId=null;

function openDeviceTypeModal(devId) {
  _devModalDevId=devId;
  const dev=devId?(project.devices||[]).find(d=>d.id===devId):null;

  let el=document.getElementById('modal-device-type');
  if(el) el.remove();
  el=document.createElement('div');
  el.id='modal-device-type';
  el.className='modal-bg';
  el.style.cssText='align-items:center;justify-content:center;';

  const selCatId = dev?.categoryId || 'cat-cylinder';
  const typeOptions = DEV_BUILTIN_CATS.map(c=>
    `<option value="${c.id}" ${selCatId===c.id?'selected':''}>${c.icon} ${esc2(c.name)}</option>`
  ).join('');

  el.innerHTML=`
    <div class="modal" style="min-width:640px;max-width:92vw;max-height:88vh;display:flex;flex-direction:column;padding:0;overflow:hidden;">
      <div style="padding:12px 20px 10px;background:var(--s3);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-shrink:0;">
        <span style="font-size:15px;">🔩</span>
        <span style="font-size:12px;letter-spacing:2px;font-family:'Orbitron',monospace;">${devId?'EDIT':'NEW'} DEVICE TYPE</span>
        <span class="dev-class-badge" style="margin-left:auto;">CLASS</span>
      </div>
      <div style="padding:12px 20px 4px;display:flex;gap:20px;flex-shrink:0;flex-wrap:wrap;">
        <div style="flex:1;min-width:180px;">
          <div class="dev-field-lbl">DEVICE TYPE NAME</div>
          <input id="dev-modal-name" type="text" placeholder="e.g. CylA, MotorConv…"
            style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:'JetBrains Mono',monospace;font-size:12px;padding:6px 8px;border-radius:3px;outline:none;margin-top:5px;">
        </div>
        <div style="flex:0 0 180px;">
          <div class="dev-field-lbl">TYPE</div>
          <select id="dev-modal-cat" style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:'JetBrains Mono',monospace;font-size:11px;padding:6px 8px;border-radius:3px;outline:none;margin-top:5px;">
            ${typeOptions}
          </select>
        </div>
      </div>
      <div style="margin:6px 20px 4px;padding:5px 10px;background:rgba(34,211,238,.05);border:1px solid rgba(34,211,238,.15);border-radius:3px;font-size:9px;color:var(--text3);display:flex;gap:6px;flex-shrink:0;">
        <span style="color:var(--cyan);">ℹ</span>
        <span>This is a <b>class</b> — no address here. In the <b>Variable Table</b>, select this device type as DATA FORMAT to create an instance. Address is assigned per-signal in the Variable Table.</span>
      </div>
      <div style="padding:4px 20px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:9px;letter-spacing:1.5px;color:var(--cyan);font-family:'Orbitron',monospace;">SIGNALS</span>
        <button class="btn" style="border-color:var(--cyan);color:var(--cyan);font-size:9px;" onclick="devModalAddRow()">+ Add Signal</button>
      </div>
      <div style="flex:1;overflow:auto;padding:0 20px 8px;">
        <table class="dev-sig-table">
          <thead><tr>
            <th style="width:140px;">SIGNAL NAME</th>
            <th style="width:90px;">DATA TYPE</th>
            <th style="width:110px;">VARIABLE TYPE</th>
            <th>COMMENT</th>
            <th style="width:22px;"></th>
          </tr></thead>
          <tbody id="dev-modal-tbody"></tbody>
        </table>
      </div>
      <div style="padding:10px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;background:var(--s3);">
        <button class="btn" onclick="closeModal('modal-device-type')">Cancel</button>
        <button class="btn a" onclick="confirmDeviceType()">✓ Save</button>
      </div>
    </div>`;
  document.body.appendChild(el);

  document.getElementById('dev-modal-name').value = dev?.name||'';

  const sigs = dev?.signals||[];
  if(sigs.length) sigs.forEach(s=>devModalAddRow(s));
  else { devModalAddRow(); devModalAddRow(); }

  showModal('modal-device-type');
  setTimeout(()=>document.getElementById('dev-modal-name').focus(),80);
}

function devModalAddRow(sig) {
  const tbody=document.getElementById('dev-modal-tbody');
  if(!tbody) return;
  const sid=sig?.id||('sig-'+Date.now()+'-'+Math.random().toString(36).slice(2,5));
  const tr=document.createElement('tr');
  tr.dataset.sigId=sid;
  tr.innerHTML=`
    <td><input class="dev-sig-input" placeholder="LSL" value="${esc2(sig?.name||'')}" data-f="name"></td>
    <td>
      <select class="dev-sig-select" data-f="dataType">
        ${['Bool','Int','Real','Word','DWord','Time'].map(t=>`<option value="${t}" ${(sig?.dataType||'Bool')===t?'selected':''}>${t}</option>`).join('')}
      </select>
    </td>
    <td>
      <select class="dev-sig-select" data-f="varType" style="color:var(--text);">
        <option value="Input"  ${(sig?.varType||'Input')==='Input' ?'selected':''}>Input</option>
        <option value="Output" ${(sig?.varType||'')==='Output'?'selected':''}>Output</option>
        <option value="Var"    ${(sig?.varType||'')==='Var'   ?'selected':''}>Var</option>
      </select>
    </td>
    <td><input class="dev-sig-input" placeholder="e.g. Lower limit sensor" value="${esc2(sig?.comment||'')}" data-f="comment" style="color:var(--text2);"></td>
    <td><button class="dev-del-row" onclick="this.closest('tr').remove()">✕</button></td>`;
  tbody.appendChild(tr);
}

function confirmDeviceType() {
  const name=(document.getElementById('dev-modal-name').value||'').trim();
  if(!name){alert('Please enter a device type name.');return;}
  const catId=document.getElementById('dev-modal-cat').value;
  if(!project.devices) project.devices=[];

  const signals=Array.from(document.getElementById('dev-modal-tbody').querySelectorAll('tr')).map(tr=>({
    id:tr.dataset.sigId||('sig-'+Date.now()),
    name:    tr.querySelector('[data-f="name"]').value.trim(),
    dataType:tr.querySelector('[data-f="dataType"]').value,
    varType: tr.querySelector('[data-f="varType"]').value,
    comment: tr.querySelector('[data-f="comment"]').value.trim()
  })).filter(s=>s.name);

  if(_devModalDevId){
    const d=project.devices.find(x=>x.id===_devModalDevId);
    if(d){d.name=name;d.categoryId=catId;d.signals=signals;}
  } else {
    project.devices.push({id:'dev-'+Date.now(),name,categoryId:catId,open:true,signals});
  }
  saveProject(); renderTree();
  closeModal('modal-device-type');
  toast('✓ Device type: '+name);
}

function removeDeviceType(devId,e){
  if(e)e.stopPropagation();
  const d=(project.devices||[]).find(x=>x.id===devId);
  if(!confirm(`Delete device type "${d?.name}"?`)) return;
  project.devices=project.devices.filter(x=>x.id!==devId);
  saveProject(); renderTree();
}

// ── Standard device templates ─────────────────────────────────────────────────
// Pre-defined device type templates for common actuators.
// Each template creates a device type in the Device Library with the standard
// signal definitions. Instances in the Variable Table map signals to PLC addresses,
// so the same template works with any PLC brand by changing only the addresses.
function addStandardDeviceTemplates() {
  const mkSigId = (prefix, idx) => `sig-${prefix}-${idx}-${Date.now()}`;
  const templates = [
    {
      name: 'CY_Double_Act',
      categoryId: 'cat-cylinder',
      signals: [
        {id:mkSigId('cy2',0), name:'Out_Up',    dataType:'Bool', varType:'Output', comment:'Up solenoid coil'},
        {id:mkSigId('cy2',1), name:'Out_Down',  dataType:'Bool', varType:'Output', comment:'Down solenoid coil'},
        {id:mkSigId('cy2',2), name:'In_Up',     dataType:'Bool', varType:'Input',  comment:'Up position sensor'},
        {id:mkSigId('cy2',3), name:'In_Down',   dataType:'Bool', varType:'Input',  comment:'Down position sensor'},
        {id:mkSigId('cy2',4), name:'Lock_Up',   dataType:'Bool', varType:'Input',  comment:'Up interlock signal'},
        {id:mkSigId('cy2',5), name:'Lock_Down', dataType:'Bool', varType:'Input',  comment:'Down interlock signal'},
        {id:mkSigId('cy2',6), name:'Sys_Man',   dataType:'Bool', varType:'Var',    comment:'Manual mode toggle bit'},
        {id:mkSigId('cy2',7), name:'Err_Up',    dataType:'Bool', varType:'Var',    comment:'Up travel timeout error'},
        {id:mkSigId('cy2',8), name:'Err_Down',  dataType:'Bool', varType:'Var',    comment:'Down travel timeout error'},
      ],
    },
    {
      name: 'CY_Single_Act',
      categoryId: 'cat-cylinder',
      signals: [
        {id:mkSigId('cy1',0), name:'Out_Extend',  dataType:'Bool', varType:'Output', comment:'Extend solenoid coil'},
        {id:mkSigId('cy1',1), name:'In_Extend',   dataType:'Bool', varType:'Input',  comment:'Extended position sensor'},
        {id:mkSigId('cy1',2), name:'In_Retract',  dataType:'Bool', varType:'Input',  comment:'Retracted position sensor'},
        {id:mkSigId('cy1',3), name:'Lock',        dataType:'Bool', varType:'Input',  comment:'Interlock signal'},
        {id:mkSigId('cy1',4), name:'Sys_Man',     dataType:'Bool', varType:'Var',    comment:'Manual mode toggle bit'},
        {id:mkSigId('cy1',5), name:'Err_Extend',  dataType:'Bool', varType:'Var',    comment:'Extend travel timeout error'},
      ],
    },
    {
      name: 'Motor_FwdRev',
      categoryId: 'cat-motor',
      signals: [
        {id:mkSigId('mot',0), name:'Out_Fwd',  dataType:'Bool', varType:'Output', comment:'Forward run coil'},
        {id:mkSigId('mot',1), name:'Out_Rev',  dataType:'Bool', varType:'Output', comment:'Reverse run coil'},
        {id:mkSigId('mot',2), name:'In_Fwd',   dataType:'Bool', varType:'Input',  comment:'Forward limit / feedback'},
        {id:mkSigId('mot',3), name:'In_Rev',   dataType:'Bool', varType:'Input',  comment:'Reverse limit / feedback'},
        {id:mkSigId('mot',4), name:'Fault',    dataType:'Bool', varType:'Input',  comment:'Motor fault / overload input'},
        {id:mkSigId('mot',5), name:'Sys_Man',  dataType:'Bool', varType:'Var',    comment:'Manual mode toggle bit'},
        {id:mkSigId('mot',6), name:'Err_Fwd',  dataType:'Bool', varType:'Var',    comment:'Forward timeout error'},
        {id:mkSigId('mot',7), name:'Err_Rev',  dataType:'Bool', varType:'Var',    comment:'Reverse timeout error'},
      ],
    },
  ];

  if(!project.devices) project.devices=[];
  let added=0;
  templates.forEach(tpl=>{
    if(project.devices.find(d=>d.name===tpl.name)) return; // skip if already present
    project.devices.push({
      id:'dev-tmpl-'+tpl.name.toLowerCase()+'-'+Date.now(),
      name:tpl.name,
      categoryId:tpl.categoryId,
      open:true,
      signals:tpl.signals
    });
    added++;
  });

  if(!added){ toast('⚠ All standard templates already exist in this project'); return; }
  saveProject(); renderTree();
  toast(`✓ Added ${added} standard device template(s) — use Variable Table to create instances`);
}

function removeDeviceSignal(devId,sigId,e){
  if(e)e.stopPropagation();
  const d=(project.devices||[]).find(x=>x.id===devId);
  if(!d)return;
  d.signals=(d.signals||[]).filter(s=>s.id!==sigId);
  saveProject(); renderTree();
}

function makeDiagItem(d) {
  const item = document.createElement('div');
  item.className = 'tree-item' + (d.id===activeDiagramId?' active':'');
  item.dataset.id = d.id; item.dataset.type = 'diagram';

  const MODE_COLORS = {Auto:'#39d353',Origin:'#f5a623',Manual:'#4fa3e3',Error:'#e35a4f',Drivers:'#a78bfa'};
  const modeColor = MODE_COLORS[d.mode]||'var(--text3)';
  const typeLbl = d.diagramType==='SubRoutine'?'SR':'M';
  const typeColor = d.diagramType==='SubRoutine'?'var(--blue)':'var(--amber)';

  item.innerHTML = `
    <span class="tree-item-icon" style="color:${modeColor};font-size:8px;">⬤</span>
    <span class="tree-item-name">${esc2(d.name)}</span>
    <span style="font-size:7px;padding:1px 3px;border:1px solid ${typeColor};color:${typeColor};border-radius:2px;flex-shrink:0;">${typeLbl}</span>
    <div class="tree-item-actions">
      <button class="tree-item-btn" onclick="openDiagPropsPanel('${d.id}');event.stopPropagation()" title="Properties">⚙</button>
      <button class="tree-item-btn del" onclick="removeDiagram('${d.id}',event)" title="Delete">✕</button>
    </div>`;
  item.addEventListener('click', e=>{ if(!e.target.closest('.tree-item-btn')) openTab(d.id); });
  item.addEventListener('dblclick', ()=>openDiagPropsPanel(d.id));
  item.addEventListener('contextmenu', e=>{ e.preventDefault(); showTreeCtx(e, d.id, 'diagram'); });
  return item;
}

// ── Unit management ──
let unitModalMode = null; // 'add' | 'rename:{id}'

function addUnit() {
  unitModalMode = 'add';
  document.getElementById('modal-unit-title').textContent = 'ADD UNIT';
  document.getElementById('modal-unit-name').value = `Unit_${String((project.units||[]).length+1).padStart(2,'0')}_`;
  showModal('modal-unit');
  setTimeout(()=>document.getElementById('modal-unit-name').select(),60);
}
function renameUnit(id) {
  unitModalMode = 'rename:'+id;
  const u = (project.units||[]).find(x=>x.id===id);
  document.getElementById('modal-unit-title').textContent = 'RENAME UNIT';
  document.getElementById('modal-unit-name').value = u?.name||'';
  showModal('modal-unit');
}
function confirmUnit() {
  const val = document.getElementById('modal-unit-name').value.trim();
  if(!val) return;
  if(!project.units) project.units=[];
  if(unitModalMode==='add'){
    const id='unit-'+Date.now();
    project.units.push({id, name:val, open:true});
    saveProject(); renderTree();
    toast('✓ Unit added: '+val);
  } else if(unitModalMode?.startsWith('rename:')){
    const id=unitModalMode.split(':')[1];
    const u=project.units.find(x=>x.id===id);
    if(u){ u.name=val; saveProject(); renderTree(); }
  }
  closeModal('modal-unit');
}
function removeUnit(id, e) {
  if(e) e.stopPropagation();
  const u=project.units.find(x=>x.id===id);
  const diagsIn=project.diagrams.filter(d=>d.unitId===id);
  if(!confirm(`Delete unit "${u?.name}"? ${diagsIn.length>0?diagsIn.length+' diagram(s) will be unassigned.':''}`)) return;
  diagsIn.forEach(d=>{d.unitId=null;});
  project.units=project.units.filter(x=>x.id!==id);
  saveProject(); renderTree();
}
function toggleUnitOpen(id) {
  const u=(project.units||[]).find(x=>x.id===id);
  if(u){ u.open=u.open===false?true:false; saveProject(); renderTree(); }
}
function addDiagramInUnit(unitId, mode) {
  addDiagram(false, unitId, mode);
}
function addDriverDiagram() {
  const id='diag-'+Date.now();
  project.diagrams.push({
    id, name:'Driver_Device', unitId:null, folderId:null,
    mode:'Drivers', diagramType:'Main',
    machine:project.machineName||project.name, unit:'', description:''
  });
  saveDiagramData(id, {steps:[],transitions:[],parallels:[],connections:[],vars:[]}, 1, 0, 100, 80, 1);
  saveProject(); renderTree(); openTab(id);
}
function renameMachine() {
  renameMode='machine';
  document.getElementById('modal-input').value = project.machineName||project.name;
  document.getElementById('modal-rename').querySelector('h2').textContent = 'MACHINE NAME';
  showModal('modal-rename');
}

// ── Inline Diagram Properties Panel ──
let diagPropsId = null;
const MODE_CFG = {
  Auto:   {color:'#39d353', bg:'rgba(57,211,83,.12)'},
  Origin: {color:'#f5a623', bg:'rgba(245,166,35,.12)'},
};

function openDiagPropsPanel(id) {
  diagPropsId = id;
  const d = project.diagrams.find(x=>x.id===id);
  if(!d) return;

  // Populate unit dropdown
  const sel = document.getElementById('dp-unit');
  sel.innerHTML = '<option value="">— unassigned —</option>';
  (project.units||[]).forEach(u=>{
    const o = document.createElement('option');
    o.value = u.id; o.textContent = u.name;
    if(u.id===d.unitId) o.selected=true;
    sel.appendChild(o);
  });

  // Fill fields
  document.getElementById('dp-name').value = d.name||'';
  document.getElementById('dp-desc').value = d.description||'';
  document.getElementById('dp-machine').value = d.machine||project.machineName||'';

  // Mode chips — only Auto and Origin
  dpSetMode(d.mode||'Auto');
  // Type chips
  dpSetType(d.diagramType||'Main');
  // Header badge
  dpUpdateBadge(d.mode||'Auto');
  document.getElementById('dp-title').textContent = d.name;
  // Code preview
  dpUpdateCodePreview(d);

  // Show panel, hide element props
  document.getElementById('dp-panel').classList.add('show');
  document.getElementById('props-area').style.display='none';
}

function closeDiagPropsPanel() {
  diagPropsId = null;
  document.getElementById('dp-panel').classList.remove('show');
  document.getElementById('props-area').style.display='block';
}

function dpSetMode(mode) {
  document.querySelectorAll('#dp-mode-chips .dp-chip').forEach(c=>{
    c.classList.toggle('active', c.dataset.mode===mode);
  });
  dpUpdateBadge(mode);
  dpLiveUpdate();
}
function dpSetType(type) {
  const mBtn = document.getElementById('dp-type-main');
  const sBtn = document.getElementById('dp-type-sub');
  mBtn.className = 'dp-type-chip' + (type==='Main'?' active-main':'');
  sBtn.className = 'dp-type-chip' + (type==='SubRoutine'?' active-sub':'');
  dpLiveUpdate();
}
function dpUpdateBadge(mode) {
  const cfg = MODE_CFG[mode]||{color:'var(--text2)',bg:'var(--s3)'};
  const badge = document.getElementById('dp-mode-badge');
  badge.textContent = mode||'—';
  badge.style.color = cfg.color;
  badge.style.borderColor = cfg.color;
  badge.style.background = cfg.bg;
}
function dpGetCurrentMode() {
  const active = document.querySelector('#dp-mode-chips .dp-chip.active');
  return active ? active.dataset.mode : 'Auto';
}
function dpGetCurrentType() {
  return document.getElementById('dp-type-main').classList.contains('active-main') ? 'Main' : 'SubRoutine';
}

function dpLiveUpdate() {
  const mode = dpGetCurrentMode();
  dpUpdateBadge(mode);
  // Build preview
  const machine = document.getElementById('dp-machine').value||'Machine';
  const unitSel = document.getElementById('dp-unit');
  const unitName = unitSel.selectedIndex>0 ? unitSel.options[unitSel.selectedIndex].text : (document.getElementById('dp-desc').value||'Unit');
  const type = dpGetCurrentType();
  const name = document.getElementById('dp-name').value||'GRAFCET';
  const desc = document.getElementById('dp-desc').value;
  const fake = {machine, unit:unitName, mode, diagramType:type, name, description:desc};
  dpUpdateCodePreview(fake);
}
function dpUpdateCodePreview(d) {
  const el = document.getElementById('dp-codeprev');
  if(!el) return;
  const unit = d.unit || ((project.units||[]).find(u=>u.id===d.unitId)?.name)||'—';
  el.innerHTML = [
    ['machine', d.machine||project.machineName||'Machine'],
    ['unit',    unit],
    ['mode',    d.mode||'Auto'],
    ['type',    d.diagramType||'Main'],
    ['name',    d.name||'GRAFCET'],
  ].map(([k,v])=>`<span class="k">${k}</span>: <span class="v">${esc(v)}</span>`).join('\n');
}

function saveDiagPropsPanel() {
  if(!diagPropsId) return;
  const d = project.diagrams.find(x=>x.id===diagPropsId);
  if(!d) return;
  d.name = document.getElementById('dp-name').value.trim()||d.name;
  d.description = document.getElementById('dp-desc').value.trim();
  d.machine = document.getElementById('dp-machine').value.trim()||project.machineName;
  const unitSel = document.getElementById('dp-unit');
  d.unitId = unitSel.value||null;
  d.unit = unitSel.value ? (project.units.find(u=>u.id===unitSel.value)?.name||'') : '';
  d.mode = dpGetCurrentMode();
  d.diagramType = dpGetCurrentType();
  saveProject(); renderTree(); renderTabs();
  document.getElementById('dp-title').textContent = d.name;
  dpUpdateCodePreview(d);
  toast('✓ Properties saved');
}

// Legacy alias — keep tctx working
function showDiagMeta(id){ openDiagPropsPanel(id); }

function removeDiagram(id, e) {
  if (e) e.stopPropagation();
  const allDiags = project.diagrams.length;
  if (allDiags <= 1) { toast('⚠ Cannot delete last diagram'); return; }
  if (!confirm('Delete diagram "'+project.diagrams.find(d=>d.id===id)?.name+'"?')) return;
  deleteDiagramData(id);
  project.diagrams = project.diagrams.filter(d=>d.id!==id);
  openTabs = openTabs.filter(t=>t.id!==id);
  saveProject();
  if (activeDiagramId===id) {
    activeDiagramId=null;
    if (openTabs.length>0) openTab(openTabs[0].id);
    else if(project.diagrams.length>0) openTab(project.diagrams[0].id);
    else { renderTree(); renderTabs(); }
  } else { renderTree(); renderTabs(); }
}

// ─── Folder management ───
function addFolder() {
  const id = 'fld-'+Date.now();
  const num = (project.folders||[]).length + 1;
  if(!project.folders) project.folders=[];
  project.folders.push({ id, name:'Folder '+num, open:true });
  saveProject(); renderTree();
}

function addDiagramInFolder(folderId) {
  addDiagram(false, folderId);
}

function removeFolder(id, e) {
  if(e) e.stopPropagation();
  const f = project.folders.find(x=>x.id===id);
  const diagsIn = project.diagrams.filter(d=>d.folderId===id);
  const msg = diagsIn.length>0
    ? `Delete folder "${f?.name}"? ${diagsIn.length} diagram(s) will be moved to root.`
    : `Delete folder "${f?.name}"?`;
  if(!confirm(msg)) return;
  // Move diagrams to root
  project.diagrams.forEach(d=>{ if(d.folderId===id) d.folderId=null; });
  project.folders = project.folders.filter(x=>x.id!==id);
  saveProject(); renderTree();
}

function renameFolder(id) {
  renameMode='folder:'+id;
  const f = project.folders.find(x=>x.id===id);
  document.getElementById('modal-input').value = f?.name||'';
  document.getElementById('modal-rename').querySelector('h2').textContent = 'RENAME FOLDER';
  showModal('modal-rename');
}

function moveDiagramToFolder(diagId, folderId) {
  const d = project.diagrams.find(x=>x.id===diagId);
  if(d){
    d.folderId = folderId||null;
    saveProject(); renderTree();
    const fname = folderId ? (project.folders.find(f=>f.id===folderId)?.name||'folder') : 'Root';
    toast('✓ Moved to: '+fname);
  }
  hideTreeCtx();
}

// ─── Tree context menu ───
let treeCtxTarget = null;
function showTreeCtx(e, id, type) {
  e.stopPropagation();
  treeCtxTarget = {id, type};
  const m = document.getElementById('tree-ctx');
  const isDiag = type==='diagram';
  document.getElementById('tctx-open').style.display = isDiag?'flex':'none';
  document.getElementById('tctx-dup').style.display  = isDiag?'flex':'none';
  document.getElementById('tctx-move').style.display = isDiag?'flex':'none';
  document.getElementById('tree-ctx-folders').style.display='none';
  m.style.display='block';
  const vw=window.innerWidth, vh=window.innerHeight;
  m.style.left=e.clientX+'px'; m.style.top=e.clientY+'px';
  requestAnimationFrame(()=>{
    const r=m.getBoundingClientRect();
    if(r.right>vw) m.style.left=(e.clientX-r.width)+'px';
    if(r.bottom>vh) m.style.top=(e.clientY-r.height)+'px';
  });
}
function hideTreeCtx(){
  document.getElementById('tree-ctx').style.display='none';
  document.getElementById('tree-ctx-folders').style.display='none';
}
document.addEventListener('click', e=>{
  if(!e.target.closest('#tree-ctx')&&!e.target.closest('#tree-ctx-folders')) hideTreeCtx();
});
function tctxOpen(){ if(treeCtxTarget?.type==='diagram') openTab(treeCtxTarget.id); hideTreeCtx(); }
function tctxRename(){ if(!treeCtxTarget) return; hideTreeCtx(); if(treeCtxTarget.type==='diagram') renameCurrentDiagram(treeCtxTarget.id); else renameFolder(treeCtxTarget.id); }
function tctxDup(){
  hideTreeCtx();
  if(!treeCtxTarget||treeCtxTarget.type!=='diagram') return;
  const d=project.diagrams.find(x=>x.id===treeCtxTarget.id); if(!d) return;
  const newId='diag-'+Date.now();
  const srcData=loadDiagramData(d.id);
  project.diagrams.push({id:newId, name:d.name+' Copy', folderId:d.folderId||null});
  if(srcData) saveDiagramData(newId, JSON.parse(JSON.stringify(srcData.state)), srcData.nextId, srcData.nextStepNum, srcData.viewX, srcData.viewY, srcData.viewScale);
  saveProject(); renderTree();
  toast('✓ Duplicated');
}
function tctxDel(){ hideTreeCtx(); if(!treeCtxTarget) return; if(treeCtxTarget.type==='diagram') removeDiagram(treeCtxTarget.id); else removeFolder(treeCtxTarget.id); }
function tctxShowMove(e){
  if(e){ e.preventDefault(); e.stopPropagation(); }
  const fm = document.getElementById('tree-ctx-folders');
  fm.innerHTML='<div style="padding:5px 10px 3px;font-size:8px;color:var(--text3);letter-spacing:1.5px;">MOVE TO</div>';
  const curDiag=project.diagrams.find(x=>x.id===treeCtxTarget?.id);

  const rootBtn=document.createElement('div');
  rootBtn.className='tree-ctx-i';
  rootBtn.innerHTML=(curDiag&&!curDiag.folderId?'<b style="color:var(--blue)">✓</b> ':'  ')+'📂 Root';
  rootBtn.onclick=(ev)=>{ ev.stopPropagation(); moveDiagramToFolder(treeCtxTarget.id, null); };
  fm.appendChild(rootBtn);

  (project.folders||[]).forEach(f=>{
    const fb=document.createElement('div');
    fb.className='tree-ctx-i';
    const isHere=curDiag?.folderId===f.id;
    fb.innerHTML=(isHere?'<b style="color:var(--blue)">✓</b> ':'  ')+'📁 '+esc2(f.name);
    fb.onclick=(ev)=>{ ev.stopPropagation(); moveDiagramToFolder(treeCtxTarget.id, f.id); };
    fm.appendChild(fb);
  });

  if(!(project.folders||[]).length){
    const noF=document.createElement('div');
    noF.style.cssText='padding:5px 12px;font-size:9px;color:var(--text3);font-style:italic;';
    noF.textContent='No folders — create one first';
    fm.appendChild(noF);
  }

  const m=document.getElementById('tree-ctx');
  const mr=m.getBoundingClientRect();
  const vw=window.innerWidth;
  fm.style.display='block';
  fm.style.top=mr.top+'px';
  requestAnimationFrame(()=>{
    const fr=fm.getBoundingClientRect();
    fm.style.left = (mr.right+fr.width+4<vw) ? (mr.right+2)+'px' : (mr.left-fr.width-2)+'px';
  });
}

// ═══════════════════════════════════════════════════════════
//  RENAME
// ═══════════════════════════════════════════════════════════
function renameProject() {
  renameMode='project';
  document.getElementById('modal-input').value = project.name;
  document.getElementById('modal-rename').querySelector('h2').textContent = 'RENAME PROJECT';
  showModal('modal-rename');
}
function renameCurrentDiagram(id) {
  renameMode='diagram:'+id;
  const d = project.diagrams.find(x=>x.id===id);
  document.getElementById('modal-input').value = d?.name||'';
  document.getElementById('modal-rename').querySelector('h2').textContent = 'RENAME DIAGRAM';
  showModal('modal-rename');
}
function confirmRename() {
  const val = document.getElementById('modal-input').value.trim();
  if (!val) return;
  if (renameMode==='project') { project.name=val; saveProject(); renderTree(); }
  else if (renameMode==='machine') { project.machineName=val; saveProject(); renderTree(); toast('✓ Machine renamed'); }
  else if (renameMode?.startsWith('diagram:')) {
    const id=renameMode.split(':')[1];
    const d=project.diagrams.find(x=>x.id===id);
    if (d) { d.name=val; saveProject(); renderTabs(); renderTree(); }
  } else if (renameMode?.startsWith('folder:')) {
    const id=renameMode.split(':')[1];
    const f=(project.folders||[]).find(x=>x.id===id);
    if (f) { f.name=val; saveProject(); renderTree(); }
  }
  closeModal('modal-rename');
}
function showModal(id) { document.getElementById(id).classList.add('show'); setTimeout(()=>document.getElementById('modal-input').focus(),50); }
// closeModal → moved to src/js/modules/utils.js
document.addEventListener('keydown', e=>{ if(e.key==='Enter'&&document.getElementById('modal-rename').classList.contains('show')) confirmRename(); });

function newProject() {
  if (!confirm('Create new project? Current project will be cleared.')) return;
  project.diagrams.forEach(d=>deleteDiagramData(d.id));
  project = { id:'proj-'+Date.now(), name:'New Project', machineName:'Machine', diagrams:[], folders:[], units:[] };
  openTabs = []; activeDiagramId=null;
  saveProject();
  addDiagram(true);
  // Immediately prompt to name the project
  renameMode='project';
  document.getElementById('modal-input').value = 'New Project';
  document.getElementById('modal-rename').querySelector('h2').textContent = 'NAME YOUR PROJECT';
  showModal('modal-rename');
}

// ═══════════════════════════════════════════════════════════
//  SNAP & COORDINATES
// ═══════════════════════════════════════════════════════════
function snap(v) { return snapOn ? Math.round(v/GRID)*GRID : Math.round(v); }
function toggleSnap() { snapOn=!snapOn; document.getElementById('tb-snap').classList.toggle('active',snapOn); }

// ═══════════════════════════════════════════════════════════
//  VIEWPORT
// ═══════════════════════════════════════════════════════════
function applyView() {
  document.getElementById('vp').setAttribute('transform',`translate(${viewX},${viewY}) scale(${viewScale})`);
  document.getElementById('s-zoom').textContent = Math.round(viewScale*100)+'%';
  drawGrid();
}
function w2s(wx,wy) {
  const r=document.getElementById('canvas-wrap').getBoundingClientRect();
  return {x:(wx-r.left-viewX)/viewScale, y:(wy-r.top-viewY)/viewScale};
}
function drawGrid() {
  const c=document.getElementById('grid-canvas');
  const w=document.getElementById('canvas-wrap');
  c.width=w.clientWidth; c.height=w.clientHeight;
  const ctx=c.getContext('2d');
  ctx.clearRect(0,0,c.width,c.height);
  const step=GRID*viewScale;
  const ox=((viewX%step)+step)%step, oy=((viewY%step)+step)%step;
  ctx.strokeStyle='#14192a'; ctx.lineWidth=.5;
  for(let x=ox;x<c.width;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,c.height);ctx.stroke();}
  for(let y=oy;y<c.height;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(c.width,y);ctx.stroke();}
  const maj=GRID*5*viewScale, ox2=((viewX%maj)+maj)%maj, oy2=((viewY%maj)+maj)%maj;
  ctx.strokeStyle='#1d2438'; ctx.lineWidth=1;
  for(let x=ox2;x<c.width;x+=maj){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,c.height);ctx.stroke();}
  for(let y=oy2;y<c.height;y+=maj){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(c.width,y);ctx.stroke();}
}
function zoomIn(){viewScale=Math.min(4,viewScale*1.2);applyView();}
function zoomOut(){viewScale=Math.max(.15,viewScale/1.2);applyView();}
function fitView() {
  const all=[...state.steps.map(s=>({x:s.x,y:s.y,w:SW,h:SH})),
             ...state.transitions.map(t=>({x:t.x,y:t.y,w:TW,h:TH+20})),
             ...state.parallels.map(p=>({x:p.x,y:p.y,w:p.width,h:PH*2+4}))];
  if(!all.length){viewX=80;viewY=60;viewScale=1;applyView();return;}
  const minX=Math.min(...all.map(a=>a.x))-40, minY=Math.min(...all.map(a=>a.y))-40;
  const maxX=Math.max(...all.map(a=>a.x+a.w))+80, maxY=Math.max(...all.map(a=>a.y+a.h))+60;
  const wrap=document.getElementById('canvas-wrap');
  const W=wrap.clientWidth-40, H=wrap.clientHeight-40;
  viewScale=Math.min(W/(maxX-minX),H/(maxY-minY),2);
  viewX=W/2-((minX+maxX)/2)*viewScale+20;
  viewY=H/2-((minY+maxY)/2)*viewScale+20;
  applyView();
}
function onWheel(e){
  e.preventDefault();
  const f=e.deltaY<0?1.12:1/1.12;
  const r=document.getElementById('canvas-wrap').getBoundingClientRect();
  const mx=e.clientX-r.left, my=e.clientY-r.top;
  viewX=mx-(mx-viewX)*f; viewY=my-(my-viewY)*f;
  viewScale=Math.max(.15,Math.min(4,viewScale*f));
  applyView();
}

// ═══════════════════════════════════════════════════════════
//  RENDER
// ═══════════════════════════════════════════════════════════
function render() {
  renderConn();
  renderEl();
  updateStats();
  miniMap();
  updateAlignBtns();
}

// ── Connections ──
function renderConn() {
  const layer=document.getElementById('conn-layer');
  layer.innerHTML='';
  state.connections.forEach(c=>{
    const g=buildConnEl(c);
    if(g) layer.appendChild(g);
  });
}
function getPortXY(id, port) {
  const s=state.steps.find(x=>x.id===id);
  if(s){
    const cx=s.x+SW/2;
    if(port==='top') return {x:cx, y:s.y};
    if(port==='bottom') return {x:cx, y:s.y+SH};
    return {x:cx, y:s.y+SH/2};
  }
  const t=state.transitions.find(x=>x.id===id);
  if(t){
    const cx=t.x+TW/2;
    if(port==='top') return {x:cx, y:t.y-10};
    if(port==='bottom') return {x:cx, y:t.y+TH+10};
    return {x:cx, y:t.y+TH/2};
  }
  const p=state.parallels.find(x=>x.id===id);
  if(p){
    const barH=PH*2+4;
    if(port==='top') return {x:p.x+p.width/2, y:p.y};
    if(port==='bottom') return {x:p.x+p.width/2, y:p.y+barH};
    if(port?.startsWith('top-')){
      const idx=+port.split('-')[1];
      const ports=p.ports||3;
      const spacing=p.width/(ports);
      return {x:p.x+spacing*(idx+.5), y:p.y};
    }
    if(port?.startsWith('bottom-')){
      const idx=+port.split('-')[1];
      const ports=p.ports||3;
      const spacing=p.width/(ports);
      return {x:p.x+spacing*(idx+.5), y:p.y+barH};
    }
    return {x:p.x+p.width/2, y:p.y+barH/2};
  }
  return null;
}
function buildConnEl(c) {
  const fp=getPortXY(c.from, c.fromPort||'bottom');
  const tp=getPortXY(c.to, c.toPort||'top');
  if(!fp||!tp) return null;
  const g=svgE('g'); g.setAttribute('class','gf-conn'+(selIds.has(c.id)?' sel':''));
  g.dataset.id=c.id; g.dataset.type='connection';
  const path=svgE('path');
  const dx=fp.x-tp.x, dy=fp.y-tp.y;
  let d;
  if(Math.abs(dx)<2) {
    d=`M${fp.x},${fp.y} L${tp.x},${tp.y}`;
  } else {
    const my=(fp.y+tp.y)/2;
    d=`M${fp.x},${fp.y} L${fp.x},${my} L${tp.x},${my} L${tp.x},${tp.y}`;
  }
  path.setAttribute('d',d);
  path.setAttribute('marker-end', selIds.has(c.id)?'url(#arr-sel)':'url(#arr)');
  g.appendChild(path);
  g.addEventListener('click', e=>{e.stopPropagation(); selectEl(c.id,'connection',e);});
  return g;
}

// ── Elements ──
function renderEl() {
  const layer=document.getElementById('el-layer');
  layer.innerHTML='';
  state.parallels.forEach(p=>layer.appendChild(buildParEl(p)));
  state.steps.forEach(s=>layer.appendChild(buildStepEl(s)));
  state.transitions.forEach(t=>layer.appendChild(buildTransEl(t)));
}

function buildStepEl(s) {
  const g=svgE('g'); g.setAttribute('class','gf-step'); g.id='el-'+s.id;
  g.dataset.id=s.id; g.dataset.type='step';
  const sel=selIds.has(s.id);

  // Body
  const body=svgE('rect'); body.setAttribute('class','s-body'+(sel?' sel':''));
  body.setAttribute('x',s.x);body.setAttribute('y',s.y);body.setAttribute('width',SW);body.setAttribute('height',SH);body.setAttribute('rx','2');
  g.appendChild(body);

  // Initial double border
  if(s.initial){
    const ob=svgE('rect'); ob.setAttribute('class','s-init');
    ob.setAttribute('x',s.x+3);ob.setAttribute('y',s.y+3);ob.setAttribute('width',SW-6);ob.setAttribute('height',SH-6);ob.setAttribute('rx','1');
    g.appendChild(ob);
  }

  // Number area (left portion)
  const numW=34;
  const div=svgE('line'); div.setAttribute('class','s-divider');
  div.setAttribute('x1',s.x+numW);div.setAttribute('y1',s.y+4);div.setAttribute('x2',s.x+numW);div.setAttribute('y2',s.y+SH-4);
  g.appendChild(div);

  const num=svgE('text'); num.setAttribute('class','s-num');
  num.setAttribute('x',s.x+numW/2); num.setAttribute('y',s.y+SH/2+4);
  num.setAttribute('text-anchor','middle');
  num.textContent=String(s.number).padStart(2,'0');
  g.appendChild(num);

  // Label area (right of divider)
  if(s.label){
    const lbl=svgE('text'); lbl.setAttribute('class','s-lbl');
    lbl.setAttribute('x',s.x+numW+6); lbl.setAttribute('y',s.y+SH/2+4);
    lbl.textContent=s.label.length>13?s.label.slice(0,12)+'…':s.label;
    g.appendChild(lbl);
  }

  // Action box — IEC 61131-3 qualified actions, dynamic height
  const acts = getStepActions(s); // [{qualifier,variable,time}]
  const hasAct = acts.length > 0;
  if(hasAct){
    const lineH=15, pad=6;
    const aH=Math.max(SH, acts.length*lineH+pad*2);
    // Box
    const ab=svgE('rect'); ab.setAttribute('class','s-act-box');
    ab.setAttribute('x',s.x+SW); ab.setAttribute('y',s.y);
    ab.setAttribute('width',ACT_W); ab.setAttribute('height',aH);
    g.appendChild(ab);
    // Vertical separator line
    const vsep=svgE('line');
    vsep.setAttribute('x1',s.x+SW+18);vsep.setAttribute('y1',s.y+2);
    vsep.setAttribute('x2',s.x+SW+18);vsep.setAttribute('y2',s.y+aH-2);
    vsep.setAttribute('stroke','#1e3a5a');vsep.setAttribute('stroke-width','1');
    g.appendChild(vsep);

    acts.forEach((act,i)=>{
      const y0=s.y+pad+lineH*i+lineH-4;
      // Qualifier badge
      const qColor=ACT_QUAL_COLORS[act.qualifier]||'#f5a623';
      const qBg=svgE('rect');
      qBg.setAttribute('x',s.x+SW+2);qBg.setAttribute('y',s.y+pad+lineH*i+1);
      qBg.setAttribute('width',14);qBg.setAttribute('height',lineH-3);
      qBg.setAttribute('rx','2');qBg.setAttribute('fill',qColor);qBg.setAttribute('opacity','.18');
      g.appendChild(qBg);
      const qt=svgE('text');
      qt.setAttribute('x',s.x+SW+9);qt.setAttribute('y',y0-1);
      qt.setAttribute('text-anchor','middle');qt.setAttribute('font-size','9');
      qt.setAttribute('font-family','Share Tech Mono,monospace');qt.setAttribute('font-weight','bold');
      qt.setAttribute('fill',qColor);
      qt.textContent=act.qualifier||'N';
      g.appendChild(qt);
      // Variable name
      const varTxt=svgE('text'); varTxt.setAttribute('class','s-act-txt');
      varTxt.setAttribute('x',s.x+SW+22);varTxt.setAttribute('y',y0-1);
      varTxt.setAttribute('font-size','10');
      const vdisp=act.variable||(act.address?'@'+act.address:'');
      varTxt.textContent=vdisp.length>14?vdisp.slice(0,13)+'\u2026':vdisp;
      g.appendChild(varTxt);
      // Time for L/D
      if((act.qualifier==='L'||act.qualifier==='D')&&act.time){
        const tt=svgE('text');
        tt.setAttribute('x',s.x+SW+ACT_W-3);tt.setAttribute('y',y0-1);
        tt.setAttribute('text-anchor','end');tt.setAttribute('font-size','8');
        tt.setAttribute('fill','#22d3ee');tt.setAttribute('font-family','Share Tech Mono,monospace');
        tt.textContent=act.time;
        g.appendChild(tt);
      }
      // Row separator
      if(i<acts.length-1){
        const rl=svgE('line');
        rl.setAttribute('x1',s.x+SW+1);rl.setAttribute('y1',s.y+pad+lineH*(i+1));
        rl.setAttribute('x2',s.x+SW+ACT_W-1);rl.setAttribute('y2',s.y+pad+lineH*(i+1));
        rl.setAttribute('stroke','#1e3050');rl.setAttribute('stroke-width','0.5');
        g.appendChild(rl);
      }
    });
    if(aH>SH){
      const extLine=svgE('line');
      extLine.setAttribute('x1',s.x);extLine.setAttribute('y1',s.y+aH);
      extLine.setAttribute('x2',s.x+SW);extLine.setAttribute('y2',s.y+aH);
      extLine.setAttribute('stroke','#2a3a55');extLine.setAttribute('stroke-width','1');
      g.appendChild(extLine);
    }
  }

  // Ports
  addPort(g, s.x+SW/2, s.y, s.id,'step','top');
  addPort(g, s.x+SW/2, s.y+SH, s.id,'step','bottom');

  g.addEventListener('mousedown',e=>elDown(e,s.id,'step'));
  g.addEventListener('click',e=>{e.stopPropagation();selectEl(s.id,'step',e);});
  return g;
}

function buildTransEl(t) {
  const g=svgE('g'); g.setAttribute('class','gf-trans'); g.id='el-'+t.id;
  g.dataset.id=t.id; g.dataset.type='transition';
  const sel=selIds.has(t.id);
  const cx=t.x+TW/2;

  const vl=svgE('line'); vl.setAttribute('class','t-vline');
  vl.setAttribute('x1',cx);vl.setAttribute('y1',t.y-10);vl.setAttribute('x2',cx);vl.setAttribute('y2',t.y+TH+10);
  g.appendChild(vl);

  const bar=svgE('rect'); bar.setAttribute('class','t-bar'+(sel?' sel':''));
  bar.setAttribute('x',t.x);bar.setAttribute('y',t.y);bar.setAttribute('width',TW);bar.setAttribute('height',TH);bar.setAttribute('rx','1');
  g.appendChild(bar);

  if(t.condition){
    const ct=svgE('text'); ct.setAttribute('class','t-cond');
    ct.setAttribute('x',t.x+TW+8); ct.setAttribute('y',t.y+7);
    ct.textContent=t.condition;
    g.appendChild(ct);
  }
  if(t.label){
    const lt=svgE('text'); lt.setAttribute('class','t-lbl');
    lt.setAttribute('x',cx); lt.setAttribute('y',t.y-4);
    lt.setAttribute('text-anchor','middle');
    lt.textContent=t.label;
    g.appendChild(lt);
  }

  addPort(g, cx, t.y-10, t.id,'transition','top');
  addPort(g, cx, t.y+TH+10, t.id,'transition','bottom');

  g.addEventListener('mousedown',e=>elDown(e,t.id,'transition'));
  g.addEventListener('click',e=>{e.stopPropagation();selectEl(t.id,'transition',e);});
  return g;
}

function buildParEl(p) {
  const g=svgE('g'); g.setAttribute('class','gf-par'); g.id='el-'+p.id;
  g.dataset.id=p.id; g.dataset.type='parallel';
  const sel=selIds.has(p.id);
  const barH=PH*2+4;
  const isSplit=p.type==='split';
  const ports=p.ports||3;
  const spacing=p.width/ports;
  const cx=p.x+p.width/2;

  // ── Hit area FIRST (lowest z-order) so ports sit on top ──
  const hit=svgE('rect');
  hit.setAttribute('x',p.x-8); hit.setAttribute('y',p.y-8);
  hit.setAttribute('width',p.width+16); hit.setAttribute('height',barH+16);
  hit.setAttribute('fill','transparent');
  g.appendChild(hit);

  // Double bar
  const bar1=svgE('line'); bar1.setAttribute('class','p-bar1'+(sel?' sel':''));
  bar1.setAttribute('x1',p.x);bar1.setAttribute('y1',p.y);bar1.setAttribute('x2',p.x+p.width);bar1.setAttribute('y2',p.y);
  g.appendChild(bar1);
  const bar2=svgE('line'); bar2.setAttribute('class','p-bar2'+(sel?' sel':''));
  bar2.setAttribute('x1',p.x);bar2.setAttribute('y1',p.y+barH);bar2.setAttribute('x2',p.x+p.width);bar2.setAttribute('y2',p.y+barH);
  g.appendChild(bar2);

  // Label
  const lbl=svgE('text'); lbl.setAttribute('class','p-lbl');
  lbl.setAttribute('x',p.x); lbl.setAttribute('y',p.y-6);
  lbl.textContent=isSplit?'AND-SPLIT':'AND-JOIN';
  g.appendChild(lbl);

  // Center vertical line (single-connection side)
  const cv=svgE('line'); cv.setAttribute('class','p-vline');
  if(isSplit){cv.setAttribute('x1',cx);cv.setAttribute('y1',p.y-18);cv.setAttribute('x2',cx);cv.setAttribute('y2',p.y);}
  else       {cv.setAttribute('x1',cx);cv.setAttribute('y1',p.y+barH);cv.setAttribute('x2',cx);cv.setAttribute('y2',p.y+barH+18);}
  g.appendChild(cv);

  // Branch vertical lines
  for(let i=0;i<ports;i++){
    const bx=p.x+spacing*(i+.5);
    const bv=svgE('line'); bv.setAttribute('class','p-vline');
    if(isSplit){bv.setAttribute('x1',bx);bv.setAttribute('y1',p.y+barH);bv.setAttribute('x2',bx);bv.setAttribute('y2',p.y+barH+18);}
    else       {bv.setAttribute('x1',bx);bv.setAttribute('y1',p.y-18);bv.setAttribute('x2',bx);bv.setAttribute('y2',p.y);}
    g.appendChild(bv);
    // Branch index label
    const bidx=svgE('text'); bidx.setAttribute('font-size','8');
    bidx.setAttribute('fill','rgba(167,139,250,.5)'); bidx.setAttribute('text-anchor','middle');
    bidx.setAttribute('font-family','monospace');
    if(isSplit){bidx.setAttribute('x',bx);bidx.setAttribute('y',p.y+barH+30);}
    else       {bidx.setAttribute('x',bx);bidx.setAttribute('y',p.y-22);}
    bidx.textContent='B'+(i+1);
    g.appendChild(bidx);
  }

  // Resize handles
  ['left','right'].forEach(side=>{
    const rx2=svgE('rect'); rx2.setAttribute('class','p-resize');
    rx2.setAttribute('x', side==='left'?p.x-6:p.x+p.width-6);
    rx2.setAttribute('y',p.y-2); rx2.setAttribute('width',12); rx2.setAttribute('height',barH+4);
    rx2.dataset.side=side;
    rx2.addEventListener('mousedown',e=>{e.stopPropagation();startResize(e,p.id,side);});
    g.appendChild(rx2);
  });

  // ── Ports LAST (highest z-order) so they receive clicks ──
  // Single port (Transition side)
  const singPY = isSplit ? p.y : p.y+barH;
  const singPort = isSplit?'top':'bottom';
  addParPort(g, cx, singPY, p.id, singPort, true);

  // Branch ports (Step side) — one per branch, each individually clickable
  const branchPY = isSplit ? p.y+barH : p.y;
  for(let i=0;i<ports;i++){
    const bx=p.x+spacing*(i+.5);
    const bPort = isSplit?`bottom-${i}`:`top-${i}`;
    addParPort(g, bx, branchPY, p.id, bPort, false);
  }

  g.addEventListener('mousedown',e=>elDown(e,p.id,'parallel'));
  g.addEventListener('click',e=>{e.stopPropagation();selectEl(p.id,'parallel',e);});
  return g;
}

// Parallel bar ports — drag-to-connect, distinct colors per role, direction-aware
function addParPort(g, x, y, id, port, isSingleSide) {
  const isSplit = state.parallels.find(p=>p.id===id)?.type==='split';
  // Color logic:
  //   AND-Split: top (single input from Transition) = green; bottom-N (output to Step) = purple
  //   AND-Join:  top-N (input from Step) = purple; bottom (single output to Transition) = green
  const isInputPort = isSplit ? port==='top' : port.startsWith('top-');
  const portColor = isSingleSide ? 'var(--green)' : 'var(--purple)';
  const dirLabel = isSplit
    ? (port==='top' ? '←T' : 'S→')
    : (port.startsWith('top-') ? '←S' : 'T→');

  // Outer glow ring
  const ring = svgE('circle');
  ring.setAttribute('cx',x); ring.setAttribute('cy',y); ring.setAttribute('r','12');
  ring.setAttribute('fill','none');
  ring.setAttribute('stroke', portColor);
  ring.setAttribute('stroke-width','1.5');
  ring.setAttribute('opacity','0');
  ring.setAttribute('class','par-port-ring');
  ring.setAttribute('pointer-events','none');
  g.appendChild(ring);

  // Direction arrow indicator (shows on hover)
  const dirT = svgE('text');
  dirT.setAttribute('x', x); dirT.setAttribute('y', y + (isSplit?(port==='top'?-14:14):(port.startsWith('top-')?-14:14)));
  dirT.setAttribute('text-anchor','middle'); dirT.setAttribute('font-size','7');
  dirT.setAttribute('fill', portColor); dirT.setAttribute('opacity','0');
  dirT.setAttribute('pointer-events','none'); dirT.setAttribute('class','par-port-ring');
  dirT.setAttribute('font-family','monospace');
  dirT.textContent = dirLabel;
  g.appendChild(dirT);

  const c = svgE('circle');
  c.setAttribute('class','conn-port');
  c.setAttribute('cx',x); c.setAttribute('cy',y); c.setAttribute('r','9');
  c.setAttribute('fill', portColor);
  c.setAttribute('stroke','var(--bg)'); c.setAttribute('stroke-width','1.5');
  c.dataset.id=id; c.dataset.type='parallel'; c.dataset.port=port;
  c.setAttribute('style','pointer-events:all;cursor:crosshair;');

  c.addEventListener('mouseenter',()=>{
    ring.setAttribute('opacity','0.7');
    dirT.setAttribute('opacity','0.9');
    c.setAttribute('r','11');
  });
  c.addEventListener('mouseleave',()=>{
    ring.setAttribute('opacity','0');
    dirT.setAttribute('opacity','0');
    c.setAttribute('r','9');
  });

  // Mousedown on port = start drag-connect immediately
  c.addEventListener('mousedown', e=>{
    e.stopPropagation();
    e.preventDefault();
    if(tool==='delete') return;
    // Start connecting from this specific port
    startPortDragConnect(id, 'parallel', port, x, y, e);
  });

  // Click also works (for tool=connect mode)
  c.addEventListener('click', e=>{
    e.stopPropagation();
    handlePortClick(id,'parallel',port);
  });

  g.appendChild(c);
}

// Also upgrade regular addPort to support drag-to-connect
function addPort(g, x, y, id, type, port) {
  const c=svgE('circle'); c.setAttribute('class','conn-port');
  c.setAttribute('cx',x); c.setAttribute('cy',y); c.setAttribute('r','7');
  c.dataset.id=id; c.dataset.type=type; c.dataset.port=port;
  c.addEventListener('click',e=>{e.stopPropagation();handlePortClick(id,type,port);});
  c.addEventListener('mousedown',e=>{
    e.stopPropagation();
    if(tool==='select'||tool==='connect'){
      startPortDragConnect(id, type, port, x, y, e);
    }
  });
  g.appendChild(c);
}

// Drag-to-connect: start connecting from a port via mousedown
let portDragging = false;

function startPortDragConnect(id, type, port, wx, wy, e) {
  // If already connecting, treat as target click
  if(connecting) {
    handlePortClick(id, type, port);
    return;
  }
  // Begin connect from this port
  portDragging = true;
  connecting = true;
  connFrom = {id, type, port};
  document.getElementById('conn-hint').style.display='block';
  document.getElementById('s-tool').textContent = 'CONNECTING FROM '+id+' ['+port+']';
  // Show ghost line from port position
  const fp = getPortXY(id, port);
  if(fp){
    document.getElementById('ghost-path').setAttribute('d',`M${fp.x},${fp.y} L${fp.x},${fp.y}`);
    document.getElementById('ghost-path').setAttribute('display','');
  }
  // Listen for mouseup on SVG to finish connection
  const svg = document.getElementById('svg-canvas');
  function onDragUp(ev) {
    svg.removeEventListener('mouseup', onDragUp);
    portDragging = false;
    if(!connecting) return;
    // Find element under mouse
    const p = w2s(ev.clientX, ev.clientY);
    const target = findElementAt(p.x, p.y);
    if(target && target.id !== id) {
      const tp = target.type==='parallel'
        ? getNearestParPort(state.parallels.find(x=>x.id===target.id), p.x, p.y)
        : guessTargetPort(connFrom, target.id, target.type, null);
      addConn(connFrom.id, connFrom.port, target.id, tp);
    }
    cancelConnect();
  }
  svg.addEventListener('mouseup', onDragUp);
}

// Find which element (step/transition/parallel) is at world coords
function findElementAt(wx, wy) {
  for(const s of state.steps){
    if(wx>=s.x&&wx<=s.x+SW&&wy>=s.y&&wy<=s.y+SH) return {id:s.id,type:'step'};
  }
  for(const t of state.transitions){
    if(wx>=t.x&&wx<=t.x+TW&&wy>=t.y-12&&wy<=t.y+TH+12) return {id:t.id,type:'transition'};
  }
  for(const p of state.parallels){
    const barH=PH*2+4;
    if(wx>=p.x&&wx<=p.x+p.width&&wy>=p.y-16&&wy<=p.y+barH+16) return {id:p.id,type:'parallel'};
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
//  ELEMENT CREATION
// ═══════════════════════════════════════════════════════════
function addStep(x,y,init=false){
  const id='S'+(nextId++);
  state.steps.push({id,x:snap(x-SW/2),y:snap(y-SH/2),number:nextStepNum++,label:'',actions:[],initial:init});
  afterChange(); return id;
}
function addTransition(x,y){
  const id='T'+(nextId++);
  state.transitions.push({id,x:snap(x-TW/2),y:snap(y-TH/2),condition:'',label:''});
  afterChange(); return id;
}
function addParallel(x,y,type){
  const id='B'+(nextId++);
  state.parallels.push({id,x:snap(x-100),y:snap(y),type,width:200,ports:3});
  afterChange(); return id;
}
function addConn(from,fromPort,to,toPort){
  const ft=getElType(from), tt=getElType(to);
  // Validate
  const ok=(ft==='step'&&tt==='transition')||(ft==='transition'&&tt==='step')||
           (ft==='step'&&tt==='parallel')||(ft==='parallel'&&tt==='step')||
           (ft==='transition'&&tt==='parallel')||(ft==='parallel'&&tt==='transition');
  if(!ok){toast('⚠ Invalid connection: Step↔Transition or Step/Trans↔ParallelBar');return false;}
  if(state.connections.find(c=>c.from===from&&c.to===to&&c.fromPort===fromPort&&c.toPort===toPort)){
    toast('⚠ Duplicate connection');return false;
  }
  state.connections.push({id:'C'+(nextId++),from,fromPort:fromPort||'bottom',to,toPort:toPort||'top'});
  afterChange(); return true;
}
function getElType(id){
  if(state.steps.find(s=>s.id===id)) return 'step';
  if(state.transitions.find(t=>t.id===id)) return 'transition';
  if(state.parallels.find(p=>p.id===id)) return 'parallel';
  return null;
}

// ═══════════════════════════════════════════════════════════
//  SELECTION
// ═══════════════════════════════════════════════════════════
function selectEl(id, type, e) {
  if(e?.shiftKey) { selIds.has(id)?selIds.delete(id):selIds.add(id); }
  else { selIds.clear(); if(id) selIds.add(id); }
  // Close diagram props panel if open
  if(diagPropsId) closeDiagPropsPanel();
  render(); updateProps();
}
function updateProps() {
  const ids=[...selIds];
  // Align bar
  updateAlignBtns();
  if(ids.length===0){
    show('no-sel'); hide('step-props'); hide('trans-props'); hide('par-props'); return;
  }
  if(ids.length===1){
    const id=ids[0];
    const s=state.steps.find(x=>x.id===id);
    if(s){ hide('no-sel');show('step-props');hide('trans-props');hide('par-props');
      document.getElementById('px-x').value=s.x;
      document.getElementById('px-y').value=s.y;
      document.getElementById('px-num').value=s.number;
      document.getElementById('px-lbl').value=s.label||'';
      document.getElementById('px-init').checked=s.initial||false;
      renderActEditor(s);
      return;
    }
    const t=state.transitions.find(x=>x.id===id);
    if(t){ hide('no-sel');hide('step-props');show('trans-props');hide('par-props');
      document.getElementById('tx-x').value=t.x;
      document.getElementById('tx-y').value=t.y;
      document.getElementById('tx-cond').value=t.condition||'';
      document.getElementById('tx-lbl').value=t.label||'';
      return;
    }
    const p=state.parallels.find(x=>x.id===id);
    if(p){ hide('no-sel');hide('step-props');hide('trans-props');show('par-props');
      document.getElementById('bx-x').value=p.x;
      document.getElementById('bx-y').value=p.y;
      document.getElementById('bx-w').value=p.width;
      document.getElementById('bx-ports').value=p.ports||3;
      document.getElementById('bx-type').textContent=p.type==='split'?'AND-SPLIT (divergence)':'AND-JOIN (convergence)';
      return;
    }
  }
  // Multiple selected
  hide('no-sel');hide('step-props');hide('trans-props');hide('par-props');
}
function updateAlignBtns() {
  const multi = selIds.size >= 2;
  const anyEl = selIds.size >= 1;
  const alignIds = ['ab-left','ab-centerX','ab-right','ab-distH','ab-top','ab-centerY','ab-bottom','ab-distV'];
  alignIds.forEach(id=>{
    const btn = document.getElementById(id);
    if(btn){
      const needsMulti = id==='ab-distH'||id==='ab-distV';
      btn.disabled = needsMulti ? !multi : !anyEl;
    }
  });
}
function setProp(prop, val) {
  const id=[...selIds][0]; if(!id) return;
  const s=state.steps.find(x=>x.id===id);
  if(s){s[prop]=val;afterChange();return;}
  const t=state.transitions.find(x=>x.id===id);
  if(t){t[prop]=val;afterChange();return;}
  const p=state.parallels.find(x=>x.id===id);
  if(p){p[prop]=val;afterChange();}
}
function setPropCoord(coord, val) {
  const v=snap(+val);
  const id=[...selIds][0]; if(!id) return;
  const s=state.steps.find(x=>x.id===id);
  if(s){s[coord]=v;afterChange();return;}
  const t=state.transitions.find(x=>x.id===id);
  if(t){t[coord]=v;afterChange();return;}
  const p=state.parallels.find(x=>x.id===id);
  if(p){p[coord]=v;afterChange();}
}
function delSelected(){[...selIds].forEach(id=>{deleteEl(id);});selIds.clear();updateProps();}
function deleteEl(id){
  state.steps=state.steps.filter(s=>s.id!==id);
  state.transitions=state.transitions.filter(t=>t.id!==id);
  state.parallels=state.parallels.filter(p=>p.id!==id);
  state.connections=state.connections.filter(c=>c.from!==id&&c.to!==id&&c.id!==id);
  selIds.delete(id);
  afterChange();
}

// ═══════════════════════════════════════════════════════════
//  ALIGNMENT
// ═══════════════════════════════════════════════════════════
function getElRect(id) {
  const s=state.steps.find(x=>x.id===id);
  if(s) return {x:s.x,y:s.y,w:SW,h:SH,el:s};
  const t=state.transitions.find(x=>x.id===id);
  if(t) return {x:t.x,y:t.y,w:TW,h:TH,el:t};
  const p=state.parallels.find(x=>x.id===id);
  if(p) return {x:p.x,y:p.y,w:p.width,h:PH*2+4,el:p};
  return null;
}
function alignSel(mode) {
  const ids=[...selIds].filter(id=>getElType(id)!=='connection');
  if(ids.length<2) return;
  const rects=ids.map(id=>({id,...getElRect(id)})).filter(r=>r.x!==undefined);
  const minX=Math.min(...rects.map(r=>r.x));
  const maxX=Math.max(...rects.map(r=>r.x+r.w));
  const minY=Math.min(...rects.map(r=>r.y));
  const maxY=Math.max(...rects.map(r=>r.y+r.h));
  const cX=(minX+maxX)/2, cY=(minY+maxY)/2;
  rects.forEach(r=>{
    if(mode==='left') r.el.x=snap(minX);
    if(mode==='right') r.el.x=snap(maxX-r.w);
    if(mode==='top') r.el.y=snap(minY);
    if(mode==='bottom') r.el.y=snap(maxY-r.h);
    if(mode==='centerX') r.el.x=snap(cX-r.w/2);
    if(mode==='centerY') r.el.y=snap(cY-r.h/2);
  });
  if(mode==='distH'){
    const sorted=rects.slice().sort((a,b)=>a.x-b.x);
    const totalW=sorted.reduce((s,r)=>s+r.w,0);
    const gap=(maxX-minX-totalW)/(sorted.length-1);
    let cx2=minX;
    sorted.forEach(r=>{r.el.x=snap(cx2);cx2+=r.w+gap;});
  }
  if(mode==='distV'){
    const sorted=rects.slice().sort((a,b)=>a.y-b.y);
    const totalH=sorted.reduce((s,r)=>s+r.h,0);
    const gap=(maxY-minY-totalH)/(sorted.length-1);
    let cy2=minY;
    sorted.forEach(r=>{r.el.y=snap(cy2);cy2+=r.h+gap;});
  }
  afterChange();
}

// ═══════════════════════════════════════════════════════════
//  MOUSE INTERACTIONS
// ═══════════════════════════════════════════════════════════
function cvDown(e) {
  if(e.button===1||(e.button===0&&e.altKey)){panning=true;panSX=e.clientX-viewX;panSY=e.clientY-viewY;return;}
  if(e.button!==0) return;
  hideCtx();
  const p=w2s(e.clientX,e.clientY);
  if(tool==='step'){addStep(p.x,p.y,false);return;}
  if(tool==='initstep'){addStep(p.x,p.y,true);return;}
  if(tool==='transition'){addTransition(p.x,p.y);return;}
  if(tool==='par-split'){addParallel(p.x,p.y,'split');return;}
  if(tool==='par-join'){addParallel(p.x,p.y,'join');return;}
  // Selection box
  if(tool==='select'&&!e.target.closest('.gf-step,.gf-trans,.gf-par')){
    if(!e.shiftKey) selIds.clear();
    selBoxing=true; selBoxSX=p.x; selBoxSY=p.y;
    const sb=document.getElementById('sel-box');
    sb.setAttribute('x',p.x);sb.setAttribute('y',p.y);sb.setAttribute('width',0);sb.setAttribute('height',0);sb.setAttribute('display','');
    panning=true; panSX=e.clientX-viewX; panSY=e.clientY-viewY;
    return;
  }
}
function cvMove(e) {
  if(dragging||panning||connecting||resizingBar) e.preventDefault();
  const p=w2s(e.clientX,e.clientY);
  document.getElementById('s-cx').textContent=Math.round(p.x);
  document.getElementById('s-cy').textContent=Math.round(p.y);
  if(panning&&!selBoxing){viewX=e.clientX-panSX;viewY=e.clientY-panSY;applyView();return;}
  if(selBoxing){
    const sx=Math.min(p.x,selBoxSX), sy=Math.min(p.y,selBoxSY);
    const sw=Math.abs(p.x-selBoxSX), sh=Math.abs(p.y-selBoxSY);
    const sb=document.getElementById('sel-box');
    sb.setAttribute('x',sx);sb.setAttribute('y',sy);sb.setAttribute('width',sw);sb.setAttribute('height',sh);
    return;
  }
  if(dragging&&dragMap.size>0){
    dragMap.forEach((off,id)=>{
      const s=state.steps.find(x=>x.id===id);
      if(s){s.x=snap(p.x-off.dx);s.y=snap(p.y-off.dy);}
      const t=state.transitions.find(x=>x.id===id);
      if(t){t.x=snap(p.x-off.dx);t.y=snap(p.y-off.dy);}
      const pb=state.parallels.find(x=>x.id===id);
      if(pb){pb.x=snap(p.x-off.dx);pb.y=snap(p.y-off.dy);}
    });
    render();
    // Update coord fields if single selection
    if(selIds.size===1) updateProps();
    return;
  }
  if(resizingBar){
    const pb=state.parallels.find(x=>x.id===resizingBar.id);
    if(pb){
      const dx=p.x-resizeStartX;
      if(resizingBar.side==='right') pb.width=snap(Math.max(80,resizeStartW+dx));
      else {pb.x=snap(Math.min(p.x,resizingBar.origX+resizeStartW-80));pb.width=snap(Math.max(80,resizeStartW-dx));}
      render();
    }
    return;
  }
  if(connecting&&connFrom){
    const fp=getPortXY(connFrom.id,connFrom.port);
    if(fp){
      document.getElementById('ghost-path').setAttribute('d',`M${fp.x},${fp.y} L${p.x},${p.y}`);
      document.getElementById('ghost-path').setAttribute('display','');
    }
  }
}
function cvUp(e) {
  if(selBoxing){
    finishSelBox();
    selBoxing=false;
    document.getElementById('sel-box').setAttribute('display','none');
  }
  if(panning){panning=false;}
  if(dragging){dragging=false;dragMap.clear();afterChange();}
  if(resizingBar){resizingBar=null;afterChange();}
}
function finishSelBox() {
  const sb=document.getElementById('sel-box');
  const bx=+sb.getAttribute('x'),by=+sb.getAttribute('y'),bw=+sb.getAttribute('width'),bh=+sb.getAttribute('height');
  if(bw<4&&bh<4){selectEl(null,null);return;}
  state.steps.forEach(s=>{if(s.x+SW>=bx&&s.x<=bx+bw&&s.y+SH>=by&&s.y<=by+bh) selIds.add(s.id);});
  state.transitions.forEach(t=>{if(t.x+TW>=bx&&t.x<=bx+bw&&t.y+TH>=by&&t.y<=by+bh) selIds.add(t.id);});
  state.parallels.forEach(p=>{if(p.x+p.width>=bx&&p.x<=bx+bw&&p.y+(PH*2+4)>=by&&p.y<=by+bh) selIds.add(p.id);});
  render(); updateProps();
}
function cvDbl(e) {
  if(e.target.closest('.gf-step,.gf-trans,.gf-par')) return;
  const p=w2s(e.clientX,e.clientY);
  if(tool==='select') addStep(p.x,p.y);
}
function cvRClick(e) {
  e.preventDefault();
  const el=e.target.closest('.gf-step,.gf-trans,.gf-par');
  if(!el){hideCtx();return;}
  ctxTarget={id:el.dataset.id,type:el.dataset.type};
  selectEl(ctxTarget.id,ctxTarget.type);
  showCtx(e.clientX,e.clientY);
}
function elDown(e,id,type) {
  if(e.button!==0) return; e.stopPropagation();
  if(tool==='delete'){deleteEl(id);return;}
  if(tool==='connect'){
    if(type==='parallel'){
      // Find nearest port to mouse click position
      const pb=state.parallels.find(x=>x.id===id);
      if(pb){
        const mp=w2s(e.clientX,e.clientY);
        const nearPort=getNearestParPort(pb,mp.x,mp.y);
        handlePortClick(id,'parallel',nearPort);
      }
    } else {
      handlePortClick(id,type,'bottom');
    }
    return;
  }
  if(tool==='select'){
    if(!selIds.has(id)){
      if(!e.shiftKey) selIds.clear();
      selIds.add(id);
      updateProps();
    }
    dragging=true;
    const p=w2s(e.clientX,e.clientY);
    selIds.forEach(sid=>{
      const r=getElRect(sid);
      if(r) dragMap.set(sid,{dx:p.x-r.x,dy:p.y-r.y});
    });
    const r=getElRect(id);
    if(r&&!dragMap.has(id)) dragMap.set(id,{dx:p.x-r.x,dy:p.y-r.y});
  }
}

// Find nearest port on a parallel bar given mouse world coords
function getNearestParPort(pb, mx, my) {
  const barH=PH*2+4;
  const isSplit=pb.type==='split';
  const ports=pb.ports||3;
  const spacing=pb.width/ports;
  const cx=pb.x+pb.width/2;

  // Single-side port (center)
  const singPY = isSplit ? pb.y : pb.y+barH;
  // Branch-side Y
  const branchPY = isSplit ? pb.y+barH : pb.y;

  // Build all port candidates
  const candidates=[];
  // Single (transition) port
  candidates.push({port: isSplit?'top':'bottom', x:cx, y:singPY});
  // Branch ports
  for(let i=0;i<ports;i++){
    const bx=pb.x+spacing*(i+.5);
    candidates.push({port: isSplit?`bottom-${i}`:`top-${i}`, x:bx, y:branchPY});
  }

  // Find closest by euclidean distance
  let best=candidates[0], bestDist=Infinity;
  candidates.forEach(c=>{
    const d=Math.hypot(c.x-mx, c.y-my);
    if(d<bestDist){bestDist=d;best=c;}
  });
  return best.port;
}
function startResize(e,id,side){
  e.stopPropagation();
  const pb=state.parallels.find(x=>x.id===id);
  if(!pb) return;
  resizingBar={id,side};
  const p=w2s(e.clientX,e.clientY);
  resizeStartX=p.x; resizeStartW=pb.width;
  resizingBar.origX=pb.x;
}

// ─── Connect ───
function handlePortClick(id,type,port) {
  if(!connecting){
    connecting=true;
    connFrom={id,type,port:port||'bottom'};
    setTool('connect');
    document.getElementById('conn-hint').style.display='block';
    document.getElementById('s-tool').textContent='CONNECTING FROM '+id;
  } else {
    if(connFrom.id===id){cancelConnect();return;}
    const tp = guessTargetPort(connFrom,id,type,port);
    addConn(connFrom.id,connFrom.port,id,tp);
    cancelConnect();
  }
}
function guessTargetPort(from, toId, toType, clickedPort) {
  // If a specific indexed port was clicked, always use it
  if(clickedPort && clickedPort!=='bottom' && clickedPort!=='top') return clickedPort;
  // For parallel bars, use nearest port logic if no specific port given
  if(toType==='parallel'){
    const pb=state.parallels.find(x=>x.id===toId);
    if(pb){
      const fp=getPortXY(from.id, from.port);
      if(fp) return getNearestParPort(pb, fp.x, fp.y);
    }
  }
  // For step/transition: use top if source is above target, else bottom
  const fp=getPortXY(from.id,from.port);
  const tp0=getPortXY(toId,'top');
  if(!fp||!tp0) return clickedPort||'top';
  return fp.y < tp0.y ? 'top' : 'bottom';
}
function cancelConnect(){
  connecting=false; connFrom=null;
  document.getElementById('ghost-path').setAttribute('display','none');
  document.getElementById('conn-hint').style.display='none';
  document.getElementById('s-tool').textContent=tool.toUpperCase();
}

// ═══════════════════════════════════════════════════════════
//  TOOLS
// ═══════════════════════════════════════════════════════════
const toolBtns=['select','step','initstep','transition','par-split','par-join','connect','delete'];
function setTool(t){
  tool=t;
  toolBtns.forEach(b=>{const el=document.getElementById('tb-'+b);if(el)el.classList.remove('active','amber','green','purple');});
  const el=document.getElementById('tb-'+t);
  if(el){
    el.classList.add('active');
    if(t==='connect') el.classList.add('amber');
    if(t==='par-split'||t==='par-join') el.classList.add('purple');
  }
  document.getElementById('s-tool').textContent=t.toUpperCase();
  const dot=document.getElementById('s-dot');
  dot.className='s-dot';
  if(t==='connect') dot.className='s-dot a';
  if(t==='delete') dot.className='s-dot r';
  document.getElementById('svg-canvas').style.cursor=t==='select'?'default':'crosshair';
  if(t!=='connect') cancelConnect();
}

// ═══════════════════════════════════════════════════════════
//  KEYBOARD
// ═══════════════════════════════════════════════════════════
function onKey(e){
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
  const k=e.key;
  if(k==='v'||k==='V') setTool('select');
  if(k==='s'||k==='S') setTool('step');
  if(k==='i'||k==='I') setTool('initstep');
  if(k==='t'||k==='T') setTool('transition');
  if(k==='p'||k==='P') setTool('par-split');
  if(k==='j'||k==='J') setTool('par-join');
  if(k==='c'||k==='C') setTool('connect');
  if(k==='d'||k==='D') setTool('delete');
  if(k==='f'||k==='F') fitView();
  if(k==='+'||k==='=') zoomIn();
  if(k==='-') zoomOut();
  if(k==='Escape'){cancelConnect();setTool('select');selIds.clear();render();updateProps();}
  if((k==='Delete'||k==='Backspace')&&selIds.size>0){delSelected();}
  if(k==='a'&&(e.ctrlKey||e.metaKey)){e.preventDefault();selectAll();}
  if(k==='z'&&(e.ctrlKey||e.metaKey)){/* undo placeholder */}
}
function selectAll(){
  state.steps.forEach(s=>selIds.add(s.id));
  state.transitions.forEach(t=>selIds.add(t.id));
  state.parallels.forEach(p=>selIds.add(p.id));
  render();updateProps();
}

// ═══════════════════════════════════════════════════════════
//  CONTEXT MENU
// ═══════════════════════════════════════════════════════════
function showCtx(x,y){const m=document.getElementById('ctx');m.style.display='block';m.style.left=x+'px';m.style.top=y+'px';}
function hideCtx(){document.getElementById('ctx').style.display='none';}
function ctxEdit(){hideCtx();updateProps();}
function ctxDup(){
  hideCtx(); if(!ctxTarget) return;
  const id=ctxTarget.id, type=ctxTarget.type;
  const r=getElRect(id); if(!r) return;
  if(type==='step'){const s=state.steps.find(x=>x.id===id);if(s)addStep(s.x+SW+20+SW/2,s.y+SH/2,s.initial);}
  else if(type==='transition'){const t=state.transitions.find(x=>x.id===id);if(t)addTransition(t.x+TW+20+TW/2,t.y+TH/2);}
  else if(type==='parallel'){const p=state.parallels.find(x=>x.id===id);if(p){const id2='B'+(nextId++);state.parallels.push({...p,id:id2,y:p.y+40});afterChange();}}
}
function ctxConn(){hideCtx();if(ctxTarget)handlePortClick(ctxTarget.id,ctxTarget.type,'bottom');}
function ctxDel(){hideCtx();if(ctxTarget)deleteEl(ctxTarget.id);}

// ═══════════════════════════════════════════════════════════
//  STATS & MINIMAP
// ═══════════════════════════════════════════════════════════
function updateStats(){
  document.getElementById('s-steps').textContent=state.steps.length;
  document.getElementById('s-trans').textContent=state.transitions.length;
  document.getElementById('s-bars').textContent=state.parallels.length;
  document.getElementById('s-conns').textContent=state.connections.length;
}
function miniMap(){
  const ms=document.getElementById('mini-svg'); ms.innerHTML='';
  const W=150,H=100;
  const all=[...state.steps.map(s=>({x:s.x,y:s.y,w:SW,h:SH})),...state.transitions.map(t=>({x:t.x,y:t.y,w:TW,h:TH})),...state.parallels.map(p=>({x:p.x,y:p.y,w:p.width,h:PH*2+4}))];
  if(!all.length) return;
  const minX=Math.min(...all.map(a=>a.x)),minY=Math.min(...all.map(a=>a.y));
  const maxX=Math.max(...all.map(a=>a.x+a.w)),maxY=Math.max(...all.map(a=>a.y+a.h));
  const sc=Math.min((W-12)/(maxX-minX||1),(H-12)/(maxY-minY||1));
  const ox=(W-(maxX-minX)*sc)/2,oy=(H-(maxY-minY)*sc)/2;
  const mx=x=>ox+(x-minX)*sc, my=y=>oy+(y-minY)*sc;
  state.connections.forEach(c=>{
    const f=getPortXY(c.from,c.fromPort||'bottom'),t=getPortXY(c.to,c.toPort||'top');
    if(!f||!t) return;
    const l=svgE('line');l.setAttribute('x1',mx(f.x));l.setAttribute('y1',my(f.y));l.setAttribute('x2',mx(t.x));l.setAttribute('y2',my(t.y));l.setAttribute('stroke','#2a3a5a');l.setAttribute('stroke-width','.8');ms.appendChild(l);
  });
  state.steps.forEach(s=>{const r=svgE('rect');r.setAttribute('x',mx(s.x));r.setAttribute('y',my(s.y));r.setAttribute('width',SW*sc);r.setAttribute('height',SH*sc);r.setAttribute('fill','#1a2035');r.setAttribute('stroke','#4fa3e3');r.setAttribute('stroke-width','.8');ms.appendChild(r);});
  state.transitions.forEach(t=>{const r=svgE('rect');r.setAttribute('x',mx(t.x));r.setAttribute('y',my(t.y));r.setAttribute('width',TW*sc);r.setAttribute('height',4);r.setAttribute('fill','#1a2a1a');r.setAttribute('stroke','#39d353');r.setAttribute('stroke-width','.8');ms.appendChild(r);});
  state.parallels.forEach(p=>{const l=svgE('line');l.setAttribute('x1',mx(p.x));l.setAttribute('y1',my(p.y));l.setAttribute('x2',mx(p.x+p.width));l.setAttribute('y2',my(p.y));l.setAttribute('stroke','#a78bfa');l.setAttribute('stroke-width','1.5');ms.appendChild(l);});
}

// ═══════════════════════════════════════════════════════════
//  AFTER CHANGE
// ═══════════════════════════════════════════════════════════
function afterChange(){
  render();
  markModified(activeDiagramId, true);
  saveAutoDiagram();
}
function saveAutoDiagram(){
  if(activeDiagramId) saveDiagramData(activeDiagramId);
}

// ═══════════════════════════════════════════════════════════
//  IMPORT / EXPORT
// ═══════════════════════════════════════════════════════════
function triggerImport(){ document.getElementById('file-input').click(); }
function handleImport(e) {
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try {
      const raw=JSON.parse(ev.target.result);

      // ── v1: single diagram ──
      if(raw.state&&raw.state.steps!==undefined) {
        const id='diag-'+Date.now();
        const name='Imported: '+file.name.replace(/\.(grafcet|json)$/,'');
        project.diagrams.push({
          id, name, unitId:null, folderId:null,
          mode:'Auto', diagramType:'Main',
          machine:project.machineName||'', unit:'', description:''
        });
        if(!raw.state.parallels) raw.state.parallels=[];
        if(!raw.state.vars) raw.state.vars=[];
        if(raw.state.connections) raw.state.connections=raw.state.connections.map(c=>({
          ...c, fromPort:c.fromPort||'bottom', toPort:c.toPort||'top'
        }));
        saveDiagramData(id, raw.state, raw.nextId||1, raw.nextStepNum||0, 60, 40, 1);
        saveProject(); renderTree(); openTab(id);
        toast('✓ Imported v1 diagram');
        return;
      }

      // ── v2/v3: full project ──
      if(raw.project&&raw.diagrams) {
        const ver = raw.version||'2.0';
        const mode = confirm(
          `Import project "${raw.project.name}" (v${ver})?\n\n` +
          `• REPLACE — clear current project and load this one\n` +
          `• MERGE — add to current project\n\n` +
          `OK = Replace  |  Cancel = Merge`
        );

        if(mode) {
          // REPLACE: clear everything
          project.diagrams.forEach(d=>deleteDiagramData(d.id));
          project = {
            id: raw.project.id||('proj-'+Date.now()),
            name: raw.project.name||'Imported',
            machineName: raw.project.machineName||raw.project.name||'Machine',
            units: (raw.units||[]).map(u=>({...u})),
            folders: (raw.folders||[]),
            diagrams: []
          };
          openTabs=[]; activeDiagramId=null;
        } else {
          // MERGE: add units from import (avoid duplicate IDs)
          if(!project.units) project.units=[];
          (raw.units||[]).forEach(u=>{
            if(!project.units.find(x=>x.id===u.id)){
              project.units.push({...u});
            }
          });
        }

        // Add diagrams
        raw.diagrams.forEach(d=>{
          const newId = mode ? d.id : ('diag-'+Date.now()+'-'+Math.random().toString(36).slice(2,6));
          const idMap = !mode && d.id!==newId ? {[d.id]:newId} : {};

          // Migrate data
          const data = d.data||{};
          if(!data.state) data.state={steps:[],transitions:[],parallels:[],connections:[],vars:[]};
          if(!data.state.parallels) data.state.parallels=[];
          if(!data.state.vars) data.state.vars=[];
          if(data.state.connections) data.state.connections=data.state.connections.map(c=>({
            ...c, fromPort:c.fromPort||'bottom', toPort:c.toPort||'top'
          }));

          // Restore full descriptor
          project.diagrams.push({
            id: newId,
            name: d.name||'Diagram',
            unitId: d.unitId||null,
            folderId: d.folderId||null,
            mode: d.mode||'Auto',
            diagramType: d.diagramType||'Main',
            machine: d.machine||raw.project?.machineName||'',
            unit: d.unit||'',
            description: d.description||''
          });

          saveDiagramData(
            newId,
            data.state,
            data.nextId||1,
            data.nextStepNum||0,
            data.viewX??60, data.viewY??40, data.viewScale??1
          );
        });

        saveProject(); renderTree(); renderTabs();
        const firstDiag = project.diagrams[0];
        if(firstDiag) openTab(firstDiag.id);
        toast(`✓ ${mode?'Replaced':'Merged'}: ${raw.diagrams.length} diagrams, ${(raw.units||[]).length} units`);
        return;
      }

      toast('⚠ Unknown file format');
    } catch(err){ toast('⚠ Import error: '+err.message); console.error(err); }
  };
  reader.readAsText(file); e.target.value='';
}

function exportProject() {
  flushState(); // ensure active diagram is saved first
  const diagrams = project.diagrams.map(d=>({
    // Full diagram descriptor
    id: d.id,
    name: d.name,
    unitId: d.unitId||null,
    folderId: d.folderId||null,
    mode: d.mode||'Auto',
    diagramType: d.diagramType||'Main',
    machine: d.machine||project.machineName||'',
    unit: d.unit||'',
    description: d.description||'',
    // Full diagram data (steps, transitions, vars, etc.)
    data: loadDiagramData(d.id)||{}
  }));
  const exp = {
    project: {
      id: project.id,
      name: project.name,
      machineName: project.machineName||project.name,
    },
    units: (project.units||[]).map(u=>({...u})),  // full units array
    folders: (project.folders||[]),                // legacy folders
    diagrams,
    version: '3.0',
    exported: new Date().toISOString()
  };
  const blob=new Blob([JSON.stringify(exp,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=project.name.replace(/\s+/g,'_')+'.grafcet2';
  a.click();
  toast('✓ Project exported (v3.0)');
}

function exportHTML() {
  if(!activeDiagramId){toast('⚠ No active diagram');return;}
  flushState();
  const data=loadDiagramData(activeDiagramId);
  if(!data){return;}
  const s2=data.state, n2=data.nextId||1, ns2=data.nextStepNum||0;
  const all=[...s2.steps.map(s=>({x:s.x,y:s.y,w:SW,h:SH})),...s2.transitions.map(t=>({x:t.x,y:t.y,w:TW,h:TH})),...(s2.parallels||[]).map(p=>({x:p.x,y:p.y,w:p.width,h:PH*2+4}))];
  let vb='0 0 800 600';
  if(all.length){const minX=Math.min(...all.map(a=>a.x))-40,minY=Math.min(...all.map(a=>a.y))-40,maxX=Math.max(...all.map(a=>a.x+a.w))+80,maxY=Math.max(...all.map(a=>a.y+a.h))+60;vb=`${minX} ${minY} ${maxX-minX} ${maxY-minY}`;}
  const svgContent=buildExportSVGContent(s2);
  const diagName=project.diagrams.find(d=>d.id===activeDiagramId)?.name||'Diagram';
  const html=`<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><title>GRAFCET — ${diagName}</title>
<style>
body{background:#0b0d11;margin:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;min-height:100vh;font-family:monospace;color:#c8d0e0;padding:30px;}
h1{font-size:13px;letter-spacing:4px;color:#f5a623;margin-bottom:6px;}
.sub{font-size:10px;color:#3a4a6a;margin-bottom:24px;letter-spacing:2px;}
svg{border:1px solid #222d44;background:#0b0d11;max-width:95vw;}
</style></head>
<body>
<h1>GRAFCET — ${diagName.toUpperCase()}</h1>
<div class="sub">IEC 60848 · ${project.name} · Exported ${new Date().toLocaleString('vi-VN')} · ${s2.steps.length} steps · ${s2.transitions.length} transitions</div>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" style="height:80vh;">${svgContent}</svg>
<div style="margin-top:16px;font-size:9px;color:#222d44;letter-spacing:2px;">GENERATED BY GRAFCET STUDIO v2</div>
</body></html>`;
  const safeProj=project.name.replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u1E00-\u1EFF ]/g,'').trim().replace(/\s+/g,'_');
  const safeDiag=diagName.replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u1E00-\u1EFF ]/g,'').trim().replace(/\s+/g,'_');
  const blob=new Blob([html],{type:'text/html'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=(safeProj?safeProj+'_':'')+safeDiag+'.html';a.click();
  toast('✓ HTML exported');
}

function buildExportSVGContent(s2) {
  let out=[];
  out.push('<defs><marker id="arr" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto"><polygon points="0 0,7 2.5,0 5" fill="#3a4a6a"/></marker></defs>');
  // Connections
  (s2.connections||[]).forEach(c=>{
    const fp=getPortXYStatic(c.from,c.fromPort||'bottom',s2);
    const tp=getPortXYStatic(c.to,c.toPort||'top',s2);
    if(!fp||!tp) return;
    const dx=fp.x-tp.x;
    const d=Math.abs(dx)<2?`M${fp.x},${fp.y} L${tp.x},${tp.y}`:`M${fp.x},${fp.y} L${fp.x},${(fp.y+tp.y)/2} L${tp.x},${(fp.y+tp.y)/2} L${tp.x},${tp.y}`;
    out.push(`<path d="${d}" stroke="#3a4a6a" stroke-width="1.5" fill="none" marker-end="url(#arr)"/>`);
  });
  // Steps
  (s2.steps||[]).forEach(s=>{
    const sc=s.initial?'#f5a623':'#4fa3e3';
    out.push(`<rect x="${s.x}" y="${s.y}" width="${SW}" height="${SH}" rx="2" fill="#111520" stroke="${sc}" stroke-width="1.5"/>`);
    if(s.initial) out.push(`<rect x="${s.x+3}" y="${s.y+3}" width="${SW-6}" height="${SH-6}" rx="1" fill="none" stroke="#f5a623" stroke-width="1"/>`);
    out.push(`<line x1="${s.x+34}" y1="${s.y+4}" x2="${s.x+34}" y2="${s.y+SH-4}" stroke="#2a3a55" stroke-width="1"/>`);
    out.push(`<text x="${s.x+17}" y="${s.y+SH/2+4}" text-anchor="middle" fill="#4fa3e3" font-size="12" font-family="monospace" font-weight="bold">${String(s.number).padStart(2,'0')}</text>`);
    if(s.label) out.push(`<text x="${s.x+40}" y="${s.y+SH/2+4}" fill="#c8d0e0" font-size="10" font-family="monospace">${esc(s.label)}</text>`);
    const al=getStepActionsStatic(s);
    if(al.length){
      const lineH=15, pad=6;
      const aH=Math.max(SH, al.length*lineH+pad*2);
      out.push(`<rect x="${s.x+SW}" y="${s.y}" width="${ACT_W}" height="${aH}" fill="#0c1420" stroke="#4fa3e3" stroke-width="1"/>`);
      out.push(`<line x1="${s.x+SW+18}" y1="${s.y+2}" x2="${s.x+SW+18}" y2="${s.y+aH-2}" stroke="#1e3a5a" stroke-width="1"/>`);
      al.forEach((act,i)=>{
        const qc=ACT_QUAL_COLORS[act.qualifier||'N']||'#f5a623';
        const y0=s.y+pad+lineH*i+lineH-4;
        out.push(`<rect x="${s.x+SW+2}" y="${s.y+pad+lineH*i+1}" width="14" height="${lineH-3}" rx="2" fill="${qc}" opacity=".18"/>`);
        out.push(`<text x="${s.x+SW+9}" y="${y0-1}" text-anchor="middle" fill="${qc}" font-size="9" font-family="monospace" font-weight="bold">${esc(act.qualifier||'N')}</text>`);
        const vdisp=act.variable||(act.address?'@'+act.address:'');
        out.push(`<text x="${s.x+SW+22}" y="${y0-1}" fill="#6a9fc0" font-size="10" font-family="monospace">${esc(vdisp.length>14?vdisp.slice(0,13)+'…':vdisp)}</text>`);
        if((act.qualifier==='L'||act.qualifier==='D')&&act.time) out.push(`<text x="${s.x+SW+ACT_W-3}" y="${y0-1}" text-anchor="end" fill="#22d3ee" font-size="8" font-family="monospace">${esc(act.time)}</text>`);
        if(i<al.length-1) out.push(`<line x1="${s.x+SW+1}" y1="${s.y+pad+lineH*(i+1)}" x2="${s.x+SW+ACT_W-1}" y2="${s.y+pad+lineH*(i+1)}" stroke="#1e3050" stroke-width="0.5"/>`);
      });
    }
  });
  // Transitions
  (s2.transitions||[]).forEach(t=>{
    const cx=t.x+TW/2;
    out.push(`<line x1="${cx}" y1="${t.y-10}" x2="${cx}" y2="${t.y+TH+10}" stroke="#5a6580" stroke-width="1.5"/>`);
    out.push(`<rect x="${t.x}" y="${t.y}" width="${TW}" height="${TH}" rx="1" fill="#171d2c" stroke="#39d353" stroke-width="1.5"/>`);
    if(t.condition) out.push(`<text x="${t.x+TW+8}" y="${t.y+7}" fill="#39d353" font-size="10" font-family="monospace">${esc(t.condition)}</text>`);
  });
  // Parallel bars
  (s2.parallels||[]).forEach(p=>{
    const barH=PH*2+4;
    out.push(`<line x1="${p.x}" y1="${p.y}" x2="${p.x+p.width}" y2="${p.y}" stroke="#a78bfa" stroke-width="2"/>`);
    out.push(`<line x1="${p.x}" y1="${p.y+barH}" x2="${p.x+p.width}" y2="${p.y+barH}" stroke="#a78bfa" stroke-width="2"/>`);
    const cx=p.x+p.width/2;
    const isSplit=p.type==='split';
    if(isSplit) out.push(`<line x1="${cx}" y1="${p.y-12}" x2="${cx}" y2="${p.y}" stroke="#5a6580" stroke-width="1.5"/>`);
    else out.push(`<line x1="${cx}" y1="${p.y+barH}" x2="${cx}" y2="${p.y+barH+12}" stroke="#5a6580" stroke-width="1.5"/>`);
    const ports=p.ports||3, spacing=p.width/ports;
    for(let i=0;i<ports;i++){const bx=p.x+spacing*(i+.5);if(isSplit)out.push(`<line x1="${bx}" y1="${p.y+barH}" x2="${bx}" y2="${p.y+barH+12}" stroke="#5a6580" stroke-width="1.5"/>`);else out.push(`<line x1="${bx}" y1="${p.y-12}" x2="${bx}" y2="${p.y}" stroke="#5a6580" stroke-width="1.5"/>`);}
    out.push(`<text x="${p.x}" y="${p.y-6}" fill="#a78bfa" font-size="9" font-family="monospace">${isSplit?'AND-SPLIT':'AND-JOIN'}</text>`);
  });
  return out.join('\n');
}

function getStepActionsStatic(s) {
  if(!s) return [];
  if(Array.isArray(s.actions)) return s.actions;
  if(typeof s.actions==='string'&&s.actions.trim())
    return s.actions.split('\n').filter(l=>l.trim()).map(line=>{
      const parts=line.trim().split(/\s+/);
      const q=ACT_QUALIFIERS.includes(parts[0])?parts[0]:'N';
      const v=ACT_QUALIFIERS.includes(parts[0])?parts.slice(1).join(' '):line.trim();
      return {qualifier:q,variable:v,address:'',time:''};
    });
  return [];
}

function getPortXYStatic(id, port, s2) {
  const s=(s2.steps||[]).find(x=>x.id===id);
  if(s){const cx=s.x+SW/2;return port==='top'?{x:cx,y:s.y}:port==='bottom'?{x:cx,y:s.y+SH}:{x:cx,y:s.y+SH/2};}
  const t=(s2.transitions||[]).find(x=>x.id===id);
  if(t){const cx=t.x+TW/2;return port==='top'?{x:cx,y:t.y-10}:port==='bottom'?{x:cx,y:t.y+TH+10}:{x:cx,y:t.y+TH/2};}
  const p=(s2.parallels||[]).find(x=>x.id===id);
  if(p){
    const barH=PH*2+4,cx=p.x+p.width/2;
    if(port==='top') return {x:cx,y:p.y};
    if(port==='bottom') return {x:cx,y:p.y+barH};
    if(port?.startsWith('top-')){const idx=+port.split('-')[1];const sp2=p.width/(p.ports||3);return {x:p.x+sp2*(idx+.5),y:p.y};}
    if(port?.startsWith('bottom-')){const idx=+port.split('-')[1];const sp2=p.width/(p.ports||3);return {x:p.x+sp2*(idx+.5),y:p.y+barH};}
    return {x:cx,y:p.y+barH/2};
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
//  HELPERS
//  show / hide / toast / toastTimer / closeModal → moved to src/js/modules/utils.js
// ═══════════════════════════════════════════════════════════
function svgE(t){return document.createElementNS('http://www.w3.org/2000/svg',t);}

// ═══════════════════════════════════════════════════════════
//  EXPORT TABLES
// ═══════════════════════════════════════════════════════════
let etCurrentTab = 'steps';

function showExportTablesModal() {
  if(!activeDiagramId){ toast('⚠ No active diagram'); return; }
  flushState(); // ensure vars and all state are written to localStorage first
  const diagName = project.diagrams.find(d=>d.id===activeDiagramId)?.name||'Diagram';
  document.getElementById('et-diag-name').textContent = project.name + ' › ' + diagName;
  document.getElementById('modal-tables').classList.add('show');
  etShowTab(etCurrentTab);
}

function etShowTab(tab) {
  etCurrentTab = tab;
  document.querySelectorAll('.et-tab').forEach(t=>t.classList.remove('active'));
  const btn = document.getElementById('et-tab-'+tab);
  if(btn) btn.classList.add('active');
  const content = document.getElementById('et-content');
  // Use global state directly (already flushed) — no localStorage roundtrip needed
  const s = state;
  if(tab==='steps')       content.innerHTML = buildStepTable(s);
  if(tab==='transitions') content.innerHTML = buildTransTable(s);
  if(tab==='branches')    content.innerHTML = buildBranchTable(s);
  if(tab==='vars')        content.innerHTML = buildVarsTable(s);
}

// ─── Helpers ───
function etGetStepName(stepId, steps) {
  const s = steps.find(x=>x.id===stepId);
  return s ? `S${String(s.number).padStart(2,'0')}${s.label?' · '+s.label:''}` : stepId;
}
function etGetStepsConnectedTo(elementId, connections, steps, dir) {
  // dir='from': steps that connect FROM elementId; dir='to': steps that connect TO elementId
  return connections
    .filter(c=> dir==='from' ? c.from===elementId : c.to===elementId)
    .map(c=> { const sid = dir==='from'?c.to:c.from; return steps.find(x=>x.id===sid); })
    .filter(Boolean);
}
function etQualColor(q) {
  const map={N:'#4fa3e3',S:'#39d353',R:'#e35a4f',P:'#f5a623',P0:'#f5a623',L:'#22d3ee',D:'#a78bfa',SD:'#39d353',DS:'#a78bfa',SL:'#22d3ee'};
  return map[q]||'#888';
}
function etActionsHTML(s) {
  const acts = getStepActionsStatic(s);
  if(!acts.length) return '<span style="color:var(--text3);font-size:9px;">—</span>';
  return acts.map(a=>{
    const qc=etQualColor(a.qualifier||'N');
    const vdisp = a.variable||(a.address?a.address:'');
    const addrPart = a.address&&a.address!==a.variable ? `<span style="color:var(--text3);font-size:9px;"> @${esc(a.address)}</span>` : '';
    const timePart = a.time ? `<span style="color:#22d3ee;font-size:9px;"> ${esc(a.time)}</span>` : '';
    return `<div class="et-act-row">
      <span class="et-badge" style="color:${qc};border-color:${qc};background:${qc}18">${esc(a.qualifier||'N')}</span>
      <span style="color:var(--text)">${esc(vdisp)}</span>${addrPart}${timePart}
    </div>`;
  }).join('');
}

// ─── Step Table ───
function buildStepTable(s) {
  const steps = (s.steps||[]).slice().sort((a,b)=>a.number-b.number);
  if(!steps.length) return '<div class="et-empty">No steps in this diagram</div>';
  const stats = `
    <span class="et-stat"><b style="color:var(--blue)">${steps.length}</b> Steps</span>
    <span class="et-stat"><b style="color:var(--amber)">${steps.filter(x=>x.initial).length}</b> Initial</span>
    <span class="et-stat"><b style="color:var(--green)">${steps.reduce((n,x)=>n+getStepActionsStatic(x).length,0)}</b> Actions total</span>`;
  const rows = steps.map(step=>{
    const acts = etActionsHTML(step);
    const initBadge = step.initial
      ? '<span class="et-badge" style="color:var(--amber);border-color:var(--amber);background:rgba(245,166,35,.1)">INITIAL</span>'
      : '<span style="color:var(--text3)">—</span>';
    return `<tr>
      <td style="color:var(--blue);font-weight:bold;white-space:nowrap;">S${String(step.number).padStart(2,'0')}</td>
      <td style="white-space:nowrap;">${esc(step.id)}</td>
      <td style="color:var(--text)">${esc(step.label||'—')}</td>
      <td>${initBadge}</td>
      <td>${acts}</td>
    </tr>`;
  }).join('');
  return `<div class="et-table-wrap">
    <div class="et-section-title">STEP TABLE — IEC 60848</div>
    <div>${stats}</div>
    <table class="et-table">
      <thead><tr>
        <th>STEP №</th><th>ID</th><th>NAME / LABEL</th><th>INITIAL</th><th>ACTIONS (Qualifier · Variable)</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

// ─── Graph traversal helpers ───
// resolveStepsThrough → moved to src/js/modules/graph-utils.js

// ─── Transition Table ───
function buildTransTable(s) {
  const transitions = s.transitions||[];
  const steps = s.steps||[];
  const connections = s.connections||[];
  const parallels = s.parallels||[];
  if(!transitions.length) return '<div class="et-empty">No transitions in this diagram</div>';

  // Build one row per (transition × fromStep × toStep) pair
  const tableRows = [];

  transitions.forEach(t=>{
    // Resolve steps upstream (feeding into this transition, possibly via Join bar)
    const fromSteps = resolveStepsThrough(t.id, 'upstream', connections, steps, parallels);
    // Resolve steps downstream (coming out of this transition, possibly via Split bar)
    const toSteps   = resolveStepsThrough(t.id, 'downstream', connections, steps, parallels);

    const condCell = t.condition
      ? `<span style="color:var(--green);font-family:monospace;">${esc(t.condition)}</span>`
      : '<span style="color:var(--text3)">— (always true)</span>';
    const labelCell = t.label ? esc(t.label) : '<span style="color:var(--text3)">—</span>';

    const stepLabel = st =>
      `<span style="color:var(--blue);font-weight:bold;">S${String(st.number).padStart(2,'0')}</span>`+
      (st.label ? ` <span style="color:var(--text2)">${esc(st.label)}</span>` : '');

    if(fromSteps.length===0 && toSteps.length===0){
      // Isolated transition
      tableRows.push({tid:t.id, label:labelCell, from:'<span style="color:var(--text3)">—</span>', to:'<span style="color:var(--text3)">—</span>', cond:condCell});
    } else if(fromSteps.length===0){
      toSteps.forEach(ts=>tableRows.push({tid:t.id,label:labelCell,from:'<span style="color:var(--text3)">—</span>',to:stepLabel(ts),cond:condCell}));
    } else if(toSteps.length===0){
      fromSteps.forEach(fs=>tableRows.push({tid:t.id,label:labelCell,from:stepLabel(fs),to:'<span style="color:var(--text3)">—</span>',cond:condCell}));
    } else {
      // Cross product: each fromStep paired with each toStep
      fromSteps.forEach(fs=>{
        toSteps.forEach(ts=>{
          tableRows.push({tid:t.id,label:labelCell,from:stepLabel(fs),to:stepLabel(ts),cond:condCell});
        });
      });
    }
  });

  // Render — merge repeated tid cells for readability
  let html = '';
  let prevTid = null, rowSpanCount = 0, pendingRows = [];

  function flushPending() {
    if(!pendingRows.length) return;
    pendingRows.forEach((r,i)=>{
      if(i===0){
        html+=`<tr>
          <td rowspan="${pendingRows.length}" style="color:var(--green);font-weight:bold;white-space:nowrap;vertical-align:top;">${esc(r.tid)}</td>
          <td rowspan="${pendingRows.length}" style="white-space:nowrap;vertical-align:top;">${r.label}</td>
          <td>${r.from}</td><td>${r.to}</td>
          <td rowspan="${pendingRows.length}" style="vertical-align:top;">${r.cond}</td>
        </tr>`;
      } else {
        html+=`<tr><td>${r.from}</td><td>${r.to}</td></tr>`;
      }
    });
    pendingRows=[];
  }

  tableRows.forEach((r,i)=>{
    if(r.tid!==prevTid){ flushPending(); prevTid=r.tid; }
    pendingRows.push(r);
  });
  flushPending();

  const stats = `
    <span class="et-stat"><b style="color:var(--green)">${transitions.length}</b> Transitions</span>
    <span class="et-stat"><b style="color:var(--green)">${transitions.filter(t=>t.condition).length}</b> With condition</span>
    <span class="et-stat"><b style="color:var(--green)">${tableRows.length}</b> Step pairs</span>`;

  return `<div class="et-table-wrap">
    <div class="et-section-title">TRANSITION TABLE — IEC 60848</div>
    <div>${stats}</div>
    <table class="et-table">
      <thead><tr>
        <th>TRANS ID</th><th>LABEL</th><th>FROM STEP</th><th>TO STEP</th><th>CONDITION / RECEPTIVITY</th>
      </tr></thead>
      <tbody>${html}</tbody>
    </table></div>`;
}

// ─── Branch Table (Parallel) ───
function buildBranchTable(s) {
  const parallels = s.parallels||[];
  const steps = s.steps||[];
  const transitions = s.transitions||[];
  const connections = s.connections||[];
  if(!parallels.length) return '<div class="et-empty">No parallel branches in this diagram</div>';

  const rows = parallels.map(p=>{
    const isSplit = p.type==='split';
    const barH = PH*2+4;
    const ports = p.ports||3;
    const spacing = p.width/ports;

    // Find the single transition connected to the split/join
    const singleConns = connections.filter(c=> isSplit ? c.to===p.id&&c.toPort==='top' : c.from===p.id&&c.fromPort==='bottom');
    const singTrans = singleConns.map(c=>transitions.find(x=>x.id===(isSplit?c.from:c.to))).filter(Boolean);

    // Find branch steps — each branch port
    const branchSteps = [];
    for(let i=0;i<ports;i++){
      const bPort = isSplit?`bottom-${i}`:`top-${i}`;
      const brConns = connections.filter(c=> isSplit ? c.from===p.id&&c.fromPort===bPort : c.to===p.id&&c.toPort===bPort);
      const bSteps = brConns.map(c=>steps.find(x=>x.id===(isSplit?c.to:c.from))).filter(Boolean);
      branchSteps.push(bSteps);
    }

    const typeBadge = `<span class="et-badge" style="color:var(--purple);border-color:var(--purple);background:rgba(167,139,250,.1)">${isSplit?'AND-SPLIT':'AND-JOIN'}</span>`;

    // Single transition
    const singCell = singTrans.length
      ? singTrans.map(t=>`<span style="color:var(--green);">${esc(t.id)}</span>${t.condition?' <span style="color:var(--text2);font-size:9px;">['+esc(t.condition)+']</span>':''}`).join(', ')
      : '<span style="color:var(--text3)">—</span>';

    // Branch steps per branch
    const branchCell = branchSteps.map((bst,i)=>{
      const label = bst.length
        ? bst.map(st=>`<b style="color:var(--blue)">S${String(st.number).padStart(2,'0')}</b>${st.label?' '+esc(st.label):''}`).join(', ')
        : '<span style="color:var(--text3)">—</span>';
      return `<div style="margin-bottom:3px;"><span style="color:var(--purple);font-size:9px;">B${i+1}</span> ${label}</div>`;
    }).join('');

    // Description
    const descParts = [];
    descParts.push(`${ports} branches, width=${p.width}px`);
    if(singTrans.length) descParts.push(isSplit?'Triggered by: '+singTrans.map(t=>t.id+(t.condition?' ['+t.condition+']':'')).join(', '):'Converges to: '+singTrans.map(t=>t.id).join(', '));

    return `<tr>
      <td style="color:var(--purple);font-weight:bold;white-space:nowrap;">${esc(p.id)}</td>
      <td>${typeBadge}</td>
      <td>${isSplit?singCell:'<span style="color:var(--text3)">see branches</span>'}</td>
      <td>${branchCell}</td>
      <td>${!isSplit?singCell:'<span style="color:var(--text3)">see branches</span>'}</td>
      <td style="color:var(--text2);font-size:10px;">${descParts.join(' · ')}</td>
    </tr>`;
  });

  const stats = `
    <span class="et-stat"><b style="color:var(--purple)">${parallels.filter(p=>p.type==='split').length}</b> AND-Split</span>
    <span class="et-stat"><b style="color:var(--purple)">${parallels.filter(p=>p.type==='join').length}</b> AND-Join</span>`;
  return `<div class="et-table-wrap">
    <div class="et-section-title">PARALLEL BRANCH TABLE — IEC 60848</div>
    <div>${stats}</div>
    <table class="et-table">
      <thead><tr>
        <th>BRANCH ID</th><th>TYPE</th><th>SPLIT TRANSITION</th><th>STEP BRANCHES (per branch)</th><th>JOIN TRANSITION</th><th>DESCRIPTION</th>
      </tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table></div>`;
}

// ─── Variables Table ───
function buildVarsTable(s) {
  const vars = (s.vars)||[];
  if(!vars.length) return '<div class="et-empty">No variables defined — use the Variable Table panel at the bottom</div>';

  let rowNum = 0;
  let rows = '';
  vars.forEach(v=>{
    rowNum++;
    const devType = (project.devices||[]).find(d=>d.name===(v.format||''));
    if(devType){
      // Device instance header row
      const sigCount = (devType.signals||[]).length;
      rows += `<tr class="et-dev-instance">
        <td style="color:var(--text2);">${rowNum}</td>
        <td style="color:var(--cyan);font-weight:bold;">${esc(v.label||'—')}</td>
        <td style="color:var(--cyan);">❖ ${esc(v.format||'—')}</td>
        <td style="color:var(--text3);font-style:italic;font-size:10px;">${sigCount} signal${sigCount!==1?'s':''}</td>
        <td style="color:var(--text2);">${esc(v.comment||'—')}</td>
      </tr>`;
      // One sub-row per signal
      (devType.signals||[]).forEach(sig=>{
        const addr = (v.signalAddresses||{})[sig.id] || '—';
        const sigLabel = (v.label||'?')+'.'+sig.name;
        const vc = {Input:'et-sig-in',Output:'et-sig-out',Var:'et-sig-var'}[sig.varType]||'et-sig-var';
        const vs = {Input:'IN',Output:'OUT',Var:'VAR'}[sig.varType]||'VAR';
        rows += `<tr class="et-dev-signal">
          <td style="color:var(--text3);font-size:9px;text-align:center;">└</td>
          <td style="padding-left:18px;color:var(--text2);">
            <span style="color:rgba(34,211,238,.4);margin-right:4px;">└</span>${esc(sigLabel)}
            <span class="${vc}" style="margin-left:6px;font-size:9px;padding:1px 5px;border-radius:2px;">${vs}</span>
          </td>
          <td style="color:var(--text3);font-size:10px;">${esc(sig.dataType||'Bool')}</td>
          <td style="color:var(--amber);font-family:monospace;">${esc(addr)}</td>
          <td style="color:var(--text3);font-size:10px;">${esc(sig.comment||'—')}</td>
        </tr>`;
      });
    } else {
      rows += `<tr>
        <td style="color:var(--text2);">${rowNum}</td>
        <td style="color:var(--text);font-weight:bold;">${esc(v.label||'—')}</td>
        <td style="color:var(--cyan);">${esc(v.format||'—')}</td>
        <td style="color:var(--amber);font-family:monospace;">${esc(v.address||'—')}</td>
        <td style="color:var(--text2);">${esc(v.comment||'—')}</td>
      </tr>`;
    }
  });

  const devCount = vars.filter(v=>(project.devices||[]).some(d=>d.name===v.format)).length;
  const stats = `<span class="et-stat"><b style="color:var(--cyan)">${vars.length}</b> Variables</span>`
    + (devCount ? `<span class="et-stat"><b style="color:var(--cyan)">${devCount}</b> Device instances</span>` : '');

  return `<div class="et-table-wrap">
    <div class="et-section-title">VARIABLE TABLE</div>
    <div style="margin-bottom:8px;">${stats}</div>
    <style>
      .et-dev-instance td{background:rgba(34,211,238,.05);}
      .et-dev-signal td{background:rgba(34,211,238,.02);font-size:10px;}
      .et-sig-in{background:rgba(74,222,128,.12);color:#4ade80;border:1px solid rgba(74,222,128,.3);}
      .et-sig-out{background:rgba(251,146,60,.12);color:#fb923c;border:1px solid rgba(251,146,60,.3);}
      .et-sig-var{background:rgba(167,139,250,.12);color:#a78bfa;border:1px solid rgba(167,139,250,.3);}
    </style>
    <table class="et-table">
      <thead><tr><th>#</th><th>LABEL / SIGNAL</th><th>DATA FORMAT</th><th>ADDRESS</th><th>COMMENT</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

// ─── Export as HTML ───
function etExportHTML() {
  const s = state;  // use global state directly
  const diagName = project.diagrams.find(d=>d.id===activeDiagramId)?.name||'Diagram';
  const stepsHTML = buildStepTable(s);
  const transHTML = buildTransTable(s);
  const branchHTML = buildBranchTable(s);
  const varsHTML = buildVarsTable(s);
  const html = `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8">
<title>GRAFCET Tables — ${diagName}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{background:#0b0d11;color:#c8d0e0;font-family:'Courier New',monospace;padding:30px;font-size:12px;}
h1{font-size:14px;letter-spacing:4px;color:#f5a623;margin-bottom:4px;}
.sub{font-size:10px;color:#3a4a6a;margin-bottom:30px;letter-spacing:2px;}
.section{margin-bottom:40px;}
.et-section-title{font-size:10px;letter-spacing:2px;color:#7a8aaa;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #222d44;text-transform:uppercase;}
.et-stat{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;background:#171d2c;border:1px solid #222d44;border-radius:3px;font-size:10px;color:#7a8aaa;margin-right:8px;margin-bottom:10px;}
table{width:100%;border-collapse:collapse;font-size:11px;}
thead th{background:#1d2438;color:#7a8aaa;font-size:9px;letter-spacing:1.5px;padding:7px 12px;text-align:left;border-bottom:2px solid #2d3d5a;border-right:1px solid #222d44;}
thead th:last-child{border-right:none;}
tbody td{padding:7px 12px;border-bottom:1px solid #1d2438;border-right:1px solid #1d2438;vertical-align:top;}
tbody td:last-child{border-right:none;}
tbody tr:nth-child(even) td{background:rgba(255,255,255,.02);}
tbody tr:hover td{background:rgba(79,163,227,.04);}
.et-badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:bold;margin-right:3px;border:1px solid;}
.et-act-row{display:flex;align-items:center;gap:6px;margin-bottom:3px;}
.et-act-row:last-child{margin-bottom:0;}
b.blue{color:#4fa3e3;} b.green{color:#39d353;} b.amber{color:#f5a623;} b.purple{color:#a78bfa;} b.cyan{color:#22d3ee;}
.et-dev-instance td{background:rgba(34,211,238,.06);border-left:2px solid #22d3ee;}
.et-dev-signal td{background:rgba(34,211,238,.02);font-size:10px;}
.et-sig-in{background:rgba(74,222,128,.12);color:#4ade80;border:1px solid rgba(74,222,128,.3);border-radius:2px;padding:1px 5px;font-size:9px;}
.et-sig-out{background:rgba(251,146,60,.12);color:#fb923c;border:1px solid rgba(251,146,60,.3);border-radius:2px;padding:1px 5px;font-size:9px;}
.et-sig-var{background:rgba(167,139,250,.12);color:#a78bfa;border:1px solid rgba(167,139,250,.3);border-radius:2px;padding:1px 5px;font-size:9px;}
</style></head>
<body>
<h1>GRAFCET TABLES — ${diagName.toUpperCase()}</h1>
<div class="sub">IEC 60848 · ${project.name} · Generated ${new Date().toLocaleString('vi-VN')}</div>
<div class="section">${stepsHTML}</div>
<div class="section">${transHTML}</div>
<div class="section">${branchHTML}</div>
<div class="section">${varsHTML}</div>
<div style="margin-top:20px;font-size:9px;color:#222d44;letter-spacing:2px;">GENERATED BY GRAFCET STUDIO v2</div>
</body></html>`;
  const safeProj=project.name.replace(/\s+/g,'_');
  const safeDiag=diagName.replace(/\s+/g,'_');
  const blob=new Blob([html],{type:'text/html'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=safeProj+'_'+safeDiag+'_tables.html';a.click();
  toast('✓ Tables exported as HTML');
}

// ─── Export as CSV (multi-sheet in one zip-like approach: separate files) ───
function etExportCSV() {
  const s = state;  // use global state directly
  const diagName = project.diagrams.find(d=>d.id===activeDiagramId)?.name||'Diagram';
  const safe = project.name.replace(/\s+/g,'_')+'_'+diagName.replace(/\s+/g,'_');

  // Steps CSV
  const stepsRows = [['Step №','ID','Name/Label','Initial','Qualifier','Variable','Address','Time']];
  (s.steps||[]).slice().sort((a,b)=>a.number-b.number).forEach(step=>{
    const acts = getStepActionsStatic(step);
    if(!acts.length) stepsRows.push([String(step.number).padStart(2,'0'),step.id,step.label||'',step.initial?'YES':'NO','','','','']);
    else acts.forEach((act,ai)=>{
      stepsRows.push(ai===0?[String(step.number).padStart(2,'0'),step.id,step.label||'',step.initial?'YES':'NO',act.qualifier||'N',act.variable||'',act.address||'',act.time||'']
                            :['','','','',act.qualifier||'N',act.variable||'',act.address||'',act.time||'']);
    });
  });
  downloadCSV(stepsRows, safe+'_steps.csv');

  // Transitions CSV — one row per (transition × fromStep × toStep) pair
  const transRows = [['Trans ID','Label','From Step ID','From Step Name','To Step ID','To Step Name','Condition']];
  (s.transitions||[]).forEach(t=>{
    const fromSteps = resolveStepsThrough(t.id, 'upstream',   s.connections||[], s.steps||[], s.parallels||[]);
    const toSteps   = resolveStepsThrough(t.id, 'downstream', s.connections||[], s.steps||[], s.parallels||[]);
    const pairs = [];
    if(!fromSteps.length && !toSteps.length){
      pairs.push({fs:null,ts:null});
    } else if(!fromSteps.length){
      toSteps.forEach(ts=>pairs.push({fs:null,ts}));
    } else if(!toSteps.length){
      fromSteps.forEach(fs=>pairs.push({fs,ts:null}));
    } else {
      fromSteps.forEach(fs=>toSteps.forEach(ts=>pairs.push({fs,ts})));
    }
    pairs.forEach(({fs,ts})=>{
      transRows.push([
        t.id, t.label||'',
        fs?fs.id:'', fs?`S${String(fs.number).padStart(2,'0')}${fs.label?' '+fs.label:''}` :'',
        ts?ts.id:'', ts?`S${String(ts.number).padStart(2,'0')}${ts.label?' '+ts.label:''}` :'',
        t.condition||''
      ]);
    });
  });
  setTimeout(()=>downloadCSV(transRows, safe+'_transitions.csv'), 200);

  // Branches CSV
  const branchRows = [['Branch ID','Type','Nr Branches','Width','Single Trans ID','Branch 1 Steps','Branch 2 Steps','Branch 3+']];
  (s.parallels||[]).forEach(p=>{
    const ports=p.ports||3;
    const isSplit=p.type==='split';
    const singT=(s.connections||[]).filter(c=>isSplit?c.to===p.id:c.from===p.id).map(c=>isSplit?c.from:c.to).join('; ');
    const branches=[];
    for(let i=0;i<ports;i++){
      const bPort=isSplit?`bottom-${i}`:`top-${i}`;
      const bIds=(s.connections||[]).filter(c=>isSplit?c.from===p.id&&c.fromPort===bPort:c.to===p.id&&c.toPort===bPort).map(c=>isSplit?c.to:c.from).join(', ');
      branches.push(bIds||'—');
    }
    branchRows.push([p.id,p.type.toUpperCase(),ports,p.width,singT,branches[0]||'',branches[1]||'',branches.slice(2).join(' | ')||'']);
  });
  setTimeout(()=>downloadCSV(branchRows, safe+'_branches.csv'), 400);

  // Variables CSV — expand device type instances into per-signal rows
  const varRows=[['#','Label','Data Format','Address','Variable Type','Comment']];
  let vRowNum=0;
  (s.vars||[]).forEach(v=>{
    vRowNum++;
    const devType=(project.devices||[]).find(d=>d.name===(v.format||''));
    if(devType){
      varRows.push([vRowNum, v.label||'', v.format||'', '', 'DEVICE', v.comment||'']);
      (devType.signals||[]).forEach(sig=>{
        const addr=(v.signalAddresses||{})[sig.id]||'';
        varRows.push(['└', (v.label||'?')+'.'+sig.name, sig.dataType||'Bool', addr, sig.varType||'', sig.comment||'']);
      });
    } else {
      varRows.push([vRowNum, v.label||'', v.format||'', v.address||'', '', v.comment||'']);
    }
  });
  setTimeout(()=>downloadCSV(varRows, safe+'_variables.csv'), 600);

  toast('✓ 4 CSV files downloading...');
}

function downloadCSV(rows, filename) {
  const csv=rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();
}

// ═══════════════════════════════════════════════════════════
//  VARIABLE TABLE
// ═══════════════════════════════════════════════════════════
const VT_FORMATS = ['BOOL','BYTE','WORD','DWORD','LWORD','INT','DINT','LINT','UINT','UDINT','ULINT','REAL','LREAL','STRING','TIME','DATE','TOD','DT','ARRAY'];

// Returns base formats + device type names as custom formats
function getVtFormats() {
  const devTypes = (project.devices||[]).map(d=>d.name);
  return [...VT_FORMATS, ...devTypes];
}
let vtOpen = true;
let vtSelRows = new Set();
let vtResizing = false, vtResizeStartY = 0, vtResizeStartH = 0;

function getVars() {
  // Always read from global state (single source of truth)
  if(!state.vars) state.vars = [];
  return state.vars;
}
function saveVars(vars) {
  if(!activeDiagramId) return;
  // Write into global state so flushState/saveDiagramData persists it
  state.vars = vars;
  saveDiagramData(activeDiagramId);   // persist immediately
  markModified(activeDiagramId, true);
}

function toggleVarTable() {
  vtOpen = !vtOpen;
  const panel = document.getElementById('vartable-panel');
  const btn = document.getElementById('pin-vt');
  panel.classList.toggle('vt-closed', !vtOpen);
  if(btn){ btn.textContent=vtOpen?'📌':'📍'; btn.classList.toggle('pinned',vtOpen); }
  try{ localStorage.setItem('gf2-vt-open', vtOpen?'1':'0'); }catch(e){}
  drawGrid();
}

function renderVarTable() {
  const vars = getVars();
  const filter = (document.getElementById('vt-search')?.value||'').toLowerCase();
  const tbody = document.getElementById('vt-tbody');
  if(!tbody) return;
  tbody.innerHTML = '';

  const filtered = vars.map((v,i)=>({...v,_i:i})).filter(v=>
    !filter ||
    (v.label||'').toLowerCase().includes(filter) ||
    (v.format||'').toLowerCase().includes(filter) ||
    (v.address||'').toLowerCase().includes(filter) ||
    (v.comment||'').toLowerCase().includes(filter)
  );

  if(filtered.length===0){
    const tr=document.createElement('tr');
    tr.innerHTML=`<td colspan="5" class="vt-empty">${vars.length===0?'No variables — click <b>+ Add</b> to create one':'No match for filter'}</td>`;
    tbody.appendChild(tr);
  } else {
    filtered.forEach((v,fi)=>{
      const realIdx=v._i;
      const tr=document.createElement('tr');
      tr.dataset.idx=realIdx;
      if(vtSelRows.has(realIdx)) tr.classList.add('vt-sel');

      // Check if format is a device type
      const devType = (project.devices||[]).find(d=>d.name===(v.format||''));
      if(devType) tr.classList.add('vt-dev-instance');

      // Row number
      const tdN=document.createElement('td');
      tdN.className='vt-rownum';
      tdN.textContent=realIdx+1;
      tdN.addEventListener('click',e=>{
        if(e.shiftKey){ /* range select placeholder */ }
        if(vtSelRows.has(realIdx)) vtSelRows.delete(realIdx); else vtSelRows.add(realIdx);
        renderVarTable(); updateVtDelBtn();
      });
      tr.appendChild(tdN);

      // Label
      tr.appendChild(vtEditCell(realIdx,'label',v.label||'','lbl','text','e.g. Motor_Run'));
      // Format
      tr.appendChild(vtSelectCell(realIdx,'format',v.format||'BOOL'));
      // Address — for device type instance: shows toggle + signal count, not editable here
      if(devType){
        const tdA=document.createElement('td');
        const isExpanded = v._sigExpanded !== false; // default expanded
        tdA.style.cssText='padding:0 8px;font-size:9px;color:var(--cyan);cursor:pointer;user-select:none;';
        tdA.innerHTML=`<span class="vt-dev-expand-btn" style="display:inline-flex;align-items:center;gap:4px;">
          <span style="font-size:10px;transition:.15s;" class="vt-dev-arrow">${isExpanded?'▾':'▸'}</span>
          <span style="opacity:.7;">${(devType.signals||[]).length} signal${(devType.signals||[]).length!==1?'s':''}</span>
        </span>`;
        tdA.addEventListener('click', e=>{
          e.stopPropagation();
          const vars=getVars();
          if(vars[realIdx]){
            vars[realIdx]._sigExpanded = !(vars[realIdx]._sigExpanded !== false);
            saveVars(vars);
            renderVarTable();
          }
        });
        tr.appendChild(tdA);
      } else {
        tr.appendChild(vtEditCell(realIdx,'address',v.address||'','addr','text','%MX0.0'));
      }
      // Comment
      tr.appendChild(vtEditCell(realIdx,'comment',v.comment||'','comment','text',''));

      tbody.appendChild(tr);

      // If device type instance → render signal sub-rows (collapsible)
      if(devType && v._sigExpanded !== false){
        if(!v.signalAddresses) v.signalAddresses={};
        (devType.signals||[]).forEach(sig=>{
          const subTr=document.createElement('tr');
          subTr.className='vt-dev-signal-row';
          const vc={Input:'vt-input',Output:'vt-output',Var:'vt-var'}[sig.varType]||'vt-var';
          const vs={Input:'IN',Output:'OUT',Var:'VAR'}[sig.varType]||'VAR';
          const tc={Bool:'sig-bool',Int:'sig-int',Real:'sig-real',Word:'sig-word',DWord:'sig-word',Time:'sig-word'}[sig.dataType]||'sig-bool';

          // col1: indent + signal name
          const tdSN=document.createElement('td');
          tdSN.colSpan=1;
          tdSN.style.cssText='padding:0;';
          tdSN.innerHTML=`<div class="vt-sig-num"></div>`;
          subTr.appendChild(tdSN);

          const tdSLabel=document.createElement('td');
          tdSLabel.innerHTML=`<div class="vt-sig-label">
            <span class="vt-sig-indent">└</span>
            <span class="vt-sig-name">${esc2(v.label||'?')}.${esc2(sig.name)}</span>
            <span class="sdcol-type ${tc}" style="margin-left:5px;">${esc2(sig.dataType)}</span>
            <span class="sdcol-io ${vc}" style="margin-left:3px;">${vs}</span>
          </div>`;
          subTr.appendChild(tdSLabel);

          // col3: DATA TYPE — read-only, shows device type
          const tdSFmt=document.createElement('td');
          tdSFmt.innerHTML=`<span style="font-size:9px;color:var(--text3);padding:0 8px;">${esc2(devType.name)}</span>`;
          subTr.appendChild(tdSFmt);

          // col4: ADDRESS — editable per-signal
          const tdSAddr=document.createElement('td');
          const addrInp=document.createElement('input');
          addrInp.type='text';
          addrInp.className='vt-cell addr vt-sig-addr';
          addrInp.value=v.signalAddresses[sig.id]||'';
          addrInp.placeholder=sig.varType==='Input'?'%IX0.0':sig.varType==='Output'?'%QX0.0':'%MX0.0';
          addrInp.addEventListener('change',()=>{
            const vars=getVars();
            if(vars[realIdx]){
              if(!vars[realIdx].signalAddresses) vars[realIdx].signalAddresses={};
              vars[realIdx].signalAddresses[sig.id]=addrInp.value;
              saveVars(vars);
            }
          });
          tdSAddr.appendChild(addrInp);
          subTr.appendChild(tdSAddr);

          // col5: COMMENT — from signal definition (read-only hint)
          const tdSCmt=document.createElement('td');
          tdSCmt.innerHTML=`<span class="vt-sig-cmt">${esc2(sig.comment||'')}</span>`;
          subTr.appendChild(tdSCmt);

          tbody.appendChild(subTr);
        });
      }
    });
  }
  // Update count
  const cnt = document.querySelector('.vt-count');
  if(cnt) cnt.textContent = vars.length+' var'+(vars.length!==1?'s':'')+(filter?' ('+filtered.length+' shown)':'');
}

function vtEditCell(idx, field, val, cls, type, ph) {
  const td = document.createElement('td');
  const inp = document.createElement('input');
  inp.type = type; inp.className = 'vt-cell '+cls;
  inp.value = val; inp.placeholder = ph;
  inp.addEventListener('change', ()=>{
    const vars=getVars(); if(vars[idx]) vars[idx][field]=inp.value; saveVars(vars);
  });
  inp.addEventListener('keydown', e=>{
    if(e.key==='Tab'){ e.preventDefault(); focusNextCell(idx, field, e.shiftKey); }
    if(e.key==='Enter'){ e.preventDefault(); if(e.ctrlKey||e.metaKey) vtAddRow(); else focusNextRow(idx, field); }
    if(e.key==='Delete'&&e.ctrlKey){ e.preventDefault(); vtDeleteRow(idx); }
  });
  td.appendChild(inp); return td;
}

function vtSelectCell(idx, field, val) {
  const td = document.createElement('td');
  const sel = document.createElement('select');
  sel.className = 'vt-select';

  // Group 1: primitive types
  const grpPrim = document.createElement('optgroup');
  grpPrim.label = 'Primitive';
  VT_FORMATS.forEach(f=>{
    const o=document.createElement('option');
    o.value=f; o.textContent=f;
    if(f===val) o.selected=true;
    grpPrim.appendChild(o);
  });
  sel.appendChild(grpPrim);

  // Group 2: device types (if any)
  const devTypes = (project.devices||[]);
  if(devTypes.length){
    const grpDev = document.createElement('optgroup');
    grpDev.label = '── Device Types ──';
    devTypes.forEach(d=>{
      const o=document.createElement('option');
      o.value=d.name; o.textContent='❖ '+d.name;
      if(d.name===val) o.selected=true;
      grpDev.appendChild(o);
    });
    sel.appendChild(grpDev);
  }

  sel.addEventListener('change',()=>{
    const vars=getVars();
    if(vars[idx]){
      vars[idx].format=sel.value;
      // If switching to device type, init signalAddresses map
      const dev=(project.devices||[]).find(d=>d.name===sel.value);
      if(dev){
        if(!vars[idx].signalAddresses) vars[idx].signalAddresses={};
        (dev.signals||[]).forEach(s=>{ if(!(s.id in vars[idx].signalAddresses)) vars[idx].signalAddresses[s.id]=''; });
        vars[idx]._sigExpanded = true; // auto-expand when first selecting a device type
      } else {
        delete vars[idx].signalAddresses;
        delete vars[idx]._sigExpanded;
      }
    }
    saveVars(vars); renderVarTable();
  });
  sel.addEventListener('keydown',e=>{ if(e.key==='Tab'){e.preventDefault();focusNextCell(idx,field,e.shiftKey);} });
  td.appendChild(sel);

  // Color-hint if device type selected
  const isDevType = (project.devices||[]).some(d=>d.name===val);
  if(isDevType) sel.style.color='var(--cyan)';

  return td;
}

function focusNextCell(rowIdx, field, reverse) {
  const order=['label','format','address','comment'];
  const fi=order.indexOf(field);
  const nextField = reverse ? order[fi-1] : order[fi+1];
  if(nextField) {
    const tr=document.querySelector(`#vt-tbody tr[data-idx="${rowIdx}"]`);
    if(tr){ const inputs=tr.querySelectorAll('input,select'); const ni=order.indexOf(nextField); if(inputs[ni]) inputs[ni].focus(); }
  } else {
    focusNextRow(rowIdx, reverse?'comment':'label', reverse);
  }
}
function focusNextRow(rowIdx, field, reverse=false) {
  const vars=getVars();
  const next = reverse ? rowIdx-1 : rowIdx+1;
  if(next>=0&&next<vars.length){ const tr=document.querySelector(`#vt-tbody tr[data-idx="${next}"]`);if(tr){const inp=tr.querySelector('input');if(inp)inp.focus();} }
}

function vtAddRow(after=-1) {
  const vars=getVars();
  const newRow={label:'',format:'BOOL',address:'',comment:''};
  if(after>=0&&after<vars.length) vars.splice(after+1,0,newRow);
  else vars.push(newRow);
  saveVars(vars); renderVarTable();
  // Focus the new row label
  setTimeout(()=>{
    const newIdx=after>=0?after+1:vars.length-1;
    const tr=document.querySelector(`#vt-tbody tr[data-idx="${newIdx}"]`);
    if(tr){ const inp=tr.querySelector('input');if(inp)inp.focus(); }
  },50);
}

function vtDeleteSelected() {
  if(vtSelRows.size===0) return;
  const vars=getVars();
  const sorted=[...vtSelRows].sort((a,b)=>b-a);
  sorted.forEach(i=>vars.splice(i,1));
  vtSelRows.clear();
  saveVars(vars); renderVarTable(); updateVtDelBtn();
}
function vtDeleteRow(idx) {
  const vars=getVars(); vars.splice(idx,1);
  vtSelRows.delete(idx);
  saveVars(vars); renderVarTable();
}
function updateVtDelBtn() {
  const btn=document.getElementById('vt-del-btn');
  if(btn){ btn.disabled=vtSelRows.size===0; }
}

function vtExportCSV() {
  const vars=getVars();
  const rows=[['Label','DataFormat','Address','Comment']];
  vars.forEach(v=>{
    const devType=(project.devices||[]).find(d=>d.name===(v.format||''));
    if(devType){
      // Device instance: one header row (no address) + one sub-row per signal
      rows.push([v.label||'', v.format||'', '', v.comment||'']);
      (devType.signals||[]).forEach(sig=>{
        const addr=(v.signalAddresses||{})[sig.id]||'';
        const sigLabel=(v.label||'?')+'.'+sig.name;
        rows.push([sigLabel, sig.dataType||'Bool', addr, sig.comment||'']);
      });
    } else {
      rows.push([v.label||'', v.format||'', v.address||'', v.comment||'']);
    }
  });
  const csv=rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const diagName=project.diagrams.find(d=>d.id===activeDiagramId)?.name||'diagram';
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=project.name.replace(/\s+/g,'_')+'_'+diagName.replace(/\s+/g,'_')+'_vars.csv';a.click();
  toast('✓ Exported '+vars.length+' variables');
}
function vtImportCSV() {
  const inp=document.createElement('input');inp.type='file';inp.accept='.csv';
  inp.onchange=e=>{
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const lines=ev.target.result.split(/\r?\n/).filter(l=>l.trim());
        const vars=[];
        lines.forEach((line,li)=>{
          if(li===0&&line.toLowerCase().includes('label')) return; // skip header
          const cols=line.split(',').map(c=>c.trim().replace(/^"|"$/g,'').replace(/""/g,'"'));
          if(cols.length>=1&&cols[0]) vars.push({label:cols[0]||'',format:cols[1]||'BOOL',address:cols[2]||'',comment:cols[3]||''});
        });
        const existing=getVars();
        saveVars([...existing,...vars]);
        renderVarTable();
        toast('✓ Imported '+vars.length+' variables');
      }catch(err){toast('⚠ CSV parse error: '+err.message);}
    };
    reader.readAsText(file);
  };
  inp.click();
}

// Variable table resize drag
function initVtResize() {
  const handle=document.getElementById('vt-resize');
  if(!handle) return;
  handle.addEventListener('mousedown',e=>{
    e.preventDefault(); vtResizing=true;
    vtResizeStartY=e.clientY;
    vtResizeStartH=document.getElementById('vartable-panel').offsetHeight;
    document.addEventListener('mousemove',onVtResizeMove);
    document.addEventListener('mouseup',onVtResizeUp);
  });
}
function onVtResizeMove(e){
  if(!vtResizing)return;
  const delta=vtResizeStartY-e.clientY;
  const newH=Math.max(80,Math.min(600,vtResizeStartH+delta));
  document.getElementById('vartable-panel').style.height=newH+'px';
  drawGrid();
}
function onVtResizeUp(){
  vtResizing=false;
  document.removeEventListener('mousemove',onVtResizeMove);
  document.removeEventListener('mouseup',onVtResizeUp);
}

// ═══════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════
window.addEventListener('load', ()=>{
  init();
  initVtResize();
  // Restore var table open state
  const vts=localStorage.getItem('gf2-vt-open');
  if(vts==='0'){ vtOpen=true; toggleVarTable(); }
  setTimeout(fitView, 200);
  renderVarTable();
});
document.getElementById('modal-input').addEventListener('keydown', e=>{ if(e.key==='Enter') confirmRename(); });
// Unit modal enter
document.addEventListener('DOMContentLoaded',()=>{
  const ui=document.getElementById('modal-unit-name');
  if(ui) ui.addEventListener('keydown',e=>{ if(e.key==='Enter') confirmUnit(); });
  // Meta modal live preview
  ['meta-name','meta-machine','meta-unit','meta-mode','meta-dtype'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.addEventListener('input',updateMetaCodePath);
  });
});
