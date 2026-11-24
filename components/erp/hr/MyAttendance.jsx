"use client";

import Link from "next/link";
import PageLinks from "@/components/dashboard/PageLinks";
import { PROFILE_PAGES } from "@/components/erp/profile/profilePages";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { Button, PageHeader } from "@/components/erp/ui/fields";
import { MonthPicker } from "@/components/erp/hr/hrUi";
import PersonMonth from "@/components/erp/hr/PersonMonth";
import CheckInCard from "@/components/erp/hr/CheckInCard";

// (Leave is asked for and decided on the Requests page.)
export default function MyAttendance({ initialMonth }) {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const [month, setMonth] = useState(searchParams.get("month") || initialMonth);

  return (
    <div>
      <PageHeader
        title={t("erp.nav.attendance")}
        subtitle={t("erp.hr.mySubtitle")}
        actions={
          <>
            <PageLinks pages={PROFILE_PAGES} current="attendance" />
            <MonthPicker month={month} onChange={setMonth} />
            <Link href="/dashboard/orders?type=leave">
              <Button>
                <Plus size={16} /> {t("erp.hr.requestLeave")}
              </Button>
            </Link>
          </>
        }
      />
      <div className="mb-6">
        <CheckInCard />
      </div>
      <PersonMonth key={month} month={month} />
    </div>
  );
}
