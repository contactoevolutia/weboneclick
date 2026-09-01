"use client";

import { useState, type ReactNode } from "react";

/** Desplegable del pie de la ficha. Lo usan las tres plantillas: cambia qué
 *  items recibe, no cómo se ve. */
type AccordionItem = { id: string; title: string; content: ReactNode };

export function ProductAccordion({ items }: { items: AccordionItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (items.length === 0) return null;

  return (
    <div className="oc-pdp-accordion">
      {items.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div className="oc-pdp-accordion-item" key={item.id}>
            <button
              type="button"
              className="oc-pdp-accordion-trigger"
              aria-expanded={isOpen}
              onClick={() => setOpenId(isOpen ? null : item.id)}
            >
              <span>{item.title}</span>
              <span
                className={`oc-pdp-accordion-icon${isOpen ? " is-open" : ""}`}
                aria-hidden="true"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 9l6 6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>
            {isOpen && <div className="oc-pdp-accordion-panel">{item.content}</div>}
          </div>
        );
      })}
    </div>
  );
}
