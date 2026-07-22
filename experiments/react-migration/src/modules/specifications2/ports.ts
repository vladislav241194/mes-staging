export interface Specifications2DraftRowValue {
  label: string;
  designation: string;
  type: string;
  quantity: string;
  unitOfMeasure: string;
}

export interface Specifications2RouteValue {
  productLabel: string;
  designation: string;
  status: "draft" | "ready-for-norming";
}

export type Specifications2AttachmentKind = "pnp" | "gerber" | "instructionDoc" | "instructionPdf";

export type Specifications2ReactCommand =
  | { type: "select-entry"; payload: { entryId: string } }
  | { type: "save-draft-row"; payload: { entryId: string; rowId: string; value: Specifications2DraftRowValue } }
  | { type: "add-row"; payload: { entryId: string; parentId: string; value: Specifications2DraftRowValue } }
  | { type: "remove-row"; payload: { entryId: string; rowId: string; confirmRowId: string } }
  | { type: "reparent-row"; payload: { entryId: string; rowId: string; parentId: string } }
  | { type: "edit-route"; payload: { entryId: string; routeId: string; value: Specifications2RouteValue } }
  | { type: "bind-attachment"; payload: { entryId: string; routeId: string; operationId: string; kind: Specifications2AttachmentKind; fileName: string; mediaType: string; size: number; inlineDataUrl: string } }
  | { type: "publish-draft"; payload: { entryId: string; confirmEntryId: string; expectedPreviousRevision: number } }
  | { type: "create-work-order"; payload: { entryId: string; revisionId: string; confirmRevisionId: string; routeSourceDraftId: string; quantity: number } };

export interface Specifications2CommandResult {
  ok?: boolean;
  message?: string;
  id?: string;
  revision?: number;
  conflict?: boolean;
}

export interface Specifications2CommandPort {
  execute(command: Specifications2ReactCommand): Promise<Specifications2CommandResult | void>;
}
