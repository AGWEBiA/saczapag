import { describe, it, expect } from "bun:test";
import { normalizeBrPhone, normalizeJid } from "./phone";

describe("Phone Normalization", () => {
  it("should remove @s.whatsapp.net suffix", () => {
    expect(normalizeBrPhone("5511999999999@s.whatsapp.net")).toBe("5511999999999");
  });

  it("should add 55 prefix if missing (11 digits with 9)", () => {
    expect(normalizeBrPhone("11999999999")).toBe("5511999999999");
  });

  it("should add 55 prefix and 9th digit if missing (10 digits)", () => {
    expect(normalizeBrPhone("1188888888")).toBe("5511988888888");
  });

  it("should add 9th digit to 55+10 digit numbers", () => {
    expect(normalizeBrPhone("551188888888")).toBe("5511988888888");
  });

  it("should handle numbers already correctly formatted", () => {
    expect(normalizeBrPhone("5511999999999")).toBe("5511999999999");
  });

  it("should keep group JIDs unchanged", () => {
    const groupJid = "120363023456789@g.us";
    expect(normalizeJid(groupJid)).toBe(groupJid);
  });

  it("should normalize contact JIDs consistency", () => {
    expect(normalizeJid("11999999999")).toBe("5511999999999@s.whatsapp.net");
    expect(normalizeJid("551188888888@s.whatsapp.net")).toBe("5511988888888@s.whatsapp.net");
  });
});
