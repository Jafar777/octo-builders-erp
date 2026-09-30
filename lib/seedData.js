// Services and projects from the company profile. They are inserted once into an
// empty database (see lib/seed.js) and are fully editable from the dashboard after that.

const ZENBARAKJI = { ar: "م. محمد زنبركجي", en: "Arch. Muhammad Zenbarakji" };

function designers(ar, en) {
  return { ar: `${ZENBARAKJI.ar}، ${ar}`, en: `${ZENBARAKJI.en}, ${en}` };
}

function gallery(prefix, count) {
  return Array.from({ length: count }, (_, i) => `/profile/${prefix}-${i + 1}.jpg`);
}

export const SEED_SERVICES = [
  {
    category: "design",
    icon: "building",
    title: { ar: "التصميم الخارجي", en: "Exterior Design" },
    description: {
      ar: "تصميم واجهات مبتكرة ومنسجمة مع محيطها تجمع بين الإبداع والوظيفة والتناغم البصري.",
      en: "Crafting innovative and contextually sensitive building facades that combine creativity, function, and visual harmony.",
    },
  },
  {
    category: "design",
    icon: "sofa",
    title: { ar: "التصميم الداخلي", en: "Interior Design" },
    description: {
      ar: "ابتكار مساحات داخلية مخصصة تعكس الشخصية والراحة وجمالية عصرية راقية.",
      en: "Creating personalized interior spaces that reflect character, comfort, and a refined modern aesthetic.",
    },
  },
  {
    category: "design",
    icon: "armchair",
    title: { ar: "تصميم الأثاث", en: "Furniture Design" },
    description: {
      ar: "تصميم قطع أثاث حسب الطلب تنسجم مع هوية المشروع وتعزز تفرّده.",
      en: "Designing custom furniture pieces that harmonize with the overall project identity and enhance uniqueness.",
    },
  },
  {
    category: "technical",
    icon: "ruler",
    title: { ar: "المخططات التنفيذية", en: "Shop Drawing" },
    description: {
      ar: "تقديم رسومات فنية دقيقة توضح تفاصيل عناصر البناء والتركيب.",
      en: "Providing precise technical drawings that detail construction and installation elements.",
    },
  },
  {
    category: "technical",
    icon: "factory",
    title: { ar: "مخططات التصنيع", en: "Fabrication Drawing" },
    description: {
      ar: "إعداد رسومات تصنيع تفصيلية مخصصة للمصنّعين والموردين لضمان دقة التنفيذ.",
      en: "Producing detailed manufacturing drawings tailored for fabricators and suppliers to ensure accurate implementation.",
    },
  },
  {
    category: "technical",
    icon: "file-check",
    title: { ar: "مخططات الوضع القائم", en: "As-Built Drawing" },
    description: {
      ar: "توثيق الحالة النهائية للمشروع كما نُفّذ، بما يعكس الواقع في الموقع بدقة.",
      en: "Documenting the final condition of the project as built, accurately reflecting on-site reality.",
    },
  },
  {
    category: "execution",
    icon: "hard-hat",
    title: { ar: "الإشراف على المواقع", en: "Site Supervision" },
    description: {
      ar: "إدارة المشروع في الموقع لضمان مطابقة جميع الأعمال للمخططات المعتمدة ومعايير الجودة.",
      en: "On-site project management to ensure all works align with approved drawings and quality standards.",
    },
  },
  {
    category: "execution",
    icon: "package",
    title: { ar: "توريد مواد التشطيب", en: "Finishing Materials Supply" },
    description: {
      ar: "توريد مواد تشطيب معمارية عالية الجودة ضمن خدمة تنفيذ متكاملة، بما يضمن التوافق بين الفكرة التصميمية والواقع.",
      en: "Supplying high-quality architectural finishing materials as part of a comprehensive execution service, ensuring harmony between design intent and material reality.",
    },
  },
  {
    category: "execution",
    icon: "key",
    title: { ar: "التنفيذ المتكامل (تسليم مفتاح)", en: "Turnkey Execution" },
    description: {
      ar: "تقديم حلول متكاملة من التصميم حتى البناء، مع تنفيذ كامل للمشروع بواسطة فريقنا المتمرّس.",
      en: "Offering complete design-to-build solutions, with full project execution handled by our experienced team.",
    },
  },
];

export const SEED_PROJECTS = [
  {
    categories: ["exterior-interior"],
    title: { ar: "موتيل كاديكوي", en: "Kadakoy Motel" },
    description: {
      ar: "واجهة معاصرة مستوحاة من أسلوب الجاباندي الذي يجمع بساطة التصميم الياباني ودفء الطابع الإسكندنافي. خطوط نظيفة وأسطح مائلة بلطف وأحواض نباتية مدمجة في كل طابق تُلطّف الكتلة وتربطها بالطبيعة، بينما تكتمل تجربة الضيوف بصالة علوية بسقف زجاجي وواجهة جانبية زجاجية بكامل الارتفاع وتصاميم داخلية دافئة غنية بالمواد.",
      en: "A contemporary façade inspired by the Japandi approach — Japanese minimalism meets Scandinavian warmth. Clean lines, subtly angled surfaces and integrated planters on every level soften the structure and connect it to nature, while a glass-roofed sky lounge, a full-height glass side façade and warm, material-rich interiors complete the guest experience.",
    },
    location: { ar: "إسطنبول، تركيا", en: "Istanbul, Turkey" },
    year: "2024",
    style: { ar: "جاباندي وعصري", en: "Japandi & Modern" },
    area: "340 m²",
    designers: designers("م. ياسر سلوطة", "Arch. Yaser Salota"),
    client: { ar: "", en: "" },
    imageUrl: "/profile/kadakoy-1.jpg",
    gallery: gallery("kadakoy", 12).slice(1),
  },
  {
    categories: ["exterior-interior", "furniture"],
    title: { ar: "مطعم رز رز", en: "Ruz Ruz Restaurant" },
    description: {
      ar: "يدمج مفهوم «رز رز بخاري» بين الطراز الصناعي والطراز الأوزبكي، مستخدماً الأقواس في الجدران والواجهات لخلق تجربة طعام تمزج الهوية الحضرية بالتراث الأصيل. يضم المطعم منطقة خدمة سريعة بمواد صناعية حديثة وقسم جلوس هادئ بأخشاب وألوان تقليدية، تحت سقف بارتفاع 6.5 متر.",
      en: "The “Ruz Ruz Bukhary” concept merges industrial and Uzbek styles, using arches in the walls and façades to create a dining experience that blends urban identity with authentic heritage. A quick-service area in modern industrial materials sits alongside a tranquil seating section of traditional woods and colors, under a 6.5 m ceiling.",
    },
    location: { ar: "الرياض، المملكة العربية السعودية", en: "Riyadh, Saudi Arabia" },
    year: "2023",
    style: { ar: "أوزبكي وصناعي", en: "Uzbek & Industrial" },
    area: "846 m²",
    designers: designers("م. ليلان الكرمي", "Arch. Lilan Al-Karmi"),
    client: { ar: "", en: "" },
    imageUrl: "/profile/ruzruz-1.jpg",
    gallery: gallery("ruzruz", 6).slice(1),
  },
  {
    categories: ["exterior-interior", "furniture"],
    title: { ar: "4 شاليهات نموذجية", en: "4 Typical Chalet" },
    description: {
      ar: "ملاذ فاخر وسط الطبيعة بتصميم خارجي وداخلي بسيط وأنيق يركّز على الاستدامة والاستفادة من الإضاءة الطبيعية. يستقبل الزوار مدخل فاخر وساحة دائرية تتوسطها نافورة هادئة، ويضم كل شاليه مسبحاً خاصاً وتراساً خارجياً ومساحات معيشة مفتوحة جيدة التهوية بمواد صديقة للبيئة.",
      en: "A luxurious retreat in nature with a simple, elegant exterior and interior focused on sustainability and natural light. Guests are welcomed by an entrance gate and a circular plaza with a tranquil fountain, while each chalet offers a private pool, an outdoor terrace and open, well-ventilated living spaces built with eco-friendly materials.",
    },
    location: { ar: "الرياض، المملكة العربية السعودية", en: "Riyadh, Saudi Arabia" },
    year: "2022",
    style: { ar: "بسيط (مينيماليست)", en: "Minimalist" },
    area: "750 m²",
    designers: designers("م. رزان حسون", "Arch. Razan Hasson"),
    client: { ar: "", en: "" },
    imageUrl: "/profile/chalet-1.jpg",
    gallery: gallery("chalet", 7).slice(1),
  },
  {
    categories: ["exterior-interior"],
    title: { ar: "كشك ستريت كوفي", en: "Street Coffee Booth" },
    description: {
      ar: "كشك عصري أنيق يجمع بين الألوان الدافئة والخطوط النظيفة، يخدم السيارات على الطريق العام والمشاة المتجهين إلى الحدائق المجاورة. كُسي بالكامل بألواح الألوكوبوند لمتانتها وقدرتها على الحفاظ على مظهرها الجذاب لفترة طويلة.",
      en: "A sleek, modern kiosk combining warm colors and clean lines, serving cars on the public road and pedestrians heading to the adjacent parks. It is clad entirely in Alucobond for durability and a lasting attractive appearance.",
    },
    location: { ar: "أبها، المملكة العربية السعودية", en: "Abha, Saudi Arabia" },
    year: "2023",
    style: { ar: "عصري", en: "Modern" },
    area: "12.8 m²",
    designers: designers("م. علي علي", "Arch. Ali Ali"),
    client: { ar: "", en: "" },
    imageUrl: "/profile/booth-1.jpg",
    gallery: gallery("booth", 4).slice(1),
  },
  {
    categories: ["shop-drawing"],
    title: { ar: "مدرسة صافية", en: "Safia School" },
    description: {
      ar: "مخططات تنفيذية متكاملة لمبنى المدرسة تشمل المساقط والواجهات والقطاعات وجداول التشطيبات لضمان دقة التنفيذ.",
      en: "Complete shop drawings for the school building, detailing plans, elevations, sections and finishing schedules for accurate execution.",
    },
    location: { ar: "جدة، المملكة العربية السعودية", en: "Jeddah, Saudi Arabia" },
    client: { ar: "جامعة الملك عبدالعزيز", en: "King Abdulaziz University" },
    imageUrl: "/profile/safia-1.jpg",
    gallery: gallery("safia", 4).slice(1),
  },
  {
    categories: ["shop-drawing"],
    title: { ar: "المبنى الإداري", en: "Administration Building" },
    description: {
      ar: "مخططات تنفيذية تفصيلية للمبنى الإداري تنسّق التفاصيل المعمارية والقطاعات وعناصر الإنشاء.",
      en: "Detailed shop drawings for the administration building, coordinating architectural details, sections and construction elements.",
    },
    location: { ar: "جدة، المملكة العربية السعودية", en: "Jeddah, Saudi Arabia" },
    client: { ar: "جامعة الملك عبدالعزيز", en: "King Abdulaziz University" },
    imageUrl: "/profile/admin-2.jpg",
    gallery: ["/profile/admin-1.jpg", "/profile/admin-3.jpg"],
  },
  {
    categories: ["shop-drawing"],
    title: { ar: "برج T92", en: "T92 Tower" },
    description: {
      ar: "مخططات تنفيذية لبرج سكني شاهق في ماروتا سيتي تشمل الواجهات والقطاعات والتفاصيل المعمارية.",
      en: "Shop drawings for a high-rise residential tower in Marota City, covering elevations, sections and architectural details.",
    },
    location: { ar: "دمشق، سوريا", en: "Damascus, Syria" },
    client: { ar: "ماروتا سيتي", en: "Marota City" },
    imageUrl: "/profile/t92-1.jpg",
    gallery: gallery("t92", 4).slice(1),
  },
  {
    categories: ["shop-drawing"],
    title: { ar: "مستشفى المرجان", en: "Al-Morjan Hospital" },
    description: {
      ar: "مخططات تنفيذية معمارية لمستشفى المرجان تشمل القطاعات والواجهات والتفاصيل الإنشائية.",
      en: "Architectural shop drawings for Al-Morjan Hospital, including sections, elevations and construction details.",
    },
    location: { ar: "جدة، المملكة العربية السعودية", en: "Jeddah, Saudi Arabia" },
    imageUrl: "/profile/morjan-1.jpg",
    gallery: gallery("morjan", 3).slice(1),
  },
];
