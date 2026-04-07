"use strict";

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

