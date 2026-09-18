"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowUpRight, Heart, Star } from "@/components/bharatdrip/icons";
import { useCart } from "@/components/bharatdrip/cart-context";
import { formatPrice, type Product } from "@/lib/bharatdrip/products";

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const { addItem } = useCart();
  const [saved, setSaved] = useState(false);
  const [added, setAdded] = useState(false);

  function quickAdd() {
    addItem(product, product.sizes[0]);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  }

  return (
    <article className="product-card" style={{ "--card-index": index } as CSSProperties}>
      <div className="product-image-wrap">
        <Link href={`/bharatdrip/products/${product.slug}`} className="product-image-link" aria-label={`View ${product.name}`}>
          <img src={product.images[0]} alt={product.name} className="product-image" loading={index > 3 ? "lazy" : "eager"} />
          <span className="product-view-label">View piece <ArrowUpRight size={14} /></span>
        </Link>
        {product.badge && <span className="product-badge">{product.badge}</span>}
        <button className={`save-button ${saved ? "saved" : ""}`} onClick={() => setSaved((value) => !value)} aria-label={saved ? `Remove ${product.name} from saved items` : `Save ${product.name}`}><Heart size={17} /></button>
      </div>
      <div className="product-card-info">
        <div className="product-card-heading"><div><Link href={`/bharatdrip/products/${product.slug}`} className="product-name">{product.name}</Link><p className="product-tagline">{product.tagline}</p></div><strong className="product-price">{formatPrice(product.price)}</strong></div>
        <div className="product-card-meta"><span>{product.color}</span>{product.reviewCount > 0 ? <span className="product-rating"><Star size={11} /> {product.rating}</span> : <span className="product-rating">New</span>}</div>
        <button className={`quick-add ${added ? "added" : ""}`} onClick={quickAdd}>{added ? "Added to bag" : "Quick add"}<span>{added ? "✓" : "+"}</span></button>
      </div>
    </article>
  );
}
