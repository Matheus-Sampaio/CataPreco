/**
 * Ports — the boundary between pure extraction logic and the outside world.
 *
 * Implementations live in apps (worker): NativeFetchPort, PlaywrightFetchPort,
 * OllamaPort/OpenAiPort. Tests inject fakes. Nothing here imports I/O.
 */

export interface FetchResponse {
  url: string;
  /** Final URL after redirects. */
  finalUrl: string;
  status: number;
  html: string;
  /** True when a real browser engine was used (escalation). */
  usedBrowser: boolean;
}

export interface FetchPort {
  get(url: string): Promise<FetchResponse>;
}

export interface AIPort {
  /** Sends a prompt, returns the raw model text. */
  complete(prompt: string): Promise<string>;
  /** Short id for logs, e.g. "ollama:qwen3:8b". */
  describe(): string;
}

/** Detects bot walls / captcha pages. Pure — used for browser escalation. */
const BOT_WALL_MARKERS = [
  "g-recaptcha",
  "cf-challenge",
  "/cdn-cgi/challenge-platform",
  "are you a robot",
  "Robot Check",
  "verify you are a human",
  "perimeterx",
  "px-captcha",
  "dados da sua solicita", // akamai-ish
  "access denied",
  "suspicious-traffic-frontend", // mercado livre
  "suspicious traffic",
  "datadome", // datadome (shopee, magalu)
  "captcha-delivery",
  "akamai-bot", // akamai bot manager (magalu)
  "não é possível acessar a página",
];

export function looksLikeBotWall(html: string): boolean {
  // A page that already exposes Product JSON-LD is a real product page —
  // interceptors/SDKs mentioning "captcha" cause false positives otherwise.
  if (/"@type"\s*:\s*"Product"/i.test(html)) return false;
  const sample = html.slice(0, 50_000).toLowerCase();
  return BOT_WALL_MARKERS.some((m) => sample.includes(m.toLowerCase()));
}
