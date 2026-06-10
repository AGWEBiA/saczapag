// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { cn } from "./utils";

describe("cn (className merge)", () => {
  it("junta classes simples separadas por espaço", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("ignora valores falsy (false, null, undefined, '')", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });

  it("aceita objeto com flags booleanas (clsx)", () => {
    expect(cn("base", { active: true, disabled: false })).toBe("base active");
  });

  it("aceita arrays aninhados", () => {
    expect(cn(["a", ["b", { c: true }]])).toBe("a b c");
  });

  it("resolve conflitos do Tailwind mantendo a última classe (twMerge)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm text-lg")).toBe("text-lg");
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
  });

  it("preserva classes não conflitantes ao mesclar", () => {
    const result = cn("p-2 rounded", "p-4 shadow");
    expect(result).toContain("p-4");
    expect(result).toContain("rounded");
    expect(result).toContain("shadow");
    expect(result).not.toContain("p-2");
  });

  it("retorna string vazia sem argumentos", () => {
    expect(cn()).toBe("");
  });

  it("trata variantes responsivas como classes distintas", () => {
    expect(cn("p-2", "md:p-4")).toBe("p-2 md:p-4");
  });
});
