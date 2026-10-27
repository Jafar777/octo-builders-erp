import Notification from "@/models/Notification";
import User from "@/models/User";
import Role from "@/models/Role";
import { publish, userChannel } from "@/lib/realtime/server";
import { sendNotificationEmail } from "@/lib/resend";

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
  "conversation.added": {
    priority: "normal",
    ar: (p) => `${p.actor} أضافك إلى المجموعة: ${p.conversation}`,
    en: (p) => `${p.actor} added you to the group: ${p.conversation}`,
  },
};

// Groups people can switch off in their notification preferences. Account messages
// ("user.*") can't be muted.
export const NOTIFICATION_GROUPS = {
  tasks: ["task."],
  projects: ["project."],
  messages: ["message.", "conversation."],
  hr: ["attendance.", "leave.", "payroll.", "hr."],
  kpi: ["kpi."],
  finance: ["finance."],
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
    const people = await User.find({ _id: { $in: candidates }, status: "active" }, { email: 1, notificationPrefs: 1 }).lean();
    const allowed = people.filter((u) => !group || !(u.notificationPrefs?.muted || []).includes(group));
    const ids = allowed.map((u) => u._id.toString());
    if (!ids.length) return;

    const arParams = { ...params, ...paramsAr };
    if (actor?.nameAr && params.actor && params.actor === (actor.name || actor.email) && !paramsAr.actor) arParams.actor = actor.nameAr;
    const message = { ar: template.ar(arParams), en: template.en(params) };
    const docs = await Notification.insertMany(
      ids.map((user) => ({
        user,
        type,
        actor: actor?.id || actor || null,
        message,
        link,
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
          sendNotificationEmail({ to: u.email, message, link })
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

// Everyone whose role has the given permission (e.g. who manages users).
export async function usersWithPermission(permission) {
  const roles = await Role.find({ permissions: permission }, { key: 1 }).lean();
  const users = await User.find(
    { role: { $in: roles.map((r) => r.key) }, status: "active" },
    { _id: 1 }
  ).lean();
  return users.map((u) => u._id.toString());
}
