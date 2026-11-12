import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { newGatewaySecret } from "@/lib/fileServer";

// A new connection key for the file gateway (Files page → Connection). Shown once: it
// goes into the gateway's config.json. The old key stops working at once, so the
// gateway refuses everyone until its config has the new one.
export async function POST() {
  const user = await requirePermission("files.manage");
  if (!user) return forbidden();
  if (process.env.FILE_SERVER_SECRET) return fail("file_key_from_env");
  const secret = await newGatewaySecret();
  await audit(user, "files.key_created", { entityType: "settings", entityId: "fileServer", summary: "file gateway key" });
  return NextResponse.json({ secret });
}
