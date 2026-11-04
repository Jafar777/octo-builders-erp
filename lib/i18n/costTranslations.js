// Earned value on the Gantt and utilization (Analytics). Deep-merged in translations.js.

const cost = {
  ar: {
    erp: {
      evm: {
        spi: "الجدول",
        cpi: "الساعات",
        title: "القيمة المكتسبة: الجدول = العمل المنجز ÷ المخطط حتى الآن (أقل من 1 = متأخر)، الساعات = العمل المنجز ÷ الساعات المصروفة (أقل من 1 = ساعات أكثر من المخطط).",
        hours: "الساعات: المخطط كله {bac} · المنجز {ev} · المخطط حتى الآن {pv} · المصروف {ac} · المتوقع عند الانتهاء {eac}",
        cost: "تكلفة العمل: المخططة {planned} · الفعلية {actual} · المتوقعة {forecast}",
      },
      utilization: {
        title: "استغلال وقت الموظفين",
        hint: "نسبة ساعات العمل على المشاريع من الساعات المتاحة هذا الشهر ({hours} ساعة). الصحي لمكتب تصميم بين 70% و85%؛ فوق 95% لا يبقى وقت للتعديلات.",
        average: "المتوسط",
        month: "الشهر",
        hours: "{n} س على المشاريع",
        none: "لا يوجد موظفون ضمن نطاقك.",
      },
    },
  },
  en: {
    erp: {
      evm: {
        spi: "Schedule",
        cpi: "Hours",
        title: "Earned value: Schedule = work done ÷ work planned by now (below 1 = behind), Hours = work done ÷ hours spent (below 1 = more hours than planned).",
        hours: "Hours: whole plan {bac} · done {ev} · planned by now {pv} · spent {ac} · expected at finish {eac}",
        cost: "Labour cost: planned {planned} · actual {actual} · expected {forecast}",
      },
      utilization: {
        title: "Staff utilization",
        hint: "Share of this month's available hours ({hours} h) spent on project work. Healthy for a design studio: 70–85%; above 95% leaves no time for revisions.",
        average: "Average",
        month: "Month",
        hours: "{n} h on projects",
        none: "No employees in your scope.",
      },
    },
  },
};

export default cost;
