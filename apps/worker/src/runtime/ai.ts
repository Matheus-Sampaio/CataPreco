import type { AIPort } from "@catapreco/scraper";

export interface AiPortConfig {
  provider: "ollama" | "openai" | "anthropic";
  baseUrl: string;
  apiKey?: string | null;
  model: string;
}

/**
 * OpenAI-compatible chat completions port — works for Ollama (/v1),
 * OpenAI, and any compatible gateway. Designed for small instruct models.
 */
export class OpenAiCompatPort implements AIPort {
  constructor(private config: AiPortConfig) {}

  describe(): string {
    return `${this.config.provider}:${this.config.model}`;
  }

  async complete(prompt: string): Promise<string> {
    const base = this.config.baseUrl.replace(/\/$/, "");
    const isOllama = this.config.provider === "ollama";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          // qwen3 & friends are "thinking" models — /no_think keeps the
          // output budget for the actual JSON answer instead of reasoning
          { role: "user", content: isOllama ? `${prompt}\n\n/no_think` : prompt },
        ],
        temperature: 0,
        stream: false,
        ...(isOllama ? { think: false } : {}),
        max_tokens: 2048,
      }),
      signal: AbortSignal.timeout(300_000), // first call loads the model (cold start ~100s)
    });
    if (!res.ok) throw new Error(`AI HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? "";
  }
}

/** Anthropic Messages API. */
export class AnthropicPort implements AIPort {
  constructor(private config: AiPortConfig) {}

  describe(): string {
    return `anthropic:${this.config.model}`;
  }

  async complete(prompt: string): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`AI HTTP ${res.status}`);
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    return data.content?.map((c) => c.text ?? "").join("") ?? "";
  }
}

export function buildAiPort(config: AiPortConfig): AIPort {
  return config.provider === "anthropic"
    ? new AnthropicPort(config)
    : new OpenAiCompatPort(config);
}
