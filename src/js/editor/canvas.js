"use strict";

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

