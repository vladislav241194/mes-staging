import { handleSharedStateRequest } from "../scripts/shared-state-endpoint.mjs";

function responseHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
  };
}

export default async function handler(req, res) {
  await handleSharedStateRequest(req, res, {
    headers: responseHeaders,
  });
}
