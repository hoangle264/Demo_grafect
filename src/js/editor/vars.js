"use strict";

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

// Returns only diagram-local vars (for saving)
function getLocalVars() {
  if(!state.vars) state.vars = [];
  return state.vars;
}

// Returns merged view: local diagram vars + project.excelVars (global).
// Local vars take priority if same label exists in both.
// This is the single source of truth for all lookups (datalist, gen code, etc.)
function getVars() {
  const local = getLocalVars();
  const excelVars = (project.excelVars || []);
  const localLabels = new Set(local.map(v => v.label));
  const extra = excelVars.filter(v => !localLabels.has(v.label));
  return [...local, ...extra];
}

function saveVars(vars) {
  if(!activeDiagramId) return;
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
  const vars = getLocalVars();
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
          const vars=getLocalVars();
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
            const vars=getLocalVars();
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
  if(cnt) cnt.textContent = vars.length+' var'+(vars.length!==1?'s':'')+(filter?' (filtered)':'');
}

function vtEditCell(idx, field, val, cls, type, ph) {
  const td = document.createElement('td');
  const inp = document.createElement('input');
  inp.type = type; inp.className = 'vt-cell '+cls;
  inp.value = val; inp.placeholder = ph;
  inp.addEventListener('change', ()=>{
    const vars=getLocalVars(); if(vars[idx]) vars[idx][field]=inp.value; saveVars(vars);
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
    grpDev.label = '── Struct Data ──';
    devTypes.forEach(d=>{
      const o=document.createElement('option');
      o.value=d.name; o.textContent='❖ '+d.name;
      if(d.name===val) o.selected=true;
      grpDev.appendChild(o);
    });
    sel.appendChild(grpDev);
  }

  sel.addEventListener('change',()=>{
    const vars=getLocalVars();
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
  const vars=getLocalVars();
  const next = reverse ? rowIdx-1 : rowIdx+1;
  if(next>=0&&next<vars.length){ const tr=document.querySelector(`#vt-tbody tr[data-idx="${next}"]`);if(tr){const inp=tr.querySelector('input');if(inp)inp.focus();} }
}

function vtAddRow(after=-1) {
  const vars=getLocalVars();
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
  const vars=getLocalVars();
  const sorted=[...vtSelRows].sort((a,b)=>b-a);
  sorted.forEach(i=>vars.splice(i,1));
  vtSelRows.clear();
  saveVars(vars); renderVarTable(); updateVtDelBtn();
}
function vtDeleteRow(idx) {
  const vars=getLocalVars(); vars.splice(idx,1);
  vtSelRows.delete(idx);
  saveVars(vars); renderVarTable();
}
function updateVtDelBtn() {
  const btn=document.getElementById('vt-del-btn');
  if(btn){ btn.disabled=vtSelRows.size===0; }
}

function vtExportCSV() {
  const vars=getLocalVars();
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
        const existing=getLocalVars();
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
// ═══════════════════════════════════════════════════════════
//  GLOBAL VARIABLE TABLE (sidebar panel)
// ═══════════════════════════════════════════════════════════
const GVT_CYL_SIGNALS = [
  {id:'cyl_coilA',  name:'CoilA',    dataType:'Bool', varType:'Output', comment:'Output coil A (extend)'},
  {id:'cyl_coilB',  name:'CoilB',    dataType:'Bool', varType:'Output', comment:'Output coil B (retract)'},
  {id:'cyl_lsh',    name:'LSH',      dataType:'Bool', varType:'Input',  comment:'Limit switch high (extended)'},
  {id:'cyl_lsl',    name:'LSL',      dataType:'Bool', varType:'Input',  comment:'Limit switch low (retracted)'},
  {id:'cyl_lockA',  name:'LockA',    dataType:'Bool', varType:'Var',    comment:'Interlock coil A'},
  {id:'cyl_lockB',  name:'LockB',    dataType:'Bool', varType:'Var',    comment:'Interlock coil B'},
  {id:'cyl_disSnsH',name:'DisSnsH',  dataType:'Bool', varType:'Var',    comment:'Disable sensor LSH'},
  {id:'cyl_disSnsL',name:'DisSnsL',  dataType:'Bool', varType:'Var',    comment:'Disable sensor LSL'},
  {id:'cyl_errA',   name:'ErrorA',   dataType:'Bool', varType:'Var',    comment:'Error flag dir A'},
  {id:'cyl_errB',   name:'ErrorB',   dataType:'Bool', varType:'Var',    comment:'Error flag dir B'},
  {id:'cyl_state',  name:'State',    dataType:'Bool', varType:'Var',    comment:'Cylinder state'},
  {id:'cyl_hmiMan', name:'HmiManBtn',dataType:'Bool', varType:'Var',    comment:'HMI manual button'},
];

const GVT_UNIT_SIGNALS = [
  {id:'originBaseAddr', name:'OriginBase', dataType:'Word', varType:'Var', path:'originBaseAddr'},
  {id:'autoBaseAddr',   name:'AutoBase',   dataType:'Word', varType:'Var', path:'autoBaseAddr'},
  {id:'flagOrigin',     name:'OriginFlag', dataType:'Bool', varType:'Var', path:'flags.flagOrigin'},
  {id:'flagAuto',       name:'AutoFlag',   dataType:'Bool', varType:'Var', path:'flags.flagAuto'},
  {id:'flagManual',     name:'ManualFlag', dataType:'Bool', varType:'Var', path:'flags.flagManual'},
  {id:'flagError',      name:'ErrorFlag',  dataType:'Bool', varType:'Var', path:'flags.flagError'},
  {id:'btnStart',       name:'Start',      dataType:'Bool', varType:'Input', path:'io.btnStart'},
  {id:'hmiStop',        name:'Stop',       dataType:'Bool', varType:'Input', path:'io.hmiStop'},
  {id:'btnReset',       name:'Reset',      dataType:'Bool', varType:'Input', path:'io.btnReset'},
  {id:'eStop',          name:'EStop',      dataType:'Bool', varType:'Input', path:'io.eStop'},
  {id:'outHomed',       name:'HomeDone',   dataType:'Bool', varType:'Output', path:'io.outHomed'},
];

function gvtGetEntries() {
  const unitConfig = project.unitConfig || {};
  const hasExcelUnitStation = (project.excelVars || []).some(function(v) {
    return v && v.format === 'Unit Station';
  });
  const excelEntries = (project.excelVars || []).map(function(v, idx) {
    return {
      source: 'excel',
      key: idx,
      label: v.label || '',
      format: v.format || 'Struct Data',
      data: v,
    };
  });
  const unitEntries = hasExcelUnitStation ? [] : Object.keys(unitConfig).map(function(key) {
    const cfg = unitConfig[key] || {};
    return {
      source: 'unit',
      key: key,
      label: cfg.label || key,
      format: 'Unit Station',
      data: cfg,
    };
  });
  return excelEntries.concat(unitEntries);
}

function gvtGetUnitAddr(cfg, path) {
  return path.split('.').reduce(function(cur, part) {
    return cur && cur[part] != null ? cur[part] : '';
  }, cfg) || '';
}

function gvtSetUnitAddr(cfg, path, value) {
  const parts = path.split('.');
  let cur = cfg;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function gvtGetUnitSigList() {
  const devType = (project.devices||[]).find(d=>d.name==='Unit Station');
  const devSigs = devType ? (devType.signals||[]) : [];
  if (!devSigs.length) return GVT_UNIT_SIGNALS;

  const unitPaths = GVT_UNIT_SIGNALS.reduce(function(map, sig) {
    map[sig.id] = sig.path;
    return map;
  }, {});
  return devSigs.map(function(sig) {
    return Object.assign({}, sig, {
      path: unitPaths[sig.id] || sig.path || sig.id
    });
  });
}

function gvtGetSigList(v) {
  const devType = (project.devices||[]).find(d=>d.name===(v.format||''));
  const devSigs = devType ? (devType.signals||[]) : [];
  const hasCylIds = devSigs.some(s=>s.id&&s.id.startsWith('cyl_'));
  return (v.format==='Cylinder' && !hasCylIds) ? GVT_CYL_SIGNALS : devSigs;
}

function gvtGetExcelSignalAddress(v, sig) {
  const sAddr = (v && v.signalAddresses) || {};
  if (!sig) return '';

  if ((v && v.format) === 'Cylinder') {
    const key = String(sig.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key === 'lsh') return sAddr.cyl_lsh || sAddr.LSH || '';
    if (key === 'lsl') return sAddr.cyl_lsl || sAddr.LSL || '';
    if (key === 'locka') return sAddr.cyl_lockA || sAddr.LockA || '';
    if (key === 'lockb') return sAddr.cyl_lockB || sAddr.LockB || '';
    if (key === 'dissnslsh' || key === 'dissnsh') return sAddr.cyl_disSnsH || sAddr.DisSnsLSH || sAddr.DisSnsH || '';
    if (key === 'dissnslsl' || key === 'dissnsl') return sAddr.cyl_disSnsL || sAddr.DisSnsLSL || sAddr.DisSnsL || '';
    if (key === 'state') return sAddr.cyl_state || sAddr.State || '';
    if (key === 'errora' || key === 'erra') return sAddr.cyl_errA || sAddr.ErrorA || sAddr.ErrA || '';
    if (key === 'errorb' || key === 'errb') return sAddr.cyl_errB || sAddr.ErrorB || sAddr.ErrB || '';
    if (key === 'coila') return sAddr.cyl_coilA || sAddr.CoilA || '';
    if (key === 'coilb') return sAddr.cyl_coilB || sAddr.CoilB || '';
    if (key === 'hmimanbtn' || key === 'hmiman') return sAddr.cyl_hmiMan || sAddr.HmiManBtn || sAddr.HmiMan || '';
  }

  if (sig.id && sAddr[sig.id]) return sAddr[sig.id];

  return '';
}

function renderGlobalVarTable() {
  const tbody = document.getElementById('gvt-tbody');
  if(!tbody) return;
  tbody.innerHTML = '';
  const entries = gvtGetEntries();
  const filter = (document.getElementById('gvt-search')?.value||'').toLowerCase();
  const filtered = entries.filter(v=>
    !filter ||
    (v.label||'').toLowerCase().includes(filter) ||
    (v.format||'').toLowerCase().includes(filter)
  );

  const cnt = document.getElementById('gvt-count');
  if(cnt) cnt.textContent = entries.length+' item'+(entries.length!==1?'s':'');

  if(filtered.length===0){
    const tr=document.createElement('tr');
    tr.innerHTML=`<td colspan="4" class="vt-empty">${entries.length===0
      ?'Chưa có — import từ 📥 CSV/Excel'
      :'No match for filter'}</td>`;
    tbody.appendChild(tr);
    return;
  }

  filtered.forEach(function(entry){
    const v = entry.data;
    const sigList = entry.source === 'unit' ? gvtGetUnitSigList() : gvtGetSigList(v);
    const sAddr = v.signalAddresses||{};
    const isExpanded = v._sigExpanded !== false;

    // ── Device header row ──
    const tr=document.createElement('tr');
    tr.className='vt-dev-instance';

    const tdDel=document.createElement('td');
    tdDel.className='vt-rownum';
    tdDel.innerHTML=`<button onclick="gvtDeleteVar('${entry.source}', '${String(entry.key).replace(/'/g, '\\&#39;')}')" title="Xóa" style="background:none;border:none;color:#f87171;cursor:pointer;font-size:11px;padding:0 3px;">✕</button>`;
    tr.appendChild(tdDel);

    const tdL=document.createElement('td');
    tdL.innerHTML=`<span class="vt-cell lbl">${esc2(v.label||'')}</span>`;
    tr.appendChild(tdL);

    const tdF=document.createElement('td');
    tdF.innerHTML=`<span style="font-size:9px;color:var(--cyan);">${esc2(v.format||'')}</span>`;
    tr.appendChild(tdF);

    const tdTog=document.createElement('td');
    tdTog.style.cssText='padding:0 8px;font-size:9px;color:var(--cyan);cursor:pointer;user-select:none;';
    tdTog.innerHTML=`<span style="display:inline-flex;align-items:center;gap:4px;">
      <span>${isExpanded?'▾':'▸'}</span>
      <span style="opacity:.7;">${sigList.length} address${sigList.length!==1?'es':''}</span>
    </span>`;
    tdTog.addEventListener('click',function(){
      if(entry.source === 'excel' && project.excelVars[entry.key]) {
        project.excelVars[entry.key]._sigExpanded = !isExpanded;
      } else if(entry.source === 'unit' && project.unitConfig && project.unitConfig[entry.key]) {
        project.unitConfig[entry.key]._sigExpanded = !isExpanded;
      }
      saveProject(); renderGlobalVarTable();
    });
    tr.appendChild(tdTog);
    tbody.appendChild(tr);

    // ── Signal sub-rows (editable) ──
    if(isExpanded && sigList.length>0){
      sigList.forEach(function(sig){
        const subTr=document.createElement('tr');
        subTr.className='vt-dev-signal-row';
        const vc={Input:'vt-input',Output:'vt-output',Var:'vt-var'}[sig.varType]||'vt-var';
        const vs={Input:'IN',Output:'OUT',Var:'VAR'}[sig.varType]||'VAR';
        const tc={Bool:'sig-bool',Int:'sig-int',Real:'sig-real',Word:'sig-word'}[sig.dataType||'Bool']||'sig-bool';

        // col 1: indent marker
        const tdSN=document.createElement('td');
        tdSN.innerHTML='<div class="vt-sig-num"></div>';
        subTr.appendChild(tdSN);

        // col 2: Label.SignalName
        const tdSLabel=document.createElement('td');
        tdSLabel.innerHTML=`<div class="vt-sig-label">
          <span class="vt-sig-indent">└</span>
          <span class="vt-sig-name">${esc2(v.label||'?')}.${esc2(sig.name)}</span>
        </div>`;
        subTr.appendChild(tdSLabel);

        // col 3: Type badges
        const tdSType=document.createElement('td');
        tdSType.innerHTML=`<span class="sdcol-type ${tc}">${esc2(sig.dataType||'Bool')}</span>
          <span class="sdcol-io ${vc}" style="margin-left:3px;">${vs}</span>`;
        subTr.appendChild(tdSType);

        // col 4: Address input
        const tdSAddr=document.createElement('td');
        const addrInp=document.createElement('input');
        addrInp.type='text';
        addrInp.className='vt-cell addr vt-sig-addr';
        addrInp.value=entry.source === 'unit' ? gvtGetUnitAddr(v, sig.path) : gvtGetExcelSignalAddress(v, sig);
        addrInp.placeholder=sig.varType==='Input'?'MR…':sig.varType==='Output'?'LR…':'MR…';
        addrInp.addEventListener('change',function(){
          if(entry.source === 'excel' && project.excelVars[entry.key]){
            if(!project.excelVars[entry.key].signalAddresses) project.excelVars[entry.key].signalAddresses={};
            project.excelVars[entry.key].signalAddresses[sig.id]=addrInp.value;
          } else if(entry.source === 'unit' && project.unitConfig && project.unitConfig[entry.key]) {
            gvtSetUnitAddr(project.unitConfig[entry.key], sig.path, addrInp.value);
          }
          saveProject();
          if(typeof updateVarDatalist==='function') updateVarDatalist();
        });
        tdSAddr.appendChild(addrInp);
        subTr.appendChild(tdSAddr);
        tbody.appendChild(subTr);
      });
    }
  });
}

function gvtDeleteVar(source, key) {
  if(source === 'excel') {
    const idx = parseInt(key, 10);
    if(!project.excelVars||idx<0||idx>=project.excelVars.length) return;
    if(!confirm('Xóa "'+project.excelVars[idx].label+'" khỏi Global Vars?')) return;
    project.excelVars.splice(idx,1);
  } else if(source === 'unit') {
    if(!project.unitConfig || !project.unitConfig[key]) return;
    if(!confirm('Xóa unit "'+(project.unitConfig[key].label||key)+'" khỏi Global Vars?')) return;
    delete project.unitConfig[key];
  } else {
    return;
  }
  saveProject();
  renderGlobalVarTable();
}

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

// Hiển thị preview đường dẫn code trong modal Diagram Properties
function updateMetaCodePath() {
  const el = document.getElementById('meta-codepath');
  if (!el) return;
  const machine = (document.getElementById('meta-machine')?.value || 'Machine').trim() || 'Machine';
  const unit    = (document.getElementById('meta-unit')?.value    || 'Unit').trim()    || 'Unit';
  const mode    = (document.getElementById('meta-mode')?.value    || 'Auto').trim()    || 'Auto';
  const name    = (document.getElementById('meta-name')?.value    || '').trim();
  const dtype   = (document.getElementById('meta-dtype')?.value   || 'Main').trim();
  const label   = name || mode;
  el.textContent = `${machine} / ${unit} / ${mode} / ${label}  [${dtype}]`;
}

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
