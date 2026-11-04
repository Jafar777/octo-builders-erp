// Server errors from pages and API routes go to the System page (lib/errorLog.js).
export async function onRequestError(err, request, context) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError } = await import("./lib/errorLog.js");
  await recordError({
    source: "server",
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : "",
    path: request?.path || "",
    route: context?.routePath || "",
  });
}
