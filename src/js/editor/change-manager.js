"use strict";

const saveAutoDiagram = () => {
  if (activeDiagramId) saveDiagramData(activeDiagramId);
};

const afterChange = () => {
  render();
  markModified(activeDiagramId, true);
  saveAutoDiagram();
};

Object.assign(window, {
  afterChange,
  saveAutoDiagram,
});
