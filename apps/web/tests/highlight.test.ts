import { describe, expect, it } from "vitest";
import { highlight, tokenLines } from "../lib/highlight";

const typed = (code: string, lang: "ts" | "bash" | "json") => highlight(code, lang).filter((t) => t.type).map((t) => [t.type, t.text]);

describe("highlight", () => {
  it("colours TypeScript keywords, strings, calls, properties and comments", () => {
    expect(typed('const x = await stackpay.invoices.create({ amount: "25" }); // ok', "ts")).toEqual([
      ["keyword", "const"], ["keyword", "await"], ["function", "create"], ["property", "amount"], ["string", '"25"'], ["comment", "// ok"],
    ]);
  });

  it("colours shell commands, flags and variables without touching URLs", () => {
    expect(typed('curl https://x:3100/api/v1 \\\n  -H "Authorization: Bearer $KEY" -d \'{}\'', "bash")).toEqual([
      ["command", "curl"], ["flag", "-H"], ["string", '"Authorization: Bearer $KEY"'], ["flag", "-d"], ["string", "'{}'"],
    ]);
  });

  it("keeps the text intact and splits it into lines", () => {
    const code = 'a\n  "b": 1\n';
    const lines = tokenLines(highlight(code, "json"));
    expect(lines.map((line) => line.map((t) => t.text).join("")).join("\n")).toBe(code);
    expect(lines).toHaveLength(3);
  });
});
