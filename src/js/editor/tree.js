"use strict";

// ═══════════════════════════════════════════════════════════
//  RENDER TABS & TREE
// ═══════════════════════════════════════════════════════════
function renderTabs() {
  const bar = document.getElementById('tabs-bar');
  bar.innerHTML = '';
  openTabs.forEach(t => {
    if(String(t.id).startsWith(STRUCT_TAB_PREFIX)) {
      const devId = String(t.id).slice(STRUCT_TAB_PREFIX.length);
      const dev = (project.devices||[]).find(d=>d.id===devId);
      const tab = document.createElement('div');
      tab.className = 'tab' + (activeDiagramId===t.id?' active':'');
      tab.dataset.id = t.id;
      tab.innerHTML = `<span class="tab-name">Structure: ${esc2(dev?.name||'Unknown')}</span><button class="tab-close" onclick="closeTab('${t.id}',event)">×</button>`;
      tab.addEventListener('click', e=>{ if(!e.target.classList.contains('tab-close')) openStructTab(devId); });
      bar.appendChild(tab);
      return;
    }
    if(t.id === IO_MAPPING_TAB_ID) {
      const tab = document.createElement('div');
      tab.className = 'tab' + (activeDiagramId===IO_MAPPING_TAB_ID?' active':'');
      tab.dataset.id = IO_MAPPING_TAB_ID;
      tab.innerHTML = `<span class="tab-name">🔌 IO Mapping</span><button class="tab-close" onclick="closeTab('${IO_MAPPING_TAB_ID}',event)">×</button>`;
      tab.addEventListener('click', e=>{ if(!e.target.classList.contains('tab-close')) openIOMappingTab(); });
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

function treeIcon(name, cls='') {
  const icons = {
    chevron: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
    folder: '<svg viewBox="0 0 24 24"><path d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5z"/></svg>',
    plc: '<svg viewBox="0 0 24 24"><path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"/></svg>',
    variables: '<svg viewBox="0 0 24 24"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z"/></svg>',
    io: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 17h16M7 4v6m10-6v6M9 14v6m6-6v6"/></svg>',
    structure: '<svg viewBox="0 0 24 24"><path d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>',
    program: '<svg viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>'
  };
  return `<span class="tree-svg ${cls}">${icons[name] || icons.folder}</span>`;
}

function treeSectionOpen(key) {
  return localStorage.getItem('gf2-tree-section-open-' + key) !== '0';
}

function bindTreeSectionToggle(section, key) {
  const head = section.querySelector('.tree-section-head');
  const body = section.querySelector('.tree-section-body');
  const toggle = section.querySelector('.tree-unit-toggle');
  if (!head || !body || !toggle) return;
  head.addEventListener('click', e => {
    if (e.target.closest('button')) return;
    const hidden = body.classList.toggle('hidden');
    toggle.classList.toggle('closed', hidden);
    toggle.classList.toggle('open', !hidden);
    localStorage.setItem('gf2-tree-section-open-' + key, hidden ? '0' : '1');
  });
}

function renderTree() {
  const body = document.getElementById('tree-body');
  body.innerHTML = '';
  if (!project.folders) project.folders = [];
  if (!project.units) project.units = [];
  if (!project.devices) project.devices = [];

  // Project root.
  const editProjectRow = document.createElement('div');
  editProjectRow.className = 'tree-machine';
  editProjectRow.innerHTML = `
    ${treeIcon('folder','root')}
    <span class="tree-machine-name">${esc2(project.name)}</span>
    <button class="tree-machine-edit" onclick="renameProject()" title="Edit project">✎</button>`;
  body.appendChild(editProjectRow);

  // PLC branch.
  const plcWrap = document.createElement('div');
  plcWrap.className = 'tree-section tree-plc-section';
  const plcOpen = treeSectionOpen('plc');
  plcWrap.innerHTML = `
    <div class="tree-section-head">
      <span class="tree-unit-toggle ${plcOpen?'open':'closed'}">${treeIcon('chevron')}</span>
      ${treeIcon('folder','folder')}
      <span class="tree-section-name">PLC</span>
    </div>
    <div class="tree-section-body${plcOpen?'':' hidden'}">
      <div class="tree-leaf" onclick="openPlcConfigModal()">
        ${treeIcon('plc','plc')}
        <span class="tree-leaf-name">${esc2(project.plcConfig?.name || project.plcName || project.machineName || 'Model PLC')}</span>
      </div>
    </div>`;
  bindTreeSectionToggle(plcWrap, 'plc');
  body.appendChild(plcWrap);

  // Machine branch.
  const machineWrap = document.createElement('div');
  machineWrap.className = 'tree-section tree-machine-section';
  const machineOpen = treeSectionOpen('machine');
  machineWrap.innerHTML = `
    <div class="tree-section-head">
      <span class="tree-unit-toggle ${machineOpen?'open':'closed'}">${treeIcon('chevron')}</span>
      ${treeIcon('folder','folder')}
      <span class="tree-section-name">Machine</span>
    </div>`;
  const machineBody = document.createElement('div');
  machineBody.className = 'tree-section-body' + (machineOpen?'':' hidden');

  const varGroups = typeof ensureProjectVariables === 'function' ? ensureProjectVariables() : (project.variables || {imported:[], user:[]});
  const varsCount = ((varGroups.imported||[]).length) + ((varGroups.user||[]).length) + Object.keys(project.unitConfig||{}).length;
  const varsItem = document.createElement('div');
  varsItem.className = 'tree-leaf';
  varsItem.innerHTML = `${treeIcon('variables','vars')}<span class="tree-leaf-name">Global Variables</span><span class="tree-count-badge">${varsCount}</span>`;
  varsItem.addEventListener('click', ()=>openVarsTab());
  machineBody.appendChild(varsItem);

  const ioItem = document.createElement('div');
  ioItem.className = 'tree-leaf';
  ioItem.innerHTML = `${treeIcon('io','io')}<span class="tree-leaf-name">IO Mapping</span>`;
  ioItem.addEventListener('click', ()=>openIOMappingTab());
  machineBody.appendChild(ioItem);

  const devSection = makeDevicesSection();
  devSection.classList.add('tree-section-nested');
  machineBody.appendChild(devSection);

  machineWrap.appendChild(machineBody);
  bindTreeSectionToggle(machineWrap, 'machine');
  body.appendChild(machineWrap);

  // Units branch.
  const unitsWrap = document.createElement('div');
  unitsWrap.className = 'tree-section tree-units-section';
  const unitsOpen = treeSectionOpen('units');
  unitsWrap.innerHTML = `
    <div class="tree-section-head">
      <span class="tree-unit-toggle ${unitsOpen?'open':'closed'}">${treeIcon('chevron')}</span>
      ${treeIcon('folder','folder')}
      <span class="tree-section-name">Units</span>
      <button class="tree-mode-add" onclick="addUnit();event.stopPropagation()" title="Add unit">+</button>
    </div>`;
  const unitsBody = document.createElement('div');
  unitsBody.className = 'tree-section-body' + (unitsOpen?'':' hidden');
  project.units.forEach(u=>unitsBody.appendChild(makeUnitItem(u)));
  unitsWrap.appendChild(unitsBody);
  bindTreeSectionToggle(unitsWrap, 'units');
  body.appendChild(unitsWrap);

  const orphans = project.diagrams.filter(d=>!d.unitId && d.mode!=='Drivers');
  if(orphans.length){
    const orphanHead = document.createElement('div');
    orphanHead.style.cssText='padding:4px 8px;font-size:8px;color:var(--text3);letter-spacing:1px;border-top:1px solid var(--border);';
    orphanHead.textContent='- UNASSIGNED';
    body.appendChild(orphanHead);
    orphans.forEach(d=>body.appendChild(makeDiagItem(d)));
  }

  const projectNameEl = document.getElementById('project-name-display');
  if (projectNameEl) projectNameEl.textContent = project.name;
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
    <span class="tree-unit-toggle ${isOpen?'open':'closed'}">${treeIcon('chevron')}</span>
    ${treeIcon('folder','unit')}
    <span class="tree-unit-name">${esc2(u.name)}</span>
    <div class="tree-unit-actions">
      <button class="tree-unit-btn" onclick="addDiagramInUnit('${u.id}','Auto');event.stopPropagation()" title="Add diagram">+</button>
      <button class="tree-unit-btn" onclick="renameUnit('${u.id}');event.stopPropagation()" title="Rename">✎</button>
      <button class="tree-unit-btn del" onclick="removeUnit('${u.id}',event)" title="Delete">✕</button>
    </div>`;
  head.addEventListener('click', ()=>toggleUnitOpen(u.id));

  const children = document.createElement('div');
  children.className = 'tree-unit-children' + (isOpen?'':' hidden');

  // New tree keeps programs directly under the unit; mode stays in Properties.
  if(!diagsInUnit.length){
    const empty = document.createElement('div');
    empty.style.cssText='padding:3px 8px 3px 34px;font-size:9px;color:var(--text3);font-style:italic;';
    empty.textContent='no programs';
    children.appendChild(empty);
  } else {
    diagsInUnit.forEach(d=>children.appendChild(makeDiagItem(d)));
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
    <span class="tree-dev-toggle ${isOpen?'':'closed'}">${treeIcon('chevron')}</span>
    ${treeIcon('structure','structure')}
    <span class="tree-dev-title">Structure</span>
    <span class="tree-dev-count">${totalTypes}</span>
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
  const isOpen = false;
  const cat = getDevCatById(dev.categoryId||'cat-other');
  const wrap = document.createElement('div');
  wrap.className = 'tree-dev-type';

  const head = document.createElement('div');
  head.className = 'tree-dev-type-head';
  head.innerHTML = `
    <span class="tree-dev-toggle ${isOpen?'':'closed'}">${treeIcon('chevron')}</span>
    <span class="tree-dev-dot"></span>
    <span class="tree-dev-type-name">${esc2(dev.name)}</span>
    <span class="tree-dev-type-tag" title="${esc2(cat.name)}">${esc2(cat.name)}</span>
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
    if(typeof openStructTab === 'function') openStructTab(dev.id);
    else openDeviceTypeModal(dev.id);
  });

  // show/hide action buttons on hover
  const acts = head.querySelector('.tree-dev-type-acts');
  if(acts){ acts.style.opacity='0'; head.addEventListener('mouseenter',()=>acts.style.opacity='1'); head.addEventListener('mouseleave',()=>acts.style.opacity='0'); }

  wrap.appendChild(head); wrap.appendChild(children);
  return wrap;
}

// ── PLC configuration modal ─────────────────────────────────
function openPlcConfigModal() {
  const cfg = project.plcConfig || {};
  let el = document.getElementById('modal-plc-config');
  if (el) el.remove();
  el = document.createElement('div');
  el.id = 'modal-plc-config';
  el.className = 'modal-bg';
  el.style.cssText = 'align-items:center;justify-content:center;';

  const plcTypes = ['Siemens S7-1200', 'Siemens S7-1500', 'Modbus TCP', 'Omron', 'Mitsubishi'];
  const currentType = cfg.type || 'Siemens S7-1200';
  const plcOptions = plcTypes.map(t => `<option value="${esc2(t)}" ${currentType===t?'selected':''}>${esc2(t)}</option>`).join('');

  el.innerHTML = `
    <div class="modal" style="width:520px;min-width:360px;max-width:92vw;display:flex;flex-direction:column;padding:0;overflow:hidden;">
      <div style="padding:12px 20px 10px;background:var(--s3);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-shrink:0;">
        <span style="font-size:15px;">${treeIcon('plc','plc')}</span>
        <span style="font-size:12px;letter-spacing:.3px;font-family:'Segoe UI',sans-serif;font-weight:600;">PLC Configuration</span>
      </div>
      <div style="padding:14px 20px;display:grid;grid-template-columns:1fr 1fr;gap:12px 14px;">
        <div style="grid-column:1 / -1;">
          <div class="dev-field-lbl">Name / Model PLC</div>
          <input id="plc-modal-name" type="text" placeholder="Model PLC" value="${esc2(cfg.name || project.plcName || project.machineName || 'Model PLC')}"
            style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:'Segoe UI',sans-serif;font-size:12px;padding:6px 8px;border-radius:3px;outline:none;margin-top:5px;">
        </div>
        <div style="grid-column:1 / -1;">
          <div class="dev-field-lbl">PLC</div>
          <select id="plc-modal-type" style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:'Segoe UI',sans-serif;font-size:12px;padding:6px 8px;border-radius:3px;outline:none;margin-top:5px;">
            ${plcOptions}
          </select>
        </div>
        <div>
          <div class="dev-field-lbl">IP Address</div>
          <input id="plc-modal-ip" type="text" placeholder="192.168.0.1" value="${esc2(cfg.ip || '')}"
            style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:'Segoe UI',sans-serif;font-size:12px;padding:6px 8px;border-radius:3px;outline:none;margin-top:5px;">
        </div>
        <div>
          <div class="dev-field-lbl">Port</div>
          <input id="plc-modal-port" type="number" min="0" placeholder="102" value="${esc2(cfg.port ?? '102')}"
            style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:'Segoe UI',sans-serif;font-size:12px;padding:6px 8px;border-radius:3px;outline:none;margin-top:5px;">
        </div>
        <div>
          <div class="dev-field-lbl">Rack</div>
          <input id="plc-modal-rack" type="number" min="0" placeholder="0" value="${esc2(cfg.rack ?? '0')}"
            style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:'Segoe UI',sans-serif;font-size:12px;padding:6px 8px;border-radius:3px;outline:none;margin-top:5px;">
        </div>
        <div>
          <div class="dev-field-lbl">Slot</div>
          <input id="plc-modal-slot" type="number" min="0" placeholder="1" value="${esc2(cfg.slot ?? '1')}"
            style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:'Segoe UI',sans-serif;font-size:12px;padding:6px 8px;border-radius:3px;outline:none;margin-top:5px;">
        </div>
        <div style="grid-column:1 / -1;">
          <div class="dev-field-lbl">Timeout</div>
          <input id="plc-modal-timeout" type="number" min="0" placeholder="3000" value="${esc2(cfg.timeout ?? '3000')}"
            style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:'Segoe UI',sans-serif;font-size:12px;padding:6px 8px;border-radius:3px;outline:none;margin-top:5px;">
        </div>
      </div>
      <div style="padding:0 20px 14px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn" onclick="plcConnect()">Connect</button>
        <button class="btn" onclick="plcDisconnect()">Disconnect</button>
        <button class="btn" onclick="plcPingTest()">Ping Test</button>
      </div>
      <div style="padding:10px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;background:var(--s3);">
        <button class="btn" onclick="closeModal('modal-plc-config')">Cancel</button>
        <button class="btn a" onclick="confirmPlcConfig()">✓ Save</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  showModal('modal-plc-config');
  setTimeout(()=>document.getElementById('plc-modal-name').focus(),80);
}

function confirmPlcConfig() {
  const name = (document.getElementById('plc-modal-name').value || '').trim() || 'Model PLC';
  project.plcConfig = {
    name,
    type: document.getElementById('plc-modal-type').value,
    ip: (document.getElementById('plc-modal-ip').value || '').trim(),
    port: document.getElementById('plc-modal-port').value,
    rack: document.getElementById('plc-modal-rack').value,
    slot: document.getElementById('plc-modal-slot').value,
    timeout: document.getElementById('plc-modal-timeout').value
  };
  project.plcName = name;
  saveProject(); renderTree();
  closeModal('modal-plc-config');
  toast('✓ PLC configuration saved');
}

function plcConnect() {
  toast('PLC connect command is ready');
}

function plcDisconnect() {
  toast('PLC disconnect command is ready');
}

function plcPingTest() {
  const ip = (document.getElementById('plc-modal-ip')?.value || '').trim();
  toast(ip ? 'Ping Test: ' + ip : 'Ping Test: enter IP Address');
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
    <div class="modal" style="width:800px;min-width:430px;max-width:92vw;max-height:88vh;display:flex;flex-direction:column;padding:0;overflow:hidden;">
      <div style="padding:12px 20px 10px;background:var(--s3);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-shrink:0;">
        <span style="font-size:15px;">🔩</span>
        <span style="font-size:12px;letter-spacing:.3px;font-family:'Segoe UI',sans-serif;font-weight:600;">${devId?'Edit':'New'} Struct Data</span>
      </div>
      <div style="padding:12px 20px 4px;display:flex;gap:20px;flex-shrink:0;flex-wrap:wrap;">
        <div style="flex:1;min-width:180px;">
          <div class="dev-field-lbl">Struct data name</div>
          <input id="dev-modal-name" type="text" placeholder="e.g. CylA, MotorConv…"
            style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:'Segoe UI',sans-serif;font-size:12px;padding:5px 8px;border-radius:3px;outline:none;margin-top:5px;">
        </div>
        <div style="flex:0 0 180px;">
          <div class="dev-field-lbl">Type</div>
          <select id="dev-modal-cat" style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:'Segoe UI',sans-serif;font-size:12px;padding:5px 8px;border-radius:3px;outline:none;margin-top:5px;">
            ${typeOptions}
          </select>
        </div>
      </div>
      <div style="padding:4px 20px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:11px;letter-spacing:.3px;color:var(--cyan);font-family:'Segoe UI',sans-serif;font-weight:600;">Signals</span>
        <button class="btn" style="border-color:var(--cyan);color:var(--cyan);font-size:9px;" onclick="devModalAddRow()">+ Add Signal</button>
      </div>
      <div style="flex:1;overflow:auto;padding:0 20px 8px;">
        <table class="dev-sig-table">
          <thead><tr>
            <th style="width:140px;">Signal name</th>
            <th style="width:67px;">Data type</th>
            <th style="width:80px;">Variable type</th>
            <th style="width:110px;">Address</th>
            <th>Comment</th>
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
    <td><input class="dev-sig-input" placeholder="%IX0.0 / %QX0.0" value="${esc2(sig?.address||'')}" data-f="address" style="color:var(--amber);"></td>
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
    address: tr.querySelector('[data-f="address"]')?.value.trim() || '',
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
    <span class="tree-item-mode-dot" style="background:${modeColor};box-shadow:0 0 5px ${modeColor};" title="${esc2(d.mode||'Program')}"></span>
    <span class="tree-item-name">${esc2(d.name)}</span>
    <span class="tree-item-type-badge" style="border-color:${typeColor};color:${typeColor};">${typeLbl}</span>
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

