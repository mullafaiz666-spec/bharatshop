"use client";

import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Bag, ChevronRight, Lock, Minus, Plus, Truck, X } from "@/components/bharatdrip/icons";
import { formatPrice, products as staticProducts, type Product } from "@/lib/bharatdrip/products";

type CartLine = {
  product: Product;
  size: string;
  quantity: number;
};

type CartContextValue = {
  items: CartLine[];
  itemCount: number;
  subtotal: number;
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (product: Product, size: string, quantity?: number) => void;
  removeItem: (productId: string, size: string) => void;
  updateQuantity: (productId: string, size: string, quantity: number) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "bharatdrip-cart";
const MAX_LINE_QUANTITY = 20;
const MAX_CART_LINES = 50;

type Provider = "razorpay" | "cashfree";
type PaymentAvailability = {
  providers?: {
    razorpay?: { configured: boolean };
    cashfree?: { configured: boolean };
  };
  anyConfigured?: boolean;
};

async function loadScript(src: string) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Secure payment window could not load"));
    document.body.appendChild(script);
  });
}

function clampQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.trunc(value)));
}

export function restoreCart(value: unknown, catalogue: Product[] = staticProducts): CartLine[] {
  if (!Array.isArray(value)) return [];

  const restored: CartLine[] = [];
  for (const entry of value.slice(0, MAX_CART_LINES)) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as {
      product?: { id?: unknown };
      size?: unknown;
      quantity?: unknown;
    };

    const productId = typeof candidate.product?.id === "string" ? candidate.product.id : "";
    const size = typeof candidate.size === "string" ? candidate.size : "";
    const quantity = Number(candidate.quantity);
    const product = catalogue.find((item) => item.id === productId);

    // Rehydrate from the canonical catalogue. Never trust persisted product
    // pricing/details from localStorage.
    if (!product || !product.sizes.includes(size)) continue;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) continue;

    restored.push({ product, size, quantity });
  }
  return restored;
}

export function CartProvider({ children, catalogue = staticProducts }: { children: ReactNode; catalogue?: Product[] }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setItems(restoreCart(JSON.parse(stored), catalogue));
    } catch {
      // Private browsing, malformed storage, or storage access failures must
      // not break the cart; keep the in-memory cart usable.
    } finally {
      setHasHydrated(true);
    }
  }, [catalogue]);

  useEffect(() => {
    if (!hasHydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage writes can fail (quota/private mode). The in-memory cart
      // remains authoritative for this session.
    }
  }, [items, hasHydrated]);

  useEffect(() => {
    document.body.style.overflow = isCartOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isCartOpen]);

  const value = useMemo<CartContextValue>(() => ({
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    isCartOpen,
    openCart: () => setIsCartOpen(true),
    closeCart: () => setIsCartOpen(false),
    addItem: (product, size, quantity = 1) => {
      if (!product.sizes.includes(size)) return;
      const safeQuantity = clampQuantity(quantity);
      setItems((current) => {
        const match = current.find((item) => item.product.id === product.id && item.size === size);
        if (match) {
          return current.map((item) => item === match
            ? { ...item, product, quantity: clampQuantity(item.quantity + safeQuantity) }
            : item);
        }
        return [...current, { product, size, quantity: safeQuantity }].slice(0, MAX_CART_LINES);
      });
      setIsCartOpen(true);
    },
    removeItem: (productId, size) => setItems((current) => current.filter((item) => !(item.product.id === productId && item.size === size))),
    updateQuantity: (productId, size, quantity) => setItems((current) => current.map((item) => item.product.id === productId && item.size === size ? { ...item, quantity: clampQuantity(quantity) } : item)),
    clearCart: () => setItems([]),
  }), [items, isCartOpen]);

  return <CartContext.Provider value={value}>{children}<CartDrawer /></CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}

function CartDrawer() {
  const { items, itemCount, subtotal, isCartOpen, closeCart, removeItem, updateQuantity, clearCart } = useCart();
  const [view, setView] = useState<"cart" | "checkout" | "success">("cart");
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<Provider>("razorpay");
  const [availability, setAvailability] = useState<PaymentAvailability>({});
  const [verifiedRefs, setVerifiedRefs] = useState<string[]>([]);
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", city: "", state: "", pincode: "" });

  const liveCheckout = items.length > 0 && items.every((item) => Number.isInteger(item.product.liveProductId) && Number(item.product.liveProductId) > 0);

  useEffect(() => {
    if (!isCartOpen) {
      setView("cart");
      setCheckoutMessage("");
      setBusy(false);
      setVerifiedRefs([]);
    }
  }, [isCartOpen]);

  useEffect(() => {
    if (view !== "checkout" || !liveCheckout) return;
    let active = true;
    fetch("/api/payments/status", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error("Payment status unavailable")))
      .then((data: PaymentAvailability) => {
        if (!active) return;
        setAvailability(data);
        if (!data.providers?.razorpay?.configured && data.providers?.cashfree?.configured) setProvider("cashfree");
      })
      .catch(() => {
        if (active) setAvailability({ anyConfigured: false });
      });
    return () => { active = false; };
  }, [view, liveCheckout]);

  if (!isCartOpen) return null;

  // Live BharatDrip DB products use the same backend pricing/payment policy as
  // the main BharatShop store. Static showcase pieces keep the old preview
  // shipping display because they cannot create backend orders yet.
  const shipping = liveCheckout ? 0 : subtotal >= 7500 || subtotal === 0 ? 0 : 490;
  const total = subtotal + shipping;
  const razorpayReady = !!availability.providers?.razorpay?.configured;
  const cashfreeReady = !!availability.providers?.cashfree?.configured;

  async function createOrders() {
    const refs: string[] = [];
    let confirmationAmountInr = 0;
    let codBalanceInr = 0;

    for (const item of items) {
      const productId = item.product.liveProductId;
      if (!productId) throw new Error("This piece is not connected to the live BharatDrip catalogue yet.");

      const response = await fetch("/api/storefront/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.name,
          customerEmail: form.email,
          customerPhone: form.phone,
          customerAddress: form.address,
          customerCity: form.city,
          customerState: form.state,
          customerPincode: form.pincode,
          productId,
          quantity: item.quantity,
          selectedSize: item.size,
          paymentMode: provider === "razorpay" ? "PARTIAL_COD_RAZORPAY" : "PARTIAL_COD_CASHFREE",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to prepare this BharatDrip order.");
      refs.push(String(data.ref));
      confirmationAmountInr += Number(data.paymentPlan?.confirmationAmountInr || 0);
      codBalanceInr += Number(data.paymentPlan?.codBalanceInr || 0);
    }

    return {
      refs,
      confirmationAmountInr: Number(confirmationAmountInr.toFixed(2)),
      codBalanceInr: Number(codBalanceInr.toFixed(2)),
    };
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCheckoutMessage("");

    if (!liveCheckout) {
      setCheckoutMessage("Checkout is a preview only for legacy showcase pieces. No order was created and no payment was attempted.");
      return;
    }
    if (!availability.anyConfigured) {
      setCheckoutMessage("Online confirmation payment is not configured. Checkout stays paused instead of creating an unprotected COD order.");
      return;
    }

    setBusy(true);
    try {
      const prepared = await createOrders();

      if (provider === "razorpay") {
        const response = await fetch("/api/payments/razorpay/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderRefs: prepared.refs }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Razorpay could not start.");

        await loadScript("https://checkout.razorpay.com/v1/checkout.js");
        const Razorpay = (window as any).Razorpay;
        if (!Razorpay) throw new Error("Razorpay Checkout is unavailable.");

        const checkout = new Razorpay({
          key: data.keyId,
          amount: data.amount,
          currency: data.currency,
          name: "BharatDrip",
          description: "Order confirmation amount",
          order_id: data.razorpayOrderId,
          prefill: { name: form.name, email: form.email, contact: form.phone },
          handler: async (payment: any) => {
            try {
              const verifyResponse = await fetch("/api/payments/razorpay/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payment),
              });
              const verified = await verifyResponse.json().catch(() => ({}));
              if (!verifyResponse.ok || !verified.verified) throw new Error(verified.error || "Payment verification failed.");
              setVerifiedRefs(prepared.refs);
              clearCart();
              setView("success");
            } catch (error) {
              setCheckoutMessage(error instanceof Error ? error.message : "Payment verification failed.");
            } finally {
              setBusy(false);
            }
          },
        });

        checkout.on("payment.failed", (response: any) => {
          setCheckoutMessage(response?.error?.description || "Payment failed. The order has not entered fulfilment.");
          setBusy(false);
        });
        checkout.open();
        return;
      }

      const response = await fetch("/api/payments/cashfree/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderRefs: prepared.refs }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Cashfree could not start.");

      sessionStorage.setItem("bharatshop_pending_checkout", JSON.stringify(prepared));
      await loadScript("https://sdk.cashfree.com/js/v3/cashfree.js");
      const Cashfree = (window as any).Cashfree;
      if (!Cashfree) throw new Error("Cashfree Checkout is unavailable.");
      const cashfree = Cashfree({ mode: data.mode });
      await cashfree.checkout({ paymentSessionId: data.paymentSessionId, redirectTarget: "_self" });
    } catch (error) {
      setCheckoutMessage(error instanceof Error ? error.message : "Checkout could not start.");
      setBusy(false);
    }
  }

  return (
    <div className="cart-overlay" role="dialog" aria-modal="true" aria-label="Shopping bag">
      <button className="cart-backdrop" aria-label="Close shopping bag" onClick={closeCart} />
      <aside className="cart-panel">
        <div className="cart-header">
          <div>
            <p className="eyebrow">bharatdrip / bag</p>
            <h2>{view === "cart" ? "Your selection" : view === "checkout" ? "Secure checkout" : "Payment verified"}</h2>
          </div>
          <button className="icon-button" onClick={closeCart} aria-label="Close shopping bag"><X size={22} /></button>
        </div>

        {view === "cart" && (
          items.length === 0 ? (
            <div className="empty-cart">
              <div className="empty-cart-mark"><Bag size={28} /></div>
              <h3>Your bag is taking a breather.</h3>
              <p>Add a few good things and they’ll show up here.</p>
              <button className="button button-dark" onClick={closeCart}>Continue shopping <ChevronRight size={16} /></button>
            </div>
          ) : (
            <>
              <div className="cart-items">
                {items.map((item) => (
                  <div className="cart-line" key={`${item.product.id}-${item.size}`}>
                    <img src={item.product.images[0]} alt={item.product.name} />
                    <div className="cart-line-info">
                      <div className="cart-line-top"><div><p className="cart-line-name">{item.product.name}</p><p className="cart-line-meta">{item.size} / {item.product.color}</p></div><button className="remove-button" onClick={() => removeItem(item.product.id, item.size)} aria-label={`Remove ${item.product.name}`}><X size={15} /></button></div>
                      <div className="cart-line-bottom"><div className="quantity-control"><button onClick={() => updateQuantity(item.product.id, item.size, item.quantity - 1)} aria-label="Decrease quantity"><Minus size={13} /></button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.product.id, item.size, item.quantity + 1)} aria-label="Increase quantity"><Plus size={13} /></button></div><strong>{formatPrice(item.product.price * item.quantity)}</strong></div>
                    </div>
                  </div>
                ))}
              </div>
              {liveCheckout ? <div className="cart-note"><Truck size={17} /><span>Live BharatDrip drops use the protected BharatShop order gateway.</span></div> : <div className="cart-note"><Truck size={17} /><span>Legacy showcase pieces are browse-only until migrated into the live catalogue.</span></div>}
              <div className="cart-summary"><div><span>Subtotal <small>{itemCount} {itemCount === 1 ? "item" : "items"}</small></span><strong>{formatPrice(subtotal)}</strong></div><div><span>Shipping</span><strong>{shipping === 0 ? "Included" : formatPrice(shipping)}</strong></div><div className="cart-total"><span>Total</span><strong>{formatPrice(total)}</strong></div></div>
              <button className="button button-dark button-wide" onClick={() => setView("checkout")}>{liveCheckout ? "Continue securely" : "Review checkout status"} <ChevronRight size={17} /></button>
              <p className="secure-note"><Lock size={13} /> {liveCheckout ? "A confirmation amount is verified online before fulfilment can proceed." : "No backend order will be created for legacy showcase products."}</p>
            </>
          )
        )}

        {view === "checkout" && (
          <form className="checkout-form" onSubmit={submitOrder}>
            <div className="checkout-progress"><span className="active">{liveCheckout ? "Delivery" : "Preview"}</span><span>{liveCheckout ? "Protected payment" : "Order unavailable"}</span></div>
            <label>Full name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Aarav Sharma" /></label>
            <label>Email address<input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" /></label>
            <label>Phone number<input required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="9876543210" /></label>
            <label>Address<input required value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Street address" /></label>
            <div className="form-two"><label>City<input required value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="Mumbai" /></label><label>State<input required value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} placeholder="Maharashtra" /></label></div>
            <label>PIN code<input required pattern="[0-9]{6}" value={form.pincode} onChange={(event) => setForm({ ...form, pincode: event.target.value })} placeholder="400001" /></label>

            {liveCheckout && (
              <div className="checkout-total">
                <div>
                  <span>Protected confirmation payment</span>
                  <small>The server calculates the confirmation/COD split. Plain unprotected COD is not used.</small>
                </div>
                <div className="form-two">
                  <button type="button" disabled={!razorpayReady} onClick={() => setProvider("razorpay")} className={provider === "razorpay" && razorpayReady ? "button button-dark" : "text-button"}>Razorpay</button>
                  <button type="button" disabled={!cashfreeReady} onClick={() => setProvider("cashfree")} className={provider === "cashfree" && cashfreeReady ? "button button-dark" : "text-button"}>Cashfree</button>
                </div>
              </div>
            )}

            <div className="checkout-total"><span>Order total</span><strong>{formatPrice(total)}</strong></div>
            <button className="button button-dark button-wide" type="submit" disabled={busy || (liveCheckout && availability.anyConfigured === false)}>{busy ? "Securing…" : liveCheckout ? "Continue to secure payment" : "Check order availability"} <Lock size={15} /></button>
            <button type="button" className="text-button" onClick={() => setView("cart")}>← Back to bag</button>
            {!liveCheckout ? <p className="checkout-disclaimer">Checkout is a preview only for legacy showcase pieces. The Fashion Designer’s published live drops use the real order/payment backend.</p> : availability.anyConfigured === false ? <p className="checkout-disclaimer">Payment credentials are not configured. We will not fall back to unprotected COD.</p> : <p className="checkout-disclaimer">Order creation uses the same protected partial-COD gateway as the main BharatShop storefront.</p>}
            {checkoutMessage ? <p className="checkout-disclaimer" role="status" aria-live="polite">{checkoutMessage}</p> : null}
          </form>
        )}

        {view === "success" && (
          <div className="empty-cart">
            <div className="empty-cart-mark"><Lock size={28} /></div>
            <h3>Payment verified.</h3>
            <p>Your confirmation payment has been verified. The remaining balance follows the protected delivery policy.</p>
            {verifiedRefs.map((ref) => <p key={ref} className="checkout-disclaimer">{ref}</p>)}
            <button className="button button-dark" onClick={closeCart}>Continue shopping <ChevronRight size={16} /></button>
          </div>
        )}
      </aside>
    </div>
  );
}
