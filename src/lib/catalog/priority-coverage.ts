export type CriticalCoverageKey =
  | "fashion"
  | "tv"
  | "laptop"
  | "refrigerator"
  | "airConditioner"
  | "washingMachine";

export const CRITICAL_COVERAGE_KEYS: CriticalCoverageKey[] = [
  "fashion",
  "tv",
  "laptop",
  "refrigerator",
  "airConditioner",
  "washingMachine",
];

export const CRITICAL_DISCOVERY_QUERIES = [
  "Meesho women fashion India price",
  "Meesho men fashion India price",
  "Meesho kids fashion India price",
  "best selling smart TVs India price",
  "best selling laptops India price",
  "best selling refrigerators India price",
  "best selling washing machines India price",
  "best selling split air conditioners India price",
] as const;

function textOf(input: { title?: unknown; category?: unknown; brand?: unknown; madeToOrder?: unknown }) {
  return `${String(input.title || "")} ${String(input.category || "")} ${String(input.brand || "")}`.toLowerCase();
}

export function criticalCoverageKey(input: { title?: unknown; category?: unknown; brand?: unknown; madeToOrder?: unknown }): CriticalCoverageKey | null {
  const text = textOf(input);
  if (input.madeToOrder === true || /bharatshop studio|bharatdrip|fashion|apparel|clothing|t-?shirt|shirt|dress|kurti|kurta|saree|jeans|hoodie/.test(text)) return "fashion";
  if (/\b(smart\s*tv|television|led\s*tv|oled\s*tv|qled\s*tv|google\s*tv|android\s*tv|\d{2}\s*(?:inch|inches|\"))\b/.test(text) || /tv & home entertainment/.test(text)) return "tv";
  if (/\b(laptop|notebook|chromebook|macbook)\b/.test(text)) return "laptop";
  if (/\b(refrigerator|fridge|freezer)\b/.test(text)) return "refrigerator";
  if (/\b(washing machine|washer|front load|top load)\b/.test(text)) return "washingMachine";
  if (/\b(air conditioner|split ac|window ac|inverter ac|air conditioning)\b/.test(text) || /\b\d(?:\.\d)?\s*ton\s+ac\b/.test(text)) return "airConditioner";
  return null;
}

export function criticalCoverageCounts<T>(items: T[], map: (item: T) => { title?: unknown; category?: unknown; brand?: unknown; madeToOrder?: unknown }) {
  const counts: Record<CriticalCoverageKey, number> = {
    fashion: 0,
    tv: 0,
    laptop: 0,
    refrigerator: 0,
    airConditioner: 0,
    washingMachine: 0,
  };
  for (const item of items) {
    const key = criticalCoverageKey(map(item));
    if (key) counts[key] += 1;
  }
  return counts;
}

export function criticalFirst<T>(items: T[], map: (item: T) => { title?: unknown; category?: unknown; brand?: unknown; madeToOrder?: unknown }) {
  const buckets = new Map<CriticalCoverageKey, T[]>();
  const rest: T[] = [];
  for (const item of items) {
    const key = criticalCoverageKey(map(item));
    if (!key) rest.push(item);
    else buckets.set(key, [...(buckets.get(key) || []), item]);
  }
  const prioritized: T[] = [];
  for (const key of CRITICAL_COVERAGE_KEYS) {
    const bucket = buckets.get(key) || [];
    if (bucket.length) prioritized.push(bucket[0]);
  }
  const already = new Set(prioritized);
  for (const item of items) if (!already.has(item)) prioritized.push(item);
  return prioritized;
}
