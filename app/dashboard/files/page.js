import { Suspense } from "react";
import { getCurrentUser } from "@/lib/currentUser";
import FilesCenter from "@/components/erp/files/FilesCenter";
import NoAccess from "@/components/erp/NoAccess";

export default async function FilesPage() {
  const user = await getCurrentUser();
  if (!user?.isStaff || user.limited) return <NoAccess />;
  return (
    <Suspense>
      <FilesCenter />
    </Suspense>
  );
}
