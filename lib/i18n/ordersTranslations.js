// The Requests page (app/dashboard/orders). Deep-merged into the main tables in translations.js.
const orders = {
  ar: {
    erp: {
      nav: { orders: "الطلبات", hrMenu: "الموارد البشرية" },
      system: { tab: { audit: "سجل العمليات" } },
      finance: { tab: { sales: "المبيعات", purchases: "المشتريات والأصول" } },
      hr: { tab: { recruitment: "التوظيف" } },
      orders: {
        subtitle: "اطلب إجازة أو عملاً إضافياً أو شراء شيء من هنا، ومن عليه الرد يجيب من هنا.",
        tab: { waiting: "بانتظار ردّك", leave: "الإجازات", overtime: "العمل الإضافي", purchase: "طلبات الشراء" },
        nothing: "لا توجد طلبات بانتظار ردّك.",
      },
    },
  },
  en: {
    erp: {
      nav: { orders: "Requests", hrMenu: "Human resources" },
      system: { tab: { audit: "Audit log" } },
      finance: { tab: { sales: "Sales", purchases: "Purchases & assets" } },
      hr: { tab: { recruitment: "Hiring" } },
      orders: {
        subtitle: "Ask for leave, overtime or a purchase here; whoever decides answers here.",
        tab: { waiting: "Waiting for you", leave: "Leave", overtime: "Overtime", purchase: "Purchases" },
        nothing: "No requests are waiting for you.",
      },
    },
  },
};

export default orders;
