"use client";

import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Bag, ChevronRight, Lock, Minus, Plus, Truck, X } from "@/components/bharatdrip/icons";
import { formatPrice, products, type Product } from "@/lib/bharatdrip/products";

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

function clampQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.trunc(value)));
}

export function restoreCart(value: unknown): CartLine[] {
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
    const product = products.find((item) => item.id === productId);

    // Rehydrate from the canonical catalogue. Never trust persisted product
    // pricing/details from localStorage.
    if (!product || !product.sizes.includes(size)) continue;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) continue;

    restored.push({ product, size, quantity });
  }
  return restored;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setItems(restoreCart(JSON.parse(stored)));
    } catch {
      // Private browsing, malformed storage, or storage access failures must
      // not break the cart; keep the in-memory cart usable.
    } finally {
      setHasHydrated(true);
    }
  }, []);

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
  const { items, itemCount, subtotal, isCartOpen, closeCart, removeItem, updateQuantity } = useCart();
  const [view, setView] = useState<"cart" | "checkout">("cart");
  const [checkoutMessage, setCheckoutMessage] = useState("");

  useEffect(() => {
    if (!isCartOpen) {
      setView("cart");
      setCheckoutMessage("");
    }
  }, [isCartOpen]);

  if (!isCartOpen) return null;

  const shipping = subtotal >= 7500 || subtotal === 0 ? 0 : 490;
  const total = subtotal + shipping;

  function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCheckoutMessage("Ordering is not enabled yet. Your bag has been preserved; no order was created and no payment was attempted.");
  }

  return (
    <div className="cart-overlay" role="dialog" aria-modal="true" aria-label="Shopping bag">
      <button className="cart-backdrop" aria-label="Close shopping bag" onClick={closeCart} />
      <aside className="cart-panel">
        <div className="cart-header">
          <div>
            <p className="eyebrow">bharatdrip / bag</p>
            <h2>{view === "cart" ? "Your selection" : "Checkout preview"}</h2>
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
              <div className="cart-note"><Truck size={17} /><span>Free shipping unlocked on this order.</span></div>
              <div className="cart-summary"><div><span>Subtotal <small>{itemCount} {itemCount === 1 ? "item" : "items"}</small></span><strong>{formatPrice(subtotal)}</strong></div><div><span>Shipping</span><strong>{shipping === 0 ? "Free" : formatPrice(shipping)}</strong></div><div className="cart-total"><span>Total</span><strong>{formatPrice(total)}</strong></div></div>
              <button className="button button-dark button-wide" onClick={() => setView("checkout")}>Review checkout <ChevronRight size={17} /></button>
              <p className="secure-note"><Lock size={13} /> Ordering remains disabled until the real order/payment backend is connected.</p>
            </>
          )
        )}

        {view === "checkout" && (
          <form className="checkout-form" onSubmit={submitOrder}>
            <div className="checkout-progress"><span className="active">Preview</span><span>Order creation unavailable</span></div>
            <label>Email address<input type="email" required placeholder="you@example.com" /></label>
            <div className="form-two"><label>First name<input required placeholder="Aarav" /></label><label>Last name<input required placeholder="Sharma" /></label></div>
            <label>Address<input required placeholder="Street address" /></label>
            <div className="form-two"><label>City<input required placeholder="Mumbai" /></label><label>PIN code<input required pattern="[0-9]{6}" placeholder="400001" /></label></div>
            <label>Country<select defaultValue="India"><option>India</option><option>United States</option><option>United Kingdom</option><option>Singapore</option></select></label>
            <div className="checkout-total"><span>Preview total</span><strong>{formatPrice(total)}</strong></div>
            <button className="button button-dark button-wide" type="submit">Check order availability <Lock size={15} /></button>
            <button type="button" className="text-button" onClick={() => setView("cart")}>← Back to bag</button>
            <p className="checkout-disclaimer">Checkout is a preview only. No order or payment will be created until the real backend is connected.</p>
            {checkoutMessage ? <p className="checkout-disclaimer" role="status" aria-live="polite">{checkoutMessage}</p> : null}
          </form>
        )}
      </aside>
    </div>
  );
}
