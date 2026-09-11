/**
 * FX rates (USD→BRL etc.) — pure parsers for public quote APIs.
 */

/** Parses awesomeapi "last" endpoint response: {"USDBRL":{"bid":"5.4231",...}} */
export function parseAwesomeRate(json: unknown, pair: string): number | null {
  const data = (json as Record<string, Record<string, string>> | null)?.[pair];
  const bid = Number(data?.bid);
  return Number.isFinite(bid) && bid > 0 ? bid : null;
}

export const AWESOME_USD_BRL_URL = "https://economia.awesomeapi.com.br/json/last/USD-BRL";

/** Convert foreign-currency cents to BRL cents using a rate (BRL per unit). */
export function toBrlCents(foreignCents: number, rate: number): number {
  return Math.round(foreignCents * rate);
}
