"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChevronDown, Search, Shield, Sparkle, Star, Truck, X } from "@/components/bharatdrip/icons";
import { ProductCard } from "@/components/bharatdrip/product-card";
import { SiteHeader } from "@/components/bharatdrip/site-header";
import { categories, products, type ProductCategory } from "@/lib/bharatdrip/products";

const collectionCards = [
  { label: "Outerwear", number: "01", copy: "Layers with a point of view.", image: products[0].images[1], color: "sand" },
  { label: "Daily uniform", number: "02", copy: "The pieces you'll live in.", image: products[1].images[1], color: "sage" },
  { label: "After dark", number: "03", copy: "Made for the long way home.", image: products[5].images[0], color: "wine" },
];

export function Storefront() {
  const [activeCategory, setActiveCategory] = useState<ProductCategory>("All");
  const [sort, setSort] = useState("featured");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const visibleProducts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const result = products.filter((product) => {
      const inCategory = activeCategory === "All" || product.category === activeCategory;
      const matchesSearch = !query || `${product.name} ${product.tagline} ${product.category}`.toLowerCase().includes(query);
      return inCategory && matchesSearch;
    });
    return [...result].sort((a, b) => {
      if (sort === "price-low") return a.price - b.price;
      if (sort === "price-high") return b.price - a.price;
      if (sort === "rating") return b.rating - a.rating;
      return products.indexOf(a) - products.indexOf(b);
    });
  }, [activeCategory, searchTerm, sort]);

  function openSearch() {
    setSearchOpen(true);
    window.setTimeout(() => document.getElementById("shop")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  }

  return (
    <main>
      <SiteHeader onSearch={openSearch} />
      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow hero-eyebrow"><span className="eyebrow-line" /> Independent streetwear / 2025</p>
          <h1>Dress like<br /><em>you mean it.</em></h1>
          <p className="hero-description">Thoughtful pieces for all the ways you show up. Designed in India, made to move everywhere.</p>
          <div className="hero-actions"><a href="#shop" className="button button-dark">Shop the drop <ArrowUpRight size={16} /></a><a href="#story" className="underlined-link">Why bharatdrip <ArrowRight size={15} /></a></div>
          <div className="hero-footnote"><span>01 — 04</span><span className="hero-footnote-line" /><span>New season / chapter one</span></div>
        </div>
        <div className="hero-visual">
          <div className="hero-image-frame"><img src={products[0].images[0]} alt="Model wearing the Midnight Club Varsity" /><div className="hero-image-shade" /><div className="hero-stamp">BD<br /><span>01</span></div><div className="hero-caption"><span>Featured piece</span><strong>Midnight Club<br />Varsity</strong><Link href={`/products/${products[0].slug}`} aria-label="View Midnight Club Varsity"><ArrowUpRight size={18} /></Link></div></div>
          <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
        </div>
      </section>

      <section className="manifesto-strip"><div className="manifesto-word">EVERYDAY / ORIGINAL / ALWAYS</div><div className="manifesto-small">No rules. Good materials.<br />A little more you.</div><div className="manifesto-star"><Sparkle size={28} /></div></section>

      <section className="collections-section page-section" id="collections">
        <div className="section-heading"><div><p className="eyebrow">01 / Curated edits</p><h2>Find your<br /><em>frequency.</em></h2></div><p className="section-intro">Three ways into the season. Start with the mood, then make it yours.</p></div>
        <div className="collection-grid">{collectionCards.map((collection) => <Link href="#shop" className={`collection-card collection-${collection.color}`} key={collection.number} onClick={() => setActiveCategory(collection.label === "Outerwear" ? "Outerwear" : "All")}><img src={collection.image} alt={collection.label} loading="lazy" /><div className="collection-overlay" /><div className="collection-number">{collection.number}</div><div className="collection-copy"><span>{collection.label}</span><strong>{collection.copy}</strong><span className="collection-arrow"><ArrowUpRight size={17} /></span></div></Link>)}</div>
      </section>

      <section className="shop-section page-section" id="shop">
        <div className="shop-header"><div><p className="eyebrow">02 / The current edit</p><h2>Good <em>things.</em></h2></div><p className="shop-count">{visibleProducts.length.toString().padStart(2, "0")} pieces</p></div>
        <div className={`search-row ${searchOpen ? "visible" : ""}`}><Search size={18} /><input ref={searchRef} value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search the edit — try ‘hoodie’ or ‘denim’" /><button onClick={() => { setSearchTerm(""); setSearchOpen(false); }} aria-label="Clear search"><X size={17} /></button></div>
        <div className="shop-toolbar"><div className="category-tabs" role="tablist" aria-label="Filter products">{categories.map((category) => <button key={category.name} className={activeCategory === category.name ? "active" : ""} onClick={() => setActiveCategory(category.name)}>{category.name}{category.count && <sup>{category.count}</sup>}</button>)}</div><label className="sort-select"><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="rating">Top rated</option></select><ChevronDown size={15} /></label></div>
        {visibleProducts.length > 0 ? <div className="product-grid">{visibleProducts.map((product, index) => <ProductCard product={product} index={index} key={product.id} />)}</div> : <div className="no-results"><span>Nothing found in this edit.</span><button className="underlined-link" onClick={() => { setSearchTerm(""); setActiveCategory("All"); }}>Reset filters <ArrowRight size={15} /></button></div>}
        <div className="shop-bottom-note"><span>Showing the full edit</span><span className="note-line" /><span>More coming soon</span></div>
      </section>

      <section className="story-section" id="story"><div className="story-image"><img src={products[7].images[0]} alt="Streetwear look from the bharatdrip studio" loading="lazy" /><span className="story-image-label">For every version<br />of you</span></div><div className="story-copy"><p className="eyebrow">03 / A little context</p><h2>Not loud.<br /><em>Just clear.</em></h2><p>bharatdrip is an independent label for people in progress. We make clothes that meet you where you are — in the studio, on the street, at the edge of a new idea.</p><p>Less trend. More texture, shape, and the confidence to make it yours.</p><Link href="#shop" className="underlined-link">Meet the collection <ArrowRight size={15} /></Link><div className="story-signature">bd<span>®</span></div></div></section>

      <section className="promise-strip"><div><Truck size={22} /><div><strong>Easy worldwide delivery</strong><span>Free over ₹7,500</span></div></div><div><Shield size={22} /><div><strong>Quality, considered</strong><span>Designed to keep</span></div></div><div><Sparkle size={22} /><div><strong>Small-batch drops</strong><span>Never mass-produced</span></div></div></section>

      <section className="newsletter-section"><div className="newsletter-kicker"><span className="newsletter-star">✳</span><span>04 / Stay in the loop</span></div><div className="newsletter-main"><h2>Keep a little<br /><em>room for more.</em></h2><form className="newsletter-form" onSubmit={(event) => event.preventDefault()}><label htmlFor="newsletter-email">Drop your email for new cuts, studio notes, and the occasional good idea.</label><div><input id="newsletter-email" type="email" required placeholder="Your email address" /><button type="submit" aria-label="Subscribe"><ArrowRight size={18} /></button></div><small>By subscribing, you agree to our terms. No noise, promise.</small></form></div></section>

      <footer className="site-footer"><div className="footer-top"><Link href="/bharatdrip" className="brand footer-brand"><span className="brand-mark">bd</span><span>bharatdrip</span></Link><p>Clothes for the everyday<br />original.</p><div className="footer-socials"><a href="#shop">Instagram</a><a href="#shop">Pinterest</a><a href="#shop">Contact</a></div></div><div className="footer-bottom"><span>© 2025 bharatdrip studio</span><span>Made with intent in India</span><span>Privacy&nbsp;&nbsp; / &nbsp;&nbsp;Terms</span></div></footer>
    </main>
  );
}
