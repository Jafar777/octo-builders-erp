import Notification from "@/models/Notification";
import User from "@/models/User";
import Role from "@/models/Role";
import { publish, userChannel } from "@/lib/realtime/server";
import { sendNotificationEmail } from "@/lib/resend";
import { DEFAULT_ROLE, effectiveAccess, HIDDEN_ROLES } from "@/lib/permissions";
import { canOpenPath } from "@/lib/pageAccess";

// Bilingual text for every notification type. params come from the caller.
// New modules add their types here.
const TEMPLATES = {
  "user.signup": {
    priority: "high",
    ar: (p) => `مستخدم جديد أنشأ حساباً: ${p.name} — بانتظار تعيين الدور`,
    en: (p) => `New sign-up: ${p.name} — waiting for a role`,
  },
  "user.role_changed": {
    priority: "high",
    ar: (p) => `تم تعيين دورك في النظام: ${p.role.ar}`,
    en: (p) => `Your role in the system is now: ${p.role.en}`,
  },
  "user.deactivated": {
    priority: "high",
    ar: () => "تم إيقاف حسابك في النظام",
    en: () => "Your account has been deactivated",
  },
  "org.reports_to": {
    priority: "high",
    ar: (p) => `${p.person} أصبح يتبع لـ ${p.manager} في الهيكل التنظيمي — المهام والإجازات والعمل الإضافي ومؤشرات الأداء تتبع ذلك`,
    en: (p) => `${p.person} now reports to ${p.manager} — tasks, leave, overtime and KPI follow`,
  },
  "org.merge_started": {
    priority: "high",
    ar: (p) => `تم دمج الأقسام مؤقتاً: ${p.departments} — مدير واحد لها، ويمكن لموظفيها استلام مهام أي منها`,
    en: (p) => `Departments merged for now: ${p.departments} — one manager leads them and their employees can take work from any of them`,
  },
  "org.merge_ended": {
    priority: "normal",
    ar: (p) => `انتهى الدمج المؤقت للأقسام: ${p.departments} — عاد كل قسم كما كان`,
    en: (p) => `The temporary merge of ${p.departments} has ended — each department is back as it was`,
  },
  "message.mention": {
    priority: "normal",
    ar: (p) => `${p.actor} أشار إليك في ${p.conversation}`,
    en: (p) => `${p.actor} mentioned you in ${p.conversation}`,
  },
  "task.assigned": {
    priority: "normal",
    ar: (p) => `${p.actor} أسند إليك المهمة #${p.number}: ${p.title}`,
    en: (p) => `${p.actor} assigned you task #${p.number}: ${p.title}`,
  },
  "task.started_for_you": {
    priority: "normal",
    ar: (p) => `${p.actor} بدأ لك العمل على المهمة #${p.number}: ${p.title}`,
    en: (p) => `${p.actor} started task #${p.number} for you: ${p.title}`,
  },
  "task.work_request": {
    priority: "normal",
    ar: (p) => `${p.actor} يطلب ${{ transfer: "استلام مهمة زميل", fixed: "بدء عمل يتعارض مع مهمة مثبتة", stage: "بدء مرحلة قبل وقتها", hours: "ساعات إضافية", client: "تغييراً من العميل", start: "بدء عمل", pause: "إيقاف مهمة مؤقتاً" }[p.kind]}: ${p.title}${p.reason ? ` — ${p.reason}` : ""}`,
    en: (p) => `${p.actor} asks for ${{ transfer: "a colleague's task", fixed: "work that runs into a fixed task", stage: "a stage before its turn", hours: "more hours", client: "a client change", start: "new work", pause: "a pause" }[p.kind]}: ${p.title}${p.reason ? ` — ${p.reason}` : ""}`,
  },
  "task.work_decided": {
    priority: "normal",
    ar: (p) =>
      p.kind === "pause"
        ? `${p.approved ? "تمت الموافقة على إيقاف مهمتك مؤقتاً" : "رُفض طلب إيقاف مهمتك مؤقتاً، تابع العمل عليها"}${p.title ? `: ${p.title}` : ""}${p.note ? ` — ${p.note}` : ""}`
        : `${p.approved ? "تمت الموافقة على" : "تم رفض"} طلبك لبدء العمل${p.title ? `: ${p.title}` : ""}${p.approved && p.hours ? ` (${p.hours} ساعة) — ${p.started ? "بدأ وقتها الآن وأُوقفت مهمتك السابقة" : "يمكنك البدء الآن"}` : ""}${p.note ? ` — ${p.note}` : ""}`,
    en: (p) =>
      p.kind === "pause"
        ? `${p.approved ? "Your pause was approved" : "Your pause was declined: carry on with the task"}${p.title ? `: ${p.title}` : ""}${p.note ? ` — ${p.note}` : ""}`
        : `Your work request was ${p.approved ? "approved" : "declined"}${p.title ? `: ${p.title}` : ""}${p.approved && p.hours ? ` (${p.hours} h) — ${p.started ? "its clock started now and your previous task is paused" : "you can start it now"}` : ""}${p.note ? ` — ${p.note}` : ""}`,
  },
  // Need a decision now: they ring with the alert sound (components/NotificationBell.jsx).
  "task.start_request": {
    priority: "high",
    alert: true,
    ar: (p) => `${p.actor} يطلب ${p.urgent ? "بدء عمل عاجل (يوقف مهمته الحالية)" : "بدء عمل"}: ${p.title} — ${p.hours} ساعة مقترحة. حدّد الساعات${p.reason ? ` — ${p.reason}` : ""}`,
    en: (p) => `${p.actor} asks to start ${p.urgent ? "urgent work (pausing their current task)" : "work"}: ${p.title} — ${p.hours} h suggested. Set the hours${p.reason ? ` — ${p.reason}` : ""}`,
  },
  "task.pause_request": {
    priority: "high",
    alert: true,
    ar: (p) => `${p.actor} يطلب إيقاف المهمة #${p.number} مؤقتاً${p.title ? `: ${p.title}` : ""} — ${p.reason}`,
    en: (p) => `${p.actor} asks to pause task #${p.number}${p.title ? `: ${p.title}` : ""} — ${p.reason}`,
  },
  "task.plan_interrupted": {
    priority: "normal",
    ar: (p) => `تغيّرت خطتك: ${p.person}${p.paused ? ` أوقف ${p.paused}` : ""}${p.pushed ? ` وتأخرت ${p.pushed}` : ""} بموافقة ${p.by}${p.reason ? ` — ${p.reason}` : ""}`,
    en: (p) => `Your plan changed: ${p.person}${p.paused ? ` paused ${p.paused}` : ""}${p.pushed ? `, pushing ${p.pushed} later` : ""}, approved by ${p.by}${p.reason ? ` — ${p.reason}` : ""}`,
  },
  "task.plan_pushed": {
    priority: "normal",
    ar: (p) => `${p.actor} بدأ #${p.number} ${p.title} فتأخرت المهام ${p.pushed} — ${p.reason}`,
    en: (p) => `${p.actor} started #${p.number} ${p.title}, pushing ${p.pushed} later — ${p.reason}`,
  },
  "task.help_offered": {
    priority: "normal",
    ar: (p) => `${p.actor} يعرض المساعدة في #${p.number} ${p.title}`,
    en: (p) => `${p.actor} offers to help with #${p.number} ${p.title}`,
  },
  "task.auto_paused": {
    priority: "normal",
    ar: (p) => `توقف وقت المهمة #${p.number} ${p.title} بنهاية الدوام. اضغط استئناف عندما تعود إليها`,
    en: (p) => `#${p.number} ${p.title} was paused at the end of the working day. Press Resume when you go back to it`,
  },
  "task.submitted": {
    priority: "normal",
    ar: (p) => `${p.actor} سلّم المهمة #${p.number} للمراجعة: ${p.title}`,
    en: (p) => `${p.actor} submitted task #${p.number} for review: ${p.title}`,
  },
  "task.approved": {
    priority: "normal",
    ar: (p) => `تم اعتماد المهمة #${p.number}: ${p.title}`,
    en: (p) => `Task #${p.number} was approved: ${p.title}`,
  },
  "task.rejected": {
    priority: "high",
    ar: (p) => `تم رفض المهمة #${p.number} — طلب تعديل جديد R-${p.revision}: ${p.title}`,
    en: (p) => `Task #${p.number} was rejected — new revision request R-${p.revision}: ${p.title}`,
  },
  "task.help_requested": {
    priority: "high",
    ar: (p) => `${p.actor} يطلب مساعدتك في المهمة #${p.number}: ${p.title}`,
    en: (p) => `${p.actor} asks for your help on task #${p.number}: ${p.title}`,
  },
  "task.reassigned": {
    priority: "normal",
    ar: (p) => `تم نقل المهمة #${p.number} إلى موظف آخر: ${p.title}`,
    en: (p) => `Task #${p.number} was reassigned to someone else: ${p.title}`,
  },
  "task.comment": {
    priority: "normal",
    ar: (p) => `${p.actor} علّق على المهمة #${p.number}`,
    en: (p) => `${p.actor} commented on task #${p.number}`,
  },
  "task.due_soon": {
    priority: "normal",
    ar: (p) => `موعد تسليم المهمة #${p.number} خلال 24 ساعة: ${p.title}`,
    en: (p) => `Task #${p.number} is due within 24 hours: ${p.title}`,
  },
  "task.overdue": {
    priority: "high",
    ar: (p) => `تأخرت المهمة #${p.number} عن موعد التسليم: ${p.title}`,
    en: (p) => `Task #${p.number} is overdue: ${p.title}`,
  },
  "leave.requested": {
    priority: "normal",
    ar: (p) => `${p.actor} طلب إجازة (${p.days} يوم) من ${p.from} إلى ${p.to}`,
    en: (p) => `${p.actor} requested leave (${p.days} days) from ${p.from} to ${p.to}`,
  },
  "leave.awaiting_final": {
    priority: "normal",
    ar: (p) => `وافق ${p.actor} (مدير القسم) على إجازة ${p.employeeAr || p.employee} (${p.days} يوم) من ${p.from} إلى ${p.to} — بانتظار قرارك`,
    en: (p) => `${p.actor} (department manager) approved ${p.employee}'s leave (${p.days} days) from ${p.from} to ${p.to} — waiting for your decision`,
  },
  "leave.manager_approved": {
    priority: "normal",
    ar: (p) => `وافق مدير القسم على إجازتك من ${p.from} إلى ${p.to} — بانتظار الموارد البشرية أو المدير العام`,
    en: (p) => `Your department manager approved your leave from ${p.from} to ${p.to} — now waiting for HR or the GM`,
  },
  "leave.approved": {
    priority: "high",
    ar: (p) => `تمت الموافقة على إجازتك من ${p.from} إلى ${p.to}`,
    en: (p) => `Your leave from ${p.from} to ${p.to} was approved`,
  },
  // The executive office (lib/officeServer.js).
  "office.request_sent": {
    priority: "high",
    ar: (p) => `طلب من المكتب التنفيذي ${p.code}: ${p.title}`,
    en: (p) => `Request from the executive office ${p.code}: ${p.title}`,
  },
  "office.request_chased": {
    priority: "high",
    ar: (p) => `تذكير من المكتب التنفيذي — الطلب ${p.code} ما زال ينتظر ردكم: ${p.title}`,
    en: (p) => `Reminder from the executive office — request ${p.code} is still waiting for your answer: ${p.title}`,
  },
  "office.item_acknowledged": {
    priority: "normal",
    ar: (p) => `${p.actor} اطّلع على الطلب ${p.code}: ${p.title}`,
    en: (p) => `${p.actor} saw request ${p.code}: ${p.title}`,
  },
  "office.item_replied": {
    priority: "high",
    ar: (p) => `${p.actor} ردّ على ${p.code}: ${p.text}`,
    en: (p) => `${p.actor} replied on ${p.code}: ${p.text}`,
  },
  "office.item_done": {
    priority: "high",
    ar: (p) => `تم إنجاز ${p.code}: ${p.title}`,
    en: (p) => `${p.code} is done: ${p.title}`,
  },
  "office.item_tasked": {
    priority: "normal",
    ar: (p) => `${p.actor} حوّل الطلب ${p.code} إلى مهمة: ${p.title}`,
    en: (p) => `${p.actor} turned request ${p.code} into a task: ${p.title}`,
  },
  "office.admin_request": {
    priority: "high",
    ar: (p) => `طلب إداري جديد من ${p.actor}: ${p.title}`,
    en: (p) => `New admin request from ${p.actor}: ${p.title}`,
  },
  "office.admin_note": {
    priority: "normal",
    ar: (p) => `${p.actor} أضاف ملاحظة على طلبه ${p.code}: ${p.text}`,
    en: (p) => `${p.actor} added a note on their request ${p.code}: ${p.text}`,
  },
  "office.admin_done": {
    priority: "high",
    ar: (p) => `تم إنجاز طلبك ${p.code}: ${p.title}`,
    en: (p) => `Your request ${p.code} is done: ${p.title}`,
  },
  "office.inquiry": {
    priority: "normal",
    ar: (p) => `استفسار جديد من ${p.name}: ${p.need}`,
    en: (p) => `New inquiry from ${p.name}: ${p.need}`,
  },
  "office.meeting_invite": {
    priority: "high",
    ar: (p) => `دعوة لاجتماع «${p.title}» يوم ${p.date} الساعة ${p.time}${p.place ? ` — ${p.place}` : ""}`,
    en: (p) => `Meeting invitation "${p.title}" on ${p.date} at ${p.time}${p.place ? ` — ${p.place}` : ""}`,
  },
  "office.minutes_shared": {
    priority: "normal",
    ar: (p) => `محضر اجتماع «${p.title}» جاهز`,
    en: (p) => `The minutes of "${p.title}" are ready`,
  },
  "office.daily_summary": {
    priority: "normal",
    ar: (p) => `يومك في المكتب: ${p.due} مستحقة اليوم، ${p.overdue} متأخرة، ${p.waiting} بانتظار الأقسام`,
    en: (p) => `Your office day: ${p.due} due today, ${p.overdue} overdue, ${p.waiting} waiting on departments`,
  },
  "office.overdue_requests": {
    priority: "high",
    ar: (p) => `لديكم ${p.n} طلبات من المكتب التنفيذي تجاوزت موعدها`,
    en: (p) => `You have ${p.n} requests from the executive office past their date`,
  },
  "office.ceo_digest": {
    priority: "normal",
    ar: (p) => `المكتب اليوم: ${p.closed} أُنجزت، ${p.waiting} بانتظار الأقسام، ${p.complaints} شكاوى مفتوحة`,
    en: (p) => `The office today: ${p.closed} closed, ${p.waiting} waiting on departments, ${p.complaints} open complaints`,
  },
  "change.requested": {
    priority: "high",
    ar: (p) => `طلب تغيير جديد ${p.code} من المدير التنفيذي${p.page ? ` (${p.page})` : ""}: ${p.title}`,
    en: (p) => `New change request ${p.code} from the CEO${p.page ? ` (${p.page})` : ""}: ${p.title}`,
  },
  "change.accepted": {
    priority: "normal",
    ar: (p) => `المبرمج بدأ العمل على طلبك ${p.code}: ${p.title}`,
    en: (p) => `The programmer took on your request ${p.code}: ${p.title}`,
  },
  "change.done": {
    priority: "high",
    ar: (p) => `تم تنفيذ طلبك ${p.code}: ${p.title} — اطّلع على ما تغيّر`,
    en: (p) => `Your request ${p.code} is done: ${p.title} — see what changed`,
  },
  "change.declined": {
    priority: "normal",
    ar: (p) => `اعتذر المبرمج عن طلبك ${p.code}: ${p.title}`,
    en: (p) => `The programmer declined your request ${p.code}: ${p.title}`,
  },
  "change.replied": {
    priority: "high",
    ar: (p) => `ردّ المبرمج على طلبك ${p.code}: ${p.text}`,
    en: (p) => `The programmer replied on your request ${p.code}: ${p.text}`,
  },
  "change.ceo_replied": {
    priority: "high",
    ar: (p) => `ردّ المدير التنفيذي على الطلب ${p.code}: ${p.text}`,
    en: (p) => `The CEO replied on request ${p.code}: ${p.text}`,
  },
  "change.logged": {
    priority: "normal",
    ar: (p) => `أضاف المبرمج تغييراً على النظام ${p.code}: ${p.title}`,
    en: (p) => `The programmer made a change to the system ${p.code}: ${p.title}`,
  },
  "leave.revoked": {
    priority: "high",
    ar: (p) => `ألغى المدير التنفيذي إجازتك الموافق عليها من ${p.from} إلى ${p.to} — هذه الأيام أيام عمل عادية`,
    en: (p) => `The CEO called off your approved leave from ${p.from} to ${p.to} — those are normal working days again`,
  },
  "leave.rejected": {
    priority: "high",
    ar: (p) => `تم رفض طلب إجازتك من ${p.from} إلى ${p.to}`,
    en: (p) => `Your leave request from ${p.from} to ${p.to} was rejected`,
  },
  "hr.skill_requested": {
    priority: "normal",
    ar: (p) => `${p.actor} أضاف مهارة بانتظار موافقتك: ${p.skill}`,
    en: (p) => `${p.actor} added a skill waiting for your approval: ${p.skill}`,
  },
  "hr.skill_approved": {
    priority: "normal",
    ar: (p) => `تمت الموافقة على مهارتك: ${p.skill}`,
    en: (p) => `Your skill was approved: ${p.skill}`,
  },
  "hr.skill_rejected": {
    priority: "normal",
    ar: (p) => `لم تتم الموافقة على مهارتك: ${p.skill}`,
    en: (p) => `Your skill was not approved: ${p.skill}`,
  },
  "kpi.manager_rated": {
    priority: "normal",
    ar: (p) => `تم تقييم عملك الإداري لشهر ${p.month} — اطّلع على مؤشر أدائك`,
    en: (p) => `Your management work for ${p.month} was rated — see your KPI`,
  },
  "kpi.bonus_announced": {
    priority: "high",
    ar: (p) => `تم تحديد مكافأة شهر ${p.month}: ${p.amount} لأصحاب المراكز الأولى في مؤشرات الأداء — اعرف كم تحتاج للفوز`,
    en: (p) => `The ${p.month} bonus is set: ${p.amount} for the top KPI places — see what you need to win`,
  },
  "payroll.ready": {
    priority: "normal",
    ar: (p) => `تم إغلاق شهر ${p.month}: كشف الراتب ومؤشرات الأداء جاهزة`,
    en: (p) => `Month ${p.month} is closed: your payslip and KPI are ready`,
  },
  "finance.transfer_sent": {
    priority: "normal",
    ar: (p) => `${p.actor} سجّل حوالة بين الفروع: ${p.amount} ${p.currency}`,
    en: (p) => `${p.actor} recorded a branch transfer: ${p.amount} ${p.currency}`,
  },
  "finance.transfer_received": {
    priority: "normal",
    ar: (p) => `تم استلام الحوالة: ${p.amount} ${p.currency}`,
    en: (p) => `Transfer received: ${p.amount} ${p.currency}`,
  },
  "finance.payment_received": {
    priority: "normal",
    ar: (p) => `دفعة مستلمة من ${p.project}: ${p.amount} ${p.currency}`,
    en: (p) => `Payment received for ${p.project}: ${p.amount} ${p.currency}`,
  },
  "finance.over_budget": {
    priority: "high",
    ar: (p) => `المشروع ${p.project} تجاوز الميزانية: التكلفة ${p.cost} من ${p.budget} ${p.currency}`,
    en: (p) => `${p.project} is over budget: cost ${p.cost} of ${p.budget} ${p.currency}`,
  },
  "project.risk_changed": {
    priority: "high",
    ar: (p) => `ارتفع مستوى خطر المشروع ${p.project} إلى: ${p.levelAr}`,
    en: (p) => `Project ${p.project} risk is now: ${p.levelEn}`,
  },
  "project.stage_ready": {
    priority: "high",
    ar: (p) => `المشروع ${p.projectAr || p.project} جاهز لقسمك — يمكن البدء بمرحلة: ${p.stageAr || p.stage}`,
    en: (p) => `Project ${p.project} is ready for your department — you can start the stage: ${p.stage}`,
  },
  "project.stage_unassigned": {
    priority: "high",
    ar: (p) => `عاجل: أُلغيت المهمة #${p.number} وأصبحت مرحلة ${p.stageAr || p.stage} في المشروع ${p.projectAr || p.project} بلا عمل — المراحل التالية متوقفة حتى تُسند مهمة جديدة أو تُتخطى المرحلة`,
    en: (p) => `Critical: task #${p.number} was cancelled and the stage ${p.stage} of ${p.project} has no work left — the next stages are on hold until new work is assigned or the stage is skipped`,
  },
  "user.left_with_tasks": {
    priority: "high",
    ar: (p) => `${p.name} لم يعد يعمل في النظام ولديه ${p.n} مهام مفتوحة على المخطط — أعطها لموظف آخر حتى لا تتوقف المهام التي تنتظرها`,
    en: (p) => `${p.name} can no longer work in the system and has ${p.n} open tasks on the plan — give them to someone else so the work waiting for them isn't stuck`,
  },
  "project.intake_new": {
    priority: "high",
    ar: (p) => `استمارة مشروع جديد #${p.number} من ${p.actor}: ${p.project} — العميل ${p.client}. أكمل البيانات المالية لتحويله إلى مشروع`,
    en: (p) => `New project intake #${p.number} from ${p.actor}: ${p.project} — client ${p.client}. Add the financial details to turn it into a project`,
  },
  "project.intake_converted": {
    priority: "normal",
    ar: (p) => `أصبحت استمارة المشروع #${p.number} مشروعاً قيد العمل: ${p.project}`,
    en: (p) => `Project intake #${p.number} is now a project: ${p.project}`,
  },
  "project.intake_declined": {
    priority: "high",
    ar: (p) => `لن يُنفّذ مشروع الاستمارة #${p.number}: ${p.project} — ${p.reason}`,
    en: (p) => `Project intake #${p.number} was declined: ${p.project} — ${p.reason}`,
  },
  "project.intake_reopened": {
    priority: "normal",
    ar: (p) => `أُعيد فتح استمارة المشروع #${p.number}: ${p.project}`,
    en: (p) => `Project intake #${p.number} was reopened: ${p.project}`,
  },
  "task.customer_review": {
    priority: "high",
    ar: (p) => `المهمة #${p.number} جاهزة لمراجعتك: ${p.title}`,
    en: (p) => `Task #${p.number} is ready for your review: ${p.title}`,
  },
  "task.review_passed": {
    priority: "normal",
    ar: (p) =>
      `اعتمد ${{ manager: "مدير القسم", gm: "المدير العام", customer: "العميل" }[p.level] || ""} المهمة #${p.number} — بانتظار مراجعة ${{ manager: "مدير القسم", gm: "المدير العام", customer: "العميل" }[p.next] || ""}: ${p.title}`,
    en: (p) =>
      `The ${{ manager: "department manager", gm: "GM", customer: "customer" }[p.level] || "reviewer"} approved task #${p.number} — now waiting for the ${{ manager: "department manager", gm: "GM", customer: "customer" }[p.next] || "next reviewer"}: ${p.title}`,
  },
  "task.revision_added": {
    priority: "high",
    ar: (p) => `طلب تعديل جديد R-${p.revision} على المهمة المعتمدة #${p.number} (تغيير من العميل): ${p.title}${p.note ? ` — ${p.note}` : ""}`,
    en: (p) => `New revision R-${p.revision} on approved task #${p.number} (a change from the client): ${p.title}${p.note ? ` — ${p.note}` : ""}`,
  },
  // A client change after approval (lib/clientChangeServer.js).
  "task.change_requested": {
    priority: "high",
    ar: (p) => `${p.actor} يطلب تغييراً من العميل ${p.code} على المهمة المعتمدة #${p.number}: ${p.text}`,
    en: (p) => `${p.actor} asks for a client change ${p.code} on approved task #${p.number}: ${p.text}`,
  },
  "task.change_declined": {
    priority: "normal",
    ar: (p) => `رُفض طلب التغيير ${p.code} على المهمة #${p.number}${p.text ? `: ${p.text}` : ""}`,
    en: (p) => `Client change ${p.code} on task #${p.number} was declined${p.text ? `: ${p.text}` : ""}`,
  },
  "task.change_applied": {
    priority: "normal",
    ar: (p) => `نُفّذ طلب التغيير ${p.code} على المهمة #${p.number}`,
    en: (p) => `Client change ${p.code} on task #${p.number} was applied`,
  },
  "task.change_wait": {
    priority: "normal",
    ar: (p) => `المهمة #${p.number} تنتظر تغييراً من العميل (${p.code}) على #${p.root}: ${p.title}`,
    en: (p) => `Task #${p.number} now waits for a client change (${p.code}) to #${p.root}: ${p.title}`,
  },
  "task.change_warn": {
    priority: "high",
    ar: (p) => `انتبه: طلب العميل تغييراً (${p.code}) على #${p.root} التي تعتمد عليها مهمتك #${p.number}: ${p.title}`,
    en: (p) => `Heads-up: the client asked for a change (${p.code}) to #${p.root}, which your task #${p.number} builds on: ${p.title}`,
  },
  "task.change_pause": {
    priority: "high",
    ar: (p) => `أُوقفت مهمتك #${p.number} حتى يجهز تغيير العميل (${p.code}) على #${p.root}: ${p.title}`,
    en: (p) => `Your task #${p.number} is paused until a client change (${p.code}) to #${p.root} is ready: ${p.title}`,
  },
  "task.change_hold": {
    priority: "normal",
    ar: (p) => `مراجعة مهمتك #${p.number} معلّقة حتى يجهز تغيير العميل (${p.code}): ${p.title}`,
    en: (p) => `The review of your task #${p.number} is on hold until a client change (${p.code}) is ready: ${p.title}`,
  },
  "task.change_returned": {
    priority: "high",
    ar: (p) => `أُعيدت مهمتك #${p.number} للتعديل بسبب تغيير من العميل (${p.code}) — لا يُحسب عليك: ${p.title}`,
    en: (p) => `Your task #${p.number} is returned for a client change (${p.code}) — it doesn't count against you: ${p.title}`,
  },
  "task.change_check": {
    priority: "high",
    ar: (p) => `فحص سريع للمهمة #${p.number} بعد تغيير من العميل (${p.code}): ${p.note}`,
    en: (p) => `A quick check of task #${p.number} after a client change (${p.code}): ${p.note}`,
  },
  "task.change_ready": {
    priority: "high",
    ar: (p) => `تغيير العميل جاهز — يمكن إكمال المهمة #${p.number}: ${p.title}`,
    en: (p) => `The client change is ready — task #${p.number} can go on: ${p.title}`,
  },
  "finance.client_change": {
    priority: "high",
    ar: (p) => `تغيير مدفوع من العميل ${p.code}${p.project ? ` — ${p.project}` : ""}: ${p.hours} ساعة إضافية`,
    en: (p) => `Paid client change ${p.code}${p.project ? ` — ${p.project}` : ""}: ${p.hours} extra hours`,
  },
  "task.customer_rejected": {
    priority: "high",
    ar: (p) => `طلب العميل تعديلات على المهمة #${p.number} — طلب تعديل جديد R-${p.revision}: ${p.title}`,
    en: (p) => `The customer asked for changes to task #${p.number} — new revision request R-${p.revision}: ${p.title}`,
  },
  "task.cancel_requested": {
    priority: "high",
    ar: (p) => `${p.actor} يطلب إلغاء المهمة #${p.number}: ${p.title} — السبب: ${p.reason}`,
    en: (p) => `${p.actor} asks to cancel task #${p.number}: ${p.title} — reason: ${p.reason}`,
  },
  "task.cancel_rejected": {
    priority: "high",
    ar: (p) => `رُفض طلب إلغاء المهمة #${p.number} — تابع العمل عليها: ${p.title}${p.note ? ` — ${p.note}` : ""}`,
    en: (p) => `The request to cancel task #${p.number} was turned down — carry on with it: ${p.title}${p.note ? ` — ${p.note}` : ""}`,
  },
  "task.cancelled": {
    priority: "high",
    ar: (p) => `${p.actor} ألغى المهمة #${p.number}: ${p.title}${p.reason ? ` — ${p.reason}` : ""}`,
    en: (p) => `${p.actor} cancelled task #${p.number}: ${p.title}${p.reason ? ` — ${p.reason}` : ""}`,
  },
  "task.restored": {
    priority: "high",
    ar: (p) => `${p.actor} أعاد المهمة الملغاة #${p.number} إلى جدولك: ${p.title}`,
    en: (p) => `${p.actor} restored the cancelled task #${p.number} to your schedule: ${p.title}`,
  },
  "task.unblocked": {
    priority: "normal",
    ar: (p) => `المهمة #${p.number} جاهزة للبدء — سُلّمت المهام التي تعتمد عليها: ${p.title}`,
    en: (p) => `Task #${p.number} can start now — the tasks it was waiting for are handed in: ${p.title}`,
  },
  "task.predecessor_rejected": {
    priority: "high",
    ar: (p) =>
      p.started
        ? `رُفضت المهمة #${p.rejected} التي تعتمد عليها مهمتك #${p.number} — سيُعاد العمل عليها (R-${p.revision}): ${p.title}`
        : `المهمة #${p.number} بانتظار من جديد — رُفضت المهمة #${p.rejected} ويجب تسليم تعديلها (R-${p.revision}) أولاً: ${p.title}`,
    en: (p) =>
      p.started
        ? `Task #${p.rejected}, which your task #${p.number} builds on, was rejected and is being redone (R-${p.revision}): ${p.title}`
        : `Task #${p.number} is waiting again — #${p.rejected} was rejected and its redo (R-${p.revision}) must be handed in first: ${p.title}`,
  },
  "attendance.missing_checkout": {
    priority: "normal",
    ar: (p) => `لا توجد بصمة خروج ليوم ${p.date}${p.name ? ` — ${p.name}` : ""}`,
    en: (p) => `No check-out punch on ${p.date}${p.name ? ` — ${p.name}` : ""}`,
  },
  "hr.contract_ending": {
    priority: "high",
    ar: (p) => `ينتهي عقد ${p.name} بتاريخ ${p.date} (بعد ${p.days} يوم)`,
    en: (p) => `${p.name}'s contract ends on ${p.date} (in ${p.days} days)`,
  },
  "hr.device_offline": {
    priority: "high",
    ar: (p) => `جهاز البصمة "${p.device}" لم يرسل بيانات منذ ${p.hours} ساعة`,
    en: (p) => `Fingerprint device "${p.device}" hasn't sent data for ${p.hours} hours`,
  },
  "project.proposal_new": {
    priority: "high",
    ar: (p) => `${p.actor} يطلب بدء مشروع من الاستمارة #${p.number}: ${p.project} — بانتظار موافقتك`,
    en: (p) => `${p.actor} asks to start a project from intake #${p.number}: ${p.project} — waiting for your approval`,
  },
  "project.proposal_accepted": {
    priority: "high",
    ar: (p) => `${p.actor} وافق على المشروع ${p.project} وبدأ العمل عليه`,
    en: (p) => `${p.actor} accepted the project ${p.project}; it has started`,
  },
  "overtime.requested": {
    priority: "normal",
    ar: (p) => `${p.actor} يطلب ${p.hours} ساعة عمل إضافي اليوم — بانتظار موافقتك`,
    en: (p) => `${p.actor} asks for ${p.hours}h of overtime today — waiting for your approval`,
  },
  "overtime.approved": {
    priority: "normal",
    ar: (p) => `${p.actor} وافق على ${p.hours} ساعة عمل إضافي ليوم ${p.date}`,
    en: (p) => `${p.actor} approved ${p.hours}h of overtime for ${p.date}`,
  },
  "overtime.rejected": {
    priority: "normal",
    ar: (p) => `${p.actor} رفض طلب العمل الإضافي ليوم ${p.date} — لن يُحتسب`,
    en: (p) => `${p.actor} rejected the overtime request for ${p.date} — it won't count`,
  },
  "training.assigned": {
    priority: "normal",
    ar: (p) => `${p.actor} أضاف لك مهمة تدريبية: ${p.title}`,
    en: (p) => `${p.actor} gave you a training task: ${p.title}`,
  },
  "training.finished": {
    priority: "normal",
    ar: (p) => `${p.actor} أنهى مهمة تدريبية بانتظار تقييمك: ${p.title}`,
    en: (p) => `${p.actor} finished a training task waiting for your rating: ${p.title}`,
  },
  "training.rated": {
    priority: "normal",
    ar: (p) => `${p.actor} قيّم مهمتك التدريبية "${p.title}": ${p.stars} من 5`,
    en: (p) => `${p.actor} rated your training task "${p.title}": ${p.stars} out of 5`,
  },
  "customer.payment_due": {
    priority: "high",
    ar: (p) => `حان موعد الدفعة ${p.n} لمشروع ${p.project}`,
    en: (p) => `Payment ${p.n} for ${p.project} is now due`,
  },
  "invoice.drafted": {
    priority: "high",
    ar: (p) => `${p.actor} أنجز معلَم "${p.milestone}" في ${p.project} — فاتورة مسودة بقيمة ${p.amount} بانتظار إصدارها`,
    en: (p) => `${p.actor} reached the milestone "${p.milestone}" of ${p.project} — a draft invoice of ${p.amount} is waiting to be issued`,
  },
  "purchase.requested": {
    priority: "normal",
    ar: (p) => `${p.actor} يطلب شراء: ${p.title} (${p.number}) — بانتظار موافقتك`,
    en: (p) => `${p.actor} asks to buy: ${p.title} (${p.number}) — waiting for your approval`,
  },
  "purchase.approved": {
    priority: "normal",
    ar: (p) => `${p.actor} وافق على طلب الشراء: ${p.title}`,
    en: (p) => `${p.actor} approved the purchase: ${p.title}`,
  },
  "purchase.rejected": {
    priority: "normal",
    ar: (p) => `${p.actor} رفض طلب الشراء: ${p.title}`,
    en: (p) => `${p.actor} rejected the purchase: ${p.title}`,
  },
  "purchase.received": {
    priority: "high",
    ar: (p) => `وصل ${p.title} (${p.number}) — يمكن بدء المهمة التي كانت تنتظره`,
    en: (p) => `${p.title} (${p.number}) has arrived — the task waiting for it can start`,
  },
  "asset.assigned": {
    priority: "normal",
    ar: (p) => `${p.actor} سلّمك عهدة: ${p.name}`,
    en: (p) => `${p.actor} handed you: ${p.name}`,
  },
  "asset.expiring": {
    priority: "high",
    ar: (p) => `ينتهي ترخيص ${p.name} في ${p.date}`,
    en: (p) => `The licence of ${p.name} ends on ${p.date}`,
  },
  "asset.expired": {
    priority: "high",
    ar: (p) => `انتهى ترخيص ${p.name} في ${p.date}`,
    en: (p) => `The licence of ${p.name} ended on ${p.date}`,
  },
  "sales.quote_accepted": {
    priority: "high",
    ar: (p) => `${p.actor} سجّل قبول عرض السعر: ${p.project} لـ ${p.client} — استمارة استقبال جديدة جاهزة`,
    en: (p) => `${p.actor} recorded the accepted quotation: ${p.project} for ${p.client} — a new intake form is ready`,
  },
  "appraisal.opened": {
    priority: "normal",
    ar: (p) => `${p.actor} فتح تقييم الأداء "${p.name}" — الموعد ${p.date}`,
    en: (p) => `${p.actor} opened the performance review "${p.name}" — due ${p.date}`,
  },
  "appraisal.reassigned": {
    priority: "normal",
    ar: (p) => `أصبحت مسؤولاً عن تقييمات جديدة في "${p.name}" بعد تغيير في الهيكل — الموعد ${p.date}`,
    en: (p) => `You now write more reviews in "${p.name}" after a change in the organization — due ${p.date}`,
  },
  "appraisal.reviewed": {
    priority: "normal",
    ar: (p) => `${p.actor} أكمل تقييم أدائك في "${p.name}"`,
    en: (p) => `${p.actor} finished your performance review in "${p.name}"`,
  },
  "recruitment.onboarding": {
    priority: "normal",
    ar: (p) => `تجهيز موظف جديد: ${p.title} لـ ${p.name} قبل ${p.date}`,
    en: (p) => `New starter: ${p.title} for ${p.name} by ${p.date}`,
  },
  "system.error": {
    priority: "high",
    ar: (p) => `خطأ جديد في الموقع: ${p.message}`,
    en: (p) => `New error on the site: ${p.message}`,
  },
  "conversation.added": {
    priority: "normal",
    ar: (p) => `${p.actor} أضافك إلى المجموعة: ${p.conversation}`,
    en: (p) => `${p.actor} added you to the group: ${p.conversation}`,
  },
};

// Groups people can switch off in their notification preferences. Account messages
// ("user.*") can't be muted.
export const NOTIFICATION_GROUPS = {
  tasks: ["task.", "training."],
  projects: ["project."],
  messages: ["message.", "conversation."],
  hr: ["attendance.", "leave.", "payroll.", "hr.", "overtime."],
  kpi: ["kpi."],
  finance: ["finance.", "invoice."],
  purchasing: ["purchase.", "asset."],
  sales: ["sales."],
  people: ["appraisal.", "recruitment."],
};

export function groupOf(type) {
  return Object.keys(NOTIFICATION_GROUPS).find((g) => NOTIFICATION_GROUPS[g].some((prefix) => type.startsWith(prefix))) || null;
}

export function serializeNotification(n) {
  return {
    id: n._id.toString(),
    type: n.type,
    message: n.message,
    link: n.link,
    priority: n.priority,
    // Rings with the alert sound: a decision is waiting.
    alert: Boolean(TEMPLATES[n.type]?.alert),
    // What it's about, so its page can point at it (components/dashboard/focusEntity.js).
    entityType: n.entityType || "",
    entityId: n.entityId ? String(n.entityId) : "",
    read: n.read,
    createdAt: n.createdAt,
  };
}

// Creates one notification per recipient, pushes it live, and emails the
// high-priority ones. Never throws.
// `paramsAr` overrides params in the Arabic text (e.g. Arabic names). The actor's
// Arabic name is used there automatically.
export async function notify({ type, recipients, actor = null, params = {}, paramsAr = {}, link = "", entityType = "", entityId = "" }) {
  const template = TEMPLATES[type];
  const candidates = [...new Set([].concat(recipients).filter(Boolean).map(String))].filter(
    (id) => id !== String(actor?.id || actor || "")
  );
  if (!template || candidates.length === 0) return;

  try {
    const group = groupOf(type);
    const people = await User.find({ _id: { $in: candidates }, status: "active" }, { email: 1, notificationPrefs: 1, role: 1, access: 1 }).lean();
    const allowed = people.filter((u) => !group || !(u.notificationPrefs?.muted || []).includes(group));
    const ids = allowed.map((u) => u._id.toString());
    if (!ids.length) return;

    // A dashboard link only for staff who can open that page (lib/pageAccess.js):
    // otherwise the notice still arrives, without a link that ends in "no access".
    // (Accounts without a role — customers — keep their links: theirs are customer pages.)
    const linkFor = {};
    if (link.startsWith("/dashboard/")) {
      const staff = allowed.filter((u) => u.role && u.role !== DEFAULT_ROLE);
      const roleDocs = await Role.find({ key: { $in: [...new Set(staff.map((u) => u.role))] } }).lean();
      const roles = Object.fromEntries(roleDocs.map((r) => [r.key, r]));
      for (const u of staff) {
        const access = effectiveAccess(roles[u.role], u.access, u.role);
        if (!canOpenPath({ isStaff: true, ...access }, link)) linkFor[u._id.toString()] = "";
      }
    }
    const linkOf = (id) => (id in linkFor ? linkFor[id] : link);

    const arParams = { ...params, ...paramsAr };
    if (actor?.nameAr && params.actor && params.actor === (actor.name || actor.email) && !paramsAr.actor) arParams.actor = actor.nameAr;
    const message = { ar: template.ar(arParams), en: template.en(params) };
    const docs = await Notification.insertMany(
      ids.map((user) => ({
        user,
        type,
        actor: actor?.id || actor || null,
        message,
        link: linkOf(user),
        entityType,
        entityId: entityId ? String(entityId) : "",
        priority: template.priority,
      }))
    );

    await Promise.all(
      docs.map((doc) => publish(userChannel(doc.user.toString()), "notification:new", serializeNotification(doc)))
    );

    // Email now: "important" (default) = high-priority types, "all" = everything.
    const emailNow = allowed.filter((u) => {
      const mode = u.notificationPrefs?.email || "important";
      return mode === "all" || (mode === "important" && template.priority === "high");
    });
    if (emailNow.length) {
      const sent = [];
      await Promise.all(
        emailNow.map((u) =>
          sendNotificationEmail({ to: u.email, message, link: linkOf(u._id.toString()) })
            .then(() => sent.push(u._id.toString()))
            .catch((err) => console.error("notification email error", err?.message || err))
        )
      );
      if (sent.length) {
        await Notification.updateMany({ _id: { $in: docs.filter((d) => sent.includes(d.user.toString())).map((d) => d._id) } }, { emailedAt: new Date() });
      }
    }
  } catch (err) {
    console.error("notify error", type, err);
  }
}

// Everyone whose role has the given permission company-wide (e.g. who manages users).
// Only roles with scope "all": these alerts are about the whole company (sign-ups,
// finance, HR summaries), so a role limited to one department doesn't get them.
// For something about one department use usersWithPermissionFor() (lib/scope.js).
export async function usersWithPermission(permission) {
  const roles = await Role.find({ permissions: permission, scope: "all", key: { $nin: HIDDEN_ROLES } }, { key: 1 }).lean();
  const users = await User.find(
    { role: { $in: roles.map((r) => r.key) }, status: "active" },
    { _id: 1 }
  ).lean();
  return users.map((u) => u._id.toString());
}
