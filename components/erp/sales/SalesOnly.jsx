"use client";

import { useLanguage } from "@/context/LanguageContext";
import { PageHeader } from "@/components/erp/ui/fields";
import SalesCenter from "@/components/erp/sales/SalesCenter";

// The Finance page for someone with sales but no finance: none of the money tabs.
export default function SalesOnly() {
  const { t } = useLanguage();
  return (
    <div>
      <PageHeader title={t("erp.nav.sales")} />
      <SalesCenter />
    </div>
  );
}
