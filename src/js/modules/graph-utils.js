"use strict";
// ═══════════════════════════════════════════════════════════
//  graph-utils.js — Grafcet Studio
//  Pure graph traversal helpers for Grafcet sequence resolution.
//  Must be loaded BEFORE grafcet-studio-v2.js and grafcet-codegen.js.
// ═══════════════════════════════════════════════════════════

/**
 * Resolve all STEPS reachable from an element in one direction,
 * traversing through parallel bars.
 *
 * @param {string}   startId    - ID of the starting element
 * @param {string}   direction  - 'downstream' | 'upstream'
 * @param {Array}    connections
 * @param {Array}    steps
 * @param {Array}    parallels
 * @param {Set}      visited    - internal recursion guard
 * @returns {Array} list of step objects
 */
function resolveStepsThrough(startId, direction, connections, steps, parallels, visited=new Set()) {
  if(visited.has(startId)) return [];
  visited.add(startId);

  const result = [];
  // Get direct neighbours in the given direction
  const neighbours = direction === 'downstream'
    ? connections.filter(c=>c.from===startId).map(c=>c.to)
    : connections.filter(c=>c.to===startId).map(c=>c.from);

  for(const nId of neighbours){
    const step = steps.find(x=>x.id===nId);
    if(step){ result.push(step); continue; }
    // It's a parallel bar — traverse through it
    const bar = parallels.find(x=>x.id===nId);
    if(bar){
      // From the bar, continue in same direction
      const barNeighbours = direction === 'downstream'
        ? connections.filter(c=>c.from===nId).map(c=>c.to)
        : connections.filter(c=>c.to===nId).map(c=>c.from);
      for(const bnId of barNeighbours){
        const bStep = steps.find(x=>x.id===bnId);
        if(bStep) result.push(bStep);
        // Could be another bar — recurse
        else if(parallels.find(x=>x.id===bnId)){
          result.push(...resolveStepsThrough(bnId, direction, connections, steps, parallels, visited));
        }
      }
    }
  }
  return result;
}
