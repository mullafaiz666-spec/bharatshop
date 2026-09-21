import { sql } from "drizzle-orm";
import { appendPaymentMeta, readPaymentMeta } from "@/lib/payments/token-plan";

type InventoryTransaction = { execute: (query: any) => any };
type ReservableOrder = { productId?: number | null; quantity?: number | null; notes?: string | null };

function resultRows(result: unknown) {
  const rows = result && typeof result === "object" && "rows" in result ? (result as { rows?: unknown[] }).rows : undefined;
  return Array.isArray(rows) ? rows : [];
}

export function inventoryReservationMeta(madeToOrder: boolean, quantity: number) {
  return {
    inventory_reserved: !madeToOrder,
    inventory_reserved_qty: madeToOrder ? 0 : quantity,
    inventory_reserved_at: !madeToOrder ? new Date().toISOString() : "",
    inventory_released: false,
  };
}

export function reservationIsHeld(order: ReservableOrder) {
  return readPaymentMeta(order.notes ?? undefined, "inventory_reserved") === "true"
    && readPaymentMeta(order.notes ?? undefined, "inventory_released") !== "true";
}

export async function reserveInventory(tx: InventoryTransaction, productId: number, quantity: number) {
  const result = await tx.execute(sql`
    UPDATE products
       SET stock_count = stock_count - ${quantity},
           updated_at = NOW()
     WHERE id = ${productId}
       AND stock_count >= ${quantity}
     RETURNING stock_count
  `);
  const rows = resultRows(result);
  return { reserved: rows.length === 1, stockCount: rows.length ? Number((rows[0] as { stock_count?: unknown }).stock_count) : null };
}

export async function releaseInventoryReservation(
  tx: InventoryTransaction,
  order: ReservableOrder,
  reason: string,
) {
  if (!reservationIsHeld(order)) return { released: false, notes: String(order.notes || ""), stockCount: null };
  const productId = Number(order.productId);
  const quantity = Number(readPaymentMeta(order.notes ?? undefined, "inventory_reserved_qty") || order.quantity || 0);
  if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Inventory reservation metadata is invalid");
  }
  const result = await tx.execute(sql`
    UPDATE products
       SET stock_count = stock_count + ${quantity},
           updated_at = NOW()
     WHERE id = ${productId}
     RETURNING stock_count
  `);
  const rows = resultRows(result);
  if (rows.length !== 1) throw new Error("Reserved product no longer exists");
  return {
    released: true,
    stockCount: Number((rows[0] as { stock_count?: unknown }).stock_count),
    notes: appendPaymentMeta(String(order.notes || ""), {
      inventory_released: true,
      inventory_released_at: new Date().toISOString(),
      inventory_release_reason: String(reason || "cancelled").replace(/[|\\r\\n]/g, " ").slice(0, 80),
    }),
  };
}
