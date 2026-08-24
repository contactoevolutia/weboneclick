"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bannerImageUrl } from "@/lib/banners";
import { HtmlSlot, type BannerRow } from "@/components/home-banners";

const AUTOPLAY_MS = 6000;

export function HomeHeroCarousel({ banners }: { banners: BannerRow[] }) {
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const count = banners.length;

  const stopAutoplay = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startAutoplay = useCallback(() => {
    stopAutoplay();
    if (count < 2) return;
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, AUTOPLAY_MS);
  }, [count, stopAutoplay]);

  useEffect(() => {
    startAutoplay();
    return stopAutoplay;
  }, [startAutoplay, stopAutoplay]);

  if (count === 0) return null;

  const goTo = (next: number) => {
    setIndex(((next % count) + count) % count);
    startAutoplay();
  };

  if (count === 1) {
    const banner = banners[0];
    const desktop = bannerImageUrl(banner.imagen_desktop);
    const mobile = banner.imagen_mobile ? bannerImageUrl(banner.imagen_mobile) : null;
    return (
      <section className="oc-hero-live">
        <picture>
          {mobile ? <source media="(max-width: 768px)" srcSet={mobile} /> : null}
          <img
            className="oc-hero-live-bg"
            src={desktop}
            alt=""
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        <div className="oc-hero-live-shade" />
        <div className="container oc-hero-live-grid">
          <HtmlSlot html={banner.html} />
        </div>
      </section>
    );
  }

  return (
    <section
      className="oc-hero-live oc-hero-carousel"
      onMouseEnter={stopAutoplay}
      onMouseLeave={startAutoplay}
    >
      {banners.map((banner, i) => {
        const desktop = bannerImageUrl(banner.imagen_desktop);
        const mobile = banner.imagen_mobile ? bannerImageUrl(banner.imagen_mobile) : null;
        const active = i === index;
        return (
          <div
            key={banner.id_banner}
            className={`oc-hero-slide${active ? " is-active" : ""}`}
            aria-hidden={!active}
          >
            <picture>
              {mobile ? <source media="(max-width: 768px)" srcSet={mobile} /> : null}
              <img
                className="oc-hero-live-bg"
                src={desktop}
                alt=""
                fetchPriority={i === 0 ? "high" : "auto"}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
              />
            </picture>
            <div className="oc-hero-live-shade" />
            <div className="container oc-hero-live-grid">
              <HtmlSlot html={banner.html} />
            </div>
          </div>
        );
      })}

      <button
        type="button"
        className="oc-hero-arrow oc-hero-arrow-prev"
        aria-label="Banner anterior"
        onClick={() => goTo(index - 1)}
      >
        <svg width="12" height="20" viewBox="0 0 12 20" fill="none" aria-hidden>
          <path d="M10 2 2 10l8 8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        className="oc-hero-arrow oc-hero-arrow-next"
        aria-label="Banner siguiente"
        onClick={() => goTo(index + 1)}
      >
        <svg width="12" height="20" viewBox="0 0 12 20" fill="none" aria-hidden>
          <path d="M2 2l8 8-8 8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="oc-hero-dots" role="tablist" aria-label="Banners">
        {banners.map((banner, i) => (
          <button
            key={banner.id_banner}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Ir al banner ${i + 1}`}
            className={i === index ? "is-active" : ""}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </section>
  );
}
