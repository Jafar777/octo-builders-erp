import AuditLog from "@/models/AuditLog";

// Records who did what. Never throws — a failed audit write must not break the
// action itself — but it logs the failure.
export async function audit(actor, action, { entityType = "", entityId = "", summary = "", details = {} } = {}) {
  // Done by the CEO through "View as…": the CEO is the actor, for that person.
  const acting = actor?.actingAs;
  try {
    await AuditLog.create({
      actor: acting ? acting.id : actor?.id || actor || null,
      action,
      entityType,
      entityId: entityId ? String(entityId) : "",
      summary: acting ? `[as ${actor.displayName || actor.name || actor.email}] ${summary}`.trim() : summary,
      details: acting ? { ...details, onBehalfOf: actor.id } : details,
    });
  } catch (err) {
    console.error("audit error", action, err);
  }
}
