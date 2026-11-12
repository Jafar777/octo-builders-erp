import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { fileServerReady, gatewayKeyInfo, gatewaySecret, getFileServer, publicVolumes } from "@/lib/fileServer";

// Is the company file server connected, and how deliveries work. Every screen that offers
// server files asks this first (components/erp/files/useFileServer). The Files page's
// managers also get the full settings and whether a connection key exists.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || (!user.isStaff && !user.isCustomer)) return forbidden();
  const fs = await getFileServer();
  const enabled = fileServerReady(fs, await gatewaySecret());
  const canManage = hasPermission(user, "files.manage");
  return NextResponse.json({
    enabled,
    url: enabled ? fs.url : "",
    volumes: enabled ? publicVolumes(fs) : [],
    deliveryMode: fs.deliveryMode,
    canManage,
    ...(canManage ? { settings: fs, key: await gatewayKeyInfo() } : {}),
  });
}
