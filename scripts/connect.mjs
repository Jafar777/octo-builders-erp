// Database connection for the command-line scripts (run with scripts/legacy/register.mjs).
import { connectDB } from "@/lib/db";

// Some routers refuse Node's lookup of the Atlas "mongodb+srv" address (querySrv
// EREFUSED) even though Windows resolves it: then ask public DNS servers instead.
export async function connectScriptDB(log = console.log) {
  try {
    return await connectDB();
  } catch (err) {
    if (!/querySrv|ENOTFOUND|EREFUSED|ETIMEOUT/.test(String(err?.message || err?.code))) throw err;
    const dns = await import("node:dns");
    dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
    log("Local DNS refused the database address — retrying through public DNS…");
    return connectDB();
  }
}
