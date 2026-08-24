"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadPublicUrl } from "@/lib/utils";

type Props = {
  images: string[];
  alt: string;
  outOfStock?: boolean;
};

export function ProductGallery({ images, alt, outOfStock }: Props) {
  const urls = images.length
    ? images.map((src) => uploadPublicUrl(src))
    : ["/placeholder-product.svg"];
  const [index, setIndex] = useState(0);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const multi = urls.length > 1;

  const go = useCallback(
    (next: number) => {
      const len = urls.length;
      setIndex(((next % len) + len) % len);
    },
    [urls.length]
  );

  useEffect(() => {
    if (index >= urls.length) setIndex(0);
  }, [index, urls.length]);

  useEffect(() => {
    const el = thumbsRef.current?.querySelector<HTMLElement>(`[data-thumb="${index}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [index]);

  function scrollThumbs(dir: -1 | 1) {
    const box = thumbsRef.current;
    if (!box) return;
    box.scrollBy({ top: dir * 88, behavior: "smooth" });
  }

  return (
    <div className={`oc-gallery${outOfStock ? " oc-gallery-oos" : ""}${multi ? " has-thumbs" : ""}`}>
      {outOfStock && <span className="oc-pdp-badge-oos">Sin Stock</span>}

      {multi && (
        <div className="oc-gallery-thumbs-col">
          <button
            type="button"
            className="oc-gallery-thumb-nav"
            aria-label="Miniaturas anteriores"
            onClick={() => scrollThumbs(-1)}
          >
            <ChevronUp />
          </button>
          <div className="oc-gallery-thumbs" ref={thumbsRef}>
            {urls.map((src, i) => (
              <button
                key={`${src}-${i}`}
                type="button"
                data-thumb={i}
                className={`oc-gallery-thumb${i === index ? " is-active" : ""}`}
                aria-label={`Imagen ${i + 1}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" />
              </button>
            ))}
          </div>
          <button
            type="button"
            className="oc-gallery-thumb-nav"
            aria-label="Miniaturas siguientes"
            onClick={() => scrollThumbs(1)}
          >
            <ChevronDown />
          </button>
        </div>
      )}

      <div className="oc-gallery-stage">
        {multi && (
          <button
            type="button"
            className="oc-gallery-arrow oc-gallery-arrow--prev"
            aria-label="Imagen anterior"
            onClick={() => go(index - 1)}
          >
            <ChevronLeft />
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urls[index]}
          alt={alt}
          className="oc-gallery-main"
          width={800}
          height={800}
          fetchPriority="high"
          decoding="async"
        />

        {multi && (
          <button
            type="button"
            className="oc-gallery-arrow oc-gallery-arrow--next"
            aria-label="Imagen siguiente"
            onClick={() => go(index + 1)}
          >
            <ChevronRight />
          </button>
        )}

        {multi && (
          <div className="oc-gallery-dots" role="tablist" aria-label="Imágenes">
            {urls.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Ir a imagen ${i + 1}`}
                className={`oc-gallery-dot${i === index ? " is-active" : ""}`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChevronUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 14l6-6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 10l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
