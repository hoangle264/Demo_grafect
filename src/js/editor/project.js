"use strict";

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
