export interface Specifications2PublishRevisionInput {
  entry: Record<string, unknown> & {
    id?: unknown;
    publication?: unknown;
  };
  expectedPreviousRevision?: unknown;
  idempotencyKey?: string;
}

export interface Specifications2PublishCommandsClient {
  refreshCapability(options?: { force?: boolean }): Promise<unknown>;
  getCapability(): unknown;
  publishRevision(input?: Specifications2PublishRevisionInput): Promise<unknown>;
}

export interface Specifications2PublishCommandsOptions {
  fetchImpl?: typeof fetch;
  url?: string;
  capabilitiesUrl?: string;
  serverPrimaryPolicy?: boolean;
}

export function createSpecifications2PublishCommands(
  options?: Specifications2PublishCommandsOptions,
): Specifications2PublishCommandsClient;
