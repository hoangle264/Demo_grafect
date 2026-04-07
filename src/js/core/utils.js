"use strict";
// ═══════════════════════════════════════════════════════════
//  utils.js — Grafcet Studio
//  Pure helper functions shared by all modules.
//  Must be loaded BEFORE grafcet-studio-v2.js and grafcet-codegen.js.
// ═══════════════════════════════════════════════════════════

// ── HTML escape ─────────────────────────────────────────────
/** Escape &, <, >, " for safe HTML attribute/text output. */
function esc2(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/** Escape &, <, > for safe HTML text content. */
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── DOM helpers ─────────────────────────────────────────────
function show(id){ document.getElementById(id).style.display='block'; }
function hide(id){ document.getElementById(id).style.display='none'; }
function closeModal(id){ document.getElementById(id).classList.remove('show'); }

// ── Toast notifications ─────────────────────────────────────
let toastTimer;
function toast(msg){
  const old=document.querySelector('.toast'); if(old) old.remove();
  const el=document.createElement('div'); el.className='toast'; el.textContent=msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{ el.style.opacity='0'; setTimeout(()=>el.remove(),300); },2500);
}
