// Resolves the app's "@/…" imports (jsconfig paths) for plain Node scripts, the way
// Next.js does, so the importer can use the real models and lib helpers.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = path.join(ROOT, specifier.slice(2));
    const file = [base, `${base}.js`, `${base}.mjs`, path.join(base, "index.js")].find((f) => existsSync(f) && !f.endsWith(path.sep));
    if (file) return next(pathToFileURL(file).href, context);
  }
  try {
    return await next(specifier, context);
  } catch (err) {
    // Package subpaths without an "exports" map ("next/server"): the bundler adds ".js".
    if (err.code === "ERR_MODULE_NOT_FOUND" && !specifier.startsWith(".") && !specifier.endsWith(".js")) return next(`${specifier}.js`, context);
    throw err;
  }
}
