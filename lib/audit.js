import AuditLog from "@/models/AuditLog";

// Records who did what. Never throws — a failed audit write must not break the
// action itself — but it logs the failure.
export async function audit(actor, action, { entityType = "", entityId = "", summary = "", details = {} } = {}) {
  try {
    await AuditLog.create({
      actor: actor?.id || actor || null,
      action,
      entityType,
      entityId: entityId ? String(entityId) : "",
      summary,
      details,
    });
  } catch (err) {
    console.error("audit error", action, err);
  }
}
