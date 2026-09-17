/**
 * Detecta status de importação de uma página de produto (Remessa Conforme etc.).
 *
 * Marketplaces mistos (Shopee, AliExpress, Mercado Livre) vendem tanto itens
 * com envio nacional quanto internacional — e alguns já embutem o imposto no
 * preço. Esta heurística procura sinais textuais na página e devolve:
 *
 * - imported: true = envio internacional; false = estoque/envio do Brasil;
 *   null = não dá pra saber pela página.
 * - taxIncluded: true = preço já inclui imposto; false = imposto vem no checkout;
 *   null = desconhecido.
 *
 * Puro: HTML string + URL in, dados out.
 */

export interface ImportInfo {
  imported: boolean | null;
  taxIncluded: boolean | null;
}

// Estoque no Brasil / envio nacional (fortes o suficiente pra negar importação)
const DOMESTIC_MARKERS = [
  "envio do brasil",
  "enviado do brasil",
  "estoque no brasil",
  "armazém no brasil",
  "armazem no brasil",
  "ships from brazil",
  "ship from brazil",
  "entrega full", // ML: full = estoque local ML
];

// Item importado / envio internacional
const IMPORTED_MARKERS = [
  "envio internacional",
  "produto internacional",
  "compra internacional",
  "international shipping",
  "ships from china",
  "armazém na china",
  "armazem na china",
  "importado da china",
  "envio da china",
];

// Preço já inclui impostos de importação (Remessa Conforme embutido)
const TAX_INCLUDED_MARKERS = [
  "imposto incluído",
  "impostos incluídos",
  "imposto incluso",
  "remessa conforme",
  "taxas incluídas",
  "tax included",
];

// Imposto cobrado à parte (no checkout / na entrega)
const TAX_AT_CHECKOUT_MARKERS = [
  "impostos calculados no checkout",
  "imposto calculado no checkout",
  "impostos na finalização",
  "taxes calculated at checkout",
  "taxas calculadas no checkout",
];

/** Hosts cuja operação default é importação (quando a página não diz nada). */
function isImportDefaultHost(host: string): boolean {
  return (
    host.includes("aliexpress.") ||
    host.includes("banggood.") ||
    host.includes("gearbest.") ||
    host.includes("ebay.") ||
    // amazon.com (sem .br) é importação; shopee.com (sem .br) idem
    (host.endsWith("amazon.com") && !host.endsWith(".com.br")) ||
    (host.endsWith("shopee.com") && !host.endsWith(".com.br"))
  );
}

export function detectImportInfo(html: string, url: string): ImportInfo {
  const text = html.toLowerCase();

  let imported: boolean | null = null;
  if (DOMESTIC_MARKERS.some((m) => text.includes(m))) {
    imported = false;
  } else if (IMPORTED_MARKERS.some((m) => text.includes(m))) {
    imported = true;
  }

  let taxIncluded: boolean | null = null;
  if (TAX_INCLUDED_MARKERS.some((m) => text.includes(m))) {
    taxIncluded = true;
  } else if (TAX_AT_CHECKOUT_MARKERS.some((m) => text.includes(m))) {
    taxIncluded = false;
  }

  // heurística de host quando a página não diz nada
  if (imported === null) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (isImportDefaultHost(host)) imported = true;
    } catch {
      /* ignora */
    }
  }

  return { imported, taxIncluded };
}
