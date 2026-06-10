// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { normalizeBrPhone, normalizeJid } from "./phone";

describe("normalizeBrPhone — casos principais", () => {
  it("remove sufixo @s.whatsapp.net", () => {
    expect(normalizeBrPhone("5511999999999@s.whatsapp.net")).toBe("5511999999999");
  });

  it("adiciona prefixo 55 quando faltando (11 dígitos com 9)", () => {
    expect(normalizeBrPhone("11999999999")).toBe("5511999999999");
  });

  it("adiciona 55 + 9º dígito para 10 dígitos sem 55", () => {
    expect(normalizeBrPhone("1188888888")).toBe("5511988888888");
  });

  it("adiciona 9º dígito quando 55 + 10 dígitos", () => {
    expect(normalizeBrPhone("551188888888")).toBe("5511988888888");
  });

  it("mantém número já normalizado", () => {
    expect(normalizeBrPhone("5511999999999")).toBe("5511999999999");
  });
});

describe("normalizeBrPhone — casos extremos", () => {
  it("retorna string vazia para entrada vazia", () => {
    expect(normalizeBrPhone("")).toBe("");
  });

  it("retorna string vazia para null/undefined sem quebrar", () => {
    // @ts-expect-error testando entrada inválida
    expect(normalizeBrPhone(null)).toBe("");
    // @ts-expect-error testando entrada inválida
    expect(normalizeBrPhone(undefined)).toBe("");
  });

  it("remove caracteres não numéricos (parênteses, hífen, espaços, +)", () => {
    expect(normalizeBrPhone("+55 (11) 99999-9999")).toBe("5511999999999");
  });

  it("preserva dígitos para números muito curtos (não toca)", () => {
    expect(normalizeBrPhone("12345")).toBe("12345");
  });

  it("preserva números internacionais não-BR longos sem mutação indevida", () => {
    // 13 dígitos não-BR não dispara nenhuma das regras
    expect(normalizeBrPhone("4915123456789")).toBe("4915123456789");
  });

  it("descarta texto após @ (ex: @g.us, @lid)", () => {
    expect(normalizeBrPhone("5511999999999@lid")).toBe("5511999999999");
  });

  it("é idempotente: aplicar duas vezes não altera o resultado", () => {
    const once = normalizeBrPhone("1188888888");
    expect(normalizeBrPhone(once)).toBe(once);
  });
});

describe("normalizeJid", () => {
  it("preserva JIDs de grupo (@g.us) inalterados", () => {
    const groupJid = "120363023456789@g.us";
    expect(normalizeJid(groupJid)).toBe(groupJid);
  });

  it("acrescenta sufixo @s.whatsapp.net a contatos individuais", () => {
    expect(normalizeJid("11999999999")).toBe("5511999999999@s.whatsapp.net");
  });

  it("normaliza e re-sufixa JID vindo de contato", () => {
    expect(normalizeJid("551188888888@s.whatsapp.net")).toBe("5511988888888@s.whatsapp.net");
  });

  it("retorna string vazia para JID vazio", () => {
    expect(normalizeJid("")).toBe("");
  });

  it("é idempotente para JIDs já normalizados", () => {
    const jid = "5511999999999@s.whatsapp.net";
    expect(normalizeJid(jid)).toBe(jid);
  });
});
