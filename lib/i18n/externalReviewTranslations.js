// External review: after a task is handed in, another office checks it and the tasks
// after it wait (lib/gantt.js readyTime). Deep-merged into the main tables in translations.js.

const externalReview = {
  ar: {
    errors: {
      invalid_hours: "عدد الساعات غير صالح",
      no_external_review: "هذه المهمة لا تذهب لمراجعة خارجية",
      already_received: "تم تسجيل استلام المراجعة مسبقاً",
      not_delivered: "لم تُسلَّم المهمة بعد",
    },
    erp: {
      external: {
        label: "مراجعة خارجية بعد التسليم",
        hours: "انتظار المراجعة الخارجية (ساعات عمل)",
        hoursShort: "مراجعة خارجية",
        formHint: "اختياري: إذا كانت هذه المهمة تُرسل لمكتب آخر للمراجعة بعد تسليمها، اكتب كم ساعة عمل تستغرق المراجعة. لا يُحجز وقت أي موظف خلالها — يعملون على مشاريع أخرى — لكن المهام التالية لا تبدأ حتى تعود المراجعة.",
        bar: "مراجعة خارجية · {h} س",
        barLate: "المراجعة الخارجية متأخرة",
        barReceived: "عادت المراجعة الخارجية",
        waiting: "بانتظار المراجعة الخارجية",
        waitingFor: "بانتظار مراجعة خارجية لـ #{n}",
        plannedBack: "متوقع عودتها: {at}",
        late: "متأخرة — المهام التالية تنتظر",
        receivedAt: "عادت المراجعة {at} · {name}",
        notSentYet: "بعد تسليم المهمة تذهب لمراجعة خارجية مدتها {h} ساعة عمل.",
        markReceived: "تم استلام المراجعة الخارجية",
        reopen: "التراجع عن الاستلام",
        legend: "مراجعة خارجية (لا تحجز وقت أحد)",
      },
      tasks: {
        event: { external_received: "سجّل استلام المراجعة الخارجية", external_reopened: "تراجع عن استلام المراجعة الخارجية" },
      },
      delivery: {
        causeShort: { external_review: "المراجعات الخارجية" },
        cause: { external_review: "مراجعة خارجية من مكتب آخر — تحركت المهام التالية معها" },
      },
    },
  },
  en: {
    errors: {
      invalid_hours: "Invalid number of hours",
      no_external_review: "This task doesn't go out for an external review",
      already_received: "The review was already marked as received",
      not_delivered: "The task hasn't been handed in yet",
    },
    erp: {
      external: {
        label: "External review after delivery",
        hours: "External review wait (working hours)",
        hoursShort: "External review",
        formHint: "Optional: if this task is sent to another office for review once it's handed in, enter how many working hours the review takes. Nobody's time is held meanwhile — they work on other projects — but the next tasks can't start until the review is back.",
        bar: "External review · {h}h",
        barLate: "External review is late",
        barReceived: "External review is back",
        waiting: "Waiting for an external review",
        waitingFor: "Waiting for the external review of #{n}",
        plannedBack: "Expected back: {at}",
        late: "Late — the next tasks are waiting",
        receivedAt: "Review back {at} · {name}",
        notSentYet: "Once handed in, it goes out for a {h}-working-hour external review.",
        markReceived: "External review received",
        reopen: "Undo received",
        legend: "External review (holds nobody's time)",
      },
      tasks: {
        event: { external_received: "marked the external review as received", external_reopened: "undid the external review's receipt" },
      },
      delivery: {
        causeShort: { external_review: "External reviews" },
        cause: { external_review: "An external review by another office — the next tasks moved with it" },
      },
    },
  },
};

export default externalReview;
