// Default content for every editable homepage section, taken from the company
// profile. It is shown until an admin saves the section from the dashboard.

export const SECTIONS = [
  "hero",
  "about",
  "stats",
  "values",
  "services",
  "process",
  "projects",
  "clients",
  "contact",
];

export const DEFAULTS = {
  hero: {
    mediaType: "image",
    mediaUrl: "/profile/kadakoy-3.jpg",
    title: {
      ar: "العمارة حوار بين الإنسان والمكان",
      en: "Architecture as a dialogue between people and place",
    },
    subtitle: {
      ar: "شركة معمارية متخصصة في التصميم الخارجي والداخلي والمخططات التنفيذية والإشراف والتنفيذ المتكامل",
      en: "A specialized architectural firm for exterior & interior design, shop drawings, site supervision and turnkey execution",
    },
  },

  about: {
    title: { ar: "من نحن", en: "About Us" },
    body: {
      ar: "في أوكتو بيلدرز، نرى العمارة حواراً مستمراً بين الإنسان والمكان، وبين الجمال والوظيفة. نحن شركة معمارية متخصصة نقدم حلولاً متكاملة في التصميم الخارجي والتصميم الداخلي وتنسيق المواقع والمخططات التنفيذية والإشراف على المواقع.\n\nبخبرة تتجاوز 14 عاماً، قدّمنا خدمات معمارية عالية الجودة في المملكة العربية السعودية وخارجها، وبنينا سجلاً حافلاً يعكس الإبداع والدقة والالتزام. يعمل فريقنا من المعماريين والمصممين بروح الفريق الواحد لتحويل رؤى عملائنا إلى مساحات نابضة بالحياة وعملية، مع الحفاظ الدائم على الجودة والوضوح والشفافية في كل مرحلة.",
      en: "At OCTO Builders, we view architecture as a continuous dialogue between people and place, between beauty and function. We are a specialized architectural firm offering integrated solutions in exterior design, interior design, landscape planning, technical drawings, and site supervision.\n\nWith over 14 years of experience, we have delivered high-quality architectural services across Saudi Arabia and beyond, building a strong portfolio that reflects creativity, precision, and commitment. Our team of skilled architects and designers works collaboratively to transform client visions into vibrant, functional spaces — always upholding quality, clarity, and transparency at every stage.",
    },
    imageUrl: "/profile/kadakoy-11.jpg",
    vision: {
      ar: "أن نكون شركة معمارية رائدة في المنطقة من خلال تقديم خدمات متكاملة تشمل التصميم المعماري والمخططات التنفيذية والإشراف على المواقع والتنفيذ الكامل، مع الحفاظ على أعلى معايير الجودة والإبداع والانسجام مع السياق.",
      en: "To be a leading architectural firm in the region by offering fully integrated services — including architectural design, construction drawings, site supervision, and full execution — all while maintaining the highest standards of quality, creativity, and contextual relevance.",
    },
    mission: {
      ar: "تقديم حلول معمارية شاملة تبدأ من الفكرة مروراً بالتصميم والمخططات التنفيذية وصولاً إلى الإشراف والتنفيذ. نجمع بين الرؤية الإبداعية والخبرة التقنية لنصنع مساحات عملية وملهمة ومتجذرة في سياقها الثقافي والبيئي.",
      en: "To deliver comprehensive architectural solutions — from concept through design and construction drawings, to supervision and execution. We combine creative vision with technical expertise to realize spaces that are functional, inspiring, and deeply rooted in cultural and environmental context.",
    },
  },

  stats: {
    items: [
      { value: "14+", label: { ar: "سنة من الخبرة", en: "Years of experience" } },
      { value: "12+", label: { ar: "عميل وشريك", en: "Clients & partners" } },
      { value: "3", label: { ar: "دول نفذنا فيها مشاريع", en: "Countries served" } },
      { value: "9", label: { ar: "خدمات متكاملة", en: "Integrated services" } },
    ],
  },

  values: {
    title: { ar: "قيمنا", en: "Our Core Values" },
    subtitle: {
      ar: "المبادئ التي توجّه كل مشروع ننفذه",
      en: "The principles that guide every project we deliver",
    },
    items: [
      {
        icon: "award",
        title: { ar: "الاحترافية", en: "Professionalism" },
        description: {
          ar: "نلتزم بأعلى معايير الدقة والجودة.",
          en: "We uphold the highest standards of precision and quality.",
        },
      },
      {
        icon: "eye",
        title: { ar: "الشفافية", en: "Transparency" },
        description: {
          ar: "نؤمن بالتواصل المفتوح والصادق.",
          en: "We believe in open and honest communication.",
        },
      },
      {
        icon: "lightbulb",
        title: { ar: "الابتكار", en: "Innovation" },
        description: {
          ar: "نبحث دائماً عن حلول تصميمية مبتكرة.",
          en: "We seek creative design solutions.",
        },
      },
      {
        icon: "handshake",
        title: { ar: "الالتزام", en: "Commitment" },
        description: {
          ar: "نفي بوعودنا في الوقت المحدد وضمن الميزانية.",
          en: "We deliver on our promises, on time and on budget.",
        },
      },
      {
        icon: "map-pin",
        title: { ar: "احترام السياق", en: "Contextual Respect" },
        description: {
          ar: "نعكس هوية الموقع في تصاميمنا.",
          en: "We reflect the site's identity in our designs.",
        },
      },
      {
        icon: "users",
        title: { ar: "العمل الجماعي", en: "Teamwork" },
        description: {
          ar: "نعمل كفريق واحد متماسك نحو رؤية مشتركة.",
          en: "We work as one cohesive team toward a shared vision.",
        },
      },
    ],
  },

  services: {
    title: { ar: "خدماتنا", en: "Our Services" },
    subtitle: {
      ar: "حلول متكاملة من الفكرة حتى التسليم",
      en: "Integrated solutions from concept to handover",
    },
    categories: [
      { key: "design", name: { ar: "خدمات التصميم", en: "Design Services" } },
      { key: "technical", name: { ar: "الخدمات الفنية", en: "Technical Services" } },
      { key: "execution", name: { ar: "خدمات التنفيذ", en: "Execution Services" } },
    ],
  },

  process: {
    title: { ar: "آلية تنفيذ المشاريع", en: "Project Execution Workflow" },
    subtitle: {
      ar: "من الاجتماع الأول حتى التسليم النهائي",
      en: "From the first meeting to the final handover",
    },
    items: [
      {
        title: { ar: "الاجتماع الأولي وجمع المتطلبات", en: "Initial Meeting & Briefing" },
        description: {
          ar: "اجتماع انطلاق لفهم أهداف العميل ومتطلبات المشروع والميزانية والجدول الزمني.",
          en: "A kickoff meeting to understand the client's goals, project requirements, budget, and timeline.",
        },
      },
      {
        title: { ar: "تحليل الموقع والسياق", en: "Site and Context Analysis" },
        description: {
          ar: "دراسة بيئة الموقع والمناخ والأنظمة المحلية والاحتياجات التشغيلية.",
          en: "Studying the site's environment, climate, local regulations, and operational needs.",
        },
      },
      {
        title: { ar: "العرض الفني والمالي", en: "Technical & Financial Proposal" },
        description: {
          ar: "تقديم عرض مفصّل يغطي نطاق العمل والمراحل والتكاليف التقديرية والجدول الزمني للمشروع.",
          en: "Submitting a detailed proposal covering scope, phases, estimated costs, and project schedule.",
        },
      },
      {
        title: { ar: "مرحلة التصميم المبدئي", en: "Conceptual Design Phase" },
        description: {
          ar: "إعداد الفكرة التصميمية الأولية باستخدام المجسمات ثلاثية الأبعاد والمخططات المبدئية للتعبير عن رؤية العميل.",
          en: "Creating the initial design concept using 3D visuals and layout drafts to express the client's vision.",
        },
      },
      {
        title: { ar: "تطوير التصميم", en: "Design Development" },
        description: {
          ar: "تطوير التفاصيل المعمارية واختيار المواد والتشطيبات واعتماد التصميم النهائي.",
          en: "Refining architectural details, selecting materials and finishes, and finalizing the approved design.",
        },
      },
      {
        title: { ar: "إعداد المخططات التنفيذية", en: "Shop Drawings Production" },
        description: {
          ar: "إعداد رسومات فنية دقيقة لتوجيه المقاولين والموردين أثناء التنفيذ.",
          en: "Preparing accurate technical drawings to guide contractors and suppliers during construction.",
        },
      },
      {
        title: { ar: "الإشراف على الموقع / التنفيذ المتكامل", en: "Site Supervision / Turnkey Execution" },
        description: {
          ar: "تقديم إشراف كامل أو تنفيذ مباشر لضمان تنفيذ دقيق وعالي الجودة.",
          en: "Providing full supervision or direct execution to ensure precise and high-quality implementation.",
        },
      },
      {
        title: { ar: "التسليم النهائي", en: "Final Handover" },
        description: {
          ar: "مراجعة جميع الأعمال وإغلاقها ومعالجة الملاحظات وتسليم المشروع مع مخططات الوضع القائم كاملة.",
          en: "Reviewing and closing out all works, addressing any remarks, and handing over the project with full as-built documentation.",
        },
      },
    ],
  },

  projects: {
    title: { ar: "مشاريعنا", en: "Our Projects" },
    subtitle: {
      ar: "مختارات من أعمالنا في التصميم والمخططات التنفيذية",
      en: "Selected work across design and shop drawings",
    },
    categories: [
      { key: "exterior-interior", name: { ar: "تصميم خارجي وداخلي", en: "Exterior & Interior" } },
      { key: "furniture", name: { ar: "تصميم الأثاث", en: "Furniture Design" } },
      { key: "shop-drawing", name: { ar: "مخططات تنفيذية", en: "Shop Drawings" } },
    ],
  },

  clients: {
    title: { ar: "عملاؤنا", en: "Our Clients" },
    subtitle: {
      ar: "جهات وشركات وثقت بخبرتنا",
      en: "Organizations that trusted our expertise",
    },
    items: [
      { name: "King Abdulaziz University", logoUrl: "/profile/client-kau.jpg" },
      { name: "Marota City", logoUrl: "/profile/client-marota-city.jpg" },
      { name: "Safea", logoUrl: "/profile/client-safea.jpg" },
      { name: "Sanad Contracting", logoUrl: "/profile/client-sanad.jpg" },
      { name: "Al-Rashid Trading & Contracting", logoUrl: "/profile/client-alrashid.jpg" },
      { name: "Syrconsult", logoUrl: "/profile/client-syrconsult.jpg" },
      { name: "Rafal", logoUrl: "/profile/client-rafal.jpg" },
      { name: "Comatec", logoUrl: "/profile/client-comatec.jpg" },
      { name: "Bukharez", logoUrl: "/profile/client-bukharez.jpg" },
      { name: "Al-Harsani Architects", logoUrl: "/profile/client-alharsani.jpg" },
      { name: "Khaled Alshanqety Est.", logoUrl: "/profile/client-alshanqety.jpg" },
      { name: "le Concept Studio", logoUrl: "/profile/client-le-concept.jpg" },
    ],
  },

  contact: {
    title: { ar: "تواصل معنا", en: "Contact Us" },
    body: {
      ar: "يسعدنا سماع فكرتك ومساعدتك في تحويلها إلى واقع.",
      en: "We'd love to hear about your project and help bring it to life.",
    },
    email: "info@octo-builders.com",
    phone: "",
    whatsapp: "+963951553393",
    website: "https://www.octo-builders.com",
    instagram: "architectsocto",
    address: { ar: "جدة، المملكة العربية السعودية", en: "Jeddah, Saudi Arabia" },
  },
};
