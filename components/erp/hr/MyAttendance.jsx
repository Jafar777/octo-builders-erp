"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api } from "@/lib/clientApi";
import Modal from "@/components/erp/ui/Modal";
import { Button, PageHeader } from "@/components/erp/ui/fields";
import { MonthPicker } from "@/components/erp/hr/hrUi";
import PersonMonth from "@/components/erp/hr/PersonMonth";
import LeaveList, { LeaveForm } from "@/components/erp/hr/LeaveList";
import CheckInCard from "@/components/erp/hr/CheckInCard";

export default function MyAttendance({ initialMonth }) {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const [month, setMonth] = useState(searchParams.get("month") || initialMonth);
  const [leaves, setLeaves] = useState([]);
  const [requesting, setRequesting] = useState(false);
  const loadLeaves = useCallback(() => {
    api("/api/leave?view=mine").then((d) => setLeaves(d.leaves)).catch(() => {});
  }, []);
  useEffect(() => {
    loadLeaves();
  }, [loadLeaves]);

  return (
    <div>
      <PageHeader
        title={t("erp.nav.attendance")}
        subtitle={t("erp.hr.mySubtitle")}
        actions={
          <>
            <MonthPicker month={month} onChange={setMonth} />
            <Button onClick={() => setRequesting(true)}>
              <Plus size={16} /> {t("erp.hr.requestLeave")}
            </Button>
          </>
        }
      />
      <div className="mb-6">
        <CheckInCard />
      </div>
      <PersonMonth key={month} month={month} />

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/45">{t("erp.hr.myLeave")}</h2>
        <LeaveList leaves={leaves} onChanged={loadLeaves} />
      </section>

      <Modal open={requesting} onClose={() => setRequesting(false)} title={t("erp.hr.requestLeave")}>
        {requesting && (
          <LeaveForm
            onCancel={() => setRequesting(false)}
            onCreated={() => {
              setRequesting(false);
              loadLeaves();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
