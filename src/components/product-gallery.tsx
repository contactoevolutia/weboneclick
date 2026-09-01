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
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [index]);

  return (
    <div className={`oc-gallery${outOfStock ? " oc-gallery-oos" : ""}`}>
      {outOfStock && <span className="oc-pdp-badge-oos">Sin Stock</span>}

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
        <img src={urls[index]} alt={alt} className="oc-gallery-main" />

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
      </div>

      {multi && (
        <div className="oc-gallery-thumbs-row">
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
        </div>
      )}
    </div>
  );
}

function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
