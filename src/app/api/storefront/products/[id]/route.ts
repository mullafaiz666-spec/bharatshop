import { NextResponse } from "next/server";
import { db } from "@/db";
import { products } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await db.select().from(products).where(eq(products.id, Number(id)));
  if (!found[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ product: found[0] });
}

export const dynamic = "force-dynamic";
