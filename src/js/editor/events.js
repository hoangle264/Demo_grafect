"use strict";

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

