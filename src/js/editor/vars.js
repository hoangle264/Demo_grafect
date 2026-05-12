"use strict";

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
  if (typeof ensureProjectVariables === 'function') ensureProjectVariables();
  const imported = ((project.variables && project.variables.imported) || []).map(function(v, idx) {
    return { source: 'imported', bucket: 'imported', key: idx, label: v.label || '', format: v.format || v.dataType || 'BOOL', data: v };
  });
  const user = ((project.variables && project.variables.user) || []).map(function(v, idx) {
    return { source: 'user', bucket: 'user', key: idx, label: v.label || '', format: v.format || v.dataType || 'BOOL', data: v };
  });
  const unitImported = Object.keys(project.unitConfig || {}).map(function(key) {
    const cfg = project.unitConfig[key] || {};
    return { source: 'unit', bucket: 'imported', key: key, label: cfg.label || key, format: 'Unit Station', data: cfg };
  });
  if (imported.length || user.length || unitImported.length) return imported.concat(unitImported, user);

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

  let lastGroup = '';
  filtered.forEach(function(entry){
    const v = entry.data;
    const sigList = entry.source === 'unit' ? gvtGetUnitSigList() : gvtGetSigList(v);
    const isExpanded = v._sigExpanded !== false;
    const groupName = (entry.bucket || entry.source) === 'user' ? 'User Variables' : 'Imported / Unit Devices';
    if(groupName !== lastGroup) {
      const groupTr = document.createElement('tr');
      groupTr.innerHTML = `<td colspan="4" style="padding:8px 12px;background:var(--s2);color:var(--amber);font-size:9px;letter-spacing:1.5px;font-family:'Orbitron',monospace;border-top:1px solid var(--border);">${groupName}</td>`;
      tbody.appendChild(groupTr);
      lastGroup = groupName;
    }

    // ── Device header row ──
    const tr=document.createElement('tr');
    tr.className = sigList.length ? 'vt-dev-instance' : '';

    const tdDel=document.createElement('td');
    tdDel.className='vt-rownum';
    tdDel.innerHTML=`<button onclick="gvtDeleteVar('${entry.source}', '${String(entry.key).replace(/'/g, '\\&#39;')}')" title="Xóa" style="background:none;border:none;color:#f87171;cursor:pointer;font-size:11px;padding:0 3px;">✕</button>`;
    tr.appendChild(tdDel);

    const tdL=document.createElement('td');
    tdL.innerHTML=`<input class="vt-cell lbl" value="${esc2(v.label||'')}" onchange="gvtEditVar('${entry.source}','${entry.key}','label',this.value)">`;
    tr.appendChild(tdL);

    const tdF=document.createElement('td');
    tdF.innerHTML=`<input class="vt-cell" value="${esc2(v.format||v.dataType||'BOOL')}" onchange="gvtEditVar('${entry.source}','${entry.key}','format',this.value)" style="color:var(--cyan);">`;
    tr.appendChild(tdF);

    const tdTog=document.createElement('td');
    tdTog.style.cssText='padding:0 8px;font-size:9px;color:var(--cyan);cursor:pointer;user-select:none;';
    tdTog.innerHTML=`<span style="display:inline-flex;align-items:center;gap:4px;">
      <span>${isExpanded?'▾':'▸'}</span>
      <span style="opacity:.7;">${sigList.length} address${sigList.length!==1?'es':''}</span>
    </span>`;
    tdTog.addEventListener('click',function(){
      if((entry.source === 'imported' || entry.source === 'user') && project.variables && project.variables[entry.bucket] && project.variables[entry.bucket][entry.key]) {
        project.variables[entry.bucket][entry.key]._sigExpanded = !isExpanded;
      } else if(entry.source === 'excel' && project.excelVars[entry.key]) {
        project.excelVars[entry.key]._sigExpanded = !isExpanded;
      } else if(entry.source === 'unit' && project.unitConfig && project.unitConfig[entry.key]) {
        project.unitConfig[entry.key]._sigExpanded = !isExpanded;
      }
      saveProject(); renderGlobalVarTable();
    });
    if(!sigList.length) {
      tdTog.style.cssText = '';
      tdTog.onclick = null;
      tdTog.innerHTML=`<input class="vt-cell addr" value="${esc2(v.address||'')}" placeholder="%MX0.0" onchange="gvtEditVar('${entry.source}','${entry.key}','address',this.value)">`;
    }
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
          if((entry.source === 'imported' || entry.source === 'user') && project.variables && project.variables[entry.bucket] && project.variables[entry.bucket][entry.key]){
            const rec = project.variables[entry.bucket][entry.key];
            if(!rec.signalAddresses) rec.signalAddresses={};
            rec.signalAddresses[sig.id]=addrInp.value;
            if(entry.source === 'imported' && project.excelVars) {
              const legacyIdx = project.excelVars.findIndex(function(x) { return x && x.label === rec.label; });
              if(legacyIdx >= 0) project.excelVars[legacyIdx] = Object.assign({}, rec);
            }
          } else if(entry.source === 'excel' && project.excelVars[entry.key]){
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

function gvtResolveEntry(source, key) {
  if (typeof ensureProjectVariables === 'function') ensureProjectVariables();
  const idx = parseInt(key, 10);
  if (source === 'imported') return { list: project.variables.imported, item: project.variables.imported[idx], idx: idx, bucket:'imported' };
  if (source === 'user') return { list: project.variables.user, item: project.variables.user[idx], idx: idx, bucket:'user' };
  if (source === 'excel') return { list: project.excelVars || [], item: (project.excelVars || [])[idx], idx: idx, bucket:'excel' };
  return { list: null, item: null, idx: idx, bucket:'' };
}

function gvtEditVar(source, key, field, value) {
  const hit = gvtResolveEntry(source, key);
  if(!hit.item) return;
  hit.item[field] = value;
  if(field === 'format') {
    hit.item.dataType = value;
    const devType = (project.devices||[]).find(d=>d.name===value);
    if(devType) {
      hit.item.kind = 'struct';
      if(!hit.item.signalAddresses) hit.item.signalAddresses = {};
    } else {
      hit.item.kind = 'primitive';
      delete hit.item.signalAddresses;
    }
  }
  if(source === 'imported' && project.excelVars) {
    const legacyIdx = project.excelVars.findIndex(function(v) { return v && v.label === hit.item.label; });
    if(legacyIdx >= 0) project.excelVars[legacyIdx] = Object.assign({}, hit.item);
  }
  saveProject();
  renderGlobalVarTable();
  if(typeof updateVarDatalist==='function') updateVarDatalist();
}

function gvtAddUserVar() {
  if (typeof ensureProjectVariables === 'function') ensureProjectVariables();
  const label = 'UserVar_' + String(project.variables.user.length + 1).padStart(2, '0');
  const base = { label: label, format: 'BOOL', dataType: 'BOOL', address: '', comment: '', source: 'manual' };
  project.variables.user.push(typeof normalizeVariableRecord === 'function' ? normalizeVariableRecord(base, 'user') : base);
  saveProject();
  renderGlobalVarTable();
  toast('Added user variable');
}

function gvtDeleteVar(source, key) {
  if(source === 'imported' || source === 'user') {
    const hit = gvtResolveEntry(source, key);
    if(!hit.list || !hit.item) return;
    if(!confirm('Delete "'+(hit.item.label||'variable')+'"?')) return;
    const deletedLabel = hit.item.label;
    hit.list.splice(hit.idx,1);
    if(source === 'imported' && project.excelVars) {
      project.excelVars = project.excelVars.filter(function(v) { return v && v.label !== deletedLabel; });
    }
    saveProject();
    renderGlobalVarTable();
    if(typeof updateVarDatalist==='function') updateVarDatalist();
    return;
  }
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
  document.body.classList.add('unified-vars');
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
