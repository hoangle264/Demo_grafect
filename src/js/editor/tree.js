"use strict";

// ═══════════════════════════════════════════════════════════
//  RENDER TABS & TREE
// ═══════════════════════════════════════════════════════════
function renderTabs() {
  const bar = document.getElementById('tabs-bar');
  bar.innerHTML = '';
  openTabs.forEach(t => {
    if(t.id === VARS_TAB_ID) {
      const tab = document.createElement('div');
      tab.className = 'tab' + (activeDiagramId===VARS_TAB_ID?' active':'');
      tab.dataset.id = VARS_TAB_ID;
      tab.innerHTML = `<span class="tab-name">📋 Variables</span><button class="tab-close" onclick="closeTab('${VARS_TAB_ID}',event)">×</button>`;
      tab.addEventListener('click', e=>{ if(!e.target.classList.contains('tab-close')) openVarsTab(); });
      bar.appendChild(tab);
      return;
    }
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

  // ── Variables (global Excel/imported vars) ──
  const varsCount = (project.excelVars||[]).length;
  const varsItem = document.createElement('div');
  varsItem.className = 'tree-item';
  varsItem.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 10px 5px 14px;cursor:pointer;font-size:10px;color:var(--text2);border-top:1px solid var(--border);';
  varsItem.innerHTML = `<span style="font-size:11px;">📋</span><span style="flex:1;">Variables</span><span style="font-size:9px;color:var(--text3);background:var(--s2);padding:1px 5px;border-radius:8px;">${varsCount}</span>`;
  varsItem.addEventListener('mouseenter', ()=>{ varsItem.style.background='var(--s2)'; });
  varsItem.addEventListener('mouseleave', ()=>{ varsItem.style.background=''; });
  varsItem.addEventListener('click', ()=>openVarsTab());
  body.appendChild(varsItem);

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
    <span style="flex:1;font-size:9px;letter-spacing:1.5px;font-family:'Orbitron',monospace;">STRUCT DATA</span>
    <span style="font-size:8px;color:var(--text3);margin-right:4px;">${totalTypes}</span>
    <button class="tree-dev-add-btn" onclick="addStandardDeviceTemplates();event.stopPropagation()" title="Add standard struct data templates (CY_Double_Act, CY_Single_Act, Motor_FwdRev)" style="border-color:#a78bfa;color:#a78bfa;">📦</button>
    <button class="tree-dev-add-btn" onclick="openDeviceTypeModal(null);event.stopPropagation()" title="Add Struct Data">⊕</button>`;

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
    e.textContent='no struct data defined';
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
        <span style="font-size:12px;letter-spacing:2px;font-family:'Orbitron',monospace;">${devId?'EDIT':'NEW'} STRUCT DATA</span>
        <span class="dev-class-badge" style="margin-left:auto;">CLASS</span>
      </div>
      <div style="padding:12px 20px 4px;display:flex;gap:20px;flex-shrink:0;flex-wrap:wrap;">
        <div style="flex:1;min-width:180px;">
          <div class="dev-field-lbl">STRUCT DATA NAME</div>
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
        <span>This is a <b>class</b> — no address here. In the <b>Variable Table</b>, select this struct data as DATA FORMAT to create an instance. Address is assigned per-signal in the Variable Table.</span>
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
  if(!name){alert('Please enter a struct data name.');return;}
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
  toast('✓ Struct Data: '+name);
}

function removeDeviceType(devId,e){
  if(e)e.stopPropagation();
  const d=(project.devices||[]).find(x=>x.id===devId);
  if(!confirm(`Delete struct data "${d?.name}"?`)) return;
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
        {id:mkSigId('cy2',0), name:'CoilA', dataType:'Bool', varType:'Output', comment:'Cylinder coil A'},
        {id:mkSigId('cy2',1), name:'CoilB', dataType:'Bool', varType:'Output', comment:'Cylinder coil B'},
        {id:mkSigId('cy2',2), name:'LSH',   dataType:'Bool', varType:'Input',  comment:'High position feedback'},
        {id:mkSigId('cy2',3), name:'LSL',   dataType:'Bool', varType:'Input',  comment:'Low position feedback'},
        {id:mkSigId('cy2',4), name:'LockA', dataType:'Bool', varType:'Input',  comment:'Coil A interlock signal'},
        {id:mkSigId('cy2',5), name:'LockB', dataType:'Bool', varType:'Input',  comment:'Coil B interlock signal'},
        {id:mkSigId('cy2',6), name:'Sys_Man', dataType:'Bool', varType:'Var',  comment:'Manual mode toggle bit'},
        {id:mkSigId('cy2',7), name:'ErrA',  dataType:'Bool', varType:'Var',    comment:'Coil A travel timeout error'},
        {id:mkSigId('cy2',8), name:'ErrB',  dataType:'Bool', varType:'Var',    comment:'Coil B travel timeout error'},
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

