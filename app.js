"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";

const dom = {
  documentTitle: document.getElementById("documentTitle"),
  statusMessage: document.getElementById("statusMessage"),
  selectionCount: document.getElementById("selectionCount"),
  documentStats: document.getElementById("documentStats"),
  activeMode: document.getElementById("activeMode"),
  cursorCoords: document.getElementById("cursorCoords"),
  snapSummary: document.getElementById("snapSummary"),
  autosaveStatus: document.getElementById("autosaveStatus"),
  dwgBackendStatus: document.getElementById("dwgBackendStatus"),
  selectionSummary: document.getElementById("selectionSummary"),
  selectionColorInput: document.getElementById("selectionColorInput"),
  selectionStrokeWidthInput: document.getElementById("selectionStrokeWidthInput"),
  selectionLineTypeInput: document.getElementById("selectionLineTypeInput"),
  selectionTextInput: document.getElementById("selectionTextInput"),
  applySelectionProperties: document.getElementById("applySelectionProperties"),
  calculatorInput: document.getElementById("calculatorInput"),
  calculatorButton: document.getElementById("calculatorButton"),
  calculatorResult: document.getElementById("calculatorResult"),
  measurementResult: document.getElementById("measurementResult"),
  helpDialog: document.getElementById("helpDialog"),
  saveAsDialog: document.getElementById("saveAsDialog"),
  saveAsForm: document.getElementById("saveAsForm"),
  saveAsNameInput: document.getElementById("saveAsNameInput"),
  saveAsFormatSelect: document.getElementById("saveAsFormatSelect"),
  saveAsCancelButton: document.getElementById("saveAsCancelButton"),
  saveAsHint: document.getElementById("saveAsHint"),
  commandBarTitle: document.getElementById("commandBarTitle"),
  commandBarHint: document.getElementById("commandBarHint"),
  drawLengthInput: document.getElementById("drawLengthInput"),
  rectWidthInput: document.getElementById("rectWidthInput"),
  rectHeightInput: document.getElementById("rectHeightInput"),
  circleRadiusInput: document.getElementById("circleRadiusInput"),
  drawAnchorSelect: document.getElementById("drawAnchorSelect"),
  lineTypeSelect: document.getElementById("lineTypeSelect"),
  printPreviewPanel: document.getElementById("printPreviewPanel"),
  printScaleInput: document.getElementById("printScaleInput"),
  printColorModeSelect: document.getElementById("printColorModeSelect"),
  printNowButton: document.getElementById("printNowButton"),
  sheetTabs: document.getElementById("sheetTabs"),
  addSheetButton: document.getElementById("addSheetButton"),
  renameSheetButton: document.getElementById("renameSheetButton"),
  deleteSheetButton: document.getElementById("deleteSheetButton"),
  fileInput: document.getElementById("fileInput"),
  toolbar: document.getElementById("toolbar"),
  workspaceViewport: document.getElementById("workspaceViewport"),
  drawingSurface: document.getElementById("drawingSurface"),
  printPreviewHost: document.getElementById("printPreviewHost"),
  cameraLayer: document.getElementById("cameraLayer"),
  gridLayer: document.getElementById("gridLayer"),
  entityLayer: document.getElementById("entityLayer"),
  overlayLayer: document.getElementById("overlayLayer"),
  topRuler: document.getElementById("topRuler"),
  leftRuler: document.getElementById("leftRuler"),
  zoomRange: document.getElementById("zoomRange"),
  zoomValue: document.getElementById("zoomValue"),
  unitsSelect: document.getElementById("unitsSelect"),
  gridStepInput: document.getElementById("gridStepInput"),
  strokeWidthInput: document.getElementById("strokeWidthInput"),
  strokeColorInput: document.getElementById("strokeColorInput"),
  textSizeInput: document.getElementById("textSizeInput"),
  autosaveInput: document.getElementById("autosaveInput"),
  snapGridToggle: document.getElementById("snapGridToggle"),
  snapEndToggle: document.getElementById("snapEndToggle"),
  snapMidToggle: document.getElementById("snapMidToggle"),
  snapIntersectionToggle: document.getElementById("snapIntersectionToggle"),
  snapCenterToggle: document.getElementById("snapCenterToggle"),
  orthoToggle: document.getElementById("orthoToggle"),
};

const state = {
  documentName: "Без имени",
  sheets: [createSheet(1, "Лист 1")],
  activeSheetId: 1,
  tool: "select",
  pendingPoints: [],
  hoverPoint: null,
  lastPointerRaw: { x: 0, y: 0 },
  measurementBuffer: [],
  angleBuffer: [],
  view: {
    zoom: 1,
    panX: 120,
    panY: 80,
    showGrid: true,
    showRulers: true,
    showToolbar: true,
  },
  defaults: {
    units: "mm",
    gridStep: 25,
    stroke: "#1f2937",
    strokeWidth: 2,
    lineType: "solid",
    textSize: 18,
    dimOffset: 24,
    autosaveMinutes: 2,
  },
  drawConstraints: {
    length: "",
    rectWidth: "",
    rectHeight: "",
    radius: "",
    anchor: "start",
  },
  printPreview: {
    active: false,
    scale: 100,
    colorMode: "color",
  },
  snap: {
    grid: true,
    end: true,
    mid: true,
    intersection: true,
    center: true,
    ortho: false,
  },
  history: [],
  historyIndex: -1,
  drag: null,
  message: "Готово.",
  lastAutosave: null,
  nextId: 1,
  nextSheetId: 2,
  dwgBackend: {
    available: false,
    configured: false,
    commandAvailable: false,
    url: "http://127.0.0.1:8765",
    detail: "проверка...",
  },
};

Object.defineProperties(state, {
  entities: {
    get() {
      return getActiveSheet().entities;
    },
    set(value) {
      getActiveSheet().entities = value;
    },
  },
  selection: {
    get() {
      return getActiveSheet().selection;
    },
    set(value) {
      getActiveSheet().selection = value;
    },
  },
});

function init() {
  bindUi();
  loadDemo(false);
  const restored = restoreAutosave();
  if (!restored) {
    pushHistory("Начальное состояние");
  }
  fitToContent();
  updateAutosaveTimer();
  resizeCanvasArtifacts();
  render();
  checkDwgBackend(true);
}

function bindUi() {
  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => executeCommand(button.dataset.command));
  });

  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  });

  dom.zoomRange.addEventListener("input", (event) => {
    setZoom(Number(event.target.value) / 100, { focusScreen: getViewportCenter() });
    render();
  });

  dom.unitsSelect.addEventListener("change", (event) => {
    state.defaults.units = event.target.value;
    render();
  });
  dom.gridStepInput.addEventListener("change", (event) => {
    state.defaults.gridStep = clamp(Number(event.target.value) || 25, 5, 200);
    render();
  });
  dom.strokeWidthInput.addEventListener("change", (event) => {
    state.defaults.strokeWidth = clamp(Number(event.target.value) || 2, 1, 12);
  });
  dom.lineTypeSelect.addEventListener("change", (event) => {
    state.defaults.lineType = event.target.value;
  });
  dom.strokeColorInput.addEventListener("input", (event) => {
    state.defaults.stroke = event.target.value;
  });
  dom.textSizeInput.addEventListener("change", (event) => {
    state.defaults.textSize = clamp(Number(event.target.value) || 18, 8, 72);
  });
  dom.autosaveInput.addEventListener("change", (event) => {
    state.defaults.autosaveMinutes = clamp(Number(event.target.value) || 2, 1, 60);
    updateAutosaveTimer();
  });

  [
    ["snapGridToggle", "grid"],
    ["snapEndToggle", "end"],
    ["snapMidToggle", "mid"],
    ["snapIntersectionToggle", "intersection"],
    ["snapCenterToggle", "center"],
    ["orthoToggle", "ortho"],
  ].forEach(([id, key]) => {
    dom[id].addEventListener("change", (event) => {
      state.snap[key] = event.target.checked;
      updateSnapSummary();
      render();
    });
  });

  dom.applySelectionProperties.addEventListener("click", applySelectionProperties);
  dom.calculatorButton.addEventListener("click", runCalculator);
  dom.fileInput.addEventListener("change", openDocumentFromFile);
  dom.saveAsForm.addEventListener("submit", onSaveAsSubmit);
  dom.saveAsFormatSelect.addEventListener("change", updateSaveAsHint);
  dom.saveAsCancelButton.addEventListener("click", () => dom.saveAsDialog.close());
  [
    ["drawLengthInput", "length"],
    ["rectWidthInput", "rectWidth"],
    ["rectHeightInput", "rectHeight"],
    ["circleRadiusInput", "radius"],
  ].forEach(([id, key]) => {
    dom[id].addEventListener("input", (event) => {
      state.drawConstraints[key] = event.target.value;
      renderOverlayOnly();
    });
  });
  dom.drawAnchorSelect.addEventListener("change", (event) => {
    state.drawConstraints.anchor = event.target.value;
    renderOverlayOnly();
  });
  dom.printScaleInput.addEventListener("change", (event) => {
    state.printPreview.scale = clamp(Number(event.target.value) || 100, 10, 400);
    render();
  });
  dom.printColorModeSelect.addEventListener("change", (event) => {
    state.printPreview.colorMode = event.target.value;
    render();
  });
  dom.printNowButton.addEventListener("click", printDocument);
  dom.addSheetButton.addEventListener("click", addSheet);
  dom.renameSheetButton.addEventListener("click", renameActiveSheet);
  dom.deleteSheetButton.addEventListener("click", deleteActiveSheet);

  dom.drawingSurface.addEventListener("pointerdown", onPointerDown);
  dom.drawingSurface.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  dom.drawingSurface.addEventListener("dblclick", onDoubleClick);
  dom.drawingSurface.addEventListener("wheel", onWheel, { passive: false });

  window.addEventListener("resize", () => {
    resizeCanvasArtifacts();
    render();
  });

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".menu")) {
      document.querySelectorAll(".menu[open]").forEach((menu) => menu.removeAttribute("open"));
    }
  });
}

function executeCommand(command) {
  switch (command) {
    case "new-document":
      if (confirm("Очистить текущий документ и создать новый?")) {
        state.documentName = "Без имени";
        state.sheets = [createSheet(1, "Лист 1")];
        state.activeSheetId = 1;
        state.pendingPoints = [];
        state.measurementBuffer = [];
        state.angleBuffer = [];
        state.nextId = 1;
        state.nextSheetId = 2;
        fitToContent();
        pushHistory("Новый документ");
        setStatus("Создан новый документ.");
        render();
      }
      break;
    case "open-document":
      dom.fileInput.value = "";
      dom.fileInput.click();
      break;
    case "save-document":
      downloadJson(state.documentName || "drawing");
      break;
    case "save-as-document":
      openSaveAsDialog();
      break;
    case "export-svg":
      exportSvg();
      break;
    case "export-dxf":
      exportDxf();
      break;
    case "export-dwg":
      exportDwg();
      break;
    case "export-png":
      exportPng();
      break;
    case "export-tiff":
      exportTiff();
      break;
    case "toggle-print-preview":
      togglePrintPreview();
      break;
    case "print-document":
      printDocument();
      break;
    case "undo":
      undo();
      break;
    case "redo":
      redo();
      break;
    case "duplicate-selection":
      duplicateSelection();
      break;
    case "delete-selection":
      deleteSelection();
      break;
    case "select-all":
      state.selection = state.entities.map((entity) => entity.id);
      render();
      break;
    case "clear-selection":
      state.selection = [];
      render();
      break;
    case "toggle-grid":
      state.view.showGrid = !state.view.showGrid;
      render();
      break;
    case "toggle-rulers":
      state.view.showRulers = !state.view.showRulers;
      render();
      break;
    case "toggle-toolbar":
      state.view.showToolbar = !state.view.showToolbar;
      render();
      break;
    case "toggle-snap":
      state.snap.grid = !state.snap.grid;
      dom.snapGridToggle.checked = state.snap.grid;
      updateSnapSummary();
      render();
      break;
    case "fit":
      fitToContent();
      render();
      break;
    case "move-mode":
      setTool("select");
      setStatus("Выделите объект и перетащите его мышью.");
      break;
    case "rotate-selection":
      rotateSelection();
      break;
    case "scale-selection":
      scaleSelection();
      break;
    case "mirror-selection-x":
      mirrorSelection("x");
      break;
    case "mirror-selection-y":
      mirrorSelection("y");
      break;
    case "trim-selection":
      trimSelection();
      break;
    case "extend-selection":
      extendSelection();
      break;
    case "offset-selection":
      offsetSelection();
      break;
    case "split-selection":
      splitSelection();
      break;
    case "open-calculator":
      dom.calculatorInput.focus();
      break;
    case "show-help":
      dom.helpDialog.showModal();
      break;
    case "show-about":
      alert("Учебное двумерное черчение\nСтатическое веб-приложение для построения и редактирования двумерных объектов.");
      break;
    case "load-demo":
      loadDemo(true);
      break;
    case "zoom-in":
      setZoom(state.view.zoom * 1.25, { focusScreen: getViewportCenter() });
      render();
      break;
    case "zoom-out":
      setZoom(state.view.zoom / 1.25, { focusScreen: getViewportCenter() });
      render();
      break;
    default:
      break;
  }
}

function setTool(tool) {
  state.tool = tool;
  state.pendingPoints = [];
  state.measurementBuffer = [];
  state.angleBuffer = [];
  setStatus(toolDescription(tool));
  render();
}

function toolDescription(tool) {
  const map = {
    select: "Режим выделения и перемещения.",
    line: "Линия: укажите начальную и конечную точки.",
    polyline: "Ломаная: задавайте точки, Enter завершает построение.",
    rect: "Прямоугольник: укажите две противоположные вершины.",
    circle: "Окружность: укажите центр и точку радиуса.",
    point: "Точка: щёлкните в рабочей области.",
    text: "Текст: щёлкните в рабочей области и введите подпись.",
    "dim-linear": "Линейный размер: задайте две точки.",
    "dim-horizontal": "Горизонтальный размер: задайте две точки.",
    "dim-vertical": "Вертикальный размер: задайте две точки.",
    "dim-radius": "Размер радиуса: выберите окружность или задайте центр и точку радиуса.",
    "dim-diameter": "Размер диаметра: выберите окружность или задайте центр и точку радиуса.",
    "measure-distance": "Измерение расстояния: задайте две точки.",
    "measure-angle": "Измерение угла: выберите две линии.",
    "measure-coords": "Координаты точки: щёлкните по точке.",
  };
  return map[tool] || "Готово.";
}

function onPointerDown(event) {
  if (state.printPreview.active) {
    return;
  }

  const raw = screenToWorld(event.clientX, event.clientY);
  state.lastPointerRaw = raw;
  const point = getInteractivePoint(raw, true);

  if (event.button === 1) {
    state.drag = { type: "pan", startScreen: { x: event.clientX, y: event.clientY }, startPan: { ...state.view } };
    return;
  }

  if (state.tool === "select") {
    handleSelectionPointerDown(event, raw);
    return;
  }

  handleDrawingPointer(point, raw);
}

function handleSelectionPointerDown(event, raw) {
  const tolerance = 10 / state.view.zoom;
  const hit = hitTest(raw, tolerance);

  if (!hit) {
    if (!event.shiftKey) {
      state.selection = [];
      render();
    }
    return;
  }

  if (event.shiftKey) {
    if (state.selection.includes(hit.id)) {
      state.selection = state.selection.filter((id) => id !== hit.id);
    } else {
      state.selection = [...state.selection, hit.id];
    }
  } else if (!state.selection.includes(hit.id)) {
    state.selection = [hit.id];
  }

  state.drag = {
    type: "move-selection",
    startPoint: raw,
    original: clone(state.entities),
    moved: false,
  };
  render();
}

function handleDrawingPointer(point, raw) {
  switch (state.tool) {
    case "line":
    case "rect":
    case "circle":
    case "dim-linear":
    case "dim-horizontal":
    case "dim-vertical":
    case "measure-distance":
      state.pendingPoints.push(point);
      if (state.pendingPoints.length === 2) {
        finalizeTwoPointTool(state.tool, state.pendingPoints[0], state.pendingPoints[1]);
        state.pendingPoints = [];
      }
      break;
    case "polyline":
      state.pendingPoints.push(point);
      break;
    case "point":
      addEntity(withCurrentStrokeStyle({
        type: "point",
        x: point.x,
        y: point.y,
      }), "Построена точка");
      break;
    case "text":
      {
        const text = prompt("Введите текст надписи", "Текст");
        if (text) {
          addEntity(withCurrentStrokeStyle({
            type: "text",
            x: point.x,
            y: point.y,
            text,
            fontSize: state.defaults.textSize,
          }), "Добавлена надпись");
        }
      }
      break;
    case "dim-radius":
    case "dim-diameter":
      handleRadialDimensionPointer(raw, point);
      break;
    case "measure-angle":
      handleAngleMeasurePointer(raw);
      break;
    case "measure-coords":
      dom.measurementResult.textContent = `Координаты точки: ${formatPoint(point)}`;
      setStatus(`Координаты: ${formatPoint(point)}`);
      break;
    default:
      break;
  }
}

function finalizeTwoPointTool(tool, p1, p2) {
  switch (tool) {
    case "line":
      addEntity(withCurrentStrokeStyle({
        type: "line",
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
      }), "Построена линия");
      break;
    case "rect":
      addEntity(withCurrentStrokeStyle(rectFromPoints(p1, p2)), "Построен прямоугольник");
      break;
    case "circle":
      addEntity(withCurrentStrokeStyle({
        type: "circle",
        cx: p1.x,
        cy: p1.y,
        r: distance(p1, p2),
      }), "Построена окружность");
      break;
    case "dim-linear":
      addEntity(createDimension("linear", p1, p2), "Нанесён линейный размер");
      break;
    case "dim-horizontal":
      addEntity(createDimension("horizontal", p1, p2), "Нанесён горизонтальный размер");
      break;
    case "dim-vertical":
      addEntity(createDimension("vertical", p1, p2), "Нанесён вертикальный размер");
      break;
    case "measure-distance":
      dom.measurementResult.textContent = `Расстояние: ${formatNumber(distance(p1, p2))} ${state.defaults.units}`;
      setStatus(`Измерено расстояние ${formatNumber(distance(p1, p2))} ${state.defaults.units}.`);
      render();
      break;
    default:
      break;
  }
}

function handleRadialDimensionPointer(raw, point) {
  const hit = hitTest(raw, 10 / state.view.zoom);
  if (hit && hit.type === "circle") {
    addEntity(createRadialDimension(state.tool === "dim-diameter" ? "diameter" : "radius", hit), "Нанесён размер окружности");
    return;
  }

  state.pendingPoints.push(point);
  if (state.pendingPoints.length === 2) {
    const [center, edge] = state.pendingPoints;
    addEntity({
      type: "dimension",
      dimType: state.tool === "dim-diameter" ? "diameter" : "radius",
      center: clone(center),
      radius: distance(center, edge),
      stroke: "#8b5cf6",
      strokeWidth: 2,
      fontSize: state.defaults.textSize - 2,
    }, "Нанесён размер окружности");
    state.pendingPoints = [];
  }
}

function handleAngleMeasurePointer(raw) {
  const hit = hitTest(raw, 10 / state.view.zoom);
  if (!hit || !["line", "polyline"].includes(hit.type)) {
    setStatus("Для измерения угла выберите две линии.");
    return;
  }
  state.angleBuffer.push(hit.id);
  if (state.angleBuffer.length === 2) {
    const first = getEntityById(state.angleBuffer[0]);
    const second = getEntityById(state.angleBuffer[1]);
    const angle = measureAngleBetween(first, second);
    dom.measurementResult.textContent = angle === null
      ? "Не удалось измерить угол для выбранных объектов."
      : `Угол между объектами: ${formatNumber(angle)}°`;
    setStatus(angle === null ? "Измерение угла недоступно." : `Измерен угол ${formatNumber(angle)}°.`);
    state.angleBuffer = [];
    render();
  }
}

function onPointerMove(event) {
  if (state.printPreview.active) {
    return;
  }

  const raw = screenToWorld(event.clientX, event.clientY);
  state.lastPointerRaw = raw;
  const snapped = getInteractivePoint(raw, state.tool !== "select");
  state.hoverPoint = snapped;
  dom.cursorCoords.textContent = formatPoint(snapped);

  if (state.drag?.type === "move-selection") {
    const delta = {
      x: raw.x - state.drag.startPoint.x,
      y: raw.y - state.drag.startPoint.y,
    };
    state.drag.moved = true;
    state.entities = clone(state.drag.original);
    moveEntities(state.selection, delta.x, delta.y);
    render();
    return;
  }

  if (state.drag?.type === "pan") {
    state.view.panX = state.drag.startPan.panX + (event.clientX - state.drag.startScreen.x);
    state.view.panY = state.drag.startPan.panY + (event.clientY - state.drag.startScreen.y);
    render();
    return;
  }

  renderOverlayOnly();
}

function onPointerUp() {
  if (state.drag?.type === "move-selection" && state.drag.moved) {
    pushHistory("Перемещение объектов");
  }
  state.drag = null;
}

function onDoubleClick() {
  if (state.tool === "polyline" && state.pendingPoints.length >= 2) {
    addEntity(withCurrentStrokeStyle({
      type: "polyline",
      points: clone(state.pendingPoints),
    }), "Построена ломаная");
    state.pendingPoints = [];
  }
}

function onWheel(event) {
  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.1 : 0.9;
  setZoom(state.view.zoom * factor, {
    focusScreen: { x: event.clientX, y: event.clientY },
  });
  render();
}

function onKeyDown(event) {
  if (event.key === "Escape") {
    if (state.printPreview.active) {
      togglePrintPreview(false);
    } else if (state.pendingPoints.length || state.measurementBuffer.length || state.angleBuffer.length || state.drag) {
      state.pendingPoints = [];
      state.measurementBuffer = [];
      state.angleBuffer = [];
      state.drag = null;
      state.hoverPoint = null;
      setStatus("Текущая операция отменена.");
      render();
    } else if (state.tool !== "select") {
      setTool("select");
      setStatus("Активный инструмент сброшен.");
    }
    event.preventDefault();
    return;
  }

  const editingField = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);
  if (editingField && !event.ctrlKey && !event.metaKey) {
    return;
  }

  if (event.key === "Delete") {
    deleteSelection();
    event.preventDefault();
    return;
  }

  if (event.key === "Enter" && state.tool === "polyline" && state.pendingPoints.length >= 2) {
    addEntity(withCurrentStrokeStyle({
      type: "polyline",
      points: clone(state.pendingPoints),
    }), "Построена ломаная");
    state.pendingPoints = [];
    event.preventDefault();
    return;
  }

  if (event.ctrlKey || event.metaKey) {
    const key = event.key.toLowerCase();
    if (key === "z") {
      undo();
      event.preventDefault();
    } else if (key === "y") {
      redo();
      event.preventDefault();
    } else if (key === "s") {
      downloadJson(state.documentName || "drawing");
      event.preventDefault();
    } else if (key === "o") {
      dom.fileInput.value = "";
      dom.fileInput.click();
      event.preventDefault();
    }
  }
}

function render() {
  syncUiFromState();
  updateCameraTransform();
  renderGrid();
  renderEntities();
  renderOverlayOnly();
  renderPrintPreview();
  renderRulers();
  updateStatusPanel();
  renderSheetTabs();
}

function syncUiFromState() {
  dom.documentTitle.textContent = `Документ: ${state.documentName}`;
  dom.zoomRange.value = String(Math.round(state.view.zoom * 100));
  dom.zoomValue.textContent = `${Math.round(state.view.zoom * 100)}%`;
  dom.toolbar.classList.toggle("hidden", !state.view.showToolbar);
  dom.topRuler.classList.toggle("hidden", !state.view.showRulers);
  dom.leftRuler.classList.toggle("hidden", !state.view.showRulers);
  document.getElementById("rulerCorner").classList.toggle("hidden", !state.view.showRulers);
  dom.activeMode.textContent = labelForTool(state.tool);

  dom.unitsSelect.value = state.defaults.units;
  dom.gridStepInput.value = String(state.defaults.gridStep);
  dom.strokeWidthInput.value = String(state.defaults.strokeWidth);
  dom.lineTypeSelect.value = state.defaults.lineType;
  dom.strokeColorInput.value = state.defaults.stroke;
  dom.textSizeInput.value = String(state.defaults.textSize);
  dom.autosaveInput.value = String(state.defaults.autosaveMinutes);
  dom.drawLengthInput.value = state.drawConstraints.length;
  dom.rectWidthInput.value = state.drawConstraints.rectWidth;
  dom.rectHeightInput.value = state.drawConstraints.rectHeight;
  dom.circleRadiusInput.value = state.drawConstraints.radius;
  dom.drawAnchorSelect.value = state.drawConstraints.anchor;
  dom.printScaleInput.value = String(state.printPreview.scale);
  dom.printColorModeSelect.value = state.printPreview.colorMode;
  dom.printPreviewPanel.classList.toggle("hidden", !state.printPreview.active);
  dom.printPreviewHost.classList.toggle("hidden", !state.printPreview.active);
  dom.workspaceViewport.classList.toggle("print-preview-active", state.printPreview.active);

  dom.snapGridToggle.checked = state.snap.grid;
  dom.snapEndToggle.checked = state.snap.end;
  dom.snapMidToggle.checked = state.snap.mid;
  dom.snapIntersectionToggle.checked = state.snap.intersection;
  dom.snapCenterToggle.checked = state.snap.center;
  dom.orthoToggle.checked = state.snap.ortho;

  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === state.tool);
  });

  syncCommandBar();
}

function labelForTool(tool) {
  const labels = {
    select: "Выделение",
    line: "Линия",
    polyline: "Ломаная",
    rect: "Прямоугольник",
    circle: "Окружность",
    point: "Точка",
    text: "Текст",
    "dim-linear": "Линейный размер",
    "dim-horizontal": "Горизонтальный размер",
    "dim-vertical": "Вертикальный размер",
    "dim-radius": "Радиус",
    "dim-diameter": "Диаметр",
    "measure-distance": "Измерение расстояния",
    "measure-angle": "Измерение угла",
    "measure-coords": "Координаты",
  };
  return labels[tool] || tool;
}

function syncCommandBar() {
  const visibleFields = new Set();
  let hint = "Выберите инструмент рисования, чтобы задать точные параметры построения.";

  if (state.tool === "line") {
    visibleFields.add("length");
    visibleFields.add("anchor");
    hint = state.pendingPoints.length
      ? "Укажите направление второй точки. Длина будет выдержана автоматически."
      : "Задайте первую точку линии, затем укажите направление.";
  } else if (state.tool === "polyline") {
    visibleFields.add("length");
    visibleFields.add("anchor");
    hint = state.pendingPoints.length
      ? "Продолжайте ломаную. Поле длины ограничивает текущий сегмент."
      : "Выберите первую точку ломаной.";
  } else if (state.tool === "rect") {
    visibleFields.add("width");
    visibleFields.add("height");
    hint = state.pendingPoints.length
      ? "Ширина и высота будут применены от первой вершины."
      : "Укажите первую вершину прямоугольника.";
  } else if (state.tool === "circle") {
    visibleFields.add("radius");
    hint = state.pendingPoints.length
      ? "Радиус будет выдержан от центра окружности."
      : "Укажите центр окружности.";
  }

  dom.commandBarTitle.textContent = `Параметры: ${labelForTool(state.tool)}`;
  dom.commandBarHint.textContent = hint;
  document.querySelectorAll("[data-command-field]").forEach((field) => {
    field.classList.toggle("hidden", !visibleFields.has(field.dataset.commandField));
  });
}

function updateCameraTransform() {
  dom.cameraLayer.setAttribute("transform", `translate(${state.view.panX} ${state.view.panY}) scale(${state.view.zoom})`);
}

function renderGrid() {
  dom.gridLayer.replaceChildren();
  if (!state.view.showGrid) {
    return;
  }

  const bounds = getVisibleWorldBounds();
  const step = state.defaults.gridStep;
  const startX = Math.floor(bounds.minX / step) * step;
  const endX = Math.ceil(bounds.maxX / step) * step;
  const startY = Math.floor(bounds.minY / step) * step;
  const endY = Math.ceil(bounds.maxY / step) * step;

  for (let x = startX; x <= endX; x += step) {
    const line = createSvg("line", {
      x1: x,
      y1: startY,
      x2: x,
      y2: endY,
      class: x % (step * 5) === 0 ? "grid-line-major" : "grid-line-minor",
    });
    dom.gridLayer.append(line);
  }
  for (let y = startY; y <= endY; y += step) {
    const line = createSvg("line", {
      x1: startX,
      y1: y,
      x2: endX,
      y2: y,
      class: y % (step * 5) === 0 ? "grid-line-major" : "grid-line-minor",
    });
    dom.gridLayer.append(line);
  }
}

function renderEntities() {
  dom.entityLayer.replaceChildren();
  for (const entity of state.entities) {
    const node = renderEntity(entity);
    if (node) {
      dom.entityLayer.append(node);
    }
  }
}

function renderEntity(entity) {
  const baseClass = `entity${state.selection.includes(entity.id) ? " selected" : ""}`;
  if (entity.type === "line") {
    return createSvg("line", {
      x1: entity.x1,
      y1: entity.y1,
      x2: entity.x2,
      y2: entity.y2,
      stroke: entity.stroke,
      "stroke-width": entity.strokeWidth,
      "stroke-dasharray": dashArrayForLineType(entity.lineType),
      class: baseClass,
      "data-id": entity.id,
    });
  }
  if (entity.type === "polyline") {
    return createSvg("polyline", {
      points: entity.points.map((point) => `${point.x},${point.y}`).join(" "),
      fill: "none",
      stroke: entity.stroke,
      "stroke-width": entity.strokeWidth,
      "stroke-dasharray": dashArrayForLineType(entity.lineType),
      class: baseClass,
      "data-id": entity.id,
    });
  }
  if (entity.type === "rect") {
    return createSvg("rect", {
      x: entity.x,
      y: entity.y,
      width: entity.width,
      height: entity.height,
      fill: "none",
      stroke: entity.stroke,
      "stroke-width": entity.strokeWidth,
      "stroke-dasharray": dashArrayForLineType(entity.lineType),
      class: baseClass,
      "data-id": entity.id,
    });
  }
  if (entity.type === "circle") {
    return createSvg("circle", {
      cx: entity.cx,
      cy: entity.cy,
      r: entity.r,
      fill: "none",
      stroke: entity.stroke,
      "stroke-width": entity.strokeWidth,
      "stroke-dasharray": dashArrayForLineType(entity.lineType),
      class: baseClass,
      "data-id": entity.id,
    });
  }
  if (entity.type === "point") {
    return createSvg("circle", {
      cx: entity.x,
      cy: entity.y,
      r: 3,
      fill: entity.stroke,
      stroke: entity.stroke,
      "stroke-width": entity.strokeWidth,
      class: baseClass,
      "data-id": entity.id,
    });
  }
  if (entity.type === "text") {
    return createSvg("text", {
      x: entity.x,
      y: entity.y,
      fill: entity.stroke,
      "font-size": entity.fontSize || state.defaults.textSize,
      class: baseClass,
      "data-id": entity.id,
    }, entity.text);
  }
  if (entity.type === "dimension") {
    return renderDimension(entity);
  }
  return null;
}

function renderDimension(entity) {
  const group = createSvg("g", {
    class: `${state.selection.includes(entity.id) ? "selected " : ""}entity`,
    "data-id": entity.id,
  });

  if (["linear", "horizontal", "vertical"].includes(entity.dimType)) {
    const geom = getDimensionGeometry(entity);
    [
      createSvg("line", {
        x1: geom.ext1.x,
        y1: geom.ext1.y,
        x2: geom.dimStart.x,
        y2: geom.dimStart.y,
        class: "dimension-line",
      }),
      createSvg("line", {
        x1: geom.ext2.x,
        y1: geom.ext2.y,
        x2: geom.dimEnd.x,
        y2: geom.dimEnd.y,
        class: "dimension-line",
      }),
      createSvg("line", {
        x1: geom.dimStart.x,
        y1: geom.dimStart.y,
        x2: geom.dimEnd.x,
        y2: geom.dimEnd.y,
        class: "dimension-line",
        "marker-start": "url(#arrow)",
        "marker-end": "url(#arrow)",
      }),
      createSvg("text", {
        x: geom.text.x,
        y: geom.text.y,
        "font-size": entity.fontSize || 14,
        class: "dimension-text",
        "text-anchor": "middle",
      }, geom.label),
    ].forEach((node) => group.append(node));
    return group;
  }

  const radial = getRadialGeometry(entity);
  group.append(createSvg("line", {
    x1: radial.start.x,
    y1: radial.start.y,
    x2: radial.end.x,
    y2: radial.end.y,
    class: "dimension-line",
    "marker-end": "url(#arrow)",
  }));
  group.append(createSvg("text", {
    x: radial.labelPoint.x,
    y: radial.labelPoint.y,
    "font-size": entity.fontSize || 14,
    class: "dimension-text",
  }, radial.label));
  return group;
}

function renderOverlayOnly() {
  dom.overlayLayer.replaceChildren();

  if (state.printPreview.active) {
    return;
  }

  if (state.hoverPoint) {
    dom.overlayLayer.append(createSvg("circle", {
      cx: state.hoverPoint.x,
      cy: state.hoverPoint.y,
      r: 4,
      class: "snap-indicator",
    }));
  }

  if (!state.pendingPoints.length) {
    return;
  }

  const hover = state.hoverPoint || state.pendingPoints[state.pendingPoints.length - 1];

  if (state.tool === "line" || state.tool.startsWith("dim-") || state.tool === "measure-distance") {
    const p1 = state.pendingPoints[0];
    dom.overlayLayer.append(createSvg("line", {
      x1: p1.x,
      y1: p1.y,
      x2: hover.x,
      y2: hover.y,
      class: "overlay-preview",
    }));
    return;
  }

  if (state.tool === "rect") {
    const rect = rectFromPoints(state.pendingPoints[0], hover);
    dom.overlayLayer.append(createSvg("rect", {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      class: "overlay-preview",
    }));
    return;
  }

  if (state.tool === "circle") {
    dom.overlayLayer.append(createSvg("circle", {
      cx: state.pendingPoints[0].x,
      cy: state.pendingPoints[0].y,
      r: distance(state.pendingPoints[0], hover),
      class: "overlay-preview",
    }));
    return;
  }

  if (state.tool === "polyline") {
    const points = [...state.pendingPoints, hover];
    dom.overlayLayer.append(createSvg("polyline", {
      points: points.map((point) => `${point.x},${point.y}`).join(" "),
      class: "overlay-preview",
      fill: "none",
    }));
  }
}

function renderRulers() {
  drawRuler(dom.topRuler, "horizontal");
  drawRuler(dom.leftRuler, "vertical");
}

function drawRuler(canvas, orientation) {
  if (!state.view.showRulers) {
    return;
  }

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#e8eff7";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#94a3b8";
  ctx.fillStyle = "#475569";
  ctx.font = "10px Segoe UI";

  const step = state.defaults.gridStep;
  const visible = getVisibleWorldBounds();

  if (orientation === "horizontal") {
    const start = Math.floor(visible.minX / step) * step;
    const end = Math.ceil(visible.maxX / step) * step;
    for (let value = start; value <= end; value += step) {
      const x = worldToScreen({ x: value, y: 0 }).x - dom.workspaceViewport.getBoundingClientRect().left;
      const major = value % (step * 5) === 0;
      const tickHeight = major ? 18 : 10;
      ctx.beginPath();
      ctx.moveTo(x, height);
      ctx.lineTo(x, height - tickHeight);
      ctx.stroke();
      if (major) {
        ctx.fillText(String(value), x + 2, 11);
      }
    }
    return;
  }

  const start = Math.floor(visible.minY / step) * step;
  const end = Math.ceil(visible.maxY / step) * step;
  for (let value = start; value <= end; value += step) {
    const y = worldToScreen({ x: 0, y: value }).y - dom.workspaceViewport.getBoundingClientRect().top;
    const major = value % (step * 5) === 0;
    const tickWidth = major ? 18 : 10;
    ctx.beginPath();
    ctx.moveTo(width, y);
    ctx.lineTo(width - tickWidth, y);
    ctx.stroke();
    if (major) {
      ctx.save();
      ctx.translate(10, y - 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(String(value), 0, 0);
      ctx.restore();
    }
  }
}

function updateStatusPanel() {
  dom.statusMessage.textContent = state.message;
  dom.selectionCount.textContent = `Выделено: ${state.selection.length}`;
  dom.documentStats.textContent = `Листов: ${state.sheets.length} · Объектов: ${state.entities.length}`;
  dom.selectionSummary.textContent = summarizeSelection();
  updateSelectionInputs();
  updateCommandAvailability();
  updateSnapSummary();
  dom.autosaveStatus.textContent = state.lastAutosave ? state.lastAutosave.toLocaleTimeString("ru-RU") : "не выполнялось";
  dom.dwgBackendStatus.textContent = state.dwgBackend.detail;
}

function updateCommandAvailability() {
  const selected = getSelectedEntities();
  const hasSelection = selected.length > 0;
  const oneLineSelected = selected.length === 1 && selected[0]?.type === "line";
  const twoLinesSelected = selected.length === 2 && selected.every((entity) => entity.type === "line");

  document.querySelectorAll('[data-command="undo"]').forEach((button) => {
    button.disabled = state.historyIndex <= 0;
  });
  document.querySelectorAll('[data-command="redo"]').forEach((button) => {
    button.disabled = state.historyIndex >= state.history.length - 1;
  });
  document.querySelectorAll('[data-command="delete-selection"], [data-command="duplicate-selection"], [data-command="rotate-selection"], [data-command="scale-selection"], [data-command="mirror-selection-x"], [data-command="mirror-selection-y"], [data-command="move-mode"], [data-command="clear-selection"]').forEach((button) => {
    button.disabled = !hasSelection;
  });
  document.querySelectorAll('[data-command="trim-selection"], [data-command="extend-selection"]').forEach((button) => {
    button.disabled = !twoLinesSelected;
  });
  document.querySelectorAll('[data-command="split-selection"]').forEach((button) => {
    button.disabled = !oneLineSelected;
  });
  document.querySelectorAll('[data-command="offset-selection"]').forEach((button) => {
    button.disabled = !hasSelection;
  });
  document.querySelectorAll('[data-command="export-dwg"]').forEach((button) => {
    button.disabled = !state.dwgBackend.available;
  });
  const dwgOption = [...dom.saveAsFormatSelect.options].find((option) => option.value === "dwg");
  if (dwgOption) {
    dwgOption.disabled = !state.dwgBackend.available;
    dwgOption.textContent = state.dwgBackend.available ? "DWG" : "DWG (недоступно)";
  }
  dom.applySelectionProperties.disabled = !hasSelection;
  dom.renameSheetButton.disabled = !state.sheets.length;
  dom.deleteSheetButton.disabled = state.sheets.length <= 1;
}

function renderSheetTabs() {
  dom.sheetTabs.replaceChildren();
  for (const sheet of state.sheets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `sheet-tab${sheet.id === state.activeSheetId ? " active" : ""}`;
    button.textContent = sheet.name;
    button.addEventListener("click", () => activateSheet(sheet.id));
    button.addEventListener("dblclick", () => renameSheetById(sheet.id));
    dom.sheetTabs.append(button);
  }
}

function updateSelectionInputs() {
  const selected = getSelectedEntities();
  const first = selected[0];
  if (!first) {
    dom.selectionTextInput.value = "";
    dom.selectionLineTypeInput.value = state.defaults.lineType;
    return;
  }
  dom.selectionColorInput.value = first.stroke || state.defaults.stroke;
  dom.selectionStrokeWidthInput.value = String(first.strokeWidth || state.defaults.strokeWidth);
  dom.selectionLineTypeInput.value = first.lineType || "solid";
  dom.selectionTextInput.value = first.type === "text" ? first.text : "";
}

function updateSnapSummary() {
  const active = [];
  if (state.snap.grid) active.push("Сетка");
  if (state.snap.end) active.push("конечные точки");
  if (state.snap.mid) active.push("середины");
  if (state.snap.intersection) active.push("пересечения");
  if (state.snap.center) active.push("центры");
  if (state.snap.ortho) active.push("орто");
  dom.snapSummary.textContent = active.length ? active.join(", ") : "выключена";
}

function summarizeSelection() {
  const selected = getSelectedEntities();
  if (!selected.length) {
    return "Ничего не выбрано.";
  }
  if (selected.length === 1) {
    const entity = selected[0];
    if (entity.type === "line") {
      return `Линия ${formatPoint({ x: entity.x1, y: entity.y1 })} → ${formatPoint({ x: entity.x2, y: entity.y2 })}`;
    }
    if (entity.type === "rect") {
      return `Прямоугольник ${formatNumber(entity.width)} × ${formatNumber(entity.height)} ${state.defaults.units}`;
    }
    if (entity.type === "circle") {
      return `Окружность R=${formatNumber(entity.r)} ${state.defaults.units}`;
    }
    if (entity.type === "text") {
      return `Текст: ${entity.text}`;
    }
    return `Объект типа "${entity.type}".`;
  }
  return `Выбрано объектов: ${selected.length}.`;
}

function applySelectionProperties() {
  const selected = getSelectedEntities();
  if (!selected.length) {
    setStatus("Нет выбранных объектов.");
    return;
  }

  const color = dom.selectionColorInput.value;
  const strokeWidth = clamp(Number(dom.selectionStrokeWidthInput.value) || 2, 1, 12);
  const lineType = dom.selectionLineTypeInput.value;
  const textValue = dom.selectionTextInput.value;

  for (const entity of selected) {
    if ("stroke" in entity) entity.stroke = color;
    if ("strokeWidth" in entity) entity.strokeWidth = strokeWidth;
    if (supportsLineType(entity)) entity.lineType = lineType;
    if (entity.type === "text" && textValue.trim()) entity.text = textValue.trim();
  }
  pushHistory("Изменены свойства выделения");
  render();
}

function runCalculator() {
  const expression = dom.calculatorInput.value.trim();
  if (!/^[0-9+\-*/().,\s]+$/.test(expression)) {
    dom.calculatorResult.textContent = "Допустимы только числа и арифметические операции.";
    return;
  }
  try {
    const normalized = expression.replace(/,/g, ".");
    const result = Function(`"use strict"; return (${normalized});`)();
    dom.calculatorResult.textContent = `Результат: ${formatNumber(Number(result))}`;
  } catch (error) {
    dom.calculatorResult.textContent = "Ошибка вычисления выражения.";
  }
}

function addSheet() {
  const proposedName = `Лист ${state.nextSheetId}`;
  const name = prompt("Имя нового листа", proposedName);
  if (name === null) {
    return;
  }
  const sheet = createSheet(state.nextSheetId, sanitizeSheetName(name, proposedName));
  state.nextSheetId += 1;
  state.sheets.push(sheet);
  state.activeSheetId = sheet.id;
  state.pendingPoints = [];
  state.measurementBuffer = [];
  state.angleBuffer = [];
  fitToContent();
  pushHistory("Добавлен лист");
  render();
}

function activateSheet(sheetId) {
  if (sheetId === state.activeSheetId) {
    return;
  }
  state.activeSheetId = sheetId;
  state.pendingPoints = [];
  state.measurementBuffer = [];
  state.angleBuffer = [];
  state.drag = null;
  fitToContent();
  setStatus(`Активен ${getActiveSheet().name}.`);
  render();
}

function renameActiveSheet() {
  renameSheetById(state.activeSheetId);
}

function renameSheetById(sheetId) {
  const sheet = state.sheets.find((item) => item.id === sheetId);
  if (!sheet) {
    return;
  }
  const name = prompt("Новое имя листа", sheet.name);
  if (name === null) {
    return;
  }
  sheet.name = sanitizeSheetName(name, sheet.name);
  pushHistory("Переименован лист");
  render();
}

function deleteActiveSheet() {
  if (state.sheets.length <= 1) {
    return;
  }
  const sheet = getActiveSheet();
  if (!confirm(`Удалить ${sheet.name}?`)) {
    return;
  }
  const index = state.sheets.findIndex((item) => item.id === sheet.id);
  state.sheets = state.sheets.filter((item) => item.id !== sheet.id);
  const fallback = state.sheets[Math.max(0, index - 1)] || state.sheets[0];
  state.activeSheetId = fallback.id;
  state.pendingPoints = [];
  state.measurementBuffer = [];
  state.angleBuffer = [];
  state.drag = null;
  fitToContent();
  pushHistory("Удалён лист");
  render();
}

function openSaveAsDialog() {
  checkDwgBackend(true);
  dom.saveAsNameInput.value = safeFileName(state.documentName || "drawing");
  dom.saveAsFormatSelect.value = "dxf";
  updateSaveAsHint();
  dom.saveAsDialog.showModal();
}

async function onSaveAsSubmit(event) {
  event.preventDefault();
  const name = safeFileName(dom.saveAsNameInput.value.trim() || state.documentName || "drawing");
  const format = dom.saveAsFormatSelect.value;
  const success = await saveAsByFormat(format, name);
  if (success) {
    dom.saveAsDialog.close();
  }
}

function updateSaveAsHint() {
  dom.saveAsHint.textContent = dom.saveAsFormatSelect.value === "dwg"
    ? (state.dwgBackend.available
      ? "DWG будет сохранён через локальный backend-конвертер."
      : "DWG недоступен: запустите локальный backend и внешний конвертер.")
    : "Выберите имя файла и формат экспорта.";
}

async function saveAsByFormat(format, name) {
  switch (format) {
    case "dxf":
      exportDxf(name);
      return true;
    case "dwg":
      return exportDwg(name);
    case "svg":
      exportSvg(name);
      return true;
    case "png":
      await exportPng(name);
      return true;
    case "tiff":
      await exportTiff(name);
      return true;
    default:
      return false;
  }
}

function addEntity(entity, historyLabel) {
  entity.id = entity.id || state.nextId++;
  state.entities.push(entity);
  state.selection = [entity.id];
  pushHistory(historyLabel);
  render();
}

function deleteSelection() {
  if (!state.selection.length) {
    return;
  }
  state.entities = state.entities.filter((entity) => !state.selection.includes(entity.id));
  state.selection = [];
  pushHistory("Удаление объектов");
  render();
}

function duplicateSelection() {
  const selected = getSelectedEntities();
  if (!selected.length) {
    setStatus("Нет выбранных объектов для копирования.");
    return;
  }
  const clones = selected.map((entity) => cloneEntityWithOffset(entity, 20, 20));
  clones.forEach((entity) => {
    entity.id = state.nextId++;
    state.entities.push(entity);
  });
  state.selection = clones.map((entity) => entity.id);
  pushHistory("Копирование объектов");
  render();
}

function rotateSelection() {
  const selected = getSelectedEntities();
  if (!selected.length) {
    setStatus("Нет выбранных объектов для поворота.");
    return;
  }
  const angle = Number(prompt("Угол поворота в градусах", "90"));
  if (!Number.isFinite(angle)) {
    return;
  }
  const center = getSelectionCenter(selected);
  selected.forEach((entity) => rotateEntity(entity, center, angle));
  pushHistory("Поворот объектов");
  render();
}

function scaleSelection() {
  const selected = getSelectedEntities();
  if (!selected.length) {
    setStatus("Нет выбранных объектов для масштабирования.");
    return;
  }
  const factor = Number(prompt("Коэффициент масштабирования", "1.5"));
  if (!Number.isFinite(factor) || factor <= 0) {
    return;
  }
  const center = getSelectionCenter(selected);
  selected.forEach((entity) => scaleEntity(entity, center, factor));
  pushHistory("Масштабирование объектов");
  render();
}

function mirrorSelection(axis) {
  const selected = getSelectedEntities();
  if (!selected.length) {
    setStatus("Нет выбранных объектов для отражения.");
    return;
  }
  const center = getSelectionCenter(selected);
  selected.forEach((entity) => mirrorEntity(entity, center, axis));
  pushHistory("Зеркальное отражение объектов");
  render();
}

function trimSelection() {
  const selected = getSelectedEntities();
  if (selected.length !== 2 || !selected.every((entity) => entity.type === "line")) {
    setStatus("Для обрезки выберите две линии: сначала обрезаемую, затем границу.");
    return;
  }
  const [target, boundary] = selected;
  const intersection = lineIntersection(target, boundary);
  if (!intersection) {
    setStatus("Линии не пересекаются.");
    return;
  }
  const d1 = distance({ x: target.x1, y: target.y1 }, intersection);
  const d2 = distance({ x: target.x2, y: target.y2 }, intersection);
  if (d1 > d2) {
    target.x1 = intersection.x;
    target.y1 = intersection.y;
  } else {
    target.x2 = intersection.x;
    target.y2 = intersection.y;
  }
  pushHistory("Обрезка линии");
  render();
}

function extendSelection() {
  const selected = getSelectedEntities();
  if (selected.length !== 2 || !selected.every((entity) => entity.type === "line")) {
    setStatus("Для продления выберите две линии: сначала продлеваемую, затем границу.");
    return;
  }
  const [target, boundary] = selected;
  const intersection = infiniteLineIntersection(target, boundary);
  if (!intersection) {
    setStatus("Не удалось вычислить точку продления.");
    return;
  }
  const d1 = distance({ x: target.x1, y: target.y1 }, intersection);
  const d2 = distance({ x: target.x2, y: target.y2 }, intersection);
  if (d1 > d2) {
    target.x1 = intersection.x;
    target.y1 = intersection.y;
  } else {
    target.x2 = intersection.x;
    target.y2 = intersection.y;
  }
  pushHistory("Продление линии");
  render();
}

function offsetSelection() {
  const selected = getSelectedEntities();
  if (!selected.length) {
    setStatus("Нет выбранных объектов для смещения.");
    return;
  }
  const distanceValue = Number(prompt("Расстояние смещения", "20"));
  if (!Number.isFinite(distanceValue)) {
    return;
  }
  const newEntities = [];
  for (const entity of selected) {
    const offset = createOffsetEntity(entity, distanceValue);
    if (offset) {
      offset.id = state.nextId++;
      newEntities.push(offset);
    }
  }
  if (!newEntities.length) {
    setStatus("Смещение поддерживается для линий, прямоугольников и окружностей.");
    return;
  }
  state.entities.push(...newEntities);
  state.selection = newEntities.map((entity) => entity.id);
  pushHistory("Параллельное смещение");
  render();
}

function splitSelection() {
  const selected = getSelectedEntities();
  if (selected.length !== 1 || selected[0].type !== "line") {
    setStatus("Для разделения выберите одну линию.");
    return;
  }
  const line = selected[0];
  const midpoint = {
    x: (line.x1 + line.x2) / 2,
    y: (line.y1 + line.y2) / 2,
  };
  const first = { ...clone(line), id: state.nextId++, x2: midpoint.x, y2: midpoint.y };
  const second = { ...clone(line), id: state.nextId++, x1: midpoint.x, y1: midpoint.y };
  state.entities = state.entities.filter((entity) => entity.id !== line.id);
  state.entities.push(first, second);
  state.selection = [first.id, second.id];
  pushHistory("Разделение линии");
  render();
}

function undo() {
  if (state.historyIndex <= 0) {
    return;
  }
  state.historyIndex -= 1;
  restoreSnapshot(state.history[state.historyIndex]);
  setStatus("Выполнена отмена.");
  render();
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) {
    return;
  }
  state.historyIndex += 1;
  restoreSnapshot(state.history[state.historyIndex]);
  setStatus("Выполнен повтор.");
  render();
}

function pushHistory(label) {
  const snapshot = createSnapshot();
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(snapshot);
  state.historyIndex = state.history.length - 1;
  setStatus(label);
}

function createSnapshot() {
  return {
    documentName: state.documentName,
    sheets: clone(state.sheets),
    activeSheetId: state.activeSheetId,
    defaults: clone(state.defaults),
    view: clone(state.view),
    snap: clone(state.snap),
    nextId: state.nextId,
    nextSheetId: state.nextSheetId,
  };
}

function restoreSnapshot(snapshot) {
  state.documentName = snapshot.documentName;
  state.sheets = clone(snapshot.sheets || [createSheet(1, "Лист 1")]);
  state.activeSheetId = snapshot.activeSheetId || state.sheets[0].id;
  state.defaults = { ...state.defaults, ...clone(snapshot.defaults) };
  state.view = clone(snapshot.view);
  state.snap = clone(snapshot.snap);
  state.nextId = snapshot.nextId;
  state.nextSheetId = snapshot.nextSheetId || inferNextSheetId(state.sheets);
  normalizeSheets();
}

function fitToContent() {
  const bounds = getEntityBounds(state.entities);
  const viewportRect = dom.workspaceViewport.getBoundingClientRect();
  const width = Math.max(viewportRect.width, 500);
  const height = Math.max(viewportRect.height, 400);

  if (!bounds) {
    state.view.zoom = 1;
    state.view.panX = width / 2;
    state.view.panY = height / 2;
    return;
  }

  const padding = 60;
  const scaleX = (width - padding * 2) / Math.max(bounds.maxX - bounds.minX, 1);
  const scaleY = (height - padding * 2) / Math.max(bounds.maxY - bounds.minY, 1);
  state.view.zoom = clamp(Math.min(scaleX, scaleY), 0.25, 4);
  state.view.panX = padding - bounds.minX * state.view.zoom;
  state.view.panY = padding - bounds.minY * state.view.zoom;
}

function setZoom(nextZoom, options = {}) {
  const zoom = clamp(nextZoom, 0.25, 4);
  const focusScreen = options.focusScreen || getViewportCenter();
  const worldBefore = screenToWorld(focusScreen.x, focusScreen.y);
  state.view.zoom = zoom;
  state.view.panX = focusScreen.x - dom.workspaceViewport.getBoundingClientRect().left - worldBefore.x * zoom;
  state.view.panY = focusScreen.y - dom.workspaceViewport.getBoundingClientRect().top - worldBefore.y * zoom;
}

function openDocumentFromFile(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      importDocument(parsed, file.name.replace(/\.json$/i, ""));
      setStatus("Документ открыт.");
      render();
    } catch (error) {
      alert("Не удалось открыть файл документа.");
    }
  };
  reader.readAsText(file, "utf-8");
}

function importDocument(data, fallbackName = "Импортированный документ") {
  state.documentName = data.documentName || fallbackName;
  state.sheets = clone(data.sheets || [createSheet(1, "Лист 1", data.entities || [], [])]);
  state.activeSheetId = data.activeSheetId || state.sheets[0].id;
  state.defaults = { ...state.defaults, ...(data.defaults || {}) };
  state.view = { ...state.view, zoom: 1, panX: 120, panY: 80 };
  state.snap = { ...state.snap, ...(data.snap || {}) };
  normalizeSheets();
  state.nextId = data.nextId || inferNextEntityId(state.sheets);
  state.nextSheetId = data.nextSheetId || inferNextSheetId(state.sheets);
  fitToContent();
  pushHistory("Открыт документ");
}

function downloadJson(name) {
  const payload = JSON.stringify({
    documentName: state.documentName,
    sheets: state.sheets,
    activeSheetId: state.activeSheetId,
    defaults: state.defaults,
    snap: state.snap,
    nextId: state.nextId,
    nextSheetId: state.nextSheetId,
  }, null, 2);
  downloadBlob(new Blob([payload], { type: "application/json" }), `${safeFileName(name)}.json`);
  setStatus("Документ сохранён.");
}

function exportSvg(name = state.documentName) {
  const { svgMarkup } = buildExportSvgDocument();
  downloadBlob(new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" }), `${safeFileName(name)}.svg`);
  setStatus("Экспортирован SVG.");
}

async function exportPng(name = state.documentName) {
  try {
    const canvas = await renderExportCanvas();
    canvas.toBlob((blob) => {
      if (!blob) {
        alert("Не удалось сформировать PNG.");
        return;
      }
      downloadBlob(blob, `${safeFileName(name)}.png`);
      setStatus("Экспортирован PNG.");
    }, "image/png");
  } catch (error) {
    alert("Не удалось экспортировать PNG.");
  }
}

async function exportDwg(name = state.documentName) {
  const backendOk = await checkDwgBackend();
  if (!backendOk) {
    setStatus("DWG backend недоступен.");
    return false;
  }

  try {
    const response = await fetch(`${state.dwgBackend.url}/convert/dxf-to-dwg`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filename: safeFileName(name),
        dxf: buildDxfText(),
      }),
    });

    if (!response.ok) {
      throw new Error(await readBackendError(response) || `HTTP ${response.status}`);
    }

    const blob = await response.blob();
    downloadBlob(blob, `${safeFileName(name)}.dwg`);
    setStatus("Экспортирован DWG.");
    return true;
  } catch (error) {
    setStatus(`Ошибка DWG: ${error.message}`);
    return false;
  }
}

function exportDxf(name = state.documentName) {
  const dxfText = buildDxfText();
  downloadBlob(new Blob([dxfText], { type: "application/dxf;charset=utf-8" }), `${safeFileName(name)}.dxf`);
  setStatus("Экспортирован DXF.");
}

function buildDxfText() {
  const bounds = getEntityBounds(state.entities) || { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  const cadTransform = createCadTransform(bounds);
  const lines = [
    "0", "SECTION",
    "2", "HEADER",
    "9", "$ACADVER",
    "1", "AC1015",
    "9", "$INSUNITS",
    "70", String(getDxfUnitsCode(state.defaults.units)),
    "0", "ENDSEC",
    "0", "SECTION",
    "2", "ENTITIES",
  ];

  for (const entity of state.entities) {
    lines.push(...serializeEntityToDxf(entity, cadTransform));
  }

  lines.push("0", "ENDSEC", "0", "EOF");
  return lines.join("\r\n");
}

async function exportTiff(name = state.documentName) {
  try {
    const canvas = await renderExportCanvas();
    const blob = canvasToTiffBlob(canvas);
    downloadBlob(blob, `${safeFileName(name)}.tiff`);
    setStatus("Экспортирован TIFF.");
  } catch (error) {
    alert("Не удалось экспортировать TIFF.");
  }
}

function togglePrintPreview(force) {
  const nextState = typeof force === "boolean" ? force : !state.printPreview.active;
  state.printPreview.active = nextState;
  state.pendingPoints = [];
  state.measurementBuffer = [];
  state.angleBuffer = [];
  state.drag = null;
  state.hoverPoint = null;
  setStatus(nextState ? "Включён предпросмотр печати." : "Предпросмотр печати закрыт.");
  render();
}

function printDocument() {
  const printWindow = window.open("", "_blank", "width=1024,height=768");
  if (!printWindow) {
    return;
  }
  const { svgMarkup } = buildExportSvgDocument({
    monochrome: state.printPreview.colorMode === "bw",
  });
  const scale = clamp(state.printPreview.scale || 100, 10, 400);
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <title>${state.documentName}</title>
      <style>
        @page { margin: 12mm; }
        body { margin: 0; display: grid; place-items: start center; background: white; }
        .print-sheet { width: ${scale}%; }
        svg { width: 100%; height: auto; display: block; }
      </style>
    </head>
    <body><div class="print-sheet">${svgMarkup}</div></body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function checkDwgBackend(silent = false) {
  try {
    const response = await fetch(`${state.dwgBackend.url}/health`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    state.dwgBackend.available = Boolean(payload.available);
    state.dwgBackend.configured = Boolean(payload.configured);
    state.dwgBackend.commandAvailable = Boolean(payload.command_available);
    state.dwgBackend.detail = payload.detail || (payload.available ? "готов" : "offline");
    render();
    return state.dwgBackend.available;
  } catch (error) {
    state.dwgBackend.available = false;
    state.dwgBackend.configured = false;
    state.dwgBackend.commandAvailable = false;
    state.dwgBackend.detail = "offline";
    if (!silent) {
      setStatus("DWG backend не отвечает.");
    }
    render();
    return false;
  }
}

async function readBackendError(response) {
  const contentType = response.headers.get("Content-Type") || "";
  try {
    if (contentType.includes("application/json")) {
      const payload = await response.json();
      return payload.error || payload.detail || payload.message || "";
    }
    return await response.text();
  } catch (error) {
    return "";
  }
}

function buildExportSvgDocument(options = {}) {
  const monochrome = Boolean(options.monochrome);
  const bounds = getEntityBounds(state.entities) || { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  const padding = 40;
  const width = Math.max(bounds.maxX - bounds.minX + padding * 2, 200);
  const height = Math.max(bounds.maxY - bounds.minY + padding * 2, 200);

  const svg = createSvg("svg", {
    xmlns: SVG_NS,
    viewBox: `${bounds.minX - padding} ${bounds.minY - padding} ${width} ${height}`,
    width,
    height,
  });

  svg.append(createSvg("style", {}, `
    text { font-family: "Segoe UI", "Trebuchet MS", sans-serif; }
    .dimension-line { stroke: #8b5cf6; fill: none; stroke-width: 2; vector-effect: non-scaling-stroke; }
    .dimension-text { fill: #8b5cf6; stroke: none; }
    ${monochrome ? ".entity, .dimension-line, .dimension-text { stroke: #000 !important; fill: #000 !important; } .entity[fill='none'] { fill: none !important; } marker path { fill: #000 !important; }" : ""}
  `));

  const defs = createSvg("defs");
  const marker = createSvg("marker", {
    id: "arrow",
    markerWidth: 10,
    markerHeight: 10,
    refX: 5,
    refY: 5,
    orient: "auto-start-reverse",
  });
  marker.append(createSvg("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "#8b5cf6" }));
  defs.append(marker);
  svg.append(defs);
  svg.append(createSvg("rect", {
    x: bounds.minX - padding,
    y: bounds.minY - padding,
    width,
    height,
    fill: "#ffffff",
  }));

  const exportLayer = dom.entityLayer.cloneNode(true);
  exportLayer.removeAttribute("id");
  exportLayer.querySelectorAll(".selected").forEach((node) => node.classList.remove("selected"));
  svg.append(exportLayer);

  return {
    svgMarkup: new XMLSerializer().serializeToString(svg),
    bounds,
    width: Math.ceil(width),
    height: Math.ceil(height),
  };
}

function renderPrintPreview() {
  dom.printPreviewHost.replaceChildren();
  if (!state.printPreview.active) {
    return;
  }

  const { svgMarkup, width, height } = buildExportSvgDocument({
    monochrome: state.printPreview.colorMode === "bw",
  });
  const page = document.createElement("div");
  page.className = "print-page";
  page.style.width = `${Math.ceil(width * (state.printPreview.scale / 100))}px`;
  page.style.height = `${Math.ceil(height * (state.printPreview.scale / 100))}px`;
  page.innerHTML = svgMarkup;
  dom.printPreviewHost.append(page);
}

async function renderExportCanvas() {
  const { svgMarkup, width, height } = buildExportSvgDocument();
  const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image load failed"));
    image.src = url;
  });
}

function canvasToTiffBlob(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const rgb = new Uint8Array(width * height * 3);

  for (let src = 0, dst = 0; src < rgba.length; src += 4, dst += 3) {
    rgb[dst] = rgba[src];
    rgb[dst + 1] = rgba[src + 1];
    rgb[dst + 2] = rgba[src + 2];
  }

  const software = new TextEncoder().encode("Codex Drawing\0");
  const entryCount = 13;
  const ifdOffset = 8;
  const bitsOffset = ifdOffset + 2 + entryCount * 12 + 4;
  const xResOffset = bitsOffset + 6;
  const yResOffset = xResOffset + 8;
  const softwareOffset = yResOffset + 8;
  const imageOffset = softwareOffset + software.length;
  const totalSize = imageOffset + rgb.length;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  bytes[0] = 0x49;
  bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);

  let entryOffset = ifdOffset;
  view.setUint16(entryOffset, entryCount, true);
  entryOffset += 2;

  const writeEntry = (tag, type, count, value) => {
    view.setUint16(entryOffset, tag, true);
    view.setUint16(entryOffset + 2, type, true);
    view.setUint32(entryOffset + 4, count, true);
    if (type === 3 && count === 1) {
      view.setUint16(entryOffset + 8, value, true);
      view.setUint16(entryOffset + 10, 0, true);
    } else {
      view.setUint32(entryOffset + 8, value, true);
    }
    entryOffset += 12;
  };

  writeEntry(256, 4, 1, width);
  writeEntry(257, 4, 1, height);
  writeEntry(258, 3, 3, bitsOffset);
  writeEntry(259, 3, 1, 1);
  writeEntry(262, 3, 1, 2);
  writeEntry(273, 4, 1, imageOffset);
  writeEntry(277, 3, 1, 3);
  writeEntry(278, 4, 1, height);
  writeEntry(279, 4, 1, rgb.length);
  writeEntry(282, 5, 1, xResOffset);
  writeEntry(283, 5, 1, yResOffset);
  writeEntry(284, 3, 1, 1);
  writeEntry(305, 2, software.length, softwareOffset);

  view.setUint32(entryOffset, 0, true);

  view.setUint16(bitsOffset, 8, true);
  view.setUint16(bitsOffset + 2, 8, true);
  view.setUint16(bitsOffset + 4, 8, true);

  view.setUint32(xResOffset, 300, true);
  view.setUint32(xResOffset + 4, 1, true);
  view.setUint32(yResOffset, 300, true);
  view.setUint32(yResOffset + 4, 1, true);

  bytes.set(software, softwareOffset);
  bytes.set(rgb, imageOffset);

  return new Blob([buffer], { type: "image/tiff" });
}

function createCadTransform(bounds) {
  return (point) => ({
    x: point.x,
    y: bounds.maxY - point.y,
  });
}

function getDxfUnitsCode(units) {
  const map = {
    px: 0,
    mm: 4,
    cm: 5,
  };
  return map[units] ?? 0;
}

function serializeEntityToDxf(entity, transformPoint) {
  const primitives = explodeEntityToPrimitives(entity);
  return primitives.flatMap((primitive) => serializePrimitiveToDxf(primitive, transformPoint));
}

function explodeEntityToPrimitives(entity) {
  if (entity.type === "line") {
    return [{ type: "line", p1: { x: entity.x1, y: entity.y1 }, p2: { x: entity.x2, y: entity.y2 }, color: entity.stroke, lineType: entity.lineType }];
  }
  if (entity.type === "polyline") {
    return [{ type: "polyline", points: clone(entity.points), color: entity.stroke, closed: false, lineType: entity.lineType }];
  }
  if (entity.type === "rect") {
    return [{
      type: "polyline",
      points: [
        { x: entity.x, y: entity.y },
        { x: entity.x + entity.width, y: entity.y },
        { x: entity.x + entity.width, y: entity.y + entity.height },
        { x: entity.x, y: entity.y + entity.height },
      ],
      color: entity.stroke,
      closed: true,
      lineType: entity.lineType,
    }];
  }
  if (entity.type === "circle") {
    return [{ type: "circle", center: { x: entity.cx, y: entity.cy }, r: entity.r, color: entity.stroke, lineType: entity.lineType }];
  }
  if (entity.type === "point") {
    return [{ type: "point", point: { x: entity.x, y: entity.y }, color: entity.stroke }];
  }
  if (entity.type === "text") {
    return [{
      type: "text",
      point: { x: entity.x, y: entity.y },
      text: entity.text,
      height: entity.fontSize || state.defaults.textSize,
      color: entity.stroke,
    }];
  }
  if (entity.type === "dimension") {
    if (["linear", "horizontal", "vertical"].includes(entity.dimType)) {
      const geom = getDimensionGeometry(entity);
      return [
        { type: "line", p1: geom.ext1, p2: geom.dimStart, color: entity.stroke },
        { type: "line", p1: geom.ext2, p2: geom.dimEnd, color: entity.stroke },
        { type: "line", p1: geom.dimStart, p2: geom.dimEnd, color: entity.stroke },
        { type: "text", point: geom.text, text: geom.label, height: entity.fontSize || 14, color: entity.stroke },
      ];
    }

    const radial = getRadialGeometry(entity);
    return [
      { type: "line", p1: radial.start, p2: radial.end, color: entity.stroke },
      { type: "text", point: radial.labelPoint, text: radial.label, height: entity.fontSize || 14, color: entity.stroke },
    ];
  }
  return [];
}

function serializePrimitiveToDxf(primitive, transformPoint) {
  if (primitive.type === "line") {
    const p1 = transformPoint(primitive.p1);
    const p2 = transformPoint(primitive.p2);
    return dxfEntity("LINE", primitive.color, primitive.lineType, [
      [10, p1.x], [20, p1.y], [30, 0],
      [11, p2.x], [21, p2.y], [31, 0],
    ]);
  }
  if (primitive.type === "polyline") {
    const points = primitive.points.map(transformPoint);
    const payload = [
      [90, points.length],
      [70, primitive.closed ? 1 : 0],
    ];
    for (const point of points) {
      payload.push([10, point.x], [20, point.y]);
    }
    return dxfEntity("LWPOLYLINE", primitive.color, primitive.lineType, payload);
  }
  if (primitive.type === "circle") {
    const center = transformPoint(primitive.center);
    return dxfEntity("CIRCLE", primitive.color, primitive.lineType, [
      [10, center.x], [20, center.y], [30, 0],
      [40, primitive.r],
    ]);
  }
  if (primitive.type === "point") {
    const point = transformPoint(primitive.point);
    return dxfEntity("POINT", primitive.color, null, [
      [10, point.x], [20, point.y], [30, 0],
    ]);
  }
  if (primitive.type === "text") {
    const point = transformPoint(primitive.point);
    return dxfEntity("TEXT", primitive.color, null, [
      [10, point.x], [20, point.y], [30, 0],
      [40, primitive.height],
      [1, sanitizeDxfText(primitive.text)],
    ]);
  }
  return [];
}

function dxfEntity(type, color, lineType, payload) {
  const lines = ["0", type, "8", "0"];
  const trueColor = hexToTrueColor(color);
  if (trueColor !== null) {
    lines.push("420", String(trueColor));
  }
  const dxfLineType = dxfLineTypeName(lineType);
  if (dxfLineType) {
    lines.push("6", dxfLineType);
  }
  for (const [code, value] of payload) {
    lines.push(String(code), typeof value === "number" ? formatDxfNumber(value) : String(value));
  }
  return lines;
}

function sanitizeDxfText(text) {
  return String(text)
    .replace(/\r?\n/g, " ")
    .replace(/⌀/g, "%%c");
}

function hexToTrueColor(color) {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) {
    return null;
  }
  return parseInt(color.slice(1), 16);
}

function formatDxfNumber(value) {
  return Number(value).toFixed(4).replace(/\.?0+$/, "");
}

function dxfLineTypeName(lineType) {
  const map = {
    solid: "CONTINUOUS",
    dashed: "DASHED",
    dotted: "DOT",
    dashdot: "CENTER",
  };
  return map[lineType] || "CONTINUOUS";
}

function restoreAutosave() {
  const raw = localStorage.getItem("drawing-autosave");
  if (!raw) {
    return false;
  }
  try {
    const parsed = JSON.parse(raw);
    importDocument(parsed, parsed.documentName || "Автосохранённый документ");
    state.lastAutosave = new Date(parsed.savedAt || Date.now());
    setStatus("Восстановлен автосохранённый документ.");
    return true;
  } catch (error) {
    return false;
  }
}

function updateAutosaveTimer() {
  if (state.autosaveTimer) {
    clearInterval(state.autosaveTimer);
  }
  state.autosaveTimer = setInterval(() => {
    const payload = {
      documentName: state.documentName,
      sheets: state.sheets,
      activeSheetId: state.activeSheetId,
      defaults: state.defaults,
      snap: state.snap,
      nextId: state.nextId,
      nextSheetId: state.nextSheetId,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem("drawing-autosave", JSON.stringify(payload));
    state.lastAutosave = new Date();
    dom.autosaveStatus.textContent = state.lastAutosave.toLocaleTimeString("ru-RU");
  }, state.defaults.autosaveMinutes * 60 * 1000);
}

function loadDemo(recordHistory) {
  state.documentName = "Демонстрационный чертёж";
  state.sheets = [
    createSheet(1, "Лист 1", [
      { id: 1, type: "rect", x: 50, y: 50, width: 260, height: 160, stroke: "#1f2937", strokeWidth: 2 },
      { id: 2, type: "circle", cx: 420, cy: 140, r: 70, stroke: "#1f2937", strokeWidth: 2 },
      { id: 3, type: "line", x1: 50, y1: 260, x2: 280, y2: 340, stroke: "#0f766e", strokeWidth: 2, lineType: "dashed" },
      { id: 4, type: "polyline", points: [{ x: 360, y: 300 }, { x: 420, y: 260 }, { x: 520, y: 320 }, { x: 620, y: 280 }], stroke: "#0369a1", strokeWidth: 2, lineType: "dashdot" },
      { id: 5, type: "point", x: 180, y: 130, stroke: "#b91c1c", strokeWidth: 2 },
      { id: 6, type: "text", x: 65, y: 42, text: "Демонстрационный чертёж", stroke: "#1f2937", strokeWidth: 2, fontSize: 20 },
      { id: 7, type: "dimension", dimType: "horizontal", p1: { x: 50, y: 220 }, p2: { x: 310, y: 220 }, offset: 26, stroke: "#8b5cf6", strokeWidth: 2, fontSize: 14 },
      { id: 8, type: "dimension", dimType: "radius", center: { x: 420, y: 140 }, radius: 70, stroke: "#8b5cf6", strokeWidth: 2, fontSize: 14 },
    ], []),
  ];
  state.activeSheetId = 1;
  state.nextId = 9;
  state.nextSheetId = 2;
  state.defaults = {
    units: "mm",
    gridStep: 25,
    stroke: "#1f2937",
    strokeWidth: 2,
    lineType: "solid",
    textSize: 18,
    dimOffset: 24,
    autosaveMinutes: 2,
  };
  fitToContent();
  if (recordHistory) {
    pushHistory("Загружен демонстрационный чертёж");
    render();
  }
}

function createDimension(dimType, p1, p2) {
  return {
    type: "dimension",
    dimType,
    p1: clone(p1),
    p2: clone(p2),
    offset: state.defaults.dimOffset,
    stroke: "#8b5cf6",
    strokeWidth: 2,
    fontSize: Math.max(12, state.defaults.textSize - 4),
  };
}

function createRadialDimension(dimType, circleEntity) {
  return {
    type: "dimension",
    dimType,
    center: { x: circleEntity.cx, y: circleEntity.cy },
    radius: circleEntity.r,
    stroke: "#8b5cf6",
    strokeWidth: 2,
    fontSize: Math.max(12, state.defaults.textSize - 4),
  };
}

function getDimensionGeometry(entity) {
  const p1 = entity.p1;
  const p2 = entity.p2;
  const offset = entity.offset || state.defaults.dimOffset;
  let dimStart;
  let dimEnd;
  let ext1;
  let ext2;
  let label;
  if (entity.dimType === "horizontal") {
    dimStart = { x: p1.x, y: Math.max(p1.y, p2.y) + offset };
    dimEnd = { x: p2.x, y: Math.max(p1.y, p2.y) + offset };
    ext1 = { x: p1.x, y: p1.y };
    ext2 = { x: p2.x, y: p2.y };
    label = `${formatNumber(Math.abs(p2.x - p1.x))} ${state.defaults.units}`;
  } else if (entity.dimType === "vertical") {
    dimStart = { x: Math.max(p1.x, p2.x) + offset, y: p1.y };
    dimEnd = { x: Math.max(p1.x, p2.x) + offset, y: p2.y };
    ext1 = { x: p1.x, y: p1.y };
    ext2 = { x: p2.x, y: p2.y };
    label = `${formatNumber(Math.abs(p2.y - p1.y))} ${state.defaults.units}`;
  } else {
    const normal = normalize({ x: -(p2.y - p1.y), y: p2.x - p1.x });
    dimStart = { x: p1.x + normal.x * offset, y: p1.y + normal.y * offset };
    dimEnd = { x: p2.x + normal.x * offset, y: p2.y + normal.y * offset };
    ext1 = p1;
    ext2 = p2;
    label = `${formatNumber(distance(p1, p2))} ${state.defaults.units}`;
  }
  return {
    ext1,
    ext2,
    dimStart,
    dimEnd,
    text: midpoint(dimStart, dimEnd),
    label,
  };
}

function getRadialGeometry(entity) {
  const angle = -Math.PI / 6;
  const end = {
    x: entity.center.x + Math.cos(angle) * entity.radius,
    y: entity.center.y + Math.sin(angle) * entity.radius,
  };
  const labelValue = entity.dimType === "diameter"
    ? `⌀ ${formatNumber(entity.radius * 2)} ${state.defaults.units}`
    : `R ${formatNumber(entity.radius)} ${state.defaults.units}`;
  return {
    start: clone(entity.center),
    end,
    labelPoint: { x: end.x + 10, y: end.y - 8 },
    label: labelValue,
  };
}

function getInteractivePoint(rawPoint, useOrtho) {
  const snapped = applySnap(rawPoint, useOrtho);
  return constrainPointForActiveTool(snapped);
}

function constrainPointForActiveTool(point) {
  if (!state.pendingPoints.length) {
    return point;
  }

  if (state.tool === "line" || state.tool === "polyline") {
    const length = parsePositiveValue(state.drawConstraints.length);
    if (!length) {
      return point;
    }
    const anchor = state.pendingPoints[state.pendingPoints.length - 1];
    return pointAtDistance(anchor, point, length, state.drawConstraints.anchor === "end");
  }

  if (state.tool === "rect") {
    const width = parsePositiveValue(state.drawConstraints.rectWidth);
    const height = parsePositiveValue(state.drawConstraints.rectHeight);
    if (!width && !height) {
      return point;
    }
    const anchor = state.pendingPoints[0];
    const fallbackWidth = Math.abs(point.x - anchor.x);
    const fallbackHeight = Math.abs(point.y - anchor.y);
    return {
      x: anchor.x + Math.sign((point.x - anchor.x) || 1) * (width || fallbackWidth),
      y: anchor.y + Math.sign((point.y - anchor.y) || 1) * (height || fallbackHeight),
    };
  }

  if (state.tool === "circle") {
    const radius = parsePositiveValue(state.drawConstraints.radius);
    if (!radius) {
      return point;
    }
    return pointAtDistance(state.pendingPoints[0], point, radius, false);
  }

  return point;
}

function applySnap(point, useOrtho) {
  let result = { ...point };
  const candidates = [];

  if (state.snap.grid) {
    const step = state.defaults.gridStep;
    candidates.push({
      point: {
        x: Math.round(point.x / step) * step,
        y: Math.round(point.y / step) * step,
      },
      priority: 1,
    });
  }

  if (state.snap.end || state.snap.mid || state.snap.center || state.snap.intersection) {
    for (const candidate of getSnapCandidates()) {
      const dist = distance(candidate.point, point);
      if (dist <= 16 / state.view.zoom) {
        candidates.push({ point: candidate.point, priority: candidate.priority, dist });
      }
    }
  }

  if (candidates.length) {
    candidates.sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0) || a.priority - b.priority);
    result = { ...candidates[0].point };
  }

  if (state.snap.ortho && useOrtho && state.pendingPoints.length) {
    const anchor = state.pendingPoints[state.pendingPoints.length - 1];
    const dx = Math.abs(result.x - anchor.x);
    const dy = Math.abs(result.y - anchor.y);
    if (dx >= dy) {
      result.y = anchor.y;
    } else {
      result.x = anchor.x;
    }
  }

  return result;
}

function getSnapCandidates() {
  const candidates = [];
  for (const entity of state.entities) {
    if (state.snap.end) {
      getEndpoints(entity).forEach((point) => candidates.push({ point, priority: 0 }));
    }
    if (state.snap.mid) {
      getMidpoints(entity).forEach((point) => candidates.push({ point, priority: 2 }));
    }
    if (state.snap.center) {
      getCenters(entity).forEach((point) => candidates.push({ point, priority: 3 }));
    }
  }
  if (state.snap.intersection) {
    const intersections = [];
    for (let i = 0; i < state.entities.length; i += 1) {
      for (let j = i + 1; j < state.entities.length; j += 1) {
        intersections.push(...getIntersectionPoints(state.entities[i], state.entities[j]));
      }
    }
    uniquePoints(intersections).forEach((point) => candidates.push({ point, priority: 1 }));
  }
  return candidates;
}

function getEndpoints(entity) {
  return uniquePoints(getEntitySegments(entity).flatMap((segment) => [segment.start, segment.end]));
}

function getMidpoints(entity) {
  return getEntitySegments(entity).map((segment) => midpoint(segment.start, segment.end));
}

function getCenters(entity) {
  if (entity.type === "circle") {
    return [{ x: entity.cx, y: entity.cy }];
  }
  if (entity.type === "rect") {
    return [{ x: entity.x + entity.width / 2, y: entity.y + entity.height / 2 }];
  }
  return [];
}

function getIntersectionPoints(a, b) {
  const intersections = [];
  for (const segmentA of getEntitySegments(a)) {
    for (const segmentB of getEntitySegments(b)) {
      const intersection = lineIntersection(pairToLine(segmentA.start, segmentA.end), pairToLine(segmentB.start, segmentB.end));
      if (intersection) {
        intersections.push(intersection);
      }
    }
  }
  return intersections;
}

function hitTest(point, tolerance) {
  let best = null;
  for (const entity of state.entities) {
    const hitDistance = getHitDistance(entity, point);
    if (hitDistance !== null && hitDistance <= tolerance && (!best || hitDistance < best.distance)) {
      best = { id: entity.id, type: entity.type, distance: hitDistance };
    }
  }
  return best;
}

function getHitDistance(entity, point) {
  if (entity.type === "line") {
    return pointToSegmentDistance(point, { x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 });
  }
  if (entity.type === "polyline") {
    return Math.min(...entity.points.slice(0, -1).map((segmentStart, index) => pointToSegmentDistance(point, segmentStart, entity.points[index + 1])));
  }
  if (entity.type === "rect") {
    const corners = getEndpoints(entity);
    const distances = corners.map((corner, index) => pointToSegmentDistance(point, corner, corners[(index + 1) % corners.length]));
    return Math.min(...distances);
  }
  if (entity.type === "circle") {
    return Math.abs(distance(point, { x: entity.cx, y: entity.cy }) - entity.r);
  }
  if (entity.type === "point") {
    return distance(point, { x: entity.x, y: entity.y });
  }
  if (entity.type === "text") {
    const width = (entity.text.length || 1) * ((entity.fontSize || 18) * 0.55);
    const height = entity.fontSize || 18;
    return pointInRect(point, { x: entity.x, y: entity.y - height, width, height }) ? 0 : null;
  }
  if (entity.type === "dimension") {
    if (["linear", "horizontal", "vertical"].includes(entity.dimType)) {
      const geom = getDimensionGeometry(entity);
      return pointToSegmentDistance(point, geom.dimStart, geom.dimEnd);
    }
    const geom = getRadialGeometry(entity);
    return pointToSegmentDistance(point, geom.start, geom.end);
  }
  return null;
}

function moveEntities(ids, dx, dy) {
  state.entities.forEach((entity) => {
    if (ids.includes(entity.id)) {
      translateEntity(entity, dx, dy);
    }
  });
}

function translateEntity(entity, dx, dy) {
  if (entity.type === "line") {
    entity.x1 += dx; entity.x2 += dx; entity.y1 += dy; entity.y2 += dy;
  } else if (entity.type === "polyline") {
    entity.points.forEach((point) => { point.x += dx; point.y += dy; });
  } else if (entity.type === "rect") {
    entity.x += dx; entity.y += dy;
  } else if (entity.type === "circle") {
    entity.cx += dx; entity.cy += dy;
  } else if (entity.type === "point") {
    entity.x += dx; entity.y += dy;
  } else if (entity.type === "text") {
    entity.x += dx; entity.y += dy;
  } else if (entity.type === "dimension") {
    if (entity.p1 && entity.p2) {
      entity.p1.x += dx; entity.p1.y += dy; entity.p2.x += dx; entity.p2.y += dy;
    }
    if (entity.center) {
      entity.center.x += dx; entity.center.y += dy;
    }
  }
}

function rotateEntity(entity, center, degrees) {
  const rotate = (point) => rotatePoint(point, center, degrees);
  if (entity.type === "line") {
    Object.assign(entity, {
      ...entity,
      ...pairToLine(rotate({ x: entity.x1, y: entity.y1 }), rotate({ x: entity.x2, y: entity.y2 })),
    });
  } else if (entity.type === "polyline") {
    entity.points = entity.points.map(rotate);
  } else if (entity.type === "rect") {
    const corners = getEndpoints(entity).map(rotate);
    const bounds = getEntityBounds([{ type: "polyline", points: corners }]);
    entity.x = bounds.minX;
    entity.y = bounds.minY;
    entity.width = bounds.maxX - bounds.minX;
    entity.height = bounds.maxY - bounds.minY;
  } else if (entity.type === "circle") {
    const rotated = rotate({ x: entity.cx, y: entity.cy });
    entity.cx = rotated.x;
    entity.cy = rotated.y;
  } else if (entity.type === "point" || entity.type === "text") {
    const rotated = rotate({ x: entity.x, y: entity.y });
    entity.x = rotated.x;
    entity.y = rotated.y;
  } else if (entity.type === "dimension") {
    if (entity.p1) entity.p1 = rotate(entity.p1);
    if (entity.p2) entity.p2 = rotate(entity.p2);
    if (entity.center) entity.center = rotate(entity.center);
  }
}

function scaleEntity(entity, center, factor) {
  const scalePoint = (point) => ({
    x: center.x + (point.x - center.x) * factor,
    y: center.y + (point.y - center.y) * factor,
  });
  if (entity.type === "line") {
    Object.assign(entity, pairToLine(scalePoint({ x: entity.x1, y: entity.y1 }), scalePoint({ x: entity.x2, y: entity.y2 })));
  } else if (entity.type === "polyline") {
    entity.points = entity.points.map(scalePoint);
  } else if (entity.type === "rect") {
    const p1 = scalePoint({ x: entity.x, y: entity.y });
    const p2 = scalePoint({ x: entity.x + entity.width, y: entity.y + entity.height });
    Object.assign(entity, rectFromPoints(p1, p2));
  } else if (entity.type === "circle") {
    const scaledCenter = scalePoint({ x: entity.cx, y: entity.cy });
    entity.cx = scaledCenter.x;
    entity.cy = scaledCenter.y;
    entity.r *= factor;
  } else if (entity.type === "point" || entity.type === "text") {
    const scaled = scalePoint({ x: entity.x, y: entity.y });
    entity.x = scaled.x;
    entity.y = scaled.y;
    if (entity.type === "text") entity.fontSize = Math.max(8, (entity.fontSize || state.defaults.textSize) * factor);
  } else if (entity.type === "dimension") {
    if (entity.p1) entity.p1 = scalePoint(entity.p1);
    if (entity.p2) entity.p2 = scalePoint(entity.p2);
    if (entity.center) entity.center = scalePoint(entity.center);
    if (entity.radius) entity.radius *= factor;
  }
}

function mirrorEntity(entity, center, axis) {
  const mirrorPoint = (point) => axis === "x"
    ? { x: point.x, y: center.y - (point.y - center.y) }
    : { x: center.x - (point.x - center.x), y: point.y };
  if (entity.type === "line") {
    Object.assign(entity, pairToLine(mirrorPoint({ x: entity.x1, y: entity.y1 }), mirrorPoint({ x: entity.x2, y: entity.y2 })));
  } else if (entity.type === "polyline") {
    entity.points = entity.points.map(mirrorPoint);
  } else if (entity.type === "rect") {
    const p1 = mirrorPoint({ x: entity.x, y: entity.y });
    const p2 = mirrorPoint({ x: entity.x + entity.width, y: entity.y + entity.height });
    Object.assign(entity, rectFromPoints(p1, p2));
  } else if (entity.type === "circle") {
    const mirrored = mirrorPoint({ x: entity.cx, y: entity.cy });
    entity.cx = mirrored.x;
    entity.cy = mirrored.y;
  } else if (entity.type === "point" || entity.type === "text") {
    const mirrored = mirrorPoint({ x: entity.x, y: entity.y });
    entity.x = mirrored.x;
    entity.y = mirrored.y;
  } else if (entity.type === "dimension") {
    if (entity.p1) entity.p1 = mirrorPoint(entity.p1);
    if (entity.p2) entity.p2 = mirrorPoint(entity.p2);
    if (entity.center) entity.center = mirrorPoint(entity.center);
  }
}

function createOffsetEntity(entity, amount) {
  if (entity.type === "line") {
    const start = { x: entity.x1, y: entity.y1 };
    const end = { x: entity.x2, y: entity.y2 };
    const normal = normalize({ x: -(end.y - start.y), y: end.x - start.x });
    return {
      ...clone(entity),
      x1: entity.x1 + normal.x * amount,
      y1: entity.y1 + normal.y * amount,
      x2: entity.x2 + normal.x * amount,
      y2: entity.y2 + normal.y * amount,
    };
  }
  if (entity.type === "rect") {
    return {
      ...clone(entity),
      x: entity.x - amount,
      y: entity.y - amount,
      width: Math.max(1, entity.width + amount * 2),
      height: Math.max(1, entity.height + amount * 2),
    };
  }
  if (entity.type === "circle") {
    return {
      ...clone(entity),
      r: Math.max(1, entity.r + amount),
    };
  }
  return null;
}

function getSelectedEntities() {
  return state.selection.map((id) => getEntityById(id)).filter(Boolean);
}

function getEntityById(id) {
  return state.entities.find((entity) => entity.id === id) || null;
}

function getSelectionCenter(entities) {
  const bounds = getEntityBounds(entities);
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

function getEntityBounds(entities) {
  if (!entities.length) {
    return null;
  }
  const points = [];
  for (const entity of entities) {
    if (entity.type === "line") {
      points.push({ x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 });
    } else if (entity.type === "polyline") {
      points.push(...entity.points);
    } else if (entity.type === "rect") {
      points.push({ x: entity.x, y: entity.y }, { x: entity.x + entity.width, y: entity.y + entity.height });
    } else if (entity.type === "circle") {
      points.push({ x: entity.cx - entity.r, y: entity.cy - entity.r }, { x: entity.cx + entity.r, y: entity.cy + entity.r });
    } else if (entity.type === "point" || entity.type === "text") {
      points.push({ x: entity.x, y: entity.y });
    } else if (entity.type === "dimension") {
      if (entity.p1 && entity.p2) {
        points.push(entity.p1, entity.p2);
      }
      if (entity.center) {
        points.push({ x: entity.center.x - entity.radius, y: entity.center.y - entity.radius });
        points.push({ x: entity.center.x + entity.radius, y: entity.center.y + entity.radius });
      }
    }
  }
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function getVisibleWorldBounds() {
  const rect = dom.workspaceViewport.getBoundingClientRect();
  return {
    minX: (0 - state.view.panX) / state.view.zoom,
    minY: (0 - state.view.panY) / state.view.zoom,
    maxX: (rect.width - state.view.panX) / state.view.zoom,
    maxY: (rect.height - state.view.panY) / state.view.zoom,
  };
}

function screenToWorld(clientX, clientY) {
  const rect = dom.workspaceViewport.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.view.panX) / state.view.zoom,
    y: (clientY - rect.top - state.view.panY) / state.view.zoom,
  };
}

function worldToScreen(point) {
  const rect = dom.workspaceViewport.getBoundingClientRect();
  return {
    x: rect.left + state.view.panX + point.x * state.view.zoom,
    y: rect.top + state.view.panY + point.y * state.view.zoom,
  };
}

function resizeCanvasArtifacts() {
  const rect = dom.workspaceViewport.getBoundingClientRect();
  dom.topRuler.width = Math.max(1, Math.floor(rect.width));
  dom.leftRuler.height = Math.max(1, Math.floor(rect.height));
}

function getViewportCenter() {
  const rect = dom.workspaceViewport.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function rectFromPoints(p1, p2) {
  return {
    type: "rect",
    x: Math.min(p1.x, p2.x),
    y: Math.min(p1.y, p2.y),
    width: Math.abs(p2.x - p1.x),
    height: Math.abs(p2.y - p1.y),
  };
}

function createSvg(tag, attributes, textContent = "") {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      node.setAttribute(key, String(value));
    }
  });
  if (textContent) {
    node.textContent = textContent;
  }
  return node;
}

function createLineEntity(p1, p2) {
  return withCurrentStrokeStyle({
    type: "line",
    x1: p1.x,
    y1: p1.y,
    x2: p2.x,
    y2: p2.y,
  });
}

function withCurrentStrokeStyle(entity) {
  return {
    ...entity,
    stroke: entity.stroke ?? state.defaults.stroke,
    strokeWidth: entity.strokeWidth ?? state.defaults.strokeWidth,
    lineType: supportsLineType(entity) ? (entity.lineType ?? state.defaults.lineType) : entity.lineType,
  };
}

function supportsLineType(entity) {
  return ["line", "polyline", "rect", "circle"].includes(entity.type);
}

function dashArrayForLineType(lineType) {
  const map = {
    solid: null,
    dashed: "18 10",
    dotted: "3 8",
    dashdot: "18 8 3 8",
  };
  return map[lineType] ?? null;
}

function setStatus(message) {
  state.message = message;
}

function measureAngleBetween(first, second) {
  const lineA = lineVector(first);
  const lineB = lineVector(second);
  if (!lineA || !lineB) {
    return null;
  }
  const dot = lineA.x * lineB.x + lineA.y * lineB.y;
  const mag = Math.hypot(lineA.x, lineA.y) * Math.hypot(lineB.x, lineB.y);
  if (!mag) {
    return null;
  }
  const angle = Math.acos(clamp(dot / mag, -1, 1)) * (180 / Math.PI);
  return angle;
}

function lineVector(entity) {
  if (entity.type === "line") {
    return { x: entity.x2 - entity.x1, y: entity.y2 - entity.y1 };
  }
  if (entity.type === "polyline" && entity.points.length >= 2) {
    return { x: entity.points[1].x - entity.points[0].x, y: entity.points[1].y - entity.points[0].y };
  }
  return null;
}

function lineIntersection(a, b) {
  return intersectLines(a, b, true);
}

function infiniteLineIntersection(a, b) {
  return intersectLines(a, b, false);
}

function intersectLines(a, b, segmentOnly) {
  const x1 = a.x1; const y1 = a.y1; const x2 = a.x2; const y2 = a.y2;
  const x3 = b.x1; const y3 = b.y1; const x4 = b.x2; const y4 = b.y2;
  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denominator) < 1e-6) {
    return null;
  }
  const px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denominator;
  const py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denominator;
  const point = { x: px, y: py };
  if (segmentOnly && (!pointOnSegment(point, { x: x1, y: y1 }, { x: x2, y: y2 }) || !pointOnSegment(point, { x: x3, y: y3 }, { x: x4, y: y4 }))) {
    return null;
  }
  return point;
}

function pointOnSegment(point, start, end) {
  const minX = Math.min(start.x, end.x) - 1e-6;
  const maxX = Math.max(start.x, end.x) + 1e-6;
  const minY = Math.min(start.y, end.y) - 1e-6;
  const maxY = Math.max(start.y, end.y) + 1e-6;
  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
}

function getEntitySegments(entity) {
  if (entity.type === "line") {
    return [{ start: { x: entity.x1, y: entity.y1 }, end: { x: entity.x2, y: entity.y2 } }];
  }
  if (entity.type === "polyline") {
    return entity.points.slice(0, -1).map((point, index) => ({
      start: point,
      end: entity.points[index + 1],
    }));
  }
  if (entity.type === "rect") {
    const corners = [
      { x: entity.x, y: entity.y },
      { x: entity.x + entity.width, y: entity.y },
      { x: entity.x + entity.width, y: entity.y + entity.height },
      { x: entity.x, y: entity.y + entity.height },
    ];
    return corners.map((corner, index) => ({
      start: corner,
      end: corners[(index + 1) % corners.length],
    }));
  }
  return [];
}

function uniquePoints(points) {
  const seen = new Set();
  return points.filter((point) => {
    const key = `${point.x.toFixed(4)}:${point.y.toFixed(4)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function pointToSegmentDistance(point, start, end) {
  const l2 = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  if (l2 === 0) {
    return distance(point, start);
  }
  const t = clamp(((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) / l2, 0, 1);
  const projection = {
    x: start.x + t * (end.x - start.x),
    y: start.y + t * (end.y - start.y),
  };
  return distance(point, projection);
}

function pointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function rotatePoint(point, center, degrees) {
  const radians = degrees * (Math.PI / 180);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function pairToLine(p1, p2) {
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function pointAtDistance(anchor, target, length, reverse) {
  const direction = normalize({
    x: target.x - anchor.x,
    y: target.y - anchor.y,
  });
  const fallback = (direction.x || direction.y) ? direction : { x: 1, y: 0 };
  const sign = reverse ? -1 : 1;
  return {
    x: anchor.x + fallback.x * length * sign,
    y: anchor.y + fallback.y * length * sign,
  };
}

function parsePositiveValue(value) {
  const numeric = Number(String(value).replace(",", "."));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cloneEntityWithOffset(entity, dx, dy) {
  const copy = clone(entity);
  translateEntity(copy, dx, dy);
  return copy;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatPoint(point) {
  return `${formatNumber(point.x)}, ${formatNumber(point.y)} ${state.defaults.units}`;
}

function formatNumber(value) {
  return Number(value).toFixed(1).replace(/\.0$/, "");
}

function safeFileName(name) {
  return name.replace(/[\\/:*?"<>|]+/g, "_");
}

function createSheet(id, name, entities = [], selection = []) {
  return {
    id,
    name,
    entities,
    selection,
  };
}

function getActiveSheet() {
  normalizeSheets();
  return state.sheets.find((sheet) => sheet.id === state.activeSheetId) || state.sheets[0];
}

function normalizeSheets() {
  if (!Array.isArray(state.sheets) || !state.sheets.length) {
    state.sheets = [createSheet(1, "Лист 1")];
    state.activeSheetId = 1;
  }
  for (const [index, sheet] of state.sheets.entries()) {
    if (!Array.isArray(sheet.entities)) {
      sheet.entities = [];
    }
    if (!Array.isArray(sheet.selection)) {
      sheet.selection = [];
    }
    sheet.entities = sheet.entities.map((entity) => supportsLineType(entity)
      ? { ...entity, lineType: entity.lineType || state.defaults.lineType || "solid" }
      : entity);
    if (!sheet.name) {
      sheet.name = `Лист ${index + 1}`;
    }
    if (sheet.id === undefined || sheet.id === null) {
      sheet.id = index + 1;
    }
  }
  if (!state.sheets.some((sheet) => sheet.id === state.activeSheetId)) {
    state.activeSheetId = state.sheets[0].id;
  }
}

function inferNextEntityId(sheets) {
  const maxId = Math.max(0, ...sheets.flatMap((sheet) => sheet.entities.map((entity) => entity.id || 0)));
  return maxId + 1;
}

function inferNextSheetId(sheets) {
  const maxId = Math.max(0, ...sheets.map((sheet) => sheet.id || 0));
  return maxId + 1;
}

function sanitizeSheetName(name, fallback) {
  const trimmed = String(name || "").trim();
  return trimmed || fallback;
}

init();
