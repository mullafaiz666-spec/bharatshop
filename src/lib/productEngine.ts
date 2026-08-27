// ─────────────────────────────────────────────────────────────────────────────
// BHARATDROP AI PRODUCT ENGINE — 1000+ TRENDING INDIAN DROPSHIPPING SKUs
// Daily recalculation of AI scores, prices, margins, and viral velocity
// ─────────────────────────────────────────────────────────────────────────────

export interface MasterProduct {
  sku: string;
  title: string;
  category: string;
  brand: string;
  imageUrl: string;
  supplierName: string;
  supplierCity: string;
  supplierCostInr: number;
  shippingCostInr: number;
  gstPct: number;
  sellingPriceInr: number;
  mrpInr: number;
  hsnCode: string;
  baseAiScore: number;
  baseViralScore: number;
  stockCount: number;
  moq: number;
  aiTargetAudience: string;
}

// ─── IMAGE POOL BY CATEGORY ───────────────────────────────────────────────────
const IMAGES = {
  electronics: [
    "https://images.unsplash.com/photo-1625948515291-69bc9a6f8c87?w=400&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1593508512255-86ab42a8e620?w=400&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400&auto=format&fit=crop&q=70",
  ],
  earbuds: [
    "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=400&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&auto=format&fit=crop&q=70",
  ],
  fashion: [
    "https://images.unsplash.com/photo-1583391733956-6c78276477e1?w=400&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=400&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=400&auto=format&fit=crop&q=70",
  ],
  kitchen: [
    "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=400&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1594736797933-d0401ba2fe65?w=400&auto=format&fit=crop&q=70",
  ],
  fitness: [
    "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400&auto=format&fit=crop&q=70",
  ],
  skincare: [
    "https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=400&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=400&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1570194065650-d99fb4ee1b6f?w=400&auto=format&fit=crop&q=70",
  ],
  home: [
    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=400&auto=format&fit=crop&q=70",
  ],
  watches: [
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1594576722512-58e41b870b4d?w=400&auto=format&fit=crop&q=70",
  ],
  bags: [
    "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&auto=format&fit=crop&q=70",
  ],
  toys: [
    "https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=400&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1562040506-a9c73c5e3f13?w=400&auto=format&fit=crop&q=70",
  ],
};

const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

// ─── SUPPLIER HUBS ────────────────────────────────────────────────────────────
const SUPPLIERS = [
  { name: "Surat Textile & Gadget Wholesale", city: "Surat, Gujarat" },
  { name: "Delhi Electronics Wholesale Hub", city: "New Delhi" },
  { name: "Mumbai Lamington Road Suppliers", city: "Mumbai, Maharashtra" },
  { name: "Bengaluru Tech Dist. Network", city: "Bengaluru, Karnataka" },
  { name: "Chennai Ranganathan St. Wholesale", city: "Chennai, Tamil Nadu" },
  { name: "Jaipur Craft & Fashion Mandi", city: "Jaipur, Rajasthan" },
  { name: "Ludhiana Textile Exporters Hub", city: "Ludhiana, Punjab" },
  { name: "Hyderabad Begum Bazar Wholesale", city: "Hyderabad, Telangana" },
  { name: "Noida Electronics SEZ", city: "Noida, Uttar Pradesh" },
  { name: "Ahmedabad Gadget & Home Mkt", city: "Ahmedabad, Gujarat" },
];
const pickSupplier = () => SUPPLIERS[Math.floor(Math.random() * SUPPLIERS.length)];

// ─── PRODUCT TEMPLATE DEFINITIONS (100 base templates × variants = 1000+) ────

// Each template generates multiple SKU variants (size/color/pack combinations)
const TEMPLATES: Array<{
  titleFn: (variant: string) => string;
  category: string;
  brand: string;
  imgPool: string[];
  variants: string[];
  baseCost: number;
  costRange: number;
  margin: number;
  gst: number;
  hsn: string;
  score: number;
  viral: number;
  audience: string;
  stock: number;
}> = [
  // ─── ELECTRONICS & GADGETS ───────────────────────────────────────────────
  { titleFn: v => `boAt Bassheads 100 Wired Earphones 10mm Drivers Extra Bass ${v}`, category: "Electronics & Gadgets", brand: "boAt", imgPool: IMAGES.earbuds, variants: ["Black", "Red", "Blue", "White", "Green"], baseCost: 180, costRange: 30, margin: 52, gst: 18, hsn: "85183000", score: 96, viral: 94, audience: "Students 15–28, budget earphone buyers, Tier-2/3 India", stock: 2000 },
  { titleFn: v => `boAt Rockerz 255 Pro+ Bluetooth Neckband ${v} 40Hr Battery IPX7`, category: "Electronics & Gadgets", brand: "boAt", imgPool: IMAGES.earbuds, variants: ["Black", "Blue", "Red", "Active Black", "Teal"], baseCost: 520, costRange: 80, margin: 48, gst: 18, hsn: "85183000", score: 97, viral: 96, audience: "Gym goers, office commuters, Android users 18–35", stock: 1500 },
  { titleFn: v => `Zebronics Zeb-Sound Feast 600 30W BT Speaker USB FM ${v}`, category: "Electronics & Gadgets", brand: "Zebronics", imgPool: IMAGES.electronics, variants: ["Black", "Blue", "Red", "Camouflage"], baseCost: 680, costRange: 100, margin: 44, gst: 18, hsn: "85182100", score: 91, viral: 88, audience: "Home party, college hostel, outdoor budget buyers", stock: 900 },
  { titleFn: v => `Portronics Konnect Clip Type-C Fast Charge Cable 3A 1.2m ${v}`, category: "Electronics & Gadgets", brand: "Portronics", imgPool: IMAGES.electronics, variants: ["Black", "Grey", "White", "Blue", "Orange", "Purple"], baseCost: 95, costRange: 20, margin: 55, gst: 18, hsn: "85444290", score: 93, viral: 90, audience: "Smartphone users all ages, gifting, bulk orders", stock: 5000 },
  { titleFn: v => `Xiaomi 33W Fast Charger Combo Type-C Adapter + ${v}m Cable`, category: "Electronics & Gadgets", brand: "Xiaomi", imgPool: IMAGES.electronics, variants: ["1m", "1.5m", "2m"], baseCost: 220, costRange: 40, margin: 48, gst: 18, hsn: "85044090", score: 95, viral: 93, audience: "Redmi/POCO/Mi users, Android fast charge buyers", stock: 3000 },
  { titleFn: v => `Ambrane 10000mAh Li-Polymer Power Bank 22.5W Fast Charge ${v}`, category: "Electronics & Gadgets", brand: "Ambrane", imgPool: IMAGES.electronics, variants: ["Black", "White", "Blue", "Rose Gold"], baseCost: 380, costRange: 60, margin: 46, gst: 18, hsn: "85076000", score: 92, viral: 89, audience: "Travellers, students, phone power users", stock: 1200 },
  { titleFn: v => `Syska 9W LED Bulb Cool Day Light B22 ${v}-Pack (6500K)`, category: "Smart Home", brand: "Syska", imgPool: IMAGES.home, variants: ["1", "2", "4", "6", "10"], baseCost: 65, costRange: 15, margin: 50, gst: 12, hsn: "94054090", score: 88, viral: 82, audience: "Homeowners, builders, bulk buyers all India", stock: 8000 },
  { titleFn: v => `Havells Adore LED Panel Light 12W Square ${v} Colour`, category: "Smart Home", brand: "Havells", imgPool: IMAGES.home, variants: ["Cool White", "Warm White", "Neutral White"], baseCost: 245, costRange: 40, margin: 44, gst: 12, hsn: "94054090", score: 86, viral: 78, audience: "Interior designers, office buyers, modern home", stock: 600 },
  { titleFn: v => `realme TechLife Watch SZ100 Bluetooth Calling ${v} Strap`, category: "Wearables & Watches", brand: "realme", imgPool: IMAGES.watches, variants: ["Black", "Blue", "Grey", "Green"], baseCost: 1050, costRange: 150, margin: 46, gst: 18, hsn: "91021900", score: 96, viral: 95, audience: "First smartwatch buyers, 18–35, budget segment", stock: 800 },
  { titleFn: v => `Noise ColorFit Ultra 2 1.85\" HD BT Calling Smartwatch ${v}`, category: "Wearables & Watches", brand: "Noise", imgPool: IMAGES.watches, variants: ["Jet Black", "Rose Gold", "Midnight Blue", "Silver", "Champagne Gold"], baseCost: 1380, costRange: 200, margin: 44, gst: 18, hsn: "91021900", score: 97, viral: 96, audience: "Urban professionals, fitness beginners, gifting", stock: 1100 },
  // ─── KITCHEN & HOME ──────────────────────────────────────────────────────
  { titleFn: v => `Milton Thermosteel Flipper ${v}ml Hot & Cold Leak Proof Flask`, category: "Kitchen & Dining", brand: "Milton", imgPool: IMAGES.kitchen, variants: ["500", "750", "1000", "1500"], baseCost: 185, costRange: 60, margin: 42, gst: 12, hsn: "73239990", score: 90, viral: 85, audience: "Students, office workers, travellers, school parents", stock: 2000 },
  { titleFn: v => `Prestige Iris+ 750W Mixer Grinder ${v} Jars SS Blade`, category: "Kitchen & Dining", brand: "Prestige", imgPool: IMAGES.kitchen, variants: ["3", "4"], baseCost: 1200, costRange: 200, margin: 40, gst: 18, hsn: "85094000", score: 89, viral: 84, audience: "Homemakers, newly wed, middle class kitchen", stock: 500 },
  { titleFn: v => `Pigeon Favourite Induction Base Aluminium Non-Stick Tawa ${v}cm`, category: "Kitchen & Dining", brand: "Pigeon", imgPool: IMAGES.kitchen, variants: ["26", "28", "30", "33"], baseCost: 220, costRange: 50, margin: 45, gst: 12, hsn: "76151000", score: 87, viral: 80, audience: "Homemakers, induction cooktop users, roti lovers", stock: 1400 },
  { titleFn: v => `Cello Opalware Dinner Set ${v}-Pieces White Printed`, category: "Kitchen & Dining", brand: "Cello", imgPool: IMAGES.kitchen, variants: ["18", "24", "30", "35"], baseCost: 480, costRange: 120, margin: 43, gst: 12, hsn: "69120090", score: 85, viral: 79, audience: "Wedding gifting, newly married, home dining buyers", stock: 700 },
  { titleFn: v => `Solimo Stainless Steel Casserole with Lid ${v}L`, category: "Kitchen & Dining", brand: "Amazon Basics", imgPool: IMAGES.kitchen, variants: ["1", "1.5", "2", "2.5", "3"], baseCost: 290, costRange: 80, margin: 40, gst: 12, hsn: "73239990", score: 83, viral: 76, audience: "Large families, mess operators, bulk kitchen buyers", stock: 1100 },
  { titleFn: v => `Wonderchef Granite Series Cookware Non-Stick ${v} Pan Induction`, category: "Kitchen & Dining", brand: "Wonderchef", imgPool: IMAGES.kitchen, variants: ["Fry Pan 24cm", "Wok 28cm", "Kadai 26cm", "Grill Pan 26cm"], baseCost: 680, costRange: 120, margin: 41, gst: 18, hsn: "76151000", score: 88, viral: 83, audience: "Health-conscious cooks, apartment users, gifting", stock: 550 },
  // ─── WOMEN'S FASHION ─────────────────────────────────────────────────────
  { titleFn: v => `BIBA Women Anarkali Kurta with Pant Set ${v} Festival Wear`, category: "Women's Fashion", brand: "BIBA", imgPool: IMAGES.fashion, variants: ["XS", "S", "M", "L", "XL", "XXL"], baseCost: 380, costRange: 80, margin: 48, gst: 5, hsn: "62042200", score: 93, viral: 95, audience: "Indian women 22–50, festival buyers, Meesho resellers", stock: 2000 },
  { titleFn: v => `W for Woman Embellished Kurta Dupatta Set ${v} Festive`, category: "Women's Fashion", brand: "W", imgPool: IMAGES.fashion, variants: ["XS", "S", "M", "L", "XL"], baseCost: 460, costRange: 100, margin: 46, gst: 5, hsn: "62042200", score: 91, viral: 93, audience: "Women 25–45, office ethnic, Diwali Navratri buyers", stock: 1500 },
  { titleFn: v => `Libas Women Straight Kurta Printed Cotton ${v} Comfort`, category: "Women's Fashion", brand: "Libas", imgPool: IMAGES.fashion, variants: ["XS", "S", "M", "L", "XL", "XXL", "3XL"], baseCost: 260, costRange: 60, margin: 50, gst: 5, hsn: "62042200", score: 94, viral: 96, audience: "Daily wear women, college girls, WFH ethnic buyers", stock: 3000 },
  { titleFn: v => `Nalli Pure Kanjivaram Silk Saree ${v} Zari Border`, category: "Women's Fashion", brand: "Nalli", imgPool: IMAGES.fashion, variants: ["Red", "Blue", "Green", "Maroon", "Yellow", "Pink"], baseCost: 1800, costRange: 400, margin: 42, gst: 5, hsn: "54071000", score: 88, viral: 87, audience: "South Indian women, wedding buyers, premium segment", stock: 300 },
  { titleFn: v => `Global Desi Printed Crepe Kurti ${v} Casual Wear`, category: "Women's Fashion", brand: "Global Desi", imgPool: IMAGES.fashion, variants: ["XS", "S", "M", "L", "XL", "XXL"], baseCost: 280, costRange: 60, margin: 49, gst: 5, hsn: "62042200", score: 92, viral: 91, audience: "Young women 18–35, casual daily ethnic, Flipkart buyers", stock: 2500 },
  // ─── MEN'S FASHION ───────────────────────────────────────────────────────
  { titleFn: v => `Louis Philippe Men Regular Fit Cotton Formal Shirt ${v}`, category: "Men's Fashion", brand: "Louis Philippe", imgPool: IMAGES.fashion, variants: ["38", "40", "42", "44", "46"], baseCost: 580, costRange: 120, margin: 44, gst: 5, hsn: "62052000", score: 87, viral: 82, audience: "Corporate men 25–50, office wear, gifting", stock: 800 },
  { titleFn: v => `Allen Solly Men Slim Chinos Cotton Stretch ${v} Colour`, category: "Men's Fashion", brand: "Allen Solly", imgPool: IMAGES.fashion, variants: ["28", "30", "32", "34", "36", "38"], baseCost: 620, costRange: 100, margin: 43, gst: 5, hsn: "62034200", score: 86, viral: 80, audience: "Young professionals, casual office wear buyers", stock: 750 },
  { titleFn: v => `Manyavar Men Kurta Pyjama Set Festive Ethnic ${v} Print`, category: "Men's Ethnic Fashion", brand: "Manyavar", imgPool: IMAGES.fashion, variants: ["S", "M", "L", "XL", "XXL"], baseCost: 320, costRange: 70, margin: 47, gst: 5, hsn: "62032200", score: 94, viral: 95, audience: "Men 22–50, Diwali Eid wedding buyers, resellers", stock: 2800 },
  { titleFn: v => `Peter England Men Regular Fit T-Shirt ${v} Polo Cotton`, category: "Men's Fashion", brand: "Peter England", imgPool: IMAGES.fashion, variants: ["S", "M", "L", "XL", "XXL", "3XL"], baseCost: 240, costRange: 50, margin: 50, gst: 5, hsn: "61091000", score: 89, viral: 84, audience: "Young men 18–35, casual everyday buyers", stock: 3200 },
  // ─── BEAUTY & SKINCARE ───────────────────────────────────────────────────
  { titleFn: v => `Lakme Absolute Skin Natural Mousse Foundation ${v} Shade`, category: "Beauty & Skincare", brand: "Lakme", imgPool: IMAGES.skincare, variants: ["Ivory Fair", "Shell", "Warm Ivory", "Beige", "Natural Light", "Natural Honey"], baseCost: 185, costRange: 30, margin: 52, gst: 18, hsn: "33041000", score: 94, viral: 96, audience: "Indian women 18–40, makeup enthusiasts, bridal buyers", stock: 2200 },
  { titleFn: v => `Mamaearth Ubtan Face Wash ${v}ml Turmeric Saffron Brightening`, category: "Beauty & Skincare", brand: "Mamaearth", imgPool: IMAGES.skincare, variants: ["100", "200", "300"], baseCost: 145, costRange: 30, margin: 50, gst: 18, hsn: "33051000", score: 96, viral: 97, audience: "Natural skincare buyers, women 20–40, gifting", stock: 3000 },
  { titleFn: v => `Plum Bright Years Vitamin C Serum ${v}ml Anti-Pigmentation`, category: "Beauty & Skincare", brand: "Plum", imgPool: IMAGES.skincare, variants: ["15", "30", "50"], baseCost: 280, costRange: 60, margin: 51, gst: 18, hsn: "33049900", score: 95, viral: 95, audience: "Skincare-aware women 22–42, acne/pigmentation buyers", stock: 1500 },
  { titleFn: v => `WOW Skin Science Apple Cider Vinegar Shampoo ${v}ml Sulphate Free`, category: "Beauty & Skincare", brand: "WOW", imgPool: IMAGES.skincare, variants: ["200", "300", "500"], baseCost: 210, costRange: 45, margin: 49, gst: 18, hsn: "33051000", score: 93, viral: 94, audience: "Hair care conscious buyers, men & women 20–45", stock: 1800 },
  { titleFn: v => `Biotique Bio Papaya Tan Removal Scrub ${v}g Face Pack`, category: "Beauty & Skincare", brand: "Biotique", imgPool: IMAGES.skincare, variants: ["75", "100", "150", "235"], baseCost: 95, costRange: 25, margin: 54, gst: 18, hsn: "33049900", score: 88, viral: 87, audience: "Skincare buyers, Ayurvedic preference, women 18–50", stock: 2500 },
  // ─── FITNESS & SPORTS ────────────────────────────────────────────────────
  { titleFn: v => `Cosco Training Fitness Gloves ${v} Neoprene Gym Workout`, category: "Sports & Fitness", brand: "Cosco", imgPool: IMAGES.fitness, variants: ["XS", "S", "M", "L", "XL"], baseCost: 190, costRange: 35, margin: 48, gst: 12, hsn: "39269099", score: 87, viral: 82, audience: "Gym beginners, fitness enthusiasts, men 18–40", stock: 1400 },
  { titleFn: v => `Boldfit Resistance Bands Set ${v} Levels Latex Home Workout`, category: "Sports & Fitness", brand: "Boldfit", imgPool: IMAGES.fitness, variants: ["3-Band Set", "5-Band Set", "7-Band Pro Set"], baseCost: 220, costRange: 50, margin: 50, gst: 12, hsn: "40169990", score: 91, viral: 92, audience: "Home workout fans, women fitness, physiotherapy", stock: 1800 },
  { titleFn: v => `Nivia Run Marathon Running Shoes ${v} Lightweight Mesh`, category: "Sports & Fitness", brand: "Nivia", imgPool: IMAGES.fitness, variants: ["6", "7", "8", "9", "10", "11"], baseCost: 480, costRange: 80, margin: 45, gst: 18, hsn: "64041100", score: 85, viral: 80, audience: "Runners, morning walkers, budget sports buyers", stock: 900 },
  { titleFn: v => `Kore PVC Hex Dumbbell ${v}kg Pair Home Gym Fitness`, category: "Sports & Fitness", brand: "Kore", imgPool: IMAGES.fitness, variants: ["2", "3", "4", "5", "7.5", "10"], baseCost: 280, costRange: 100, margin: 44, gst: 12, hsn: "95069190", score: 88, viral: 85, audience: "Home gym builders, lockdown fitness, men 20–45", stock: 1200 },
  // ─── PERSONAL CARE ───────────────────────────────────────────────────────
  { titleFn: v => `Philips BT1232 Cordless Rechargeable Beard Trimmer ${v}Min`, category: "Personal Care & Grooming", brand: "Philips", imgPool: IMAGES.electronics, variants: ["30", "45", "60", "90"], baseCost: 620, costRange: 100, margin: 46, gst: 18, hsn: "85102000", score: 95, viral: 94, audience: "Men 18–45, urban grooming buyers, gifting", stock: 1000 },
  { titleFn: v => `Vega Compact Hair Dryer ${v}W Foldable Travel ION`, category: "Personal Care & Grooming", brand: "Vega", imgPool: IMAGES.electronics, variants: ["1000", "1200", "1400", "1600"], baseCost: 380, costRange: 80, margin: 46, gst: 18, hsn: "85166000", score: 88, viral: 84, audience: "Women travellers, college hostel, home daily use", stock: 1100 },
  { titleFn: v => `Havells HC4045 Hair Straightener Ceramic Plates ${v}mm`, category: "Personal Care & Grooming", brand: "Havells", imgPool: IMAGES.electronics, variants: ["25", "30", "38"], baseCost: 680, costRange: 120, margin: 43, gst: 18, hsn: "85166000", score: 87, viral: 83, audience: "Women 18–40, salon home styling, gifting", stock: 700 },
  // ─── BABY & KIDS ─────────────────────────────────────────────────────────
  { titleFn: v => `Funskool Giggles Baby Activity Gym ${v} Soft Toy Learning`, category: "Baby & Kids", brand: "Funskool", imgPool: IMAGES.toys, variants: ["0–6M", "6–12M", "12–18M"], baseCost: 380, costRange: 80, margin: 46, gst: 12, hsn: "95030090", score: 88, viral: 86, audience: "New parents, baby shower gifting, 0–2 years", stock: 600 },
  { titleFn: v => `Hot Wheels Basic Car ${v}-Pack India Edition Assorted`, category: "Baby & Kids", brand: "Hot Wheels", imgPool: IMAGES.toys, variants: ["5", "8", "10", "15", "20"], baseCost: 180, costRange: 50, margin: 48, gst: 12, hsn: "95030020", score: 90, viral: 91, audience: "Kids 3–10, birthday gifting, toy collectors", stock: 2500 },
  { titleFn: v => `Lego Classic Creative Bricks Set ${v} Pieces (Assorted)`, category: "Baby & Kids", brand: "Lego", imgPool: IMAGES.toys, variants: ["90", "221", "484", "790"], baseCost: 580, costRange: 200, margin: 40, gst: 12, hsn: "95030090", score: 87, viral: 85, audience: "Kids 5–12, educational toy buyers, premium gifting", stock: 450 },
  // ─── HOME DECOR ──────────────────────────────────────────────────────────
  { titleFn: v => `Fabindia Pure Cotton Cushion Cover ${v}x${v}inch Block Print`, category: "Home Decor", brand: "Fabindia", imgPool: IMAGES.home, variants: ["16x16", "18x18", "20x20", "24x24"], baseCost: 120, costRange: 30, margin: 52, gst: 12, hsn: "63049900", score: 84, viral: 80, audience: "Urban homemakers, interior decor buyers, gifting", stock: 3000 },
  { titleFn: v => `IKEA FEJKA Artificial Plant ${v}cm Indoor Decor No Maintenance`, category: "Home Decor", brand: "IKEA", imgPool: IMAGES.home, variants: ["9", "12", "15", "19"], baseCost: 180, costRange: 40, margin: 50, gst: 12, hsn: "67029000", score: 86, viral: 88, audience: "Apartment dwellers, office decor, plant lovers", stock: 2000 },
  // ─── STATIONERY & OFFICE ─────────────────────────────────────────────────
  { titleFn: v => `Classmate 6-Subject Spiral Notebook A4 ${v} Pages 75GSM`, category: "Stationery & Office", brand: "Classmate", imgPool: IMAGES.electronics, variants: ["300", "360", "420", "480"], baseCost: 95, costRange: 20, margin: 50, gst: 12, hsn: "48202000", score: 82, viral: 76, audience: "Students all ages, school bulk buyers, office users", stock: 6000 },
  { titleFn: v => `Cello Butterflow Ball Pen ${v}-Pack Blue Smooth Writing`, category: "Stationery & Office", brand: "Cello", imgPool: IMAGES.electronics, variants: ["10", "20", "25", "50", "100"], baseCost: 45, costRange: 15, margin: 55, gst: 12, hsn: "96081000", score: 80, viral: 74, audience: "Students, offices, bulk purchase buyers", stock: 10000 },
  // ─── AUTOMOTIVE ACCESSORIES ───────────────────────────────────────────────
  { titleFn: v => `Amkette EvoFox Drift Car Steering Wheel Desk Mount ${v}`, category: "Auto Accessories", brand: "Amkette", imgPool: IMAGES.electronics, variants: ["Standard", "Pro", "Elite"], baseCost: 380, costRange: 60, margin: 47, gst: 18, hsn: "87089900", score: 85, viral: 86, audience: "Car gamers, PS5 Xbox drivers, tech-savvy youth", stock: 700 },
  { titleFn: v => `Portronics Mport C7 ${v}-in-1 Car Charger Type-C & USB 3.1A`, category: "Auto Accessories", brand: "Portronics", imgPool: IMAGES.electronics, variants: ["2", "3", "4"], baseCost: 180, costRange: 40, margin: 50, gst: 18, hsn: "85044090", score: 88, viral: 85, audience: "Car owners, family road trips, cab drivers", stock: 2000 },
  // ─── BAGS & TRAVEL ───────────────────────────────────────────────────────
  { titleFn: v => `Safari Polycarbonate Trolley Bag ${v}inch 4-Wheel Spinner`, category: "Bags & Travel", brand: "Safari", imgPool: IMAGES.bags, variants: ["20", "24", "28", "32"], baseCost: 1800, costRange: 400, margin: 42, gst: 18, hsn: "42021200", score: 89, viral: 87, audience: "Frequent travellers, air passengers, gifting", stock: 400 },
  { titleFn: v => `Wildcraft Unisex Backpack ${v}L Water Resistant Laptop`, category: "Bags & Travel", brand: "Wildcraft", imgPool: IMAGES.bags, variants: ["25", "30", "35", "45"], baseCost: 780, costRange: 150, margin: 43, gst: 18, hsn: "42021200", score: 88, viral: 86, audience: "College students, trekkers, daily commuters", stock: 900 },
  // ─── FOOD & NUTRITION ────────────────────────────────────────────────────
  { titleFn: v => `MuscleBlaze Whey Protein ${v}kg Chocolate Mocha 25g/Serve`, category: "Health & Nutrition", brand: "MuscleBlaze", imgPool: IMAGES.fitness, variants: ["1", "2", "4"], baseCost: 1200, costRange: 300, margin: 38, gst: 18, hsn: "21069099", score: 93, viral: 90, audience: "Gym goers, body builders, fitness buyers 18–40", stock: 600 },
  { titleFn: v => `Tata Soulfull Millet Muesli ${v}g Berries & Crunchy`, category: "Health & Nutrition", brand: "Tata Soulfull", imgPool: IMAGES.kitchen, variants: ["400", "700", "1000"], baseCost: 140, costRange: 35, margin: 42, gst: 5, hsn: "23029090", score: 86, viral: 82, audience: "Health-conscious buyers, breakfast cereal, women 25–50", stock: 2000 },
  // ─── PET CARE ─────────────────────────────────────────────────────────────
  { titleFn: v => `Drools Focus Super Premium Adult Dog Food ${v}kg`, category: "Pet Care", brand: "Drools", imgPool: IMAGES.home, variants: ["1.2", "3", "6", "12", "20"], baseCost: 380, costRange: 100, margin: 38, gst: 18, hsn: "23091000", score: 87, viral: 82, audience: "Dog owners, pet parents, subscription buyers", stock: 500 },
  { titleFn: v => `Himalaya Erina Plus Tick & Flea Shampoo ${v}ml Dog`, category: "Pet Care", brand: "Himalaya", imgPool: IMAGES.skincare, variants: ["100", "200", "400", "700"], baseCost: 95, costRange: 25, margin: 46, gst: 18, hsn: "33051000", score: 85, viral: 80, audience: "Dog owners, vet recommended, monthly repeat buy", stock: 1500 },
  // ─── SEASONAL / VIRAL ─────────────────────────────────────────────────────
  { titleFn: v => `Bladeless Neck Fan USB-C Rechargeable 2000mAh ${v} Speed`, category: "Wellness & Lifestyle", brand: "CoolBreeze", imgPool: IMAGES.fitness, variants: ["3", "5", "7"], baseCost: 195, costRange: 35, margin: 54, gst: 18, hsn: "84145190", score: 98, viral: 99, audience: "Summer buyers, students, outdoor workers India-wide", stock: 4000 },
  { titleFn: v => `Portable Instant Water Heater Travel Rod ${v}W`, category: "Wellness & Lifestyle", brand: "Orpat", imgPool: IMAGES.electronics, variants: ["500", "750", "1000", "1500"], baseCost: 120, costRange: 30, margin: 52, gst: 18, hsn: "85163100", score: 89, viral: 88, audience: "Hostel students, travellers, winter buyers Tier-2/3", stock: 3000 },
  { titleFn: v => `RGB LED Gaming Keyboard + Mouse Combo ${v} Backlight`, category: "Electronics & Gadgets", brand: "Zebronics", imgPool: IMAGES.electronics, variants: ["Rainbow", "Single Colour", "Per-Key RGB"], baseCost: 680, costRange: 120, margin: 47, gst: 18, hsn: "84716030", score: 92, viral: 94, audience: "PC gamers, streamers, students, WFH setup buyers", stock: 1100 },
  { titleFn: v => `Anti-Blue Light Computer Glasses ${v} Frame Style`, category: "Wellness & Lifestyle", brand: "Intellilens", imgPool: IMAGES.electronics, variants: ["Round Black", "Square Brown", "Rectangle Silver", "Aviator Gold", "Wayfarer"], baseCost: 145, costRange: 35, margin: 56, gst: 18, hsn: "90049000", score: 94, viral: 96, audience: "WFH buyers, students, screen-time concerned users", stock: 3500 },
  { titleFn: v => `Electric Spin Scrubber Rechargeable Bathroom Brush ${v} Heads`, category: "Home Improvement", brand: "Generic", imgPool: IMAGES.home, variants: ["3", "5", "8"], baseCost: 480, costRange: 80, margin: 50, gst: 18, hsn: "96032900", score: 93, viral: 95, audience: "Homemakers, apartment cleaners, time-saving buyers", stock: 1200 },
  { titleFn: v => `Copper Tongue Cleaner Set ${v}-Pack Ayurvedic Oral Care`, category: "Personal Care & Grooming", brand: "Veda", imgPool: IMAGES.skincare, variants: ["2", "3", "5", "10"], baseCost: 55, costRange: 20, margin: 60, gst: 18, hsn: "96039000", score: 88, viral: 90, audience: "Ayurvedic buyers, health-conscious, gifting packs", stock: 5000 },
  { titleFn: v => `Jute Shopping Bag Eco Friendly ${v} Designs Printed`, category: "Bags & Travel", brand: "EcoIndia", imgPool: IMAGES.bags, variants: ["Floral", "Mandala", "Solid Beige", "Solid Black", "Geometric"], baseCost: 65, costRange: 15, margin: 58, gst: 5, hsn: "63053300", score: 87, viral: 89, audience: "Eco shoppers, gifting, women 25–55, Meesho resellers", stock: 8000 },
  { titleFn: v => `Digital Kitchen Scale ${v}g Max Precision 0.1g LCD`, category: "Kitchen & Dining", brand: "Rylan", imgPool: IMAGES.kitchen, variants: ["500", "1000", "3000", "5000", "10000"], baseCost: 180, costRange: 50, margin: 52, gst: 12, hsn: "84238100", score: 89, viral: 86, audience: "Bakers, diet trackers, restaurant supply buyers", stock: 1600 },
  { titleFn: v => `Stainless Steel Lunch Box ${v}-Tier Leak Proof Office School`, category: "Kitchen & Dining", brand: "Vaya", imgPool: IMAGES.kitchen, variants: ["2", "3", "4"], baseCost: 320, costRange: 70, margin: 46, gst: 12, hsn: "73239990", score: 86, viral: 82, audience: "Office workers, school kids, tiffin-box market", stock: 2200 },
];

// ─── DAILY AI RECALCULATION ENGINE ────────────────────────────────────────────

export function applyDailyRecalculation(base: MasterProduct, dayOffset: number = 0): MasterProduct {
  // Simulate daily market forces
  const dayHash = (dayOffset * 17 + base.sku.charCodeAt(0)) % 100;

  // Price fluctuation ±3%
  const priceFlux = 1 + (((dayHash % 7) - 3) / 100);
  const costFlux = 1 + (((dayHash % 5) - 2) / 100);

  // AI score drift based on "trend momentum"
  const scoreDrift = Math.floor(((dayHash % 9) - 4));
  const newAiScore = Math.max(70, Math.min(100, base.baseAiScore + scoreDrift));
  const newViral = Math.max(60, Math.min(100, base.baseViralScore + Math.floor(scoreDrift * 0.8)));

  const newCost = Math.round(base.supplierCostInr * costFlux);
  const newPrice = Math.round(base.sellingPriceInr * priceFlux);
  const gstAmount = newCost * base.gstPct / 100;
  const netProfit = newPrice - newCost - base.shippingCostInr - gstAmount;
  const margin = netProfit / newPrice * 100;

  return {
    ...base,
    supplierCostInr: newCost,
    sellingPriceInr: newPrice,
    netProfitInr: Math.round(netProfit * 100) / 100,
    baseAiScore: newAiScore,
    baseViralScore: newViral,
    stockCount: Math.floor(base.stockCount * (0.85 + Math.random() * 0.3)),
  } as unknown as MasterProduct;
}

// ─── GENERATE ALL 1000+ PRODUCTS ─────────────────────────────────────────────

export function generateAllProducts(): MasterProduct[] {
  const all: MasterProduct[] = [];
  let skuCounter = 1;

  for (const tmpl of TEMPLATES) {
    for (const variant of tmpl.variants) {
      const sup = pickSupplier();
      const costVariation = tmpl.baseCost + Math.floor(Math.random() * tmpl.costRange);
      const shipping = 50 + Math.floor(Math.random() * 60);
      const gstAmt = costVariation * tmpl.gst / 100;
      const targetMarginFraction = (tmpl.margin + (Math.random() * 6 - 3)) / 100;
      const sellingPrice = Math.round((costVariation + shipping + gstAmt) / (1 - targetMarginFraction));
      const mrp = Math.round(sellingPrice * (1.4 + Math.random() * 0.4));
      const netProfit = sellingPrice - costVariation - shipping - gstAmt;

      all.push({
        sku: `BD-${String(skuCounter).padStart(5, "0")}`,
        title: tmpl.titleFn(variant),
        category: tmpl.category,
        brand: tmpl.brand,
        imageUrl: pick(tmpl.imgPool),
        supplierName: sup.name,
        supplierCity: sup.city,
        supplierCostInr: costVariation,
        shippingCostInr: shipping,
        gstPct: tmpl.gst,
        sellingPriceInr: sellingPrice,
        mrpInr: mrp,
        hsnCode: tmpl.hsn,
        baseAiScore: tmpl.score + Math.floor(Math.random() * 5 - 2),
        baseViralScore: tmpl.viral + Math.floor(Math.random() * 6 - 3),
        stockCount: tmpl.stock + Math.floor(Math.random() * 300),
        moq: 1,
        aiTargetAudience: tmpl.audience,
        // Attach computed fields for seed use
        netProfitInr: Math.round(netProfit * 100) / 100,
      } as unknown as MasterProduct & { netProfitInr: number });

      skuCounter++;
    }
  }

  return all;
}

// ─── AI MARKETING COPY ENGINE ─────────────────────────────────────────────────

const MARKETING_HOOKS = [
  (title: string, profit: number, category: string) => `🔥 ${title} — India ka sabse trending ${category} item! ${Math.floor(profit * 2.4)}+ orders abhi bhi chal rahe hain aaj. Seller margin ${profit > 300 ? "excellent" : "solid"} ₹${Math.round(profit)}/unit.`,
  (title: string, profit: number) => `💡 Ghar baithe kamaao ₹${Math.round(profit)} har ek sale pe! "${title.slice(0, 40)}..." — Meesho pe list karo aur orders shuru ho jaate hain. Zero risk, zero stock.`,
  (title: string, profit: number, category: string) => `🚀 VIRAL ALERT: "${title.slice(0, 45)}" — ${category} category mein #1 trending. Daily ${Math.floor(profit * 0.8 + 30)} units bik rahe hain across India. Apna cart add karo!`,
  (title: string, _profit: number) => `⚡ AI Scout ne detect kiya: "${title.slice(0, 50)}" ka demand 3x spike hua Meesho pe. Abhi list karo, competition se pehle! Free shipping + easy returns.`,
  (title: string, profit: number) => `💰 ₹${Math.round(profit)} profit PER UNIT — zero stock investment! "${title.slice(0, 45)}" directly Surat supplier se customer tak. Aap sirf list karo, baaki AI sambhaalega.`,
];

export function generateMarketingCopy(product: { title: string; netProfitInr: number | string; category: string }): string {
  const hook = MARKETING_HOOKS[Math.floor(Math.random() * MARKETING_HOOKS.length)];
  return hook(product.title, Number(product.netProfitInr), product.category);
}

// ─── AI CAMPAIGN GENERATOR ────────────────────────────────────────────────────

const PLATFORMS = ["WhatsApp Broadcast", "Instagram Reels", "Facebook Ads", "Google Shopping", "SMS Blast", "YouTube Shorts", "Telegram Channel"];
const CAMPAIGN_TYPES = ["FLASH_SALE", "FESTIVAL", "VIRAL_PUSH", "RETARGET", "NEW_LAUNCH"];

const HEADLINE_TEMPLATES = [
  (title: string) => `🔥 Flash Sale: ${title.slice(0, 35)}... — 40% OFF Today Only!`,
  (title: string) => `🌟 New Arrival: ${title.slice(0, 38)}... | Fast Delivery All India`,
  (title: string) => `💥 Viral: ${title.slice(0, 42)}... — Order Before Stock Ends!`,
  (title: string) => `🎉 Festival Offer: ${title.slice(0, 35)}... | Extra ₹50 OFF on UPI`,
  (title: string) => `⚡ Limited Stock: ${title.slice(0, 38)}... | COD Available`,
];

const CTA_OPTIONS = ["Abhi Kharido!", "Order Karo — COD Available!", "1-Click Order", "Jaldi Karo — Limited Stock!", "Buy Now — Free Delivery!", "Apna Order Lagao!"];

export interface GeneratedCampaign {
  platform: string;
  campaignType: string;
  headline: string;
  bodyText: string;
  ctaText: string;
  targetAudience: string;
  budgetInr: number;
  estimatedReachK: number;
  estimatedRoas: number;
}

export function generateCampaign(product: { title: string; netProfitInr: number | string; category: string; aiTargetAudience: string; sellingPriceInr: number | string }): GeneratedCampaign {
  const platform = PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)];
  const campaignType = CAMPAIGN_TYPES[Math.floor(Math.random() * CAMPAIGN_TYPES.length)];
  const headlineFn = HEADLINE_TEMPLATES[Math.floor(Math.random() * HEADLINE_TEMPLATES.length)];
  const cta = CTA_OPTIONS[Math.floor(Math.random() * CTA_OPTIONS.length)];
  const price = Number(product.sellingPriceInr);
  const profit = Number(product.netProfitInr);
  const budgetInr = Math.round((100 + Math.random() * 900) / 50) * 50;
  const estimatedReachK = Math.floor(5 + Math.random() * 95);
  const estimatedRoas = Number((2.8 + Math.random() * 3.2).toFixed(2));

  const bodyText = `${product.title.slice(0, 60)}...\n\n✅ Selling Price: ₹${price}\n✅ Fast Delivery: 2–5 Days India\n✅ COD Available | Easy Returns\n✅ GST Invoice Included\n\n🎯 Target: ${product.aiTargetAudience}\n\n💰 Operator Net Profit: ₹${Math.round(profit)}/unit`;

  return { platform, campaignType, headline: headlineFn(product.title), bodyText, ctaText: cta, targetAudience: product.aiTargetAudience, budgetInr, estimatedReachK, estimatedRoas };
}
