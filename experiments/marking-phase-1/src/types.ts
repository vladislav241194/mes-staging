export type PrintStatus =
  | "not-sent"
  | "sent"
  | "awaiting"
  | "confirmed"
  | "error"
  | "reprinted";

export type TaskStatus = "new" | "prepared" | "printing" | "marked" | "transferred";

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
  tone?: "info" | "success" | "warning" | "danger";
}

export interface MarkingKit {
  id: string;
  sequence: number;
  masterCode: string;
  individualCodes: string[];
  createdAfterStart: boolean;
  printStatus: PrintStatus;
  printCount: number;
  batchIds: string[];
}

export interface PrintBatch {
  id: string;
  kitIds: string[];
  status: PrintStatus;
  createdAt: string;
  attempt: number;
  sourceBatchId?: string;
  scope: "all" | "partial" | "batch" | "kit" | "master" | "individual";
  targetCode?: string;
}

export interface MarkingTask {
  id: string;
  title: string;
  product: string;
  workOrder: string;
  assignee: string;
  nextArea: string;
  planBoards: number;
  multiplicationCount: number;
  boardsPerMultiplication: number;
  masterLabel: string;
  individualLabel: string;
  status: TaskStatus;
  kits: MarkingKit[];
  batches: PrintBatch[];
  history: AuditEvent[];
}

export interface PrototypeState {
  tasks: MarkingTask[];
  selectedTaskId: string;
}
