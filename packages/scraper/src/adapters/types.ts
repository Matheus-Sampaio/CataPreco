import type { ExtractionContext, ExtractionResult } from "../extractors/types";

export interface SiteAdapter {
  /** Short id, e.g. "mercadolivre" */
  id: string;
  /** Human label, e.g. "Mercado Livre" */
  name: string;
  /** Domain suffixes, e.g. ["mercadolivre.com.br", "mercadolivre.com"] */
  domains: string[];
  /** True when the site is known to require a real browser (anti-bot). */
  needsBrowser?: boolean;
  /**
   * Site-tuned extraction. Return null to let the pipeline fall through
   * to the generic extractor. Should be a pure function of the HTML.
   */
  extract(ctx: ExtractionContext): ExtractionResult | null;
}

export interface SearchHit {
  marketplace: string;
  title: string;
  url: string;
  priceCents: number;
  image: string | null;
}
