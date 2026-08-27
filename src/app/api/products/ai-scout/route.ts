import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, aiActivityLogs, stores } from "@/db/schema";
import { ensureDemoDataSeeded } from "@/lib/seed";

const INDIAN_SCOUT_TEMPLATES = [
  {
    title: "Zebronics Zeb-Sound Feast 700 60W 2.1 Bluetooth Speaker with Remote & LED",
    category: "Electronics & Gadgets", brand: "Zebronics",
    imageUrl: "https://images.unsplash.com/photo-1545454675-3531b543be5d?w=600&auto=format&fit=crop&q=80",
    supplierCostInr: 890, shippingCostInr: 90, gstPct: 18, sellingPriceInr: 1999, mrpInr: 3499,
    aiMarketingCopy: "60W thundering bass, USB/SD/FM/Bluetooth, remote control — living room party ready. Zebronics ki quality, Meesho ka price.",
    aiTargetAudience: "Young adults, music lovers, hostel rooms, Tier-2 India",
  },
  {
    title: "Nova NHC-2060 Grooming Kit Rechargeable 10-in-1 Beard Hair Trimmer",
    category: "Personal Care & Grooming", brand: "Nova",
    imageUrl: "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=600&auto=format&fit=crop&q=80",
    supplierCostInr: 320, shippingCostInr: 55, gstPct: 18, sellingPriceInr: 799, mrpInr: 1599,
    aiMarketingCopy: "10-in-1 grooming kit, 45 min runtime, USB charge. Nova — India ka #1 grooming brand.",
    aiTargetAudience: "Men 18–35, budget-conscious buyers, festival gifting",
  },
  {
    title: "Kuber Industries 12-Piece Airtight Container Set, BPA-Free PP, Clear Lid (250ml-2500ml)",
    category: "Kitchen & Dining", brand: "Kuber Industries",
    imageUrl: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&auto=format&fit=crop&q=80",
    supplierCostInr: 280, shippingCostInr: 75, gstPct: 12, sellingPriceInr: 699, mrpInr: 1299,
    aiMarketingCopy: "Dal, chawal, masale sab organize karo — 12 airtight containers, BPA-free, transparent lid, dishwasher safe.",
    aiTargetAudience: "Indian homemakers, newly married couples, kitchen organisation buyers",
  },
  {
    title: "Fastrack Reflex Beat Smartwatch 1.69\" HD Display, SpO2, HR, 7-Day Battery — Black",
    category: "Wearables", brand: "Fastrack",
    imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80",
    supplierCostInr: 1200, shippingCostInr: 60, gstPct: 18, sellingPriceInr: 2499, mrpInr: 4995,
    aiMarketingCopy: "Fastrack Reflex Beat — SpO2, heart rate, 7-day battery, 1.69 HD screen. Smartwatch under ₹2500, best value India mein.",
    aiTargetAudience: "Fitness beginners, college students, first-time smartwatch buyers",
  },
];

export async function POST(req: Request) {
  try {
    const demoUser = await ensureDemoDataSeeded();
    const userId = demoUser?.id ?? 1;
    const body = await req.json().catch(() => ({}));
    const niche: string | undefined = body.niche;

    let template = INDIAN_SCOUT_TEMPLATES[Math.floor(Math.random() * INDIAN_SCOUT_TEMPLATES.length)];
    if (niche && niche.trim().length > 0) {
      const base = 200 + Math.random() * 400;
      const ship = 60 + Math.random() * 40;
      const price = base * (2.8 + Math.random() * 0.8);
      template = {
        title: `${niche.trim()} — AI Scout India Special (Bestseller Edition)`,
        category: "Electronics & Gadgets",
        brand: "Generic",
        imageUrl: "https://images.unsplash.com/photo-1625948515291-69bc9a6f8c87?w=600&auto=format&fit=crop&q=80",
        supplierCostInr: Number(base.toFixed(2)),
        shippingCostInr: Number(ship.toFixed(2)),
        gstPct: 18,
        sellingPriceInr: Number(price.toFixed(2)),
        mrpInr: Number((price * 1.6).toFixed(2)),
        aiMarketingCopy: `"${niche.trim()}" ka India mein 3x search spike detect hua. High-margin viral winner — Meesho & Glowroad pe ready for listing.`,
        aiTargetAudience: `${niche.trim()} buyers, Indian online shoppers, 18–45 age group`,
      };
    }

    const allStores = await db.select().from(stores);
    const storeId = allStores[0]?.id;
    const cost = Number(template.supplierCostInr);
    const ship = Number(template.shippingCostInr);
    const price = Number(template.sellingPriceInr);
    const gst = Number(template.gstPct);
    const netProfit = Number((price - cost - ship - (cost * gst / 100)).toFixed(2));
    const margin = Number(((netProfit / price) * 100).toFixed(2));
    const aiScore = Math.floor(91 + Math.random() * 9);

    const [inserted] = await db.insert(products).values({
      userId, storeId,
      sku: `BD-AI-${Math.floor(1000 + Math.random() * 9000)}`,
      title: template.title,
      category: template.category,
      imageUrl: template.imageUrl,
      brand: template.brand,
      supplierName: "Surat Automated Wholesale Hub (AI Scout)",
      supplierCity: "Surat, Gujarat",
      supplierCostInr: cost.toFixed(2),
      shippingCostInr: ship.toFixed(2),
      gstPct: gst.toFixed(2),
      sellingPriceInr: price.toFixed(2),
      mrpInr: Number(template.mrpInr).toFixed(2),
      customMarginPct: margin.toFixed(2),
      netProfitInr: netProfit.toFixed(2),
      aiScore,
      viralVelocityScore: Math.floor(88 + Math.random() * 12),
      stockCount: 600,
      moq: 1,
      autoRepriceEnabled: true,
      status: "Published",
      aiMarketingCopy: template.aiMarketingCopy,
      aiTargetAudience: template.aiTargetAudience,
      hsnCode: "85176990",
    }).returning();

    await db.insert(aiActivityLogs).values({
      userId,
      agentName: "Scout-AI v4.2 // Meesho Radar",
      actionType: "TREND_DETECTED",
      message: `Scouted & published "${inserted.title}" — AI Score ${inserted.aiScore}/100 | Net ₹${inserted.netProfitInr}/unit profit`,
      profitImpactInr: inserted.netProfitInr,
      status: "SUCCESS",
    });

    return NextResponse.json({
      product: inserted,
      scoutReport: {
        aiConfidence: inserted.aiScore,
        viralVelocity: inserted.viralVelocityScore,
        estimatedDailyOrders: Math.floor(30 + Math.random() * 60),
        supplierLocation: "Surat, Gujarat",
        carrier: "Delhivery / Ekart (1–3 day Tier-1)",
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
