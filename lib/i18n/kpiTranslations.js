// Translations for the department heads' hybrid KPI (lib/kpi/hybrid) and the project
// KPI's schedule part. Deep-merged into the main tables in translations.js.

const kpi = {
  ar: {
    erp: {
      managerKpi: {
        formulaManagement: "{n}% إداري (نتائج الفريق + تقييم المدير العام) — افتراضياً",
        formulaExecution: "{n}% تنفيذي (حضوره ومهامه هو)",
        formulaRating: "تقييم المدير العام {n}% من الجزء الإداري",
        managementPart: "الجزء الإداري",
        executionPart: "الجزء التنفيذي (عمله هو)",
        ratingPart: "تقييم المدير العام ({n}% من الجزء الإداري)",
        teamLine: "فريق من {n} · نتائج الفريق {team} × {rw}% + التقييم × {w}%",
        shareLine: "نسبة الإدارة {share}% ({kind})",
        shareDefault: "الافتراضية",
        shareOwn: "خاصة به",
        measured: "المقاسة من ساعات مهامه: {n}%",
        fewTasks: "مهامه قليلة هذا الشهر فخُفّف وزن الجزء التنفيذي",
        shareLabel: "نسبة الإدارة %",
        useDefault: "استخدم الافتراضية ({n}%)",
        defaultShare: "نسبة الإدارة الافتراضية لرؤساء الأقسام (%)",
        ratingWeight: "وزن تقييم المدير العام داخل الجزء الإداري (%)",
        teamWeights: "أوزان مؤشرات الفريق",
        teamWeightsHint: "تُحسب من مهام الفريق والمخطط الزمني والمراجعات. المؤشر بلا بيانات في الشهر لا يُحسب، وتُوزّع أوزانه على البقية.",
        metric: {
          on_time: "تسليم الفريق في الموعد",
          quality: "الاعتماد من المرة الأولى",
          utilization: "استغلال وقت الفريق",
          balance: "توازن توزيع العمل",
          team_kpi: "متوسط أداء الفريق",
          review_speed: "سرعة مراجعته للأعمال",
        },
      },
      analytics: {
        col: { schedule: "خط الأساس" },
        kpiPart: { schedule: "الالتزام بخط الأساس" },
        how: {
          scheduleLabel: "الالتزام بخط الأساس",
          schedule: "يقارن التسليم المتوقع (أو الفعلي) مع تسليم خط الأساس 1: 100 إذا لم يتأخر، وينقص بنسبة التأخير من المدة المخططة. مواعيد المهام تتحرك مع الخطة، فهذا الجزء هو الذي يُظهر انزلاق المشروع.",
        },
      },
      audit: { action: { kpi: { manager_share: "غيّر نسبة الإدارة لرئيس قسم" } } },
    },
  },
  en: {
    erp: {
      managerKpi: {
        formulaManagement: "{n}% management (team results + GM rating) by default",
        formulaExecution: "{n}% execution (their own attendance and tasks)",
        formulaRating: "GM rating is {n}% of the management part",
        managementPart: "Management part",
        executionPart: "Execution part (their own work)",
        ratingPart: "GM / CEO rating ({n}% of the management part)",
        teamLine: "team of {n} · team results {team} × {rw}% + rating × {w}%",
        shareLine: "Management share {share}% ({kind})",
        shareDefault: "default",
        shareOwn: "their own",
        measured: "measured from their task hours: {n}%",
        fewTasks: "few own tasks this month, so the execution part counts for less",
        shareLabel: "Management %",
        useDefault: "Use the default ({n}%)",
        defaultShare: "Default management share for department heads (%)",
        ratingWeight: "GM rating's weight inside the management part (%)",
        teamWeights: "Team metric weights",
        teamWeightsHint: "Calculated from the team's tasks, the plan and reviews. A metric with no data in the month is left out and its weight shared among the rest.",
        metric: {
          on_time: "Team on-time delivery",
          quality: "First-time approval",
          utilization: "Team utilisation",
          balance: "Workload balance",
          team_kpi: "Team KPI average",
          review_speed: "Their review speed",
        },
      },
      analytics: {
        col: { schedule: "Baseline" },
        kpiPart: { schedule: "Schedule vs baseline" },
        how: {
          scheduleLabel: "Schedule vs baseline",
          schedule:
            "Compares the expected (or actual) delivery with Baseline 1's: 100 when it hasn't slipped, less by the slip as a share of the planned duration. Task due dates move with the plan, so this is the part that shows a project slipping.",
        },
      },
      audit: { action: { kpi: { manager_share: "changed a department head's management share" } } },
    },
  },
};

export default kpi;
