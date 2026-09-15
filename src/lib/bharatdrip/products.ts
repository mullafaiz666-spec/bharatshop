export type ProductCategory = "All" | "Tops" | "Hoodies" | "Outerwear" | "Bottoms" | "Accessories";

export type Review = {
  name: string;
  date: string;
  rating: number;
  title: string;
  body: string;
  verified?: boolean;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  category: Exclude<ProductCategory, "All">;
  price: number;
  compareAt?: number;
  color: string;
  colors: string[];
  sizes: string[];
  images: string[];
  badge?: string;
  rating: number;
  reviewCount: number;
  description: string;
  details: string[];
  fit: string;
  reviews: Review[];
};

const image = (url: string, width = 1200, height = 1500) =>
  `${url}?auto=compress&cs=tinysrgb&fit=crop&w=${width}&h=${height}`;

export const products: Product[] = [
  {
    id: "bd-001",
    slug: "midnight-club-varsity",
    name: "Midnight Club Varsity",
    tagline: "A new classic in heavy wool",
    category: "Outerwear",
    price: 19800,
    compareAt: 23500,
    color: "Black / bone",
    colors: ["#171717", "#d7c9b2"],
    sizes: ["S", "M", "L", "XL"],
    images: [
      image("https://images.pexels.com/photos/6764027/pexels-photo-6764027.jpeg"),
      image("https://images.pexels.com/photos/25312243/pexels-photo-25312243.jpeg"),
      image("https://images.pexels.com/photos/19583558/pexels-photo-19583558.jpeg"),
    ],
    badge: "New drop",
    rating: 4.9,
    reviewCount: 34,
    description:
      "Cut from a dense recycled-wool blend with contrast leather sleeves, the Midnight Club Varsity brings collegiate codes into a sharper, everyday silhouette.",
    details: ["70% recycled wool, 30% nylon", "Contrast vegan-leather sleeves", "Quilted cupro lining", "Embroidered chenille patches", "Made in small batches in Mumbai"],
    fit: "Relaxed fit. Take your usual size for an easy layer-friendly silhouette.",
    reviews: [
      { name: "Aarav S.", date: "2 weeks ago", rating: 5, title: "The perfect weight", body: "The wool feels substantial without being stiff. The sleeve detail is even better in person.", verified: true },
      { name: "Mia R.", date: "1 month ago", rating: 5, title: "Instant favorite", body: "I have worn this every night since it arrived. Beautifully finished and roomy in the best way.", verified: true },
      { name: "Kabir M.", date: "1 month ago", rating: 4, title: "Great jacket", body: "Sizing runs relaxed, which I like. The bone panels stay surprisingly clean.", verified: true },
    ],
  },
  {
    id: "bd-002",
    slug: "daybreak-heavyweight-hoodie",
    name: "Daybreak Heavyweight Hoodie",
    tagline: "Built for slow mornings",
    category: "Hoodies",
    price: 12800,
    color: "Washed oat",
    colors: ["#c8b79e", "#202322", "#5c6d60"],
    sizes: ["XS", "S", "M", "L", "XL"],
    images: [
      image("https://images.pexels.com/photos/8217419/pexels-photo-8217419.jpeg"),
      image("https://images.pexels.com/photos/4295985/pexels-photo-4295985.jpeg"),
      image("https://images.pexels.com/photos/20248582/pexels-photo-20248582.jpeg"),
    ],
    badge: "Best seller",
    rating: 4.8,
    reviewCount: 86,
    description:
      "A softly structured, brushed-back fleece hoodie with dropped shoulders and a generous hood. Garment washed for that already-loved feeling.",
    details: ["480 GSM organic cotton fleece", "Brushed interior", "Double-layer hood", "Ribbed cuffs and waistband", "Signature tonal chest mark"],
    fit: "Oversized fit. Size down for a closer fit or stay true for the intended drape.",
    reviews: [
      { name: "Rhea K.", date: "5 days ago", rating: 5, title: "So soft", body: "The inside is unbelievably soft and the oat color is exactly as pictured.", verified: true },
      { name: "Noah P.", date: "3 weeks ago", rating: 5, title: "Heavy in the right way", body: "Finally a hoodie that holds its shape. The sleeves stack perfectly.", verified: true },
    ],
  },
  {
    id: "bd-003",
    slug: "archive-carpenter-denim",
    name: "Archive Carpenter Denim",
    tagline: "Utility, refined",
    category: "Bottoms",
    price: 16800,
    color: "Faded indigo",
    colors: ["#2f4350"],
    sizes: ["28", "30", "32", "34", "36"],
    images: [
      image("https://images.pexels.com/photos/38561616/pexels-photo-38561616.jpeg"),
      image("https://images.pexels.com/photos/6764027/pexels-photo-6764027.jpeg"),
      image("https://images.pexels.com/photos/19583558/pexels-photo-19583558.jpeg"),
    ],
    badge: "Low stock",
    rating: 4.7,
    reviewCount: 41,
    description:
      "A relaxed carpenter jean with a considered taper, custom hardware, and a washed-in blue that gets better with every wear.",
    details: ["13 oz. rigid cotton denim", "Relaxed carpenter cut", "Hammer loop and utility pocket", "Custom matte metal hardware", "Reinforced bar tacks"],
    fit: "Relaxed through the seat and thigh with a gentle taper. Size up for a more oversized look.",
    reviews: [
      { name: "Dev A.", date: "2 months ago", rating: 5, title: "Best denim I own", body: "The pocket placement is excellent and the denim has a really considered wash.", verified: true },
      { name: "Ishita N.", date: "2 months ago", rating: 4, title: "Easy everyday pair", body: "A little long on me but the fit through the leg is perfect.", verified: true },
    ],
  },
  {
    id: "bd-004",
    slug: "signal-mesh-jersey",
    name: "Signal Mesh Jersey",
    tagline: "For the late shift",
    category: "Tops",
    price: 8800,
    color: "Cobalt / ecru",
    colors: ["#294d8d", "#e8e1d2"],
    sizes: ["S", "M", "L", "XL"],
    images: [
      image("https://images.pexels.com/photos/9775760/pexels-photo-9775760.jpeg"),
      image("https://images.pexels.com/photos/9222614/pexels-photo-9222614.jpeg"),
    ],
    rating: 4.6,
    reviewCount: 27,
    description:
      "A breathable mesh jersey with a boxy, slightly cropped profile. Finished with contrast binding and a hand-drawn number graphic.",
    details: ["Lightweight performance mesh", "Contrast rib binding", "Dropped shoulder", "Screen-printed front and back graphics", "Unisex sizing"],
    fit: "Boxy fit with a slightly cropped body. Take your usual size.",
    reviews: [
      { name: "Nikhil J.", date: "3 weeks ago", rating: 5, title: "Great summer layer", body: "Looks amazing over a tee and the mesh is lighter than I expected.", verified: true },
    ],
  },
  {
    id: "bd-005",
    slug: "studio-08-box-tee",
    name: "Studio 08 Box Tee",
    tagline: "The one you reach for",
    category: "Tops",
    price: 6800,
    color: "Soft black",
    colors: ["#242424", "#f0ece2", "#bc5947"],
    sizes: ["XS", "S", "M", "L", "XL"],
    images: [
      image("https://images.pexels.com/photos/9558567/pexels-photo-9558567.jpeg"),
      image("https://images.pexels.com/photos/6729867/pexels-photo-6729867.jpeg"),
    ],
    badge: "Essential",
    rating: 4.9,
    reviewCount: 112,
    description:
      "Our everyday tee, tuned. A dense, soft cotton jersey in a clean box fit with a tiny studio mark at the hem.",
    details: ["240 GSM combed cotton", "Pre-shrunk and garment dyed", "Set-in collar", "Side-seamed construction", "Printed studio mark"],
    fit: "Easy box fit. Size up for extra volume.",
    reviews: [
      { name: "Ananya D.", date: "1 week ago", rating: 5, title: "Actually premium", body: "The fabric is weighty and the shape stays neat after washing. Buying another color.", verified: true },
      { name: "Jon L.", date: "1 month ago", rating: 5, title: "My new uniform", body: "Simple, but every proportion feels right.", verified: true },
    ],
  },
  {
    id: "bd-006",
    slug: "afterhours-leather-shell",
    name: "Afterhours Leather Shell",
    tagline: "Turn the lights down",
    category: "Outerwear",
    price: 26000,
    color: "Oxblood",
    colors: ["#4e1d1d"],
    sizes: ["S", "M", "L", "XL"],
    images: [
      image("https://images.pexels.com/photos/36976941/pexels-photo-36976941.jpeg"),
      image("https://images.pexels.com/photos/19583558/pexels-photo-19583558.jpeg"),
    ],
    badge: "Limited",
    rating: 4.8,
    reviewCount: 19,
    description:
      "A supple vegan leather overshirt with a relaxed shoulder, hidden snaps, and the kind of color that only gets richer after dark.",
    details: ["Premium vegan leather", "Lightly padded shoulders", "Hidden snap closure", "Two welt hand pockets", "Fully lined in recycled satin"],
    fit: "Relaxed fit. Designed to layer over a tee or fine knit.",
    reviews: [
      { name: "Samar T.", date: "2 weeks ago", rating: 5, title: "The color!", body: "Deep, rich, and not too red. Feels expensive the second you put it on.", verified: true },
    ],
  },
  {
    id: "bd-007",
    slug: "radio-city-track-pant",
    name: "Radio City Track Pant",
    tagline: "Move through the city",
    category: "Bottoms",
    price: 11800,
    color: "Pine green",
    colors: ["#30483c", "#202020"],
    sizes: ["XS", "S", "M", "L", "XL"],
    images: [
      image("https://images.pexels.com/photos/20248582/pexels-photo-20248582.jpeg"),
      image("https://images.pexels.com/photos/9222614/pexels-photo-9222614.jpeg"),
    ],
    rating: 4.7,
    reviewCount: 38,
    description:
      "A clean-lined track pant in crisp nylon with a generous leg and adjustable hem. Made for the commute, the studio, and everywhere after.",
    details: ["Crisp recycled nylon", "Mesh half lining", "Elasticated waist with drawcord", "Zipped side pockets", "Adjustable toggle hem"],
    fit: "Relaxed leg with a soft taper. Take your usual size.",
    reviews: [
      { name: "Tara V.", date: "3 weeks ago", rating: 5, title: "The perfect track pant", body: "The green is beautiful and the adjustable hems make them work with every shoe.", verified: true },
    ],
  },
  {
    id: "bd-008",
    slug: "solar-flare-knit",
    name: "Solar Flare Knit",
    tagline: "A little extra light",
    category: "Tops",
    price: 14600,
    color: "Signal orange",
    colors: ["#d46535", "#e6d7bd"],
    sizes: ["S", "M", "L", "XL"],
    images: [
      image("https://images.pexels.com/photos/2851880/pexels-photo-2851880.jpeg"),
      image("https://images.pexels.com/photos/6729867/pexels-photo-6729867.jpeg"),
    ],
    badge: "New drop",
    rating: 4.9,
    reviewCount: 23,
    description:
      "A textured cotton knit with a sunny gradient and a compact, relaxed shape. Wear it alone or let the collar peek through a jacket.",
    details: ["Breathable cotton knit", "Hand-linked seams", "Ribbed hem and cuffs", "Relaxed crew neckline", "Subtle gradient jacquard"],
    fit: "Relaxed fit with a neat shoulder. Take your usual size.",
    reviews: [
      { name: "Leena P.", date: "4 days ago", rating: 5, title: "So special", body: "The knit texture and color gradient are gorgeous. Lightweight but not flimsy.", verified: true },
    ],
  },
];

export const categories: { name: ProductCategory; count?: number }[] = [
  { name: "All" },
  { name: "Tops", count: 3 },
  { name: "Hoodies", count: 1 },
  { name: "Outerwear", count: 2 },
  { name: "Bottoms", count: 2 },
];

export function getProduct(slug: string) {
  return products.find((product) => product.slug === slug);
}

export function formatPrice(price: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);
}
