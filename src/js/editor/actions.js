"use strict";

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

