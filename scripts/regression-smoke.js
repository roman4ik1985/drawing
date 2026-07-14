"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { execFileSync, spawn } = require("child_process");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (error) {
  console.error("Playwright is required. Set NODE_PATH to an environment that provides it.");
  process.exit(2);
}

const ROOT = path.resolve(__dirname, "..");
const HOST = "127.0.0.1";
const PYTHON = process.env.PYTHON || "python";

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
};

function serveFile(filePath, response) {
  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, { "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream" });
    response.end(buffer);
  });
}

function startServer() {
  const server = http.createServer((request, response) => {
    const rawPath = new URL(request.url, `http://${HOST}`).pathname;
    const relativePath = rawPath === "/" ? "/index.html" : rawPath;
    const filePath = path.normalize(path.join(ROOT, relativePath));
    if (!filePath.startsWith(ROOT)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    serveFile(filePath, response);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, () => resolve(server));
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runLoggerSmoke() {
  const tempLogPath = path.join(os.tmpdir(), `drawing-log-smoke-${Date.now()}.md`);
  fs.writeFileSync(tempLogPath, "", "utf8");
  try {
    execFileSync("powershell", [
      "-ExecutionPolicy", "Bypass",
      "-File", path.join(ROOT, "scripts", "append-wiki-log.ps1"),
      "-Type", "query",
      "-Files", "scripts/append-wiki-log.ps1",
      "-Summary", "logger smoke",
      "-LogPath", tempLogPath,
    ], { cwd: ROOT, stdio: "pipe" });
    const content = fs.readFileSync(tempLogPath, "utf8");
    assert(content.includes("logger smoke"), "Logger did not write to the requested log path.");
  } finally {
    fs.rmSync(tempLogPath, { force: true });
  }
}

async function waitForHealth(url, attempts = 20) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const payload = await fetchJson(`${url}/health`);
      if (payload && typeof payload.available === "boolean") {
        return payload;
      }
    } catch (error) {
      // wait for backend to come up
    }
    await wait(250);
  }
  throw new Error(`Backend did not become healthy: ${url}`);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
  });
}

function startMockBackend() {
  const mockConfig = JSON.parse(fs.readFileSync(path.join(ROOT, "backend", "dwg-service.mock.json"), "utf8"));
  mockConfig.port = 18765;
  mockConfig.converter.command_template[0] = PYTHON;
  const configPath = path.join(os.tmpdir(), `drawing-dwg-smoke-${Date.now()}.json`);
  fs.writeFileSync(configPath, JSON.stringify(mockConfig, null, 2), "utf8");

  const child = spawn(PYTHON, [path.join(ROOT, "backend", "dwg_service.py"), "--config", configPath], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  return {
    url: `http://${HOST}:${mockConfig.port}`,
    configPath,
    child,
    async ready() {
      try {
        await waitForHealth(this.url);
      } catch (error) {
        cleanupProcess(child);
        throw error;
      }
    },
    cleanup() {
      cleanupProcess(child);
      fs.rmSync(configPath, { force: true });
    },
  };
}

function cleanupProcess(child) {
  if (!child || child.killed) {
    return;
  }
  child.kill("SIGTERM");
}

function buildImportPayload() {
  return {
    documentName: "Smoke Import",
    sheets: [
      {
        id: 1,
        name: "Alpha",
        entities: [
          {
            id: 1,
            type: "line",
            x1: 10,
            y1: 20,
            x2: 120,
            y2: 60,
            stroke: "#1f2937",
            strokeWidth: 2,
            lineType: "solid",
          },
        ],
        selection: [],
      },
      {
        id: 2,
        name: "Beta",
        entities: [
          {
            id: 2,
            type: "circle",
            cx: 80,
            cy: 80,
            r: 24,
            stroke: "#0f766e",
            strokeWidth: 2,
            lineType: "dashed",
          },
        ],
        selection: [],
      },
    ],
    activeSheetId: 2,
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
    snap: {
      grid: true,
      end: true,
      mid: true,
      intersection: true,
      center: true,
      ortho: false,
    },
    nextId: 3,
    nextSheetId: 3,
  };
}

async function expectDownload(page, action, assertion) {
  const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
  await action();
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  await assertion({
    suggestedFilename: download.suggestedFilename(),
    failure: await download.failure(),
    content: downloadedPath ? fs.readFileSync(downloadedPath, "utf8") : "",
  });
}

async function runUiScenarios(page, backendUrl) {
  const importPath = path.join(os.tmpdir(), `drawing-import-smoke-${Date.now()}.json`);
  fs.writeFileSync(importPath, JSON.stringify(buildImportPayload(), null, 2), "utf8");
  try {
    await page.waitForFunction(() => document.querySelector("#dwgBackendStatus")?.textContent !== "проверка...");

    const offline = await page.evaluate(() => {
      openSaveAsDialog();
      const dwgOption = [...document.getElementById("saveAsFormatSelect").options].find((option) => option.value === "dwg");
      const result = {
        exportDisabled: document.querySelector('[data-command="export-dwg"]').disabled,
        dwgOptionDisabled: dwgOption?.disabled ?? null,
        hint: document.getElementById("saveAsHint").textContent,
      };
      document.getElementById("saveAsDialog").close();
      return result;
    });
    assert(offline.exportDisabled === true, "DWG export should be disabled while backend is offline.");
    assert(offline.dwgOptionDisabled === true, "DWG option should be disabled in Save As while backend is offline.");

    await page.locator("#fileInput").setInputFiles(importPath);
    await page.waitForFunction(() => document.getElementById("documentTitle").textContent.includes("Smoke Import"));

    const imported = await page.evaluate(() => ({
      title: document.getElementById("documentTitle").textContent,
      tabs: [...document.querySelectorAll("#sheetTabs .sheet-tab")].map((node) => node.textContent.trim()),
      activeTab: document.querySelector("#sheetTabs .sheet-tab.active")?.textContent?.trim() || "",
      entityCount: document.querySelectorAll("#entityLayer > *").length,
      stats: document.getElementById("documentStats").textContent,
    }));
    assert(imported.title.includes("Smoke Import"), "Imported document title did not update.");
    assert(imported.tabs.join("|") === "Alpha|Beta", "Imported sheet tabs do not match payload.");
    assert(imported.activeTab === "Beta", "Imported active sheet should be Beta.");
    assert(imported.entityCount === 1, "Imported active sheet should render one entity.");

    await expectDownload(
      page,
      () => page.evaluate(() => downloadJson("smoke-json")),
      async (download) => {
        assert(download.failure === null, "JSON save download failed.");
        assert(download.suggestedFilename === "smoke-json.json", "Unexpected JSON filename.");
        const payload = JSON.parse(download.content);
        assert(payload.documentName === "Smoke Import", "Saved JSON document name mismatch.");
        assert(payload.sheets.length === 2, "Saved JSON should preserve both sheets.");
        assert(payload.activeSheetId === 2, "Saved JSON should preserve active sheet.");
      },
    );

    await page.evaluate(() => {
      openSaveAsDialog();
      document.getElementById("saveAsNameInput").value = "smoke-svg";
      document.getElementById("saveAsFormatSelect").value = "svg";
      updateSaveAsHint();
      document.getElementById("saveAsForm").requestSubmit();
    });
    const svgDownload = await page.waitForEvent("download", { timeout: 15000 });
    const svgPath = await svgDownload.path();
    const svgContent = svgPath ? fs.readFileSync(svgPath, "utf8") : "";
    assert(await svgDownload.failure() === null, "SVG save-as download failed.");
    assert(svgDownload.suggestedFilename() === "smoke-svg.svg", "Unexpected SVG filename.");
    assert(svgContent.includes("<svg"), "SVG export did not contain SVG markup.");

    await page.evaluate(() => togglePrintPreview(true));
    await page.waitForSelector("#printPreviewHost .print-page svg");
    const printState = await page.evaluate(() => ({
      panelHidden: document.getElementById("printPreviewPanel").classList.contains("hidden"),
      viewportClass: document.getElementById("workspaceViewport").classList.contains("print-preview-active"),
      pageCount: document.querySelectorAll("#printPreviewHost .print-page").length,
    }));
    assert(printState.panelHidden === false, "Print preview panel should be visible.");
    assert(printState.viewportClass === true, "Workspace should switch into print preview mode.");
    assert(printState.pageCount === 1, "Print preview should render one page.");
    await page.evaluate(() => togglePrintPreview(false));

    const backendOk = await page.evaluate(async (url) => {
      state.dwgBackend.url = url;
      return checkDwgBackend();
    }, backendUrl);
    assert(backendOk === true, "Mock backend should become available inside the app.");

    const online = await page.evaluate(() => {
      openSaveAsDialog();
      const dwgOption = [...document.getElementById("saveAsFormatSelect").options].find((option) => option.value === "dwg");
      const result = {
        exportDisabled: document.querySelector('[data-command="export-dwg"]').disabled,
        dwgOptionDisabled: dwgOption?.disabled ?? null,
        status: document.getElementById("dwgBackendStatus").textContent,
      };
      document.getElementById("saveAsDialog").close();
      return result;
    });
    assert(online.exportDisabled === false, "DWG export should be enabled while backend is online.");
    assert(online.dwgOptionDisabled === false, "DWG option should be enabled in Save As while backend is online.");
    assert(online.status === "готов", "Backend status should be ready.");

    await expectDownload(
      page,
      () => page.evaluate(() => exportDwg("smoke-dwg")),
      async (download) => {
        assert(download.failure === null, "DWG export download failed.");
        assert(download.suggestedFilename === "smoke-dwg.dwg", "Unexpected DWG filename.");
      },
    );
  } finally {
    fs.rmSync(importPath, { force: true });
  }
}

async function runGeometrySmoke(page) {
  const result = await page.evaluate(() => {
    const rotatedRect = {
      type: "rect",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      stroke: "#000000",
      strokeWidth: 2,
      lineType: "solid",
    };
    rotateEntity(rotatedRect, { x: 50, y: 25 }, 45);

    const extendInside = getLineExtensionEnd(
      { x1: 0, y1: 0, x2: 10, y2: 0 },
      { x: 5, y: 0 },
    );
    const extendStart = getLineExtensionEnd(
      { x1: 0, y1: 0, x2: 10, y2: 0 },
      { x: -5, y: 0 },
    );
    const extendEnd = getLineExtensionEnd(
      { x1: 0, y1: 0, x2: 10, y2: 0 },
      { x: 15, y: 0 },
    );

    const fakeDoc = document.implementation.createHTMLDocument("");
    const svgMarkup = buildExportSvgDocument().svgMarkup;
    populatePrintDocument(fakeDoc, "<img src=x onerror=1>", svgMarkup, 125);

    return {
      rectType: rotatedRect.type,
      rectPoints: rotatedRect.points?.length || 0,
      rectUniquePoints: new Set((rotatedRect.points || []).map((point) => `${point.x.toFixed(4)}:${point.y.toFixed(4)}`)).size,
      rectHasBoxFields: ["x", "y", "width", "height"].some((key) => Object.hasOwn(rotatedRect, key)),
      extendInside,
      extendStart,
      extendEnd,
      printTitle: fakeDoc.title,
      printSvgCount: fakeDoc.body.querySelectorAll("svg").length,
      printHasInjectedImg: Boolean(fakeDoc.querySelector("img")),
      printHasScript: Boolean(fakeDoc.querySelector("script")),
    };
  });

  assert(result.rectType === "polyline", "Rotated rect should become a polyline.");
  assert(result.rectPoints === 5, "Rotated rect should keep a closed polyline.");
  assert(result.rectUniquePoints === 4, "Rotated rect should keep four unique corners.");
  assert(result.rectHasBoxFields === false, "Rotated rect should not keep stale rect box fields.");
  assert(result.extendInside === null, "Intersection inside the segment must not extend the line.");
  assert(result.extendStart === "start", "Intersection before the first point must extend the start.");
  assert(result.extendEnd === "end", "Intersection after the last point must extend the end.");
  assert(result.printTitle === "<img src=x onerror=1>", "Print title should remain literal text.");
  assert(result.printSvgCount === 1, "Print document should contain one SVG.");
  assert(result.printHasInjectedImg === false, "Print document must not inject HTML from documentName.");
  assert(result.printHasScript === false, "Print document must not inject scripts.");
}

async function runBrowserSmoke(baseUrl) {
  const backend = startMockBackend();
  await backend.ready();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const messages = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      messages.push(`${message.type()}:${message.text()}`);
    }
  });
  page.on("pageerror", (error) => messages.push(`pageerror:${error.message}`));

  try {
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
    await page.waitForSelector("#drawingSurface");
    await runGeometrySmoke(page);
    await runUiScenarios(page, backend.url);
    const unexpectedMessages = messages.filter((message) => !message.includes("net::ERR_CONNECTION_REFUSED"));
    assert(unexpectedMessages.length === 0, `Unexpected browser errors: ${unexpectedMessages.join(" | ")}`);
  } finally {
    await browser.close();
    backend.cleanup();
  }
}

async function main() {
  runLoggerSmoke();
  const server = await startServer();
  try {
    const address = server.address();
    await runBrowserSmoke(`http://${HOST}:${address.port}`);
    console.log("regression smoke passed");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
