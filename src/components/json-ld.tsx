import type { JsonLd } from "@/lib/seo/json-ld";

/** Renders one or more JSON-LD scripts. */
export function JsonLdScript({ data }: { data: JsonLd | JsonLd[] }) {
  const blocks = Array.isArray(data) ? data : [data];
  return (
    <>
      {blocks.map((block, i) => (
        <script
          // eslint-disable-next-line react/no-danger
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
    </>
  );
}
