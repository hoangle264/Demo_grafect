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

// Danh sách kiểu primitive phổ thông
const GVT_PRIMITIVE_TYPES = ['BOOL','INT','DINT','UDINT','UINT','WORD','DWORD','BYTE','REAL','LREAL','STRING','TIME'];

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

// ── Compatibility: getVars() dùng bởi actions.js / updateVarDatalist ──
function getVars() {
  if (typeof ensureProjectVariables === 'function') ensureProjectVariables();
  const imported = (project.variables && project.variables.imported) || [];
  const user     = (project.variables && project.variables.user)     || [];
  return imported.concat(user);
}

// ── Tạo <select> cho cột Type (primitive + struct/device) ──
function gvtMakeTypeSelect(entry, v) {
  const currentFormat = v.format || v.dataType || 'BOOL';
  const structDevices = (project.devices || []).map(function(d) { return d.name; });
  const isPrimitive   = GVT_PRIMITIVE_TYPES.includes(currentFormat.toUpperCase());

  const sel = document.createElement('select');
  sel.className = 'vt-cell';
  sel.style.cssText = 'color:var(--cyan);background:var(--s1);border:none;width:100%;cursor:pointer;';
  sel.title = currentFormat;

  // Group 1: Primitive
  const grpPrim = document.createElement('optgroup');
  grpPrim.label = 'Primitive';
  GVT_PRIMITIVE_TYPES.forEach(function(t) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    if (t === currentFormat.toUpperCase()) opt.selected = true;
    grpPrim.appendChild(opt);
  });
  sel.appendChild(grpPrim);

  // Group 2: Struct / Device
  const grpStruct = document.createElement('optgroup');
  grpStruct.label = 'Struct / Device';
  const structOptions = structDevices.length
    ? structDevices
    : ['Cylinder', 'Unit Station', 'Struct Data'];

  structOptions.forEach(function(t) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    if (t === currentFormat) opt.selected = true;
    grpStruct.appendChild(opt);
  });

  // Nếu currentFormat là struct nhưng không nằm trong danh sách → thêm vào
  if (!isPrimitive && !structOptions.includes(currentFormat)) {
    const opt = document.createElement('option');
    opt.value = currentFormat;
    opt.textContent = currentFormat;
    opt.selected = true;
    grpStruct.appendChild(opt);
  }
  sel.appendChild(grpStruct);

  sel.addEventListener('change', function() {
    gvtEditVar(entry.source, String(entry.key), 'format', this.value);
  });

  return sel;
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

    // col 1: Delete button
    const tdDel=document.createElement('td');
    tdDel.className='vt-rownum';
    tdDel.innerHTML=`<button onclick="gvtDeleteVar('${entry.source}', '${String(entry.key).replace(/'/g, '\\&#39;')}')" title="Xóa" style="background:none;border:none;color:#f87171;cursor:pointer;font-size:11px;padding:0 3px;">✕</button>`;
    tr.appendChild(tdDel);

    // col 2: Label input
    const tdL=document.createElement('td');
    tdL.innerHTML=`<input class="vt-cell lbl" value="${esc2(v.label||'')}" onchange="gvtEditVar('${entry.source}','${entry.key}','label',this.value)">`;
    tr.appendChild(tdL);

    // col 3: Type — select box (primitive + struct/device)
    const tdF = document.createElement('td');
    tdF.appendChild(gvtMakeTypeSelect(entry, v));
    tr.appendChild(tdF);

    // col 4: Toggle expand / Address input (primitive)
    const tdTog=document.createElement('td');
    tdTog.style.cssText='padding:0 8px;font-size:9px;color:var(--cyan);cursor:pointer;user-select:none;';

    if(sigList.length) {
      // Có signals → nút toggle expand
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
    } else {
      // Không có signals → ô nhập địa chỉ trực tiếp
      // Dùng createElement để tránh re-render mất focus khi click
      tdTog.style.cssText = '';
      tdTog.onclick = null;

      const addrInput = document.createElement('input');
      addrInput.type = 'text';
      addrInput.className = 'vt-cell addr';
      addrInput.value = v.address || '';
      addrInput.placeholder = '%MX0.0';

      // Chỉ lưu khi blur / Enter — không re-render giữa chừng
      addrInput.addEventListener('change', function() {
        gvtEditVar(entry.source, String(entry.key), 'address', this.value);
      });
      // Ngăn propagation khi đang gõ (tránh trigger event ngoài)
      addrInput.addEventListener('input', function(e) {
        e.stopPropagation();
      });

      tdTog.appendChild(addrInput);
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

        // col 4: Address input (signal sub-row)
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
  // (local var table removed)
  setTimeout(fitView, 200);
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

function ioNormalizeTag(v) {
  return String(v || '').trim().toUpperCase().replace(/[-_\s]+/g, '.').replace(/\.+/g, '.');
}

function ioCollectCandidateVariables() {
  const out = [];
  gvtGetEntries().forEach(function (entry) {
    const v = entry.data || {};
    const sigs = entry.source === 'unit' ? gvtGetUnitSigList() : gvtGetSigList(v);
    const base = String(v.label || '').trim();
    sigs.forEach(function (sig) {
      const dir = sig.varType === 'Input' ? 'Input' : (sig.varType === 'Output' ? 'Output' : '');
      if (!dir) return;
      const appVariable = base ? (base + '.' + sig.name) : sig.name;
      out.push({ appVariable: appVariable, direction: dir, norm: ioNormalizeTag(appVariable) });
    });
  });
  return out;
}

function ioAutoMatchEntries() {
  if (typeof ensureProjectIOMapping === 'function') ensureProjectIOMapping();
  const io = project.ioMapping;
  const cands = ioCollectCandidateVariables();
  io.entries = io.physicalIOs.map(function (p) {
    const norm = ioNormalizeTag(p.deviceTag);
    const sameDir = cands.filter(function (c) { return c.direction === p.direction; });
    let best = null;
    sameDir.forEach(function (c) {
      const score = c.norm === norm ? 1 : (c.norm.endsWith(norm) || norm.endsWith(c.norm) ? 0.7 : 0);
      if (!best || score > best.matchScore) best = { physicalIOId: p.id, appVariable: c.appVariable, status: score >= 1 ? 'matched' : 'unmatched', matchScore: score };
    });
    if (!best || best.matchScore <= 0) return { physicalIOId: p.id, appVariable: '', status: 'unmatched', matchScore: 0 };
    return best;
  });
  saveProject();
}

function ioBuildCandidateOptions(direction) {
  return ioCollectCandidateVariables().filter(function (c) { return c.direction === direction; }).map(function (c) { return c.appVariable; });
}

function ioResolveVariableAddressTarget(appVariable) {
  const parts = String(appVariable || '').split('.');
  const label = parts.shift();
  const sigName = parts.join('.');
  if (!label) return null;
  const entries = gvtGetEntries();
  const entry = entries.find(function (it) { return String(it.data?.label || '') === label; });
  if (!entry) return null;
  const v = entry.data || {};
  if (!sigName) {
    return {
      get: function () { return v.address || ''; },
      set: function (value) { gvtEditVar(entry.source, String(entry.key), 'address', value); }
    };
  }
  const sigList = entry.source === 'unit' ? gvtGetUnitSigList() : gvtGetSigList(v);
  const sig = sigList.find(function (s) { return s.name === sigName; });
  if (!sig) return null;
  return {
    get: function () { return entry.source === 'unit' ? gvtGetUnitAddr(v, sig.path) : gvtGetExcelSignalAddress(v, sig); },
    set: function (value) {
      if (entry.source === 'unit' && project.unitConfig && project.unitConfig[entry.key]) {
        gvtSetUnitAddr(project.unitConfig[entry.key], sig.path, value);
      } else if ((entry.source === 'imported' || entry.source === 'user') && project.variables?.[entry.bucket]?.[entry.key]) {
        const rec = project.variables[entry.bucket][entry.key];
        if(!rec.signalAddresses) rec.signalAddresses = {};
        rec.signalAddresses[sig.id] = value;
        if(entry.source === 'imported' && project.excelVars) {
          const legacyIdx = project.excelVars.findIndex(function(x) { return x && x.label === rec.label; });
          if(legacyIdx >= 0) project.excelVars[legacyIdx] = Object.assign({}, rec);
        }
      } else if(entry.source === 'excel' && project.excelVars?.[entry.key]) {
        if(!project.excelVars[entry.key].signalAddresses) project.excelVars[entry.key].signalAddresses = {};
        project.excelVars[entry.key].signalAddresses[sig.id] = value;
      }
      saveProject();
      renderGlobalVarTable();
      if(typeof updateVarDatalist === 'function') updateVarDatalist();
    }
  };
}

function ioSetEntryMapped(physicalIOId, appVariable) {
  if (typeof ensureProjectIOMapping === 'function') ensureProjectIOMapping();
  const p = (project.ioMapping.physicalIOs || []).find(function (x) { return x.id === physicalIOId; });
  if (!p) return;
  let entry = (project.ioMapping.entries || []).find(function (e) { return e.physicalIOId === physicalIOId; });
  if (!entry) {
    entry = { physicalIOId: physicalIOId, appVariable: '', status: 'unmatched', matchScore: 0 };
    project.ioMapping.entries.push(entry);
  }
  entry.appVariable = appVariable || '';
  entry.status = entry.appVariable ? 'mapped' : 'unmatched';
  entry.matchScore = entry.appVariable ? 1 : 0;
  const target = ioResolveVariableAddressTarget(entry.appVariable);
  if(target) target.set(p.plcAddress || '');
  saveProject();
  renderIOMappingTable(document.getElementById('iomap-filter')?.value || 'All');
}

function ioUnmapEntry(physicalIOId) {
  if (typeof ensureProjectIOMapping === 'function') ensureProjectIOMapping();
  const entry = (project.ioMapping.entries || []).find(function (e) { return e.physicalIOId === physicalIOId; });
  if (!entry) return;
  const target = ioResolveVariableAddressTarget(entry.appVariable);
  if(target) target.set('');
  entry.appVariable = '';
  entry.status = 'unmatched';
  entry.matchScore = 0;
  saveProject();
  renderIOMappingTable(document.getElementById('iomap-filter')?.value || 'All');
}

function ioConfirmManual(physicalIOId) {
  const sel = document.getElementById('iomap-sel-' + physicalIOId);
  if (!sel) return;
  ioSetEntryMapped(physicalIOId, sel.value || '');
}

function renderIOMappingTable(filter) {
  if (typeof ensureProjectIOMapping === 'function') ensureProjectIOMapping();
  const tbody = document.getElementById('iomap-tbody');
  if (!tbody) return;
  const io = project.ioMapping || { physicalIOs: [], entries: [] };
  const byId = Object.create(null);
  (io.entries || []).forEach(function (e) { byId[e.physicalIOId] = e; });
  const eff = filter || 'All';
  const rows = io.physicalIOs.filter(function (p) {
    const e = byId[p.id] || { status: 'unmatched' };
    if (eff === 'Input') return p.direction === 'Input';
    if (eff === 'Output') return p.direction === 'Output';
    if (eff === 'Unmatched') return e.status === 'unmatched';
    return true;
  });
  tbody.innerHTML = '';
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="vt-empty">No IO mapping rows</td></tr>';
    return;
  }
  rows.forEach(function (p) {
    const e = byId[p.id] || { physicalIOId: p.id, appVariable: '', status: 'unmatched', matchScore: 0 };
    const tr = document.createElement('tr');
    const opts = ioBuildCandidateOptions(p.direction);
    const mappedAddress = ioResolveVariableAddressTarget(e.appVariable)?.get() || '';
    const manualCell = e.status === 'unmatched'
      ? '<select id="iomap-sel-' + p.id + '" class="dp-select iomap-select"><option value=""></option>' + opts.map(function (o) { return '<option value="' + esc2(o) + '">' + esc2(o) + '</option>'; }).join('') + '</select>'
      : '<span class="iomap-var">' + esc2(e.appVariable || '') + '</span><span class="iomap-address">' + esc2(mappedAddress || p.plcAddress || '') + '</span>';
    const statusClass = e.status === 'unmatched' ? 'iomap-status-unmapped' : 'iomap-status-mapped';
    const action = e.status === 'unmatched'
      ? '<button class="panel-head-btn btn-cyan" onclick="ioConfirmManual(\'' + p.id + '\')">Map</button>'
      : '<button class="panel-head-btn" onclick="ioUnmapEntry(\'' + p.id + '\')">Unmap</button>';
    tr.innerHTML = '<td>' + esc2(p.deviceTag || '') + '</td><td class="vt-cell addr">' + esc2(p.plcAddress || '') + '</td><td>' + esc2(p.direction || '') + '</td><td>' + esc2(p.description || '') + '</td><td>' + manualCell + '</td><td><span class="iomap-status ' + statusClass + '">' + esc2(e.status || 'unmatched') + '</span></td><td>' + esc2(String(e.matchScore ?? 0)) + '</td><td class="iomap-actions">' + action + '</td>';
    tbody.appendChild(tr);
  });
}

function clearIOMappingImport() {
  if (typeof ensureProjectIOMapping === 'function') ensureProjectIOMapping();
  const hasData = (project.ioMapping.physicalIOs || []).length || (project.ioMapping.entries || []).length;
  if (!hasData) {
    toast('⚠ No IO mapping data to clear');
    return;
  }
  if (!confirm('Clear all imported IO Mapping data?')) return;
  project.ioMapping.physicalIOs = [];
  project.ioMapping.entries = [];
  saveProject();
  renderIOMappingTable(document.getElementById('iomap-filter')?.value || 'All');
  toast('✓ IO Mapping data cleared');
}

function exportIOCode() {
  if (typeof ensureProjectIOMapping === 'function') ensureProjectIOMapping();
  const io = project.ioMapping || { physicalIOs: [], entries: [] };
  const byId = Object.create(null);
  (io.entries || []).forEach(function (e) { byId[e.physicalIOId] = e; });

  const inputLines = [];
  const outputLines = [];

  (io.physicalIOs || []).forEach(function (p) {
    const e = byId[p.id] || { appVariable: '' };
    if (!e.appVariable) return;

    const plcAddr = p.plcAddress || '';
    const appAddr = ioResolveVariableAddressTarget(e.appVariable)?.get() || e.appVariable || '';

    if (p.direction === 'Input') {
      inputLines.push('LD ' + plcAddr);
      inputLines.push('OUT ' + appAddr);
    } else if (p.direction === 'Output') {
      outputLines.push('LD ' + appAddr);
      outputLines.push('OUT ' + plcAddr);
    }
  });

  let code = [];
  if (inputLines.length) {
    code.push(';Input');
    code = code.concat(inputLines);
  }
  if (outputLines.length) {
    code.push(';Output');
    code = code.concat(outputLines);
  }

  if (!code.length) {
    toast('⚠ No mapped IO entries to export');
    return;
  }

  const text = code.join('\n');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (project.name || 'io-mapping').replace(/\s+/g, '_') + '_code.txt';
  a.click();
  toast('✓ IO Mapping code exported');
}

