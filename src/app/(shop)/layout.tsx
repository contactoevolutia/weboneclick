import { AnalyticsProvider } from "@/components/analytics-provider";
import { JsonLdScript } from "@/components/json-ld";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/json-ld";

/** Evita prerender en build (Hostinger no tiene DB accesible en compile). */
export const dynamic = "force-dynamic";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <AnalyticsProvider>
      <JsonLdScript data={[organizationJsonLd(), websiteJsonLd()]} />
      <div id="top" />
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </AnalyticsProvider>
  );
}
