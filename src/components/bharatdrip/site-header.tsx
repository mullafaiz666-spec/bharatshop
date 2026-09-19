"use client";

import { useState } from "react";
import Link from "next/link";
import { Bag, Menu, Search, User, X } from "@/components/bharatdrip/icons";
import { useCart } from "@/components/bharatdrip/cart-context";

export function SiteHeader({ onSearch }: { onSearch?: () => void }) {
  const { itemCount, openCart } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      <div className="announcement"><span>Free shipping on orders over ₹7,500</span><span className="announcement-dot">•</span><span>Worldwide delivery</span><span className="announcement-desktop">·</span><span className="announcement-desktop">Designed for the everyday original</span></div>
      <header className="site-header">
        <Link href="/bharatdrip" className="brand" aria-label="bharatdrip home" onClick={closeMobile}>
          <span className="brand-mark">bd</span><span>bharatdrip</span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <Link href="/bharatdrip#shop">Shop</Link><Link href="/bharatdrip#collections">Collections</Link><Link href="/bharatdrip#story">Our story</Link>
        </nav>
        <div className="header-actions">
          <button className="header-action search-action" onClick={onSearch} aria-label="Search"><Search size={19} /><span className="action-label">Search</span></button>
          <button className="header-action account-action" aria-label="Account"><User size={19} /><span className="action-label">Account</span></button>
          <button className="header-action bag-action" onClick={openCart} aria-label={`Shopping bag, ${itemCount} items`}><Bag size={19} /><span className="action-label">Bag</span>{itemCount > 0 && <span className="bag-count">{itemCount}</span>}</button>
          <button className="mobile-menu-button" onClick={() => setMobileOpen((open) => !open)} aria-label={mobileOpen ? "Close menu" : "Open menu"}>{mobileOpen ? <X size={21} /> : <Menu size={21} />}</button>
        </div>
      </header>
      {mobileOpen && <div className="mobile-menu"><Link href="/bharatdrip#shop" onClick={closeMobile}>Shop <span>01</span></Link><Link href="/bharatdrip#collections" onClick={closeMobile}>Collections <span>02</span></Link><Link href="/bharatdrip#story" onClick={closeMobile}>Our story <span>03</span></Link><button onClick={() => { closeMobile(); onSearch?.(); }}><Search size={17} /> Search the shop</button></div>}
    </>
  );
}
