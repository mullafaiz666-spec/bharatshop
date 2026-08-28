export type CommerceAgentName = "product" | "marketing" | "sales" | "advertising" | "social" | "email" | "analytics";

export type AgentDecision = {
  agent: CommerceAgentName;
  action: string;
  productId?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type CommerceEvent =
  | { type: "PRODUCT_CANDIDATE"; productId: number }
  | { type: "PRODUCT_PUBLISHED"; productId: number }
  | { type: "ORDER_CREATED"; orderId: number; productId?: number }
  | { type: "CAMPAIGN_METRICS"; campaignId: string; spend: number; revenue: number }
  | { type: "CART_ABANDONED"; customerId?: string; cartId: string }
  | { type: "DELIVERY_UPDATED"; orderId: number };

export type AgentHandler = (event: CommerceEvent) => Promise<AgentDecision[]>;

const handlers = new Map<CommerceAgentName, AgentHandler>();

export function registerCommerceAgent(name: CommerceAgentName, handler: AgentHandler) {
  handlers.set(name, handler);
}

export async function dispatchCommerceEvent(event: CommerceEvent): Promise<AgentDecision[]> {
  const decisions: AgentDecision[] = [];
  for (const [agent, handler] of handlers) {
    try {
      decisions.push(...await handler(event));
    } catch (error) {
      decisions.push({ agent, action: "ERROR", metadata: { error: error instanceof Error ? error.message : String(error) }, createdAt: new Date().toISOString() });
    }
  }
  return decisions;
}

/**
 * Economics guard used by every growth agent. Advertising cannot scale a
 * product unless contribution margin remains positive after acquisition cost
 * and ad spend. This is intentionally provider-neutral; provider adapters are
 * responsible for authorized API operations.
 */
export function contributionMargin(revenue: number, storeCost: number, shipping: number, adSpend: number, fees = 0) {
  return revenue - storeCost - shipping - adSpend - fees;
}

export function shouldScaleCampaign(input: { revenue: number; storeCost: number; shipping: number; adSpend: number; fees?: number; targetRoas?: number }) {
  const margin = contributionMargin(input.revenue, input.storeCost, input.shipping, input.adSpend, input.fees || 0);
  const roas = input.adSpend > 0 ? input.revenue / input.adSpend : Infinity;
  return margin > 0 && roas >= (input.targetRoas ?? 2);
}

export function shouldPauseCampaign(input: { revenue: number; storeCost: number; shipping: number; adSpend: number; fees?: number; minimumRoas?: number; }) {
  const margin = contributionMargin(input.revenue, input.storeCost, input.shipping, input.adSpend, input.fees || 0);
  const roas = input.adSpend > 0 ? input.revenue / input.adSpend : Infinity;
  return margin <= 0 || roas < (input.minimumRoas ?? 1.2);
}
