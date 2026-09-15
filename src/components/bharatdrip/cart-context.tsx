"use client";

import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Bag, Check, ChevronRight, Lock, Minus, Plus, Truck, X } from "@/components/bharatdrip/icons";
import { formatPrice, type Product } from "@/lib/bharatdrip/products";

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

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setItems(JSON.parse(stored) as CartLine[]);
    } catch {
      // A private browsing session can block local storage; the cart still works in memory.
    } finally {
      setHasHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (hasHydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
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
      setItems((current) => {
        const match = current.find((item) => item.product.id === product.id && item.size === size);
        if (match) return current.map((item) => item === match ? { ...item, quantity: item.quantity + quantity } : item);
        return [...current, { product, size, quantity }];
      });
      setIsCartOpen(true);
    },
    removeItem: (productId, size) => setItems((current) => current.filter((item) => !(item.product.id === productId && item.size === size))),
    updateQuantity: (productId, size, quantity) => setItems((current) => current.map((item) => item.product.id === productId && item.size === size ? { ...item, quantity: Math.max(1, quantity) } : item)),
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
  const [orderNumber, setOrderNumber] = useState("");

  useEffect(() => {
    if (!isCartOpen) setView("cart");
  }, [isCartOpen]);

  if (!isCartOpen) return null;

  const shipping = subtotal >= 7500 || subtotal === 0 ? 0 : 490;
  const total = subtotal + shipping;

  function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOrderNumber(`BD-${Math.floor(100000 + Math.random() * 899999)}`);
    clearCart();
    setView("success");
  }

  return (
    <div className="cart-overlay" role="dialog" aria-modal="true" aria-label="Shopping bag">
      <button className="cart-backdrop" aria-label="Close shopping bag" onClick={closeCart} />
      <aside className="cart-panel">
        <div className="cart-header">
          <div>
            <p className="eyebrow">bharatdrip / bag</p>
            <h2>{view === "cart" ? "Your selection" : view === "checkout" ? "Checkout" : "You're in."}</h2>
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
              <button className="button button-dark button-wide" onClick={() => setView("checkout")}>Continue to checkout <ChevronRight size={17} /></button>
              <p className="secure-note"><Lock size={13} /> Secure checkout · taxes calculated at payment</p>
            </>
          )
        )}

        {view === "checkout" && (
          <form className="checkout-form" onSubmit={submitOrder}>
            <div className="checkout-progress"><span className="active">1&nbsp; Contact</span><span>2&nbsp; Delivery</span><span>3&nbsp; Payment</span></div>
            <label>Email address<input type="email" required placeholder="you@example.com" /></label>
            <div className="form-two"><label>First name<input required placeholder="Aarav" /></label><label>Last name<input required placeholder="Sharma" /></label></div>
            <label>Address<input required placeholder="Street address" /></label>
            <div className="form-two"><label>City<input required placeholder="Mumbai" /></label><label>PIN code<input required pattern="[0-9]{6}" placeholder="400001" /></label></div>
            <label>Country<select defaultValue="India"><option>India</option><option>United States</option><option>United Kingdom</option><option>Singapore</option></select></label>
            <div className="checkout-total"><span>Order total</span><strong>{formatPrice(total)}</strong></div>
            <button className="button button-dark button-wide" type="submit">Place demo order <Lock size={15} /></button>
            <button type="button" className="text-button" onClick={() => setView("cart")}>← Back to bag</button>
            <p className="checkout-disclaimer">This demo checkout is ready for your payment provider. No payment is collected.</p>
          </form>
        )}

        {view === "success" && (
          <div className="success-state"><div className="success-icon"><Check size={28} /></div><p className="eyebrow">Order confirmed</p><h3>Good choice.</h3><p>Your bharatdrip order <strong>{orderNumber}</strong> is on its way to becoming a real outfit. We’ll send a confirmation to your inbox.</p><button className="button button-dark" onClick={closeCart}>Back to the shop <ChevronRight size={16} /></button></div>
        )}
      </aside>
    </div>
  );
}
