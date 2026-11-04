import crypto from "crypto";
import { connectDB } from "@/lib/db";
import ErrorLog from "@/models/ErrorLog";

// Records an error on the live site, grouped by where it happened and its first stack
// line. The first time a group appears (or comes back after being resolved), the
// people who watch the system (system.health) get a notification. Never throws.
export async function recordError({ source = "server", message = "", stack = "", path = "", route = "", user = null }) {
  try {
    await connectDB();
    const msg = String(message || "Unknown error").slice(0, 500);
    const top = String(stack || "").split("\n").slice(0, 3).join("\n");
    const where = route || String(path || "").split("?")[0].replace(/[a-f0-9]{24}/gi, ":id");
    const fingerprint = crypto.createHash("sha1").update(`${source}|${where}|${msg.replace(/\d+/g, "#")}|${top.replace(/:\d+:\d+/g, "")}`).digest("hex");
    const before = await ErrorLog.findOneAndUpdate(
      { fingerprint },
      {
        $setOnInsert: { fingerprint, source, firstAt: new Date() },
        $set: { message: msg, stack: String(stack || "").slice(0, 4000), path: String(path || "").slice(0, 300), route: where, lastAt: new Date(), lastUser: user, resolvedAt: null, resolvedBy: null },
        $inc: { count: 1 },
      },
      { upsert: true, new: false }
    ).lean();
    if (!before || before.resolvedAt) {
      const { notify, usersWithPermission } = await import("@/lib/notify");
      await notify({
        type: "system.error",
        recipients: await usersWithPermission("system.health"),
        params: { message: msg.slice(0, 120) },
        link: "/dashboard/system",
        entityType: "error",
        entityId: fingerprint,
      });
    }
  } catch (err) {
    console.error("recordError failed", err);
  }
}
