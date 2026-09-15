"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Heart, Shield, Star, Truck } from "@/components/bharatdrip/icons";
import { ProductCard } from "@/components/bharatdrip/product-card";
import { SiteHeader } from "@/components/bharatdrip/site-header";
import { useCart } from "@/components/bharatdrip/cart-context";
import { formatPrice, products, type Product } from "@/lib/bharatdrip/products";

export function ProductDetail({ product }: { product: Product }) {
  const { addItem } = useCart();
  const [activeImage, setActiveImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState("");
  const [saved, setSaved] = useState(false);
  const [openPanel, setOpenPanel] = useState("Details");
  const [quantity, setQuantity] = useState(1);
  const related = products.filter((item) => item.id !== product.id && (item.category === product.category || item.badge)).slice(0, 4);
  const panels: { title: string; content: string[] }[] = [
    { title: "Details", content: product.details },
    { title: "Care & composition", content: ["Machine wash cold with like colors", "Do not bleach or tumble dry", "Hang dry in shade", "See garment label for full care guidance"] },
    { title: "Shipping & returns", content: ["Complimentary standard shipping over ₹7,500", "Dispatches within 1–2 business days", "Easy returns within 14 days of delivery"] },
  ];

  function addToBag() {
    addItem(product, selectedSize || product.sizes[0], quantity);
  }

  return (
    <main>
      <SiteHeader />
      <div className="detail-breadcrumb"><Link href="/bharatdrip"><ArrowLeft size={14} /> Back to shop</Link><span>/</span><span>{product.category}</span><span>/</span><strong>{product.name}</strong></div>
      <section className="detail-layout">
        <div className="detail-gallery"><div className="detail-main-image"><img src={product.images[activeImage]} alt={`${product.name} view ${activeImage + 1}`} /><span className="detail-image-count">{String(activeImage + 1).padStart(2, "0")} / {String(product.images.length).padStart(2, "0")}</span></div><div className="detail-thumbnails">{product.images.map((src, index) => <button key={src} className={activeImage === index ? "active" : ""} onClick={() => setActiveImage(index)} aria-label={`View image ${index + 1}`}><img src={src} alt="" /></button>)}</div></div>
        <div className="detail-info"><p className="eyebrow">{product.category} / {product.badge ?? "The edit"}</p><div className="detail-title-row"><div><h1>{product.name}</h1><p>{product.tagline}</p></div><button className={`detail-save ${saved ? "saved" : ""}`} onClick={() => setSaved((value) => !value)} aria-label={saved ? "Remove from saved" : "Save product"}><Heart size={20} /></button></div><div className="detail-rating"><span className="stars">{Array.from({ length: 5 }).map((_, index) => <Star key={index} size={14} />)}</span><span>{product.rating} <a href="#reviews">({product.reviewCount} reviews)</a></span></div><div className="detail-price-row"><strong>{formatPrice(product.price)}</strong>{product.compareAt && <span>{formatPrice(product.compareAt)}</span>}<em>inclusive of all taxes</em></div><p className="detail-description">{product.description}</p><div className="detail-option"><div className="option-heading"><span>Color</span><strong>{product.color}</strong></div><div className="color-options">{product.colors.map((color, index) => <button key={color} className={index === 0 ? "active" : ""} style={{ backgroundColor: color }} aria-label={`Select ${product.color}`} />)}</div></div><div className="detail-option"><div className="option-heading"><span>Size</span><Link href="#size-guide">Size guide <ArrowRight size={13} /></Link></div><div className="size-options">{product.sizes.map((size) => <button key={size} className={selectedSize === size ? "active" : ""} onClick={() => setSelectedSize(size)}>{size}</button>)}</div><p className="fit-note"><Check size={13} /> {product.fit}</p></div><div className="detail-buy-row"><div className="quantity-control large"><button onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Decrease quantity">−</button><span>{quantity}</span><button onClick={() => setQuantity((value) => value + 1)} aria-label="Increase quantity">+</button></div><button className="button button-dark add-button" onClick={addToBag}>Add to bag <ArrowRight size={17} /></button></div><div className="detail-assurances"><div><Truck size={18} /><span><strong>Free shipping</strong>Orders over ₹7,500</span></div><div><Shield size={18} /><span><strong>Easy returns</strong>Within 14 days</span></div></div><div className="accordion-list">{panels.map((panel) => { const isOpen = openPanel === panel.title; return <div className={`accordion-item ${isOpen ? "open" : ""}`} key={panel.title}><button onClick={() => setOpenPanel(isOpen ? "" : panel.title)}><span>{panel.title}</span>{isOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button>{isOpen && <div className="accordion-content">{panel.content.map((line) => <p key={line}><span>•</span>{line}</p>)}</div>}</div>; })}</div></div>
      </section>

      <section className="reviews-section" id="reviews"><div className="reviews-summary"><div><p className="eyebrow">The word on the street</p><h2>Loved by<br /><em>the original.</em></h2></div><div className="rating-summary"><strong>{product.rating}</strong><div><span className="stars">{Array.from({ length: 5 }).map((_, index) => <Star key={index} size={15} />)}</span><span>Based on {product.reviewCount} reviews</span></div></div><div className="rating-bars">{[5, 4, 3, 2, 1].map((rating, index) => <div key={rating}><span>{rating}</span><div><i style={{ width: `${[92, 6, 2, 0, 0][index]}%` }} /></div></div>)}</div></div><div className="review-list">{product.reviews.map((review) => <article className="review-card" key={`${review.name}-${review.date}`}><div className="review-card-top"><span className="stars">{Array.from({ length: review.rating }).map((_, index) => <Star key={index} size={13} />)}</span><span>{review.date}</span></div><h3>{review.title}</h3><p>{review.body}</p><footer><strong>{review.name}</strong>{review.verified && <span><Check size={12} /> Verified buyer</span>}</footer></article>)}</div></section>

      <section className="related-section"><div className="section-heading"><div><p className="eyebrow">You might also like</p><h2>Keep the<br /><em>energy going.</em></h2></div><Link href="/bharatdrip#shop" className="underlined-link">View all pieces <ArrowRight size={15} /></Link></div><div className="related-grid">{related.map((item, index) => <ProductCard product={item} key={item.id} index={index} />)}</div></section>
      <footer className="minimal-footer"><Link href="/bharatdrip" className="brand"><span className="brand-mark">bd</span><span>bharatdrip</span></Link><span>Made with intent in India</span><Link href="/bharatdrip">Back to home <ArrowRight size={14} /></Link></footer>
    </main>
  );
}
