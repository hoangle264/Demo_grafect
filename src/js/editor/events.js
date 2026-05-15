"use strict";

const getById = (id) => document.getElementById(id);
const isEditableTarget = ({ target }) => ['INPUT', 'TEXTAREA'].includes(target.tagName);
const getCanvasPoint = ({ clientX, clientY }) => w2s(clientX, clientY);
const setAttrs = (el, attrs) => Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));

// ═══════════════════════════════════════════════════════════
//  MOUSE INTERACTIONS
// ═══════════════════════════════════════════════════════════
const beginPan = ({ clientX, clientY }) => {
  panning = true;
  panSX = clientX - viewX;
  panSY = clientY - viewY;
};

const runPlacementTool = ({ x, y }) => {
  const placementActions = {
    step: () => addStep(x, y, false),
    initstep: () => addStep(x, y, true),
    transition: () => addTransition(x, y),
    'par-split': () => addParallel(x, y, 'split'),
    'par-join': () => addParallel(x, y, 'join'),
  };

  if (!placementActions[tool]) return false;
  placementActions[tool]();
  return true;
};

const beginSelectionBox = (e, { x, y }) => {
  if (!e.shiftKey) selIds.clear();
  selBoxing = true;
  selBoxSX = x;
  selBoxSY = y;
  setAttrs(getById('sel-box'), { x, y, width: 0, height: 0, display: '' });
  beginPan(e);
};

const updateSelectionBox = ({ x, y }) => {
  const sx = Math.min(x, selBoxSX);
  const sy = Math.min(y, selBoxSY);
  const sw = Math.abs(x - selBoxSX);
  const sh = Math.abs(y - selBoxSY);
  setAttrs(getById('sel-box'), { x: sx, y: sy, width: sw, height: sh });
};

const getPortSnapCandidates = (elements = state) => {
  const steps = Array.isArray(elements) ? elements.filter(({ type }) => type === 'step') : (elements.steps || []);
  const transitions = Array.isArray(elements) ? elements.filter(({ type }) => type === 'transition') : (elements.transitions || []);
  const parallels = Array.isArray(elements) ? elements.filter(({ type }) => type === 'parallel') : (elements.parallels || []);
  const candidates = [];
  const addCandidate = (elementId, portId, point) => {
    if (point) candidates.push({ x: point.x, portId, elementId });
  };

  steps.forEach(({ id }) => {
    addCandidate(id, 'top', getPortXY(id, 'top'));
    addCandidate(id, 'bottom', getPortXY(id, 'bottom'));
  });
  transitions.forEach(({ id }) => {
    addCandidate(id, 'top', getPortXY(id, 'top'));
    addCandidate(id, 'bottom', getPortXY(id, 'bottom'));
  });
  parallels.forEach(({ id, ports = 3, type }) => {
    const isSplit = type === 'split';
    addCandidate(id, isSplit ? 'top' : 'bottom', getPortXY(id, isSplit ? 'top' : 'bottom'));
    for (let index = 0; index < ports; index += 1) {
      const portId = isSplit ? `bottom-${index}` : `top-${index}`;
      addCandidate(id, portId, getPortXY(id, portId));
    }
  });

  return candidates;
};

const getNearestSnapCandidate = (dragCenterX, candidates, threshold) => candidates
  .map((candidate) => ({ ...candidate, distance: Math.abs(dragCenterX - candidate.x) }))
  .filter(({ distance }) => distance <= threshold)
  .sort((a, b) => a.distance - b.distance)[0] || null;

const updateSnapState = (dragCenterX, candidates, currentSnapState) => {
  const nearestEnterCandidate = getNearestSnapCandidate(dragCenterX, candidates, SNAP_ENTER_THRESHOLD);

  if (currentSnapState?.isSnapped) {
    const currentCandidate = candidates.find(({ portId, elementId }) => (
      portId === currentSnapState.portId && elementId === currentSnapState.elementId
    ));
    const currentSnapX = currentCandidate ? currentCandidate.x : currentSnapState.snapX;
    const currentDistance = Math.abs(dragCenterX - currentSnapX);

    if (currentDistance <= SNAP_EXIT_THRESHOLD) {
      if (nearestEnterCandidate && nearestEnterCandidate.x !== currentSnapX) {
        return {
          isSnapped: true,
          snapX: nearestEnterCandidate.x,
          portId: nearestEnterCandidate.portId,
          elementId: nearestEnterCandidate.elementId,
        };
      }
      return { ...currentSnapState, snapX: currentSnapX };
    }
  }

  if (!nearestEnterCandidate) return null;
  return {
    isSnapped: true,
    snapX: nearestEnterCandidate.x,
    portId: nearestEnterCandidate.portId,
    elementId: nearestEnterCandidate.elementId,
  };
};

const applySnapToDrag = (mouseX, snapState) => (snapState?.isSnapped ? snapState.snapX : mouseX);

const drawSnapGuideLine = (snapState, canvasCtx) => {
  if (!canvasCtx) return;
  if (!snapState?.isSnapped) {
    drawGrid(false);
    return;
  }

  const port = getPortXY(snapState.elementId, snapState.portId);
  if (!port) return;

  const canvas = canvasCtx.canvas;
  const sx = viewX + snapState.snapX * viewScale;
  const sy = viewY + port.y * viewScale;
  canvasCtx.save();
  canvasCtx.beginPath();
  canvasCtx.setLineDash([6, 6]);
  canvasCtx.moveTo(sx, sy);
  canvasCtx.lineTo(sx, canvas.height);
  canvasCtx.strokeStyle = '#f5a623';
  canvasCtx.lineWidth = 1.5;
  canvasCtx.stroke();
  canvasCtx.restore();
};

const clearSnapGuideLine = () => {
  dragSnapState = null;
  drawSnapGuideLine(null, getById('grid-canvas')?.getContext('2d'));
};

const getDragElementWidth = (id) => {
  if (state.steps.some((item) => item.id === id)) return SW;
  if (state.transitions.some((item) => item.id === id)) return TW;
  const pb = state.parallels.find((item) => item.id === id);
  return pb ? pb.width : 0;
};

const refreshDragSnapGuide = (nextSnapState) => {
  const wasSnapped = dragSnapState?.isSnapped;
  dragSnapState = nextSnapState;
  if (wasSnapped || dragSnapState?.isSnapped) {
    drawGrid();
  }
};

const dragSelectedElements = ({ x, y }) => {
  const primaryDragOffset = dragMap.get(dragSnapPrimaryId);
  const primaryWidth = primaryDragOffset ? getDragElementWidth(dragSnapPrimaryId) : 0;
  const primaryCenterX = primaryDragOffset ? x - primaryDragOffset.dx + primaryWidth / 2 : x;
  const nextSnapState = updateSnapState(primaryCenterX, dragSnapCandidates, dragSnapState);
  const snappedCenterX = applySnapToDrag(primaryCenterX, nextSnapState);
  const snapDeltaX = snappedCenterX - primaryCenterX;

  dragMap.forEach(({ dx, dy }, id) => {
    const s = state.steps.find((item) => item.id === id);
    if (s) {
      s.x = nextSnapState?.isSnapped ? x - dx + snapDeltaX : snap(x - dx);
      s.y = snap(y - dy);
    }

    const t = state.transitions.find((item) => item.id === id);
    if (t) {
      t.x = nextSnapState?.isSnapped ? x - dx + snapDeltaX : snap(x - dx);
      t.y = snap(y - dy);
    }

    const pb = state.parallels.find((item) => item.id === id);
    if (pb) {
      pb.x = nextSnapState?.isSnapped ? x - dx + snapDeltaX : snap(x - dx);
      pb.y = snap(y - dy);
    }
  });

  refreshDragSnapGuide(nextSnapState);
  render();
  if (selIds.size === 1) updateProps();
};

const resizeParallelBar = ({ x }) => {
  const pb = state.parallels.find(({ id }) => id === resizingBar.id);
  if (!pb) return;

  const dx = x - resizeStartX;
  if (resizingBar.side === 'right') {
    pb.width = snap(Math.max(80, resizeStartW + dx));
  } else {
    pb.x = snap(Math.min(x, resizingBar.origX + resizeStartW - 80));
    pb.width = snap(Math.max(80, resizeStartW - dx));
  }
  render();
};

const updateGhostConnection = ({ x, y }) => {
  const fp = getPortXY(connFrom.id, connFrom.port);
  if (!fp) return;
  setAttrs(getById('ghost-path'), {
    d: `M${fp.x},${fp.y} L${x},${y}`,
    display: '',
  });
};

const cvDown = (e) => {
  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    beginPan(e);
    return;
  }
  if (e.button !== 0) return;

  hideCtx();
  const point = getCanvasPoint(e);
  if (runPlacementTool(point)) return;

  if (tool === 'select' && !e.target.closest('.gf-step,.gf-trans,.gf-par')) {
    beginSelectionBox(e, point);
  }
};

const cvMove = (e) => {
  if (dragging || panning || connecting || resizingBar) e.preventDefault();
  const point = getCanvasPoint(e);
  const { x, y } = point;

  getById('s-cx').textContent = Math.round(x);
  getById('s-cy').textContent = Math.round(y);

  if (panning && !selBoxing) {
    viewX = e.clientX - panSX;
    viewY = e.clientY - panSY;
    applyView();
    return;
  }
  if (selBoxing) {
    updateSelectionBox(point);
    return;
  }
  if (dragging && dragMap.size > 0) {
    dragSelectedElements(point);
    return;
  }
  if (resizingBar) {
    resizeParallelBar(point);
    return;
  }
  if (connecting && connFrom) updateGhostConnection(point);
};

const cvUp = () => {
  if (selBoxing) {
    finishSelBox();
    selBoxing = false;
    getById('sel-box').setAttribute('display', 'none');
  }
  if (panning) panning = false;
  if (dragging) {
    dragging = false;
    dragMap.clear();
    dragSnapCandidates = [];
    dragSnapPrimaryId = null;
    clearSnapGuideLine();
    afterChange();
  }
  if (resizingBar) {
    resizingBar = null;
    afterChange();
  }
};

const isRectInSelection = ({ x, y, w, h }, { bx, by, bw, bh }) => x + w >= bx && x <= bx + bw && y + h >= by && y <= by + bh;

const finishSelBox = () => {
  const sb = getById('sel-box');
  const [bx, by, bw, bh] = ['x', 'y', 'width', 'height'].map((attr) => +sb.getAttribute(attr));
  if (bw < 4 && bh < 4) {
    selectEl(null, null);
    return;
  }

  const box = { bx, by, bw, bh };
  state.steps.forEach((s) => {
    if (isRectInSelection({ x: s.x, y: s.y, w: SW, h: SH }, box)) selIds.add(s.id);
  });
  state.transitions.forEach((t) => {
    if (isRectInSelection({ x: t.x, y: t.y, w: TW, h: TH }, box)) selIds.add(t.id);
  });
  state.parallels.forEach((p) => {
    if (isRectInSelection({ x: p.x, y: p.y, w: p.width, h: PH * 2 + 4 }, box)) selIds.add(p.id);
  });
  render();
  updateProps();
};

const cvDbl = (e) => {
  if (e.target.closest('.gf-step,.gf-trans,.gf-par')) return;
  const { x, y } = getCanvasPoint(e);
  if (tool === 'select') addStep(x, y);
};

const cvRClick = (e) => {
  e.preventDefault();
  const el = e.target.closest('.gf-step,.gf-trans,.gf-par');
  if (!el) {
    hideCtx();
    return;
  }
  ctxTarget = { id: el.dataset.id, type: el.dataset.type };
  selectEl(ctxTarget.id, ctxTarget.type);
  showCtx(e.clientX, e.clientY);
};

const startElementDrag = (e, id) => {
  if (!selIds.has(id)) {
    if (!e.shiftKey) selIds.clear();
    selIds.add(id);
    updateProps();
  }

  dragging = true;
  dragSnapPrimaryId = id;
  dragSnapState = null;
  dragSnapCandidates = getPortSnapCandidates(state).filter(({ elementId }) => !selIds.has(elementId));
  const { x, y } = getCanvasPoint(e);
  selIds.forEach((sid) => {
    const r = getElRect(sid);
    if (r) dragMap.set(sid, { dx: x - r.x, dy: y - r.y });
  });

  const r = getElRect(id);
  if (r && !dragMap.has(id)) dragMap.set(id, { dx: x - r.x, dy: y - r.y });
};

const connectFromElement = (e, id, type) => {
  if (type !== 'parallel') {
    handlePortClick(id, type, 'bottom');
    return;
  }

  const pb = state.parallels.find((item) => item.id === id);
  if (!pb) return;
  const { x, y } = getCanvasPoint(e);
  handlePortClick(id, 'parallel', getNearestParPort(pb, x, y));
};

const elDown = (e, id, type) => {
  if (e.button !== 0) return;
  e.stopPropagation();

  if (tool === 'delete') {
    deleteEl(id);
    return;
  }
  if (tool === 'connect') {
    connectFromElement(e, id, type);
    return;
  }
  if (tool === 'select') startElementDrag(e, id);
};

const getParallelPortMetricsForSnap = (pb) => {
  const ports = Math.max(2, pb.ports || 3);
  const minInset = PAR_PORT_INSET;
  const maxInset = (pb.width - PAR_PORT_MIN_USABLE) / 2;
  const inset = Math.min(minInset, Math.max(PAR_PORT_MIN_INSET, maxInset));
  const usableWidth = Math.max(1, pb.width - inset * 2);
  const gap = ports === 1 ? 0 : usableWidth / (ports - 1);
  return { ports, startX: pb.x + inset, gap };
};

// Find nearest port on a parallel bar given mouse world coords
const getNearestParPort = (pb, mx, my) => {
  const barH = PH * 2 + 4;
  const isSplit = pb.type === 'split';
  const { ports, startX, gap } = getParallelPortMetricsForSnap(pb);
  const cx = pb.x + pb.width / 2;
  const singleY = isSplit ? pb.y : pb.y + barH;
  const branchY = isSplit ? pb.y + barH : pb.y;
  const candidates = [{ port: isSplit ? 'top' : 'bottom', x: cx, y: singleY }];

  for (let i = 0; i < ports; i += 1) {
    candidates.push({
      port: isSplit ? `bottom-${i}` : `top-${i}`,
      x: startX + gap * i,
      y: branchY,
    });
  }

  return candidates.reduce((best, candidate) => {
    const distance = Math.hypot(candidate.x - mx, candidate.y - my);
    return distance < best.distance ? { ...candidate, distance } : best;
  }, { ...candidates[0], distance: Infinity }).port;
};

const startResize = (e, id, side) => {
  e.stopPropagation();
  const pb = state.parallels.find((item) => item.id === id);
  if (!pb) return;
  resizingBar = { id, side, origX: pb.x };
  const { x } = getCanvasPoint(e);
  resizeStartX = x;
  resizeStartW = pb.width;
};

// ─── Connect ───
const handlePortClick = (id, type, port) => {
  if (!connecting) {
    connecting = true;
    connFrom = { id, type, port: port || 'bottom' };
    setTool('connect');
    getById('conn-hint').style.display = 'block';
    getById('s-tool').textContent = `CONNECTING FROM ${id}`;
    return;
  }

  if (connFrom.id === id) {
    cancelConnect();
    return;
  }
  const targetPort = guessTargetPort(connFrom, id, type, port);
  addConn(connFrom.id, connFrom.port, id, targetPort);
  cancelConnect();
};

const guessTargetPort = (from, toId, toType, clickedPort) => {
  if (clickedPort && clickedPort !== 'bottom' && clickedPort !== 'top') return clickedPort;

  if (toType === 'parallel') {
    const pb = state.parallels.find((item) => item.id === toId);
    const fp = pb && getPortXY(from.id, from.port);
    if (fp) return getNearestParPort(pb, fp.x, fp.y);
  }

  const fp = getPortXY(from.id, from.port);
  const targetTop = getPortXY(toId, 'top');
  if (!fp || !targetTop) return clickedPort || 'top';
  return fp.y < targetTop.y ? 'top' : 'bottom';
};

const cancelConnect = () => {
  connecting = false;
  connFrom = null;
  getById('ghost-path').setAttribute('display', 'none');
  getById('conn-hint').style.display = 'none';
  getById('s-tool').textContent = tool.toUpperCase();
};

// ═══════════════════════════════════════════════════════════
//  TOOLS
// ═══════════════════════════════════════════════════════════
const toolBtns = ['select', 'step', 'initstep', 'transition', 'par-split', 'par-join', 'connect', 'delete'];
const clearToolButtonState = () => {
  toolBtns.forEach((button) => {
    const el = getById(`tb-${button}`);
    if (el) el.classList.remove('active', 'amber', 'green', 'purple');
  });
};

const setToolIndicator = (nextTool) => {
  getById('s-tool').textContent = nextTool.toUpperCase();
  const dot = getById('s-dot');
  dot.className = 's-dot';
  if (nextTool === 'connect') dot.className = 's-dot a';
  if (nextTool === 'delete') dot.className = 's-dot r';
};

const setTool = (nextTool) => {
  tool = nextTool;
  clearToolButtonState();

  const el = getById(`tb-${nextTool}`);
  if (el) {
    el.classList.add('active');
    if (nextTool === 'connect') el.classList.add('amber');
    if (nextTool === 'par-split' || nextTool === 'par-join') el.classList.add('purple');
  }

  setToolIndicator(nextTool);
  getById('svg-canvas').style.cursor = nextTool === 'select' ? 'default' : 'crosshair';
  if (nextTool !== 'connect') cancelConnect();
};

// ═══════════════════════════════════════════════════════════
//  KEYBOARD
// ═══════════════════════════════════════════════════════════
const keyToolMap = {
  v: 'select',
  s: 'step',
  i: 'initstep',
  t: 'transition',
  p: 'par-split',
  j: 'par-join',
  c: 'connect',
  d: 'delete',
};

const resetCanvasInteraction = () => {
  cancelConnect();
  setTool('select');
  selIds.clear();
  render();
  updateProps();
};

const onKey = (e) => {
  if (isEditableTarget(e)) return;
  const key = e.key.toLowerCase();

  if (keyToolMap[key]) setTool(keyToolMap[key]);
  if (key === 'f') fitView();
  if (e.key === '+' || e.key === '=') zoomIn();
  if (e.key === '-') zoomOut();
  if (e.key === 'Escape') resetCanvasInteraction();
  if ((e.key === 'Delete' || e.key === 'Backspace') && selIds.size > 0) delSelected();
  if (key === 'a' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    selectAll();
  }
  if (key === 'z' && (e.ctrlKey || e.metaKey)) {
    // undo placeholder
  }
};

const selectAll = () => {
  state.steps.forEach(({ id }) => selIds.add(id));
  state.transitions.forEach(({ id }) => selIds.add(id));
  state.parallels.forEach(({ id }) => selIds.add(id));
  render();
  updateProps();
};

// ═══════════════════════════════════════════════════════════
//  CONTEXT MENU
// ═══════════════════════════════════════════════════════════
const showCtx = (x, y) => {
  const menu = getById('ctx');
  menu.style.display = 'block';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
};

const hideCtx = () => {
  getById('ctx').style.display = 'none';
};

const ctxEdit = () => {
  hideCtx();
  updateProps();
};

const ctxDup = () => {
  hideCtx();
  if (!ctxTarget) return;

  const { id, type } = ctxTarget;
  const rect = getElRect(id);
  if (!rect) return;

  if (type === 'step') {
    const s = state.steps.find((item) => item.id === id);
    if (s) addStep(s.x + SW + 20 + SW / 2, s.y + SH / 2, s.initial);
  } else if (type === 'transition') {
    const t = state.transitions.find((item) => item.id === id);
    if (t) addTransition(t.x + TW + 20 + TW / 2, t.y + TH / 2);
  } else if (type === 'parallel') {
    const p = state.parallels.find((item) => item.id === id);
    if (p) {
      const id2 = `B${nextId++}`;
      state.parallels.push({ ...p, id: id2, y: p.y + 40 });
      afterChange();
    }
  }
};

const ctxConn = () => {
  hideCtx();
  if (ctxTarget) handlePortClick(ctxTarget.id, ctxTarget.type, 'bottom');
};

const ctxDel = () => {
  hideCtx();
  if (ctxTarget) deleteEl(ctxTarget.id);
};

// ═══════════════════════════════════════════════════════════
//  STATS & MINIMAP
// ═══════════════════════════════════════════════════════════
const updateStats = () => {
  getById('s-steps').textContent = state.steps.length;
  getById('s-trans').textContent = state.transitions.length;
  getById('s-bars').textContent = state.parallels.length;
  getById('s-conns').textContent = state.connections.length;
};

const miniMap = () => {
  const ms = getById('mini-svg');
  ms.innerHTML = '';
  const W = 150;
  const H = 100;
  const all = [
    ...state.steps.map(({ x, y }) => ({ x, y, w: SW, h: SH })),
    ...state.transitions.map(({ x, y }) => ({ x, y, w: TW, h: TH })),
    ...state.parallels.map(({ x, y, width }) => ({ x, y, w: width, h: PH * 2 + 4 })),
  ];
  if (!all.length) return;

  const minX = Math.min(...all.map(({ x }) => x));
  const minY = Math.min(...all.map(({ y }) => y));
  const maxX = Math.max(...all.map(({ x, w }) => x + w));
  const maxY = Math.max(...all.map(({ y, h }) => y + h));
  const sc = Math.min((W - 12) / (maxX - minX || 1), (H - 12) / (maxY - minY || 1));
  const ox = (W - (maxX - minX) * sc) / 2;
  const oy = (H - (maxY - minY) * sc) / 2;
  const mx = (x) => ox + (x - minX) * sc;
  const my = (y) => oy + (y - minY) * sc;

  state.connections.forEach((c) => {
    const f = getPortXY(c.from, c.fromPort || 'bottom');
    const t = getPortXY(c.to, c.toPort || 'top');
    if (!f || !t) return;
    const line = svgE('line');
    setAttrs(line, { x1: mx(f.x), y1: my(f.y), x2: mx(t.x), y2: my(t.y), stroke: '#2a3a5a', 'stroke-width': '.8' });
    ms.appendChild(line);
  });

  state.steps.forEach((s) => {
    const rect = svgE('rect');
    setAttrs(rect, { x: mx(s.x), y: my(s.y), width: SW * sc, height: SH * sc, fill: '#1a2035', stroke: '#4fa3e3', 'stroke-width': '.8' });
    ms.appendChild(rect);
  });
  state.transitions.forEach((t) => {
    const rect = svgE('rect');
    setAttrs(rect, { x: mx(t.x), y: my(t.y), width: TW * sc, height: 4, fill: '#1a2a1a', stroke: '#39d353', 'stroke-width': '.8' });
    ms.appendChild(rect);
  });
  state.parallels.forEach((p) => {
    const rect = svgE('rect');
    setAttrs(rect, { x: mx(p.x), y: my(p.y), width: p.width * sc, height: 4, fill: '#a78bfa' });
    ms.appendChild(rect);
  });
};

Object.assign(window, {
  cvDown,
  cvMove,
  cvUp,
  finishSelBox,
  cvDbl,
  cvRClick,
  elDown,
  getNearestParPort,
  startResize,
  handlePortClick,
  guessTargetPort,
  cancelConnect,
  setTool,
  onKey,
  selectAll,
  showCtx,
  hideCtx,
  ctxEdit,
  ctxDup,
  getPortSnapCandidates,
  updateSnapState,
  applySnapToDrag,
  drawSnapGuideLine,
  ctxConn,
  ctxDel,
  updateStats,
  miniMap,
});
