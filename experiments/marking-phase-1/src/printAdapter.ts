import type { PrintBatch } from "./types";

export interface TestPrintReceipt {
  adapter: "test-local";
  batchId: string;
  acceptedAt: string;
  labels: number;
  message: string;
}

export const testPrintAdapter = {
  async send(batch: PrintBatch, labels: number): Promise<TestPrintReceipt> {
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    return {
      adapter: "test-local",
      batchId: batch.id,
      acceptedAt: new Date().toISOString(),
      labels,
      message: "Имитировано: данные не передавались на физический принтер",
    };
  },
};
