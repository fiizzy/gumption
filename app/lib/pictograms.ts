// The library of hand-drawn pictograms the whiteboard agent can ask for by
// name and people can pick from the panel. Each is a few open SVG paths in
// a 100 by 100 box; rough.js gives them their sketchy line at render time,
// so they match the rest of the drawing at any stroke width.
//
// Sections and names follow Font Awesome's categories so they are familiar;
// the strokes are our own.

export const PICTOGRAM_BOX_SIZE = 100;

interface PictogramDefinition {
  paths: string[];
  // Words people reach for that are not the pictogram's own name.
  keywords: string[];
}

const circle = (centerX: number, centerY: number, radius: number) =>
  `M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 1 0 ${centerX + radius} ${centerY} A ${radius} ${radius} 0 1 0 ${centerX - radius} ${centerY}`;
const rect = (x: number, y: number, width: number, height: number) => `M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`;
const line = (x1: number, y1: number, x2: number, y2: number) => `M ${x1} ${y1} L ${x2} ${y2}`;
const ellipse = (centerX: number, centerY: number, radiusX: number, radiusY: number) =>
  `M ${centerX - radiusX} ${centerY} A ${radiusX} ${radiusY} 0 1 0 ${centerX + radiusX} ${centerY} A ${radiusX} ${radiusY} 0 1 0 ${centerX - radiusX} ${centerY}`;

const SECTIONS = {
  "Users & People": {
    person: { paths: [circle(50, 30, 14), "M 20 88 C 20 62 34 54 50 54 C 66 54 80 62 80 88"], keywords: ["user", "customer", "actor", "people"] },
    team: {
      paths: [circle(36, 35, 11), "M 12 86 C 12 64 22 56 36 56 C 50 56 60 64 60 86", circle(68, 31, 11), "M 62 56 C 76 54 88 62 88 84"],
      keywords: ["group", "users", "org", "people"],
    },
    headset: {
      paths: ["M 22 62 V 50 A 28 28 0 0 1 78 50 V 62", rect(16, 56, 14, 22), rect(70, 56, 14, 22), "M 77 78 Q 77 90 60 90 H 52"],
      keywords: ["support", "agent", "help", "call centre"],
    },
    "id-card": {
      paths: [rect(10, 24, 80, 52), circle(32, 46, 8), "M 20 68 C 20 58 44 58 44 68", line(54, 42, 80, 42), line(54, 54, 80, 54), line(54, 66, 72, 66)],
      keywords: ["badge", "identity", "employee", "profile"],
    },
  },
  "Devices & Hardware": {
    phone: { paths: [rect(32, 8, 36, 84), line(44, 16, 56, 16), circle(50, 83, 3)], keywords: ["mobile", "ios", "android", "device"] },
    laptop: { paths: [rect(20, 22, 60, 44), line(8, 78, 92, 78), line(20, 66, 14, 78), line(80, 66, 86, 78)], keywords: ["computer", "notebook", "client"] },
    desktop: { paths: [rect(10, 14, 80, 50), line(50, 64, 50, 74), line(34, 74, 66, 74), rect(22, 82, 56, 8)], keywords: ["computer", "monitor", "workstation", "pc"] },
    tablet: { paths: [rect(18, 12, 64, 76), circle(50, 80, 2.5)], keywords: ["ipad", "device", "touch"] },
    watch: { paths: ["M 36 30 V 12 H 64 V 30", "M 36 70 V 88 H 64 V 70", rect(28, 30, 44, 40), line(50, 42, 50, 52), line(50, 52, 58, 52)], keywords: ["wearable", "smartwatch", "time"] },
    server: {
      paths: [rect(16, 18, 68, 26), rect(16, 56, 68, 26), line(26, 31, 30, 31), line(36, 31, 40, 31), line(26, 69, 30, 69), line(36, 69, 40, 69)],
      keywords: ["backend", "api", "host", "machine", "rack"],
    },
    printer: { paths: [rect(14, 40, 72, 30), "M 28 40 V 16 H 72 V 40", "M 28 70 V 86 H 72 V 70", circle(76, 50, 3)], keywords: ["print", "paper", "office"] },
    camera: { paths: [rect(10, 30, 80, 52), "M 34 30 L 40 18 H 60 L 66 30", circle(50, 56, 14), circle(76, 40, 3)], keywords: ["photo", "picture", "capture", "webcam"] },
    tv: { paths: [rect(10, 24, 80, 52), "M 36 8 L 50 24 L 64 8", line(30, 76, 24, 88), line(70, 76, 76, 88)], keywords: ["television", "screen", "display", "kiosk"] },
  },
  "Data & Storage": {
    database: {
      paths: ["M 20 24 A 30 10 0 1 0 80 24 A 30 10 0 1 0 20 24", "M 20 24 V 76", "M 80 24 V 76", "M 20 76 A 30 10 0 0 0 80 76", "M 20 50 A 30 10 0 0 0 80 50"],
      keywords: ["db", "sql", "postgres", "storage", "data"],
    },
    table: { paths: [rect(12, 20, 76, 60), line(12, 40, 88, 40), line(12, 60, 88, 60), line(40, 20, 40, 80), line(64, 20, 64, 80)], keywords: ["grid", "rows", "spreadsheet", "sheet"] },
    folder: { paths: ["M 10 26 H 38 L 46 34 H 90 V 80 H 10 Z", line(10, 42, 90, 42)], keywords: ["directory", "files", "group"] },
    box: { paths: [rect(14, 34, 72, 52), rect(8, 22, 84, 12), line(42, 48, 58, 48)], keywords: ["archive", "crate", "bundle", "storage"] },
    "hard-drive": { paths: [rect(10, 30, 80, 40), line(10, 56, 90, 56), circle(78, 63, 2.5), line(20, 63, 34, 63)], keywords: ["disk", "ssd", "volume", "storage"] },
    "chart-bar": { paths: ["M 14 12 V 86 H 90", rect(26, 52, 12, 34), rect(46, 34, 12, 52), rect(66, 22, 12, 64)], keywords: ["chart", "metrics", "analytics", "report", "graph"] },
    "chart-line": { paths: ["M 14 12 V 86 H 90", "M 22 70 L 40 50 L 56 60 L 84 26"], keywords: ["chart", "trend", "metrics", "analytics", "graph"] },
  },
  "Cloud & Network": {
    cloud: { paths: ["M 30 76 H 72 A 14 14 0 0 0 74 48 A 20 20 0 0 0 36 42 A 17 17 0 0 0 30 76 Z"], keywords: ["aws", "hosting", "internet", "saas"] },
    globe: { paths: [circle(50, 50, 36), "M 50 14 C 32 32 32 68 50 86", "M 50 14 C 68 32 68 68 50 86", "M 14 50 H 86"], keywords: ["world", "internet", "public", "web", "region"] },
    wifi: { paths: ["M 14 46 A 50 50 0 0 1 86 46", "M 28 60 A 30 30 0 0 1 72 60", "M 42 72 A 12 12 0 0 1 58 72", circle(50, 82, 3)], keywords: ["wireless", "network", "connection"] },
    plug: { paths: ["M 36 10 V 34", "M 64 10 V 34", "M 24 34 H 76 V 50 A 26 26 0 0 1 24 50 Z", "M 50 76 V 92"], keywords: ["power", "integration", "connector", "adapter"] },
    link: { paths: ["M 44 56 L 34 66 A 12 12 0 0 1 34 42 L 44 32", "M 56 44 L 66 34 A 12 12 0 0 1 66 58 L 56 68", line(40, 60, 60, 40)], keywords: ["url", "chain", "hyperlink", "reference"] },
    sitemap: {
      paths: [rect(38, 10, 24, 18), rect(8, 66, 24, 18), rect(38, 66, 24, 18), rect(68, 66, 24, 18), "M 50 28 V 48", "M 20 48 H 80", "M 20 48 V 66", "M 50 48 V 66", "M 80 48 V 66"],
      keywords: ["network", "topology", "hierarchy", "tree", "nodes"],
    },
    signal: { paths: [rect(10, 66, 12, 20), rect(32, 52, 12, 34), rect(54, 36, 12, 50), rect(76, 16, 12, 70)], keywords: ["bars", "strength", "cellular", "coverage"] },
  },
  "Code & Process": {
    gear: {
      paths: [circle(50, 50, 28), circle(50, 50, 12), "M 50 14 V 22", "M 50 78 V 86", "M 14 50 H 22", "M 78 50 H 86", "M 24.5 24.5 L 30 30", "M 70 70 L 75.5 75.5", "M 24.5 75.5 L 30 70", "M 70 30 L 75.5 24.5"],
      keywords: ["settings", "config", "process", "worker"],
    },
    terminal: { paths: [rect(10, 18, 80, 64), "M 22 36 L 36 48 L 22 60", line(44, 62, 66, 62)], keywords: ["shell", "cli", "console", "command"] },
    code: { paths: ["M 32 28 L 12 50 L 32 72", "M 68 28 L 88 50 L 68 72", line(58, 22, 42, 78)], keywords: ["source", "script", "function", "module"] },
    bug: {
      paths: [circle(50, 56, 18), "M 40 40 A 12 12 0 0 1 60 40", line(32, 50, 16, 42), line(32, 62, 16, 70), line(68, 50, 84, 42), line(68, 62, 84, 70), line(44, 30, 38, 20), line(56, 30, 62, 20)],
      keywords: ["error", "issue", "defect", "debug"],
    },
    branch: { paths: [circle(26, 20, 8), circle(26, 80, 8), circle(74, 32, 8), "M 26 28 V 72", "M 74 40 C 74 60 26 50 26 72"], keywords: ["git", "version", "merge", "fork"] },
    package: { paths: ["M 50 10 L 88 30 V 70 L 50 90 L 12 70 V 30 Z", "M 12 30 L 50 50 L 88 30", "M 50 50 V 90"], keywords: ["module", "library", "dependency", "npm", "artifact"] },
    wrench: { paths: ["M 88 26 L 76 38 L 66 28 L 78 16 A 22 22 0 0 0 48 40 L 10 78 L 22 90 L 60 52 A 22 22 0 0 0 88 26 Z"], keywords: ["tool", "fix", "maintenance", "build"] },
    robot: {
      paths: [rect(20, 30, 60, 50), circle(38, 52, 5), circle(62, 52, 5), line(38, 68, 62, 68), line(50, 30, 50, 16), circle(50, 12, 4), rect(10, 46, 10, 16), rect(80, 46, 10, 16)],
      keywords: ["bot", "automation", "ai", "agent", "assistant"],
    },
    queue: { paths: [rect(8, 38, 22, 24), rect(38, 38, 22, 24), rect(68, 38, 22, 24)], keywords: ["jobs", "kafka", "stream", "messages", "buffer"] },
  },
  Communication: {
    email: { paths: [rect(12, 26, 76, 48), "M 12 26 L 50 54 L 88 26"], keywords: ["mail", "message", "notification", "newsletter"] },
    comment: { paths: ["M 12 20 H 88 V 66 H 44 L 28 82 V 66 H 12 Z"], keywords: ["chat", "message", "speech", "feedback", "slack"] },
    bell: { paths: ["M 30 70 V 46 A 20 20 0 0 1 70 46 V 70 L 80 78 H 20 Z", "M 42 84 A 8 8 0 0 0 58 84", line(50, 26, 50, 20)], keywords: ["notification", "alert", "push", "reminder"] },
    megaphone: { paths: ["M 14 42 H 32 L 72 22 V 78 L 32 58 H 14 Z", "M 32 58 V 76 H 44 V 60", "M 80 42 A 12 12 0 0 1 80 58"], keywords: ["announce", "broadcast", "marketing", "campaign"] },
    "phone-call": { paths: ["M 24 14 L 40 30 L 32 42 A 36 36 0 0 0 58 68 L 70 60 L 86 76 L 74 88 A 60 60 0 0 1 12 26 Z"], keywords: ["call", "handset", "telephone", "voice", "sms"] },
    "paper-plane": { paths: ["M 10 44 L 90 12 L 68 90 L 50 58 Z", line(50, 58, 90, 12)], keywords: ["send", "submit", "deliver", "dispatch"] },
    inbox: { paths: ["M 10 56 L 22 22 H 78 L 90 56 V 84 H 10 Z", "M 10 56 H 34 L 42 68 H 58 L 66 56 H 90"], keywords: ["tray", "received", "incoming", "mailbox"] },
  },
  Documents: {
    document: { paths: ["M 24 10 H 62 L 78 26 V 90 H 24 Z", "M 62 10 V 26 H 78", "M 34 46 H 68", "M 34 58 H 68", "M 34 70 H 56"], keywords: ["file", "page", "report", "pdf", "text"] },
    image: { paths: [rect(10, 18, 80, 64), circle(34, 38, 7), "M 10 76 L 36 54 L 52 68 L 66 56 L 90 76"], keywords: ["picture", "photo", "media", "asset", "png"] },
    clipboard: { paths: [rect(20, 18, 60, 72), "M 38 24 V 12 H 62 V 24 Z", line(32, 46, 68, 46), line(32, 60, 68, 60), line(32, 74, 56, 74)], keywords: ["checklist", "tasks", "form", "copy"] },
    book: { paths: ["M 14 20 H 46 Q 50 24 50 28 V 86 Q 50 80 46 80 H 14 Z", "M 86 20 H 54 Q 50 24 50 28 V 86 Q 50 80 54 80 H 86 Z"], keywords: ["docs", "manual", "guide", "knowledge", "wiki"] },
    newspaper: { paths: [rect(16, 16, 68, 68), rect(24, 26, 24, 20), line(54, 30, 76, 30), line(54, 40, 76, 40), line(24, 56, 76, 56), line(24, 68, 76, 68)], keywords: ["news", "article", "blog", "press", "feed"] },
    note: { paths: ["M 16 14 H 84 V 64 L 62 86 H 16 Z", "M 62 86 V 64 H 84", line(28, 34, 72, 34), line(28, 48, 72, 48)], keywords: ["sticky", "memo", "reminder", "comment"] },
    receipt: {
      paths: ["M 22 10 H 78 V 90 L 70 84 L 62 90 L 54 84 L 46 90 L 38 84 L 30 90 L 22 84 Z", line(34, 30, 66, 30), line(34, 44, 66, 44), line(34, 58, 56, 58)],
      keywords: ["invoice", "bill", "order", "transaction"],
    },
  },
  Security: {
    lock: { paths: [rect(26, 46, 48, 40), "M 34 46 V 34 A 16 16 0 0 1 66 34 V 46", "M 50 62 V 72"], keywords: ["auth", "security", "secret", "password", "private"] },
    key: { paths: [circle(32, 38, 16), "M 44 50 L 86 92", "M 74 80 L 84 70", "M 64 70 L 74 60"], keywords: ["token", "credential", "access", "api key", "secret"] },
    shield: { paths: ["M 50 10 L 86 24 V 48 C 86 70 70 84 50 92 C 30 84 14 70 14 48 V 24 Z", "M 36 50 L 46 60 L 66 40"], keywords: ["protection", "firewall", "guard", "safe", "policy"] },
    eye: { paths: ["M 10 50 C 30 20 70 20 90 50 C 70 80 30 80 10 50 Z", circle(50, 50, 12)], keywords: ["view", "watch", "monitor", "observe", "visible"] },
    certificate: { paths: [circle(50, 40, 24), circle(50, 40, 10), "M 36 60 L 30 92 L 50 80 L 70 92 L 64 60"], keywords: ["award", "ssl", "licence", "verified", "badge"] },
  },
  "Commerce & Money": {
    money: { paths: [rect(8, 28, 84, 44), circle(50, 50, 12), line(18, 38, 18, 40), line(82, 60, 82, 62)], keywords: ["payment", "cash", "billing", "price", "revenue"] },
    "credit-card": { paths: [rect(8, 24, 84, 52), line(8, 38, 92, 38), line(8, 50, 92, 50), line(20, 64, 40, 64)], keywords: ["payment", "checkout", "stripe", "visa", "card"] },
    cart: { paths: ["M 8 18 H 22 L 34 68 H 80 L 90 34 H 28", circle(40, 82, 6), circle(74, 82, 6)], keywords: ["basket", "shop", "checkout", "order", "ecommerce"] },
    tag: { paths: ["M 12 12 H 50 L 90 52 L 52 90 L 12 50 Z", circle(30, 30, 6)], keywords: ["label", "price", "category", "sku", "discount"] },
    coins: {
      paths: [ellipse(50, 30, 24, 9), "M 26 30 V 72 A 24 9 0 0 0 74 72 V 30", "M 26 44 A 24 9 0 0 0 74 44", "M 26 58 A 24 9 0 0 0 74 58"],
      keywords: ["credits", "tokens", "balance", "currency", "points"],
    },
    wallet: { paths: [rect(10, 28, 80, 54), "M 10 28 V 20 H 74 V 28", rect(64, 46, 26, 18), circle(78, 55, 3)], keywords: ["account", "balance", "funds", "purse"] },
    store: {
      paths: ["M 8 40 L 14 18 H 86 L 92 40 Z", "M 24 40 V 18", "M 41 40 V 18", "M 59 40 V 18", "M 76 40 V 18", "M 16 40 V 86 H 84 V 40", rect(42, 60, 16, 26)],
      keywords: ["shop", "retail", "merchant", "marketplace", "storefront"],
    },
  },
  "Transport & Places": {
    car: { paths: ["M 10 62 V 48 L 24 46 L 34 30 H 66 L 76 46 L 90 48 V 62 Z", "M 36 46 H 64", circle(28, 64, 8), circle(72, 64, 8)], keywords: ["vehicle", "delivery", "courier", "taxi", "ride"] },
    truck: { paths: [rect(8, 30, 52, 38), "M 60 42 H 80 L 92 56 V 68 H 60", circle(24, 74, 7), circle(76, 74, 7)], keywords: ["lorry", "shipping", "freight", "logistics", "delivery"] },
    bicycle: { paths: [circle(24, 66, 16), circle(76, 66, 16), "M 24 66 L 42 38 L 66 38 L 76 66", "M 42 38 L 52 66 H 24", "M 52 66 L 66 38", "M 60 30 H 72"], keywords: ["bike", "cycling", "rider", "eco"] },
    plane: {
      paths: ["M 50 8 L 58 18 V 42 L 92 60 V 68 L 58 58 V 78 L 70 86 V 92 L 50 86 L 30 92 V 86 L 42 78 V 58 L 8 68 V 60 L 42 42 V 18 Z"],
      keywords: ["flight", "travel", "airline", "airport", "shipping"],
    },
    train: { paths: [rect(22, 10, 56, 64), rect(32, 22, 36, 22), circle(36, 60, 5), circle(64, 60, 5), "M 22 74 L 12 90", "M 78 74 L 88 90", "M 24 84 H 76"], keywords: ["rail", "metro", "subway", "transit"] },
    "map-pin": { paths: ["M 50 92 C 30 62 22 52 22 38 A 28 28 0 0 1 78 38 C 78 52 70 62 50 92 Z", circle(50, 38, 10)], keywords: ["location", "place", "address", "gps", "marker"] },
    home: { paths: ["M 10 50 L 50 14 L 90 50", "M 22 42 V 88 H 78 V 42", rect(42, 60, 16, 28)], keywords: ["house", "start", "landing", "dashboard", "residence"] },
    building: {
      paths: ["M 20 90 V 14 H 80 V 90", "M 10 90 H 90", rect(32, 26, 10, 10), rect(58, 26, 10, 10), rect(32, 46, 10, 10), rect(58, 46, 10, 10), "M 44 90 V 70 H 56 V 90"],
      keywords: ["office", "company", "bank", "enterprise", "hq"],
    },
    factory: {
      paths: ["M 10 88 V 40 L 34 56 V 40 L 58 56 V 40 L 82 56 V 24 H 90 V 88 Z", rect(20, 66, 10, 10), rect(44, 66, 10, 10), rect(68, 66, 10, 10)],
      keywords: ["plant", "manufacturing", "industry", "production", "warehouse"],
    },
  },
  "Time & Status": {
    clock: { paths: [circle(50, 50, 36), "M 50 30 V 52 L 64 60"], keywords: ["time", "schedule", "cron", "timer", "wait"] },
    calendar: { paths: [rect(12, 22, 76, 66), line(12, 42, 88, 42), line(30, 12, 30, 30), line(70, 12, 70, 30), rect(26, 54, 10, 10), rect(46, 54, 10, 10), rect(66, 54, 10, 10)], keywords: ["date", "schedule", "event", "booking", "deadline"] },
    hourglass: {
      paths: ["M 24 10 H 76", "M 24 90 H 76", "M 30 10 V 24 C 30 42 50 44 50 50 C 50 56 30 58 30 76 V 90", "M 70 10 V 24 C 70 42 50 44 50 50 C 50 56 70 58 70 76 V 90"],
      keywords: ["waiting", "pending", "loading", "delay", "timeout"],
    },
    stopwatch: { paths: [circle(50, 56, 32), line(50, 56, 50, 36), line(50, 56, 62, 64), line(42, 12, 58, 12), line(50, 12, 50, 24), line(76, 30, 82, 24)], keywords: ["timer", "latency", "performance", "benchmark", "speed"] },
    "check-circle": { paths: [circle(50, 50, 36), "M 32 52 L 44 64 L 70 36"], keywords: ["done", "success", "complete", "approved", "ok"] },
    warning: { paths: ["M 50 12 L 92 86 H 8 Z", line(50, 38, 50, 60), circle(50, 72, 2.5)], keywords: ["alert", "caution", "risk", "error", "failure"] },
    "info-circle": { paths: [circle(50, 50, 36), line(50, 46, 50, 70), circle(50, 32, 3)], keywords: ["help", "about", "details", "tip"] },
    star: { paths: ["M 50 10 L 61 38 L 92 40 L 68 59 L 76 90 L 50 72 L 24 90 L 32 59 L 8 40 L 39 38 Z"], keywords: ["favourite", "rating", "featured", "bookmark", "premium"] },
    flag: { paths: [line(20, 8, 20, 92), "M 20 14 H 82 L 68 36 L 82 58 H 20"], keywords: ["milestone", "goal", "feature flag", "marker", "report"] },
    lightbulb: { paths: ["M 36 62 C 20 50 24 20 50 20 C 76 20 80 50 64 62 V 72 H 36 Z", line(38, 80, 62, 80), line(42, 88, 58, 88)], keywords: ["idea", "insight", "tip", "innovation", "hint"] },
    bolt: { paths: ["M 56 8 L 24 54 H 46 L 40 92 L 76 42 H 54 Z"], keywords: ["lightning", "fast", "power", "energy", "event", "trigger"] },
    heart: { paths: ["M 50 86 C 20 64 10 50 14 34 C 18 18 40 16 50 34 C 60 16 82 18 86 34 C 90 50 80 64 50 86 Z"], keywords: ["like", "favourite", "health", "love", "wishlist"] },
  },
} as const satisfies Record<string, Record<string, PictogramDefinition>>;

type Sections = typeof SECTIONS;
export type PictogramSectionTitle = keyof Sections;
export type PictogramName = { [Title in PictogramSectionTitle]: keyof Sections[Title] & string }[PictogramSectionTitle];

export interface PictogramSection {
  title: PictogramSectionTitle;
  names: PictogramName[];
}

export const PICTOGRAM_SECTIONS: PictogramSection[] = (Object.keys(SECTIONS) as PictogramSectionTitle[]).map((title) => ({
  title,
  names: Object.keys(SECTIONS[title]) as PictogramName[],
}));

export const PICTOGRAM_NAMES: PictogramName[] = PICTOGRAM_SECTIONS.flatMap((section) => section.names);

const DEFINITIONS = new Map<PictogramName, PictogramDefinition>(
  PICTOGRAM_SECTIONS.flatMap((section) =>
    section.names.map((name) => [name, (SECTIONS[section.title] as Record<string, PictogramDefinition>)[name]] as const),
  ),
);

export function getPictogramPathData(name: PictogramName): string[] {
  return DEFINITIONS.get(name)?.paths ?? [];
}

export function getPictogramKeywords(name: PictogramName): string[] {
  return DEFINITIONS.get(name)?.keywords ?? [];
}

export function isPictogramName(value: unknown): value is PictogramName {
  return typeof value === "string" && DEFINITIONS.has(value as PictogramName);
}
