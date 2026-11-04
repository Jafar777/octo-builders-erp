// Department managers heading more than one department. Deep-merged in translations.js.

const org = {
  ar: {
    errors: { reassign_own_department: "يمكنك إعطاء المهام لموظفي قسمك فقط" },
    erp: {
      staff: {
        managedDepartments: "يدير أيضاً الأقسام",
        managedDepartmentsHint: "مدير القسم يمكن أن يدير أكثر من قسم: يراجع مهامها ويوافق على إجازاتها وعملها الإضافي، ويظهر رئيساً لها في الهيكل التنظيمي.",
      },
      hierarchy: { alsoManages: "يدير هذا القسم أيضاً" },
      settings: { dragToOrder: "اسحب للأعلى أو للأسفل لتغيير الترتيب" },
      tasks: {
        startFor: "بدء المهمة عن {name}",
        startForHint: "كمدير القسم يمكنك بدء المهمة عن موظفك؛ يُبلَّغ بذلك ويُحتسب وقته من الآن.",
        reassignHint: "تُعطى المهمة لموظف آخر قبل بدئها، ويضعها المخطط الزمني في أول وقت فارغ لديه — لا يُحدَّد موعد تسليم يدوياً.",
      },
      messages: {
        viewMine: "محادثاتي",
        reviewScopeAll: "مراجعة كل محادثات الشركة (للقراءة فقط، وكل محادثة تُفتح تُسجّل في سجل التدقيق).",
        reviewScopeDept: "مراجعة محادثات موظفي أقسامك (للقراءة فقط، وكل محادثة تُفتح تُسجّل في سجل التدقيق).",
      },
    },
  },
  en: {
    errors: { reassign_own_department: "You can give tasks only to your own department's employees" },
    erp: {
      staff: {
        managedDepartments: "Also manages these departments",
        managedDepartmentsHint: "A department manager can head more than one department: they review its tasks, approve its leave and overtime, and show as its head in the organization chart.",
      },
      hierarchy: { alsoManages: "Also heads this department" },
      settings: { dragToOrder: "Drag up or down to change the order" },
      tasks: {
        startFor: "Start for {name}",
        startForHint: "As their department manager you can start the task for your employee; they're told and their time counts from now.",
        reassignHint: "The not-started task goes to another employee and the Gantt puts it in their first free time — no delivery date is set by hand.",
      },
      messages: {
        viewMine: "My chats",
        reviewScopeAll: "Review every conversation in the company (read-only; every chat opened is written to the audit log).",
        reviewScopeDept: "Review your departments' employees' conversations (read-only; every chat opened is written to the audit log).",
      },
    },
  },
};

export default org;
