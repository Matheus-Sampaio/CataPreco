import { describe, expect, it } from "vitest";
import { parseProxyList, ProxyPool } from "../src/proxypool";

describe("parseProxyList", () => {
  it("extrai ip:port de texto misto", () => {
    const text = "1.2.3.4:8080\n10.0.0.1:3128 other stuff 5.6.7.8:80 http";
    const list = parseProxyList(text);
    expect(list).toContain("1.2.3.4:8080");
    expect(list).toContain("10.0.0.1:3128");
    expect(list).toContain("5.6.7.8:80");
    expect(list).toHaveLength(3);
  });

  it("rejeita ports/octets inválidos", () => {
    expect(parseProxyList("999.9.9.9:88")).toHaveLength(0);
    expect(parseProxyList("1.2.3.4:99999")).toHaveLength(0);
  });

  it("deduplica", () => {
    expect(parseProxyList("1.1.1.1:80 1.1.1.1:80")).toHaveLength(1);
  });
});

describe("ProxyPool", () => {
  it("round-robin por menos usado", () => {
    const pool = new ProxyPool();
    pool.add(["1.1.1.1:80", "2.2.2.2:80", "3.3.3.3:80"]);
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      seen.add(pool.next(i * 1000)!);
    }
    expect(seen.size).toBe(3); // todos girados
  });

  it("marca falhas e evita mortos", () => {
    const pool = new ProxyPool({ maxFailures: 2 });
    pool.add(["1.1.1.1:80", "2.2.2.2:80"]);
    pool.markResult("1.1.1.1:80", false);
    pool.markResult("1.1.1.1:80", false);
    expect(pool.aliveCount).toBe(1);
    expect(pool.next()).toBe("2.2.2.2:80");
  });

  it("needsRefill quando vazio/estourado", () => {
    const pool = new ProxyPool();
    expect(pool.needsRefill()).toBe(true);
    pool.add(["1.1.1.1:80", "2.2.2.2:80", "3.3.3.3:80"]);
    expect(pool.needsRefill(3)).toBe(false);
  });

  it("respeita tamanho máximo", () => {
    const pool = new ProxyPool({ maxSize: 2 });
    pool.add(["1.1.1.1:80", "2.2.2.2:80", "3.3.3.3:80"]);
    expect(pool.size).toBe(2);
  });
});
