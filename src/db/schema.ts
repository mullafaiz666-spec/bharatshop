import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// ── USERS / OPERATORS ─────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("Operator"),
  avatarUrl: text("avatar_url"),
  aiAutoPilotEnabled: boolean("ai_auto_pilot_enabled").notNull().default(true),
  // Indian market defaults — prices in INR
  minProfitMarginPct: numeric("min_profit_margin_pct", { precision: 5, scale: 2 }).notNull().default("35.00"),
  autoFulfillOrders: boolean("auto_fulfill_orders").notNull().default(true),
  maxDailySpendInr: numeric("max_daily_spend_inr", { precision: 12, scale: 2 }).notNull().default("200000.00"),
  gstRegistered: boolean("gst_registered").notNull().default(true),
  gstNumber: text("gst_number").default("27AAPFU0939F1ZV"),
  defaultMarginPct: numeric("default_margin_pct", { precision: 5, scale: 2 }).notNull().default("40.00"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── STORES (Indian Channels) ─────────────────────────────────────────────────
export const stores = pgTable("stores", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  platform: text("platform").notNull(), // 'Meesho' | 'Flipkart' | 'Amazon India' | 'Shopify India' | 'Glowroad'
  storeUrl: text("store_url").notNull(),
  status: text("status").notNull().default("Connected"),
  totalProductsCount: integer("total_products_count").notNull().default(0),
  currency: text("currency").notNull().default("INR"),
  commissionPct: numeric("commission_pct", { precision: 5, scale: 2 }).notNull().default("8.00"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── PRODUCTS (Real Indian Dropshipping SKUs) ──────────────────────────────────
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  storeId: integer("store_id"),
  sku: text("sku").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  imageUrl: text("image_url").notNull(),
  brand: text("brand").notNull().default("Generic"),
  supplierName: text("supplier_name").notNull(),
  supplierCity: text("supplier_city").notNull().default("Surat, Gujarat"),
  supplierCostInr: numeric("supplier_cost_inr", { precision: 10, scale: 2 }).notNull(),
  shippingCostInr: numeric("shipping_cost_inr", { precision: 10, scale: 2 }).notNull().default("60.00"),
  gstPct: numeric("gst_pct", { precision: 5, scale: 2 }).notNull().default("18.00"),
  sellingPriceInr: numeric("selling_price_inr", { precision: 10, scale: 2 }).notNull(),
  mrpInr: numeric("mrp_inr", { precision: 10, scale: 2 }).notNull(),
  // Custom margin set by the operator
  customMarginPct: numeric("custom_margin_pct", { precision: 5, scale: 2 }).notNull().default("40.00"),
  netProfitInr: numeric("net_profit_inr", { precision: 10, scale: 2 }).notNull(),
  aiScore: integer("ai_score").notNull().default(88),
  viralVelocityScore: integer("viral_velocity_score").notNull().default(80),
  stockCount: integer("stock_count").notNull().default(500),
  moq: integer("moq").notNull().default(1), // Minimum order quantity
  autoRepriceEnabled: boolean("auto_reprice_enabled").notNull().default(true),
  status: text("status").notNull().default("Published"),
  aiMarketingCopy: text("ai_marketing_copy").notNull(),
  aiTargetAudience: text("ai_target_audience").notNull(),
  hsnCode: text("hsn_code").notNull().default("85171290"),
  salesCount24h: integer("sales_count_24h").notNull().default(0),
  returnsCount: integer("returns_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── CART ITEMS (Buyer's personalised dropshipping cart) ───────────────────────
export const cartItems = pgTable("cart_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  productId: integer("product_id").notNull(),
  productTitle: text("product_title").notNull(),
  productImageUrl: text("product_image_url").notNull(),
  sku: text("sku").notNull(),
  quantity: integer("quantity").notNull().default(1),
  // Operator-set custom selling price (overrides default)
  customSellingPriceInr: numeric("custom_selling_price_inr", { precision: 10, scale: 2 }).notNull(),
  supplierCostInr: numeric("supplier_cost_inr", { precision: 10, scale: 2 }).notNull(),
  shippingCostInr: numeric("shipping_cost_inr", { precision: 10, scale: 2 }).notNull(),
  gstPct: numeric("gst_pct", { precision: 5, scale: 2 }).notNull().default("18.00"),
  // Margin is calculated from customSellingPriceInr vs cost
  customMarginPct: numeric("custom_margin_pct", { precision: 5, scale: 2 }).notNull(),
  netProfitInr: numeric("net_profit_inr", { precision: 10, scale: 2 }).notNull(),
  targetPlatform: text("target_platform").notNull().default("Meesho"), // where operator plans to list
  notes: text("notes").default(""),
  addedAt: timestamp("added_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── ORDERS ────────────────────────────────────────────────────────────────────
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  storeId: integer("store_id"),
  orderNumber: text("order_number").notNull(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").notNull().default("9999999999"),
  customerCity: text("customer_city").notNull().default("Mumbai"),
  customerState: text("customer_state").notNull().default("Maharashtra"),
  customerPincode: text("customer_pincode").notNull().default("400001"),
  productId: integer("product_id"),
  productTitle: text("product_title").notNull(),
  quantity: integer("quantity").notNull().default(1),
  customerPaidInr: numeric("customer_paid_inr", { precision: 10, scale: 2 }).notNull(),
  supplierCostInr: numeric("supplier_cost_inr", { precision: 10, scale: 2 }).notNull(),
  gstAmountInr: numeric("gst_amount_inr", { precision: 10, scale: 2 }).notNull().default("0.00"),
  platformCommissionInr: numeric("platform_commission_inr", { precision: 10, scale: 2 }).notNull().default("0.00"),
  netProfitInr: numeric("net_profit_inr", { precision: 10, scale: 2 }).notNull(),
  fulfillmentStatus: text("fulfillment_status").notNull(),
  supplierTrackingCode: text("supplier_tracking_code"),
  carrierName: text("carrier_name").default("Delhivery Surface"),
  paymentMode: text("payment_mode").notNull().default("COD"),
  aiDecisionLog: text("ai_decision_log").notNull(),
  orderedAt: timestamp("ordered_at").defaultNow().notNull(),
  fulfilledAt: timestamp("fulfilled_at"),
});

// ── AUTOMATION RULES ──────────────────────────────────────────────────────────
export const automationRules = pgTable("automation_rules", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  triggerType: text("trigger_type").notNull(),
  triggerThreshold: numeric("trigger_threshold", { precision: 10, scale: 2 }).notNull(),
  actionType: text("action_type").notNull(),
  actionParam: text("action_param").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  executionCount: integer("execution_count").notNull().default(0),
  lastTriggeredAt: timestamp("last_triggered_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── PRODUCT DAILY REFRESH LOG ─────────────────────────────────────────────────
export const productRefreshLogs = pgTable("product_refresh_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  runAt: timestamp("run_at").defaultNow().notNull(),
  totalProductsUpdated: integer("total_products_updated").notNull().default(0),
  totalProductsAdded: integer("total_products_added").notNull().default(0),
  totalProductsDropped: integer("total_products_dropped").notNull().default(0),
  avgAiScore: numeric("avg_ai_score", { precision: 5, scale: 2 }).notNull().default("0"),
  topCategory: text("top_category").notNull().default("Electronics & Gadgets"),
  topBrand: text("top_brand").notNull().default("boAt"),
  totalProjectedProfitInr: numeric("total_projected_profit_inr", { precision: 14, scale: 2 }).notNull().default("0"),
  agentSummary: text("agent_summary").notNull().default(""),
  status: text("status").notNull().default("COMPLETED"),
});

// ── MARKETING CAMPAIGNS ───────────────────────────────────────────────────────
export const marketingCampaigns = pgTable("marketing_campaigns", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  productId: integer("product_id").notNull(),
  productTitle: text("product_title").notNull(),
  platform: text("platform").notNull(), // 'WhatsApp Broadcast' | 'Instagram Reels' | 'Facebook Ads' | 'Google Shopping' | 'SMS Blast'
  campaignType: text("campaign_type").notNull(), // 'FLASH_SALE' | 'FESTIVAL' | 'VIRAL_PUSH' | 'RETARGET' | 'NEW_LAUNCH'
  headline: text("headline").notNull(),
  bodyText: text("body_text").notNull(),
  ctaText: text("cta_text").notNull().default("Abhi Kharido!"),
  targetAudience: text("target_audience").notNull(),
  budgetInr: numeric("budget_inr", { precision: 10, scale: 2 }).notNull().default("500.00"),
  estimatedReachK: integer("estimated_reach_k").notNull().default(10),
  estimatedRoas: numeric("estimated_roas", { precision: 5, scale: 2 }).notNull().default("3.50"),
  status: text("status").notNull().default("LIVE"), // 'LIVE' | 'SCHEDULED' | 'PAUSED' | 'COMPLETED'
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  conversions: integer("conversions").notNull().default(0),
  revenueGeneratedInr: numeric("revenue_generated_inr", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  scheduledAt: timestamp("scheduled_at"),
});

// ── STOREFRONT ORDERS (Customer-facing own website orders) ────────────────────
export const storefrontOrders = pgTable("storefront_orders", {
  id: serial("id").primaryKey(),
  orderRef: text("order_ref").notNull().unique(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerAddress: text("customer_address").notNull(),
  customerCity: text("customer_city").notNull(),
  customerState: text("customer_state").notNull(),
  customerPincode: text("customer_pincode").notNull(),
  productId: integer("product_id"),
  productTitle: text("product_title").notNull(),
  productImageUrl: text("product_image_url").notNull(),
  quantity: integer("quantity").notNull().default(1),
  sellingPriceInr: numeric("selling_price_inr", { precision: 10, scale: 2 }).notNull(),
  totalAmountInr: numeric("total_amount_inr", { precision: 10, scale: 2 }).notNull(),
  paymentMode: text("payment_mode").notNull().default("COD"),
  paymentStatus: text("payment_status").notNull().default("PENDING"),
  fulfillmentStatus: text("fulfillment_status").notNull().default("Received"),
  trackingCode: text("tracking_code"),
  carrierName: text("carrier_name").default("Delhivery"),
  source: text("source").notNull().default("own_website"), // 'own_website' | 'shopify_sync'
  shopifyOrderId: text("shopify_order_id"),
  notes: text("notes").default(""),
  orderedAt: timestamp("ordered_at").defaultNow().notNull(),
  fulfilledAt: timestamp("fulfilled_at"),
});

// ── SHOPIFY SYNC LOG ─────────────────────────────────────────────────────────
export const shopifySyncLogs = pgTable("shopify_sync_logs", {
  id: serial("id").primaryKey(),
  syncType: text("sync_type").notNull(), // 'PRODUCT_PUSH' | 'ORDER_PULL' | 'PRICE_UPDATE' | 'INVENTORY_SYNC'
  status: text("status").notNull().default("SUCCESS"),
  itemsSynced: integer("items_synced").notNull().default(0),
  shopifyStoreUrl: text("shopify_store_url").notNull().default(""),
  message: text("message").notNull(),
  errorDetail: text("error_detail"),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
});

// ── AI ACTIVITY LOGS ──────────────────────────────────────────────────────────
export const aiActivityLogs = pgTable("ai_activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  agentName: text("agent_name").notNull(),
  actionType: text("action_type").notNull(),
  message: text("message").notNull(),
  profitImpactInr: numeric("profit_impact_inr", { precision: 10, scale: 2 }).default("0.00"),
  metadataJson: jsonb("metadata_json"),
  status: text("status").notNull().default("SUCCESS"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
