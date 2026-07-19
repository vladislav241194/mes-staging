const record = (value: unknown): Record<string, any> => value && typeof value === "object" ? value as Record<string, any> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const tone = (value: unknown): "success" | "warning" | "neutral" => ["primary", "ok", "success"].includes(text(value)) ? "success" : ["warning", "critical", "risk"].includes(text(value)) ? "warning" : "neutral";

export interface ContourAdminContour { id: string; label: string; title: string; domain: string; targetDomain: string; service: string; port: string; dataPolicy: string; releasePolicy: string; statusLabel: string; statusTone: "success" | "warning" | "neutral" }
export interface ContourAdminCommand { id: string; label: string; serverConfirmation: boolean; }
export interface ContourAdminScenario { id: string; label: string; source: string; target: string; owner: string; risk: string; status: string; result: string; tone: "success" | "warning" | "neutral"; actions: number; commands: ContourAdminCommand[]; }
export interface ContourAdminSpeedRow { id: string; scenario: string; reference: string; current: string; delta: string; command: string; note: string }

export function adaptContourAdminPayload(payload: unknown) {
  const root = record(payload); const model = record(root.model || payload); const capabilities = record(root.capabilities);
  const contours = list(model.contours).map((value, index): ContourAdminContour => { const item = record(value); return { id: text(item.id, `contour-${index}`), label: text(item.label, "Контур"), title: text(item.title, "Контур"), domain: text(item.domain, "не подключен"), targetDomain: text(item.targetDomain, "не задан"), service: text(item.service, "не задан"), port: text(item.port, "не задан"), dataPolicy: text(item.dataPolicy), releasePolicy: text(item.releasePolicy), statusLabel: text(item.statusLabel, "неизвестно"), statusTone: tone(item.statusTone) }; });
  const scenarios = list(model.scenarios).map((value, index): ContourAdminScenario => { const item = record(value); const commands: ContourAdminCommand[] = []; if (text(item.precheckActionId)) commands.push({ id: text(item.precheckActionId), label: text(item.precheckLabel, "Проверить"), serverConfirmation: false }); if (text(item.actionId)) commands.push({ id: text(item.actionId), label: text(item.actionLabel, "Выполнить"), serverConfirmation: Boolean(item.requiresConfirm) }); return { id: text(item.id, `scenario-${index}`), label: text(item.label, "Сценарий"), source: text(item.source), target: text(item.target), owner: text(item.owner), risk: text(item.risk), status: text(item.status), result: text(item.result), tone: tone(item.tone), actions: commands.length || 1, commands }; });
  const speedRows = list(model.speedRows).map((value, index): ContourAdminSpeedRow => { const item = record(value); return { id: text(item.id, `speed-${index}`), scenario: text(item.scenario), reference: text(item.reference), current: text(item.current), delta: text(item.delta), command: text(item.command), note: text(item.note) }; });
  return { contours, scenarios, speedRows, guardrails: list(model.guardrails).map((value) => text(value)).filter(Boolean), canExecuteOps: Boolean(capabilities.executeOps) };
}
