import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MES_STATUS_CONTRACTS } from "../src/mes_contracts.js";
import {
  getProductionStructureEmployees,
  getProductionStructureResources,
} from "../src/production_structure_service.js";

const defaultUrl = new URL("/?qa=state-consistency", process.env.MES_QA_URL || "http://localhost:4174/").toString();
const statusValuesByScope = MES_STATUS_CONTRACTS.reduce((acc, status) => {
  if (!acc[status.scope]) acc[status.scope] = [];
  acc[status.scope].push(status.value);
  return acc;
}, {});
const matrixResourceIds = getProductionStructureResources().map((resource) => resource.id).filter(Boolean);
const matrixEmployeeIds = getProductionStructureEmployees().map((employee) => employee.id).filter(Boolean);

function getArg(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function findChrome() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new Error("Chrome/Chromium executable was not found in /Applications.");
}

async function getFreePort() {
  const net = await import("node:net");
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForJson(url, options = {}, timeoutMs = 10000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return await response.json();
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await delay(120);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
  constructor(webSocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => this.onMessage(event));
  }

  onMessage(event) {
    const message = JSON.parse(event.data);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || "CDP error"));
      else resolve(message.result);
      return;
    }
    if (message.method && this.listeners.has(message.method)) {
      this.listeners.get(message.method).forEach((listener) => listener(message.params || {}));
    }
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(listener);
  }

  async send(method, params = {}, timeoutMs = 15000) {
    await this.ready;
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, pageFunction, arg, timeoutMs = 45000) {
  const source = typeof pageFunction === "function" ? pageFunction.toString() : pageFunction;
  const expression = arg === undefined ? `(${source})()` : `(${source})(${JSON.stringify(arg)})`;
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, timeoutMs);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result?.value;
}

async function waitForApp(client) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 12000) {
    const ok = await evaluate(client, () => Boolean(document.querySelector("main.app-shell")));
    if (ok) return;
    await delay(120);
  }
  throw new Error("App shell did not render.");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertRuntimeFactQuantityNormalizers() {
  const source = await readFile("src/app.js", "utf8");
  const forbiddenPatterns = [
    {
      pattern: /\bactualQuantity\s*:\s*normalizeQuantity\s*\(/,
      message: "actualQuantity must use a zero-safe fact normalizer, not normalizeQuantity().",
    },
    {
      pattern: /\bdefectQuantity\s*:\s*normalizeQuantity\s*\(/,
      message: "defectQuantity must use a zero-safe fact normalizer, not normalizeQuantity().",
    },
    {
      pattern: /\bconst\s+actualQuantity\s*=\s*normalizeQuantity\s*\(/,
      message: "local actualQuantity must use a zero-safe fact normalizer, not normalizeQuantity().",
    },
    {
      pattern: /\bconst\s+defectQuantity\s*=\s*normalizeQuantity\s*\(/,
      message: "local defectQuantity must use a zero-safe fact normalizer, not normalizeQuantity().",
    },
    {
      pattern: /normalizeQuantity\s*\(\s*fact\??\.\s*actualQuantity/,
      message: "fact.actualQuantity must not go through normalizeQuantity().",
    },
    {
      pattern: /normalizeQuantity\s*\(\s*fact\??\.\s*defectQuantity/,
      message: "fact.defectQuantity must not go through normalizeQuantity().",
    },
  ];
  const failures = forbiddenPatterns
    .filter((entry) => entry.pattern.test(source))
    .map((entry) => `- ${entry.message}`);
  assert(!failures.length, `Unsafe fact quantity normalization found:\n${failures.join("\n")}`);

  const durationFunctionStart = source.indexOf("function calculateRequiredDurationMs(");
  const durationFunctionEnd = source.indexOf("function calculatePlannedEndByQuantity(", durationFunctionStart);
  const durationFunctionSource = durationFunctionStart >= 0 && durationFunctionEnd > durationFunctionStart
    ? source.slice(durationFunctionStart, durationFunctionEnd)
    : "";
  assert(durationFunctionSource, "calculateRequiredDurationMs() was not found for labor-source precedence QA.");
  const workOrderIndex = durationFunctionSource.indexOf("calculatePlanningOrderLaborDurationMs");
  const componentIndex = durationFunctionSource.indexOf("calculateSmtOperationDurationMs");
  const manualIndex = durationFunctionSource.indexOf("calculateManualLaborDurationMs");
  const normativeIndex = durationFunctionSource.indexOf("calculateNormativeSerialDurationMs");
  const rateIndex = durationFunctionSource.indexOf("calculateRateDurationMs");
  assert(workOrderIndex >= 0, "Gantt duration must read work-order labor before fallback calculators.");
  [componentIndex, manualIndex, normativeIndex, rateIndex]
    .filter((index) => index >= 0)
    .forEach((fallbackIndex) => {
      assert(workOrderIndex < fallbackIndex, "Work-order labor must have higher priority than SMT/manual/normative/rate fallback duration.");
    });
}

async function launchChrome() {
  const chromePath = await findChrome();
  const port = await getFreePort();
  const profileDir = await mkdtemp(join(tmpdir(), "mes-state-consistency-"));
  const child = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ], { stdio: "ignore" });
  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const target = await waitForJson(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    const client = new CdpClient(target.webSocketDebuggerUrl);
    return { child, client, profileDir };
  } catch (error) {
    child.kill("SIGTERM");
    await rm(profileDir, { recursive: true, force: true });
    throw error;
  }
}

async function cleanupChrome(chrome) {
  try {
    chrome.client.close();
  } catch {
    // Browser may already be closed.
  }
  if (chrome.child.exitCode === null && !chrome.child.killed) chrome.child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (chrome.child.exitCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, 1200);
    chrome.child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  await rm(chrome.profileDir, { recursive: true, force: true }).catch(() => {});
}

function summarizeIssues(issues) {
  return issues.slice(0, 40).map((issue) => `- ${issue}`).join("\n");
}

async function main() {
  const url = getArg("--url", defaultUrl);
  await assertRuntimeFactQuantityNormalizers();
  const chrome = await launchChrome();
  const consoleProblems = [];
  const dialogs = [];
  try {
    const { client } = chrome;
    client.on("Runtime.consoleAPICalled", (params) => {
      if (!["error", "warning", "assert"].includes(params.type)) return;
      consoleProblems.push({
        type: params.type,
        args: (params.args || []).map((arg) => arg.value || arg.description || "").join(" "),
      });
    });
    client.on("Runtime.exceptionThrown", (params) => {
      consoleProblems.push({
        type: "exception",
        args: params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || "",
      });
    });
    client.on("Page.javascriptDialogOpening", (params) => {
      dialogs.push(params.message || params.type || "dialog");
      client.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
    });
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: "sessionStorage.setItem('mes-planning-prototype-shared-disabled-until-v1', String(Date.now() + 60 * 60 * 1000));",
    });
    await client.send("Page.navigate", { url });
    await delay(900);
    await waitForApp(client);

    const report = await evaluate(client, ({ statusContracts, matrixResourceIds, matrixEmployeeIds }) => {
      const state = JSON.parse(localStorage.getItem("mes-planning-prototype-state-v2") || "{}");
      const directory = JSON.parse(localStorage.getItem("mes-planning-prototype-directories-v2") || "{}");
      const errors = [];
      const warnings = [];
      const routeIds = new Set((state.routes || []).map((route) => route.id));
      const routeById = new Map((state.routes || []).map((route) => [route.id, route]));
      const stepById = new Map((state.routeSteps || []).map((step) => [step.id, step]));
      const stepIds = new Set(stepById.keys());
      const slotIds = new Set((state.slots || []).map((slot) => slot.id).filter(Boolean));
      const workCenterIds = new Set((state.workCenters || []).map((center) => center.id));
      const operationIds = new Set((directory.operationMap || []).map((operation) => operation.id));
      const resourceIds = new Set(matrixResourceIds || []);
      const employeeIds = new Set(matrixEmployeeIds || []);
      const allowedSlotStatuses = new Set(statusContracts.ganttSlot || []);
      const allowedWorkOrderPlanningStatuses = new Set(statusContracts.workOrderPlanning || []);
      const allowedLaborModes = new Set(["calculator", "fixed", "unit", "panel", "shift"]);
      const allowedAssignmentStatuses = new Set(statusContracts.shiftAssignment || []);
      const allowedFactStatuses = new Set(statusContracts.dispatchFact || []);
      const getSlotPlanningOrderId = (slot, step) => slot?.planningOrderId || slot?.routeId || step?.routeId || slot?.batchId || "";

      (state.routeSteps || []).forEach((step) => {
        if (!routeIds.has(step.routeId)) errors.push(`routeStep ${step.id} points to missing route ${step.routeId}`);
        if (step.operationId && !operationIds.has(step.operationId)) errors.push(`routeStep ${step.id} points to missing operation ${step.operationId}`);
        if (step.workCenterId && !workCenterIds.has(step.workCenterId)) errors.push(`routeStep ${step.id} points to missing workCenter ${step.workCenterId}`);
        if (step.resourceId && !resourceIds.has(step.resourceId)) errors.push(`routeStep ${step.id} points to resource outside matrix ${step.resourceId}`);
      });

      (state.routes || []).forEach((route) => {
        const routePlanningStatus = String(route.planningStatus || "");
        if (!allowedWorkOrderPlanningStatuses.has(routePlanningStatus)) {
          errors.push(`route ${route.id} has invalid workOrderPlanning status ${routePlanningStatus || "empty"}`);
        }
        Object.entries(route.planningLaborByStepId || {}).forEach(([stepId, labor]) => {
          if (!stepIds.has(stepId)) errors.push(`route ${route.id} stores planning labor for missing routeStep ${stepId}`);
          const mode = String(labor?.mode || "");
          if (mode && !allowedLaborModes.has(mode)) errors.push(`route ${route.id} stores invalid planning labor mode ${mode} for routeStep ${stepId}`);
          if (mode === "unit" && Number(labor?.minutesPerUnit || 0) <= 0) errors.push(`route ${route.id} stores unit labor without minutesPerUnit for routeStep ${stepId}`);
          if (mode === "panel" && Number(labor?.minutesPerPanel || 0) <= 0) errors.push(`route ${route.id} stores panel labor without minutesPerPanel for routeStep ${stepId}`);
          if (mode === "fixed" && Number(labor?.fixedMinutes || 0) <= 0) errors.push(`route ${route.id} stores fixed labor without fixedMinutes for routeStep ${stepId}`);
          if (mode === "shift" && Number(labor?.shiftQuantity || 0) <= 0) errors.push(`route ${route.id} stores shift labor without shiftQuantity for routeStep ${stepId}`);
        });
      });

      (state.slots || []).forEach((slot) => {
        const step = stepById.get(slot.routeStepId);
        const planningOrderId = getSlotPlanningOrderId(slot, step);
        const planningOrder = routeById.get(planningOrderId);
        const start = Date.parse(slot.plannedStart || "");
        const end = Date.parse(slot.plannedEnd || "");
        const slotStatus = String(slot.status || "");
        if (!allowedSlotStatuses.has(slotStatus)) errors.push(`slot ${slot.id} has invalid ganttSlot status ${slotStatus || "empty"}`);
        if (!stepIds.has(slot.routeStepId)) errors.push(`slot ${slot.id} points to missing routeStep ${slot.routeStepId}`);
        if (!planningOrder) errors.push(`slot ${slot.id} points to missing planning order ${planningOrderId}`);
        if (slot.workCenterId && !workCenterIds.has(slot.workCenterId)) errors.push(`slot ${slot.id} points to missing workCenter ${slot.workCenterId}`);
        if (slot.resourceId && !resourceIds.has(slot.resourceId)) errors.push(`slot ${slot.id} points to resource outside matrix ${slot.resourceId}`);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) errors.push(`slot ${slot.id} has invalid planned window`);
        if ((slotStatus || "planned") !== "completed" && slot.routeStepId && slot.planningLaborSource !== "work_order") {
          errors.push(`slot ${slot.id} is planned without work-order labor source`);
        }
        if (slot.planningLaborSource === "work_order") {
          if (!planningOrder?.planningLaborByStepId?.[slot.routeStepId]) errors.push(`slot ${slot.id} uses work-order labor without route planning labor setting`);
          if (!allowedLaborModes.has(slot.planningLaborMode)) errors.push(`slot ${slot.id} has invalid planning labor mode ${slot.planningLaborMode}`);
          if (slot.planningLaborMode !== "calculator" && Number(slot.planningLaborDurationMs || 0) <= 0) errors.push(`slot ${slot.id} has work-order labor without duration`);
          if (slot.planningLaborMode === "unit" && Number(slot.planningLaborMinutesPerUnit || 0) <= 0) errors.push(`slot ${slot.id} has unit labor without minutesPerUnit`);
          if (slot.planningLaborMode === "panel" && Number(slot.planningLaborMinutesPerPanel || 0) <= 0) errors.push(`slot ${slot.id} has panel labor without minutesPerPanel`);
          if (slot.planningLaborMode === "fixed" && Number(slot.planningLaborFixedMinutes || 0) <= 0) errors.push(`slot ${slot.id} has fixed labor without fixedMinutes`);
          if (slot.planningLaborMode === "shift" && Number(slot.planningLaborShiftQuantity || 0) <= 0) errors.push(`slot ${slot.id} has shift labor without shiftQuantity`);
          if (slot.planningLaborMode === "shift" && Number(slot.planningLaborShiftMs || 0) <= 0) errors.push(`slot ${slot.id} has shift labor without matrix/calendar shift duration`);
        }
      });

      Object.entries(state.shiftMasterAssignments || {}).forEach(([key, assignment]) => {
        const baseSlotId = String(assignment?.slotId || "").split("::")[0] || assignment?.slotId;
        if (!assignment?.slotId) errors.push(`shift assignment ${key} has no slotId`);
        if (assignment?.slotId && !slotIds.has(assignment.slotId) && !slotIds.has(baseSlotId)) errors.push(`shift assignment ${key} points to missing slot ${assignment.slotId}`);
        if (!allowedAssignmentStatuses.has(assignment?.status || "")) errors.push(`shift assignment ${key} has invalid status ${assignment?.status}`);
        if (assignment?.workCenterId && !workCenterIds.has(assignment.workCenterId)) errors.push(`shift assignment ${key} points to missing workCenter ${assignment.workCenterId}`);
        if (assignment?.resourceId && !resourceIds.has(assignment.resourceId)) warnings.push(`shift assignment ${key} points to resource outside matrix ${assignment.resourceId}`);
        const executorIds = (assignment?.executors || []).map((executor) => executor.employeeId).filter(Boolean);
        const uniqueExecutorIds = new Set(executorIds);
        if (executorIds.length !== uniqueExecutorIds.size) errors.push(`shift assignment ${key} has duplicate executors`);
        executorIds.forEach((employeeId) => {
          if (!employeeIds.has(employeeId)) errors.push(`shift assignment ${key} points to employee outside matrix ${employeeId}`);
        });
        if (Number(assignment?.defectQuantity || 0) > Number(assignment?.actualQuantity || 0)) errors.push(`shift assignment ${key} has defectQuantity > actualQuantity`);
      });

      Object.entries(state.dispatchFacts || {}).forEach(([key, fact]) => {
        const baseSlotId = String(fact?.slotId || "").split("::")[0] || fact?.slotId;
        if (!fact?.slotId) errors.push(`dispatch fact ${key} has no slotId`);
        if (fact?.slotId && !slotIds.has(fact.slotId) && !slotIds.has(baseSlotId)) errors.push(`dispatch fact ${key} points to missing slot ${fact.slotId}`);
        if (!allowedFactStatuses.has(fact?.status || "")) errors.push(`dispatch fact ${key} has invalid status ${fact?.status}`);
        if (Number(fact?.defectQuantity || 0) > Number(fact?.actualQuantity || 0)) errors.push(`dispatch fact ${key} has defectQuantity > actualQuantity`);
      });

      Object.entries(state.planningCorrections || {}).forEach(([key, correction]) => {
        const baseSlotId = String(correction?.slotId || "").split("::")[0] || correction?.slotId;
        if (!correction?.slotId) errors.push(`planning correction ${key} has no slotId`);
        if (correction?.slotId && !slotIds.has(correction.slotId) && !slotIds.has(baseSlotId)) errors.push(`planning correction ${key} points to missing slot ${correction.slotId}`);
        if (Number(correction?.defectQuantity || 0) > Number(correction?.actualQuantity || 0)) errors.push(`planning correction ${key} has defectQuantity > actualQuantity`);
      });

      (directory.statuses || []).forEach((row) => {
        const id = String(row?.id || "");
        const scope = String(row?.contractScope || "");
        const code = String(row?.code || "");
        if (id === "route-planned" || id.startsWith("project-") || id.startsWith("supply-ui-") || id.startsWith("warehouse-movement-")) {
          errors.push(`directory status ${id} should be removed by normalizer`);
        }
        if (scope && code && Array.isArray(statusContracts[scope]) && !statusContracts[scope].includes(code)) {
          errors.push(`directory status ${id || code} has invalid contract ${scope}:${code}`);
        }
      });

      return {
        counts: {
          routes: (state.routes || []).length,
          routeSteps: (state.routeSteps || []).length,
          slots: (state.slots || []).length,
          assignments: Object.keys(state.shiftMasterAssignments || {}).length,
          facts: Object.keys(state.dispatchFacts || {}).length,
          corrections: Object.keys(state.planningCorrections || {}).length,
        },
        errors,
        warnings,
      };
    }, { statusContracts: statusValuesByScope, matrixResourceIds, matrixEmployeeIds }, 90000);

    assert(!dialogs.length, `Browser dialogs blocked the flow:\n${dialogs.join("\n")}`);
    assert(!consoleProblems.length, `Console problems:\n${consoleProblems.map((item) => `${item.type}: ${item.args}`).join("\n")}`);
    assert(!report.errors.length, `State consistency errors:\n${summarizeIssues(report.errors)}`);

    const injected = await evaluate(client, () => {
      const state = JSON.parse(localStorage.getItem("mes-planning-prototype-state-v2") || "{}");
      const route = (state.routes || [])[0];
      const slot = (state.slots || [])[0];
      if (!route || !slot) return false;
      const staleStepId = "__qa_missing_route_step__";
      route.planningLaborByStepId = {
        ...(route.planningLaborByStepId || {}),
        [staleStepId]: { mode: "fixed", fixedMinutes: 5 },
      };
      route.planningStatus = "planned";
      state.slots = [
        ...(state.slots || []),
        {
          ...slot,
          id: "__qa_orphan_slot__",
          routeStepId: staleStepId,
          planningLaborSource: "work_order",
          planningLaborMode: "fixed",
          planningLaborFixedMinutes: 5,
          planningLaborDurationMs: 5 * 60 * 1000,
        },
      ];
      state.shiftMasterAssignments = {
        ...(state.shiftMasterAssignments || {}),
        __qa_orphan_assignment__: { slotId: "__qa_orphan_slot__", status: "draft", plannedQuantity: 1 },
      };
      state.dispatchFacts = {
        ...(state.dispatchFacts || {}),
        __qa_orphan_fact__: { slotId: "__qa_orphan_slot__", status: "accepted", actualQuantity: 1 },
      };
      state.planningCorrections = {
        ...(state.planningCorrections || {}),
        __qa_orphan_correction__: { slotId: "__qa_orphan_slot__", state: "open", actualQuantity: 1 },
      };
      const directory = JSON.parse(localStorage.getItem("mes-planning-prototype-directories-v2") || "{}");
      directory.statuses = [
        ...(directory.statuses || []),
        { id: "route-planned", contractScope: "workOrderPlanning", code: "planned", name: "В плане" },
      ];
      localStorage.setItem("mes-planning-prototype-state-v2", JSON.stringify(state));
      localStorage.setItem("mes-planning-prototype-directories-v2", JSON.stringify(directory));
      return true;
    });
    if (injected) {
      await client.send("Page.navigate", { url: `${url}${url.includes("?") ? "&" : "?"}state-prune=1` });
      await delay(900);
      await waitForApp(client);
      const pruneProbe = await evaluate(client, () => {
        const state = JSON.parse(localStorage.getItem("mes-planning-prototype-state-v2") || "{}");
        return {
          staleRouteLabor: (state.routes || []).some((route) => route.planningLaborByStepId?.__qa_missing_route_step__),
          staleSlot: (state.slots || []).some((slot) => slot.routeStepId === "__qa_missing_route_step__"),
          staleAssignment: Object.values(state.shiftMasterAssignments || {}).some((assignment) => assignment?.slotId === "__qa_orphan_slot__"),
          staleFact: Object.values(state.dispatchFacts || {}).some((fact) => fact?.slotId === "__qa_orphan_slot__"),
          staleCorrection: Object.values(state.planningCorrections || {}).some((correction) => correction?.slotId === "__qa_orphan_slot__"),
          legacyRoutePlanningStatus: (state.routes || []).some((route) => route.planningStatus === "planned"),
          legacyRoutePlannedStatusRow: (JSON.parse(localStorage.getItem("mes-planning-prototype-directories-v2") || "{}").statuses || []).some((row) => row?.id === "route-planned"),
        };
      });
      assert(!pruneProbe.staleRouteLabor, "Normalizer did not remove planning labor for a missing routeStep.");
      assert(!pruneProbe.staleSlot, "Normalizer did not remove a slot with missing routeStep.");
      assert(!pruneProbe.staleAssignment, "Normalizer did not remove a shift assignment for a missing slot.");
      assert(!pruneProbe.staleFact, "Normalizer did not remove a dispatch fact for a missing slot.");
      assert(!pruneProbe.staleCorrection, "Normalizer did not remove a planning correction for a missing slot.");
      assert(!pruneProbe.legacyRoutePlanningStatus, "Normalizer did not migrate legacy route planningStatus=planned.");
      assert(!pruneProbe.legacyRoutePlannedStatusRow, "Directory normalizer did not remove legacy status row route-planned.");
    }

    console.log("MES State Consistency QA");
    console.log(`- routes: ${report.counts.routes}`);
    console.log(`- route steps: ${report.counts.routeSteps}`);
    console.log(`- slots: ${report.counts.slots}`);
    console.log(`- shift assignments: ${report.counts.assignments}`);
    console.log(`- dispatch facts: ${report.counts.facts}`);
    console.log(`- planning corrections: ${report.counts.corrections}`);
    if (report.warnings.length) {
      console.log("Warnings:");
      console.log(summarizeIssues(report.warnings));
    }
    console.log("OK: state references and calculation fields are consistent.");
  } finally {
    await cleanupChrome(chrome);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
