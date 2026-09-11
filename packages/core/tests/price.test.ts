import { describe, expect, it } from "vitest";
import { discountPct, formatBRL, parsePrice } from "../src/price";

describe("parsePrice", () => {
  it.each([
    ["R$ 1.234,56", 123456],
    ["1.234,56", 123456],
    ["1,234.56", 123456],
    ["1234.56", 123456],
    ["1234,56", 123456],
    ["R$ 5.499", 549900],
    ["5499", 549900],
    ["12,5", 1250],
    ["12.5", 1250],
    ["0,99", 99],
    ["1.234", 123400], // pt-BR thousands
    ["1,234", 123400],
    ["1.234.567,89", 123456789],
    ["R$ 2.999,90 à vista", 299990],
    ["US$ 49.99", 4999],
  ])("parses %j -> %i", (input, expected) => {
    expect(parsePrice(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "grátis",
    "R$",
    "0",
    "0,00",
    "-50",
    "1.234.567.890,00", // acima do teto de sanidade
    null,
    undefined,
    NaN,
    -5,
    0,
  ])("rejects %j", (input) => {
    expect(parsePrice(input as never)).toBeNull();
  });

  it("parses JSON-LD numeric values", () => {
    expect(parsePrice(2999.9)).toBe(299990);
    expect(parsePrice(49.99)).toBe(4999);
  });
});

describe("formatBRL", () => {
  it("formats cents", () => {
    expect(formatBRL(123456)).toContain("1.234,56");
    expect(formatBRL(99)).toContain("0,99");
  });
});

describe("discountPct", () => {
  it("computes percentage", () => {
    expect(discountPct(10000, 8000)).toBe(20);
    expect(discountPct(9990, 8999)).toBe(10);
  });
  it("returns 0 when no discount", () => {
    expect(discountPct(8000, 8000)).toBe(0);
    expect(discountPct(8000, 9000)).toBe(0);
  });
});
