import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// Copying functions for standalone test or importing them if possible
// For now, I'll copy the logic as in the main file to verify it
function normalizeBrPhone(raw: string): string {
  const digits = String(raw).replace(/@.+$/, "").replace(/\D/g, "");
  
  if (digits.length === 10 || digits.length === 11) {
    if (!digits.startsWith("55")) {
      if (digits.length === 10) {
        return "55" + digits.slice(0, 2) + "9" + digits.slice(2);
      }
      return "55" + digits;
    }
  }

  if (/^55\d{10}$/.test(digits)) {
    return digits.slice(0, 4) + "9" + digits.slice(4);
  }
  
  return digits;
}

Deno.test("normalizeBrPhone - variation with @s.whatsapp.net", () => {
  assertEquals(normalizeBrPhone("5511999999999@s.whatsapp.net"), "5511999999999");
});

Deno.test("normalizeBrPhone - variation without 55 and 10 digits (adds 55 and 9)", () => {
  assertEquals(normalizeBrPhone("1188888888"), "5511988888888");
});

Deno.test("normalizeBrPhone - variation without 55 and 11 digits (adds 55)", () => {
  assertEquals(normalizeBrPhone("11988888888"), "5511988888888");
});

Deno.test("normalizeBrPhone - variation with 55 and 10 digits (adds 9)", () => {
  assertEquals(normalizeBrPhone("551188888888"), "5511988888888");
});

Deno.test("normalizeBrPhone - variation with 55 and 11 digits (already correct)", () => {
  assertEquals(normalizeBrPhone("5511988888888"), "5511988888888");
});

Deno.test("normalizeBrPhone - non-BR number should stay same", () => {
  assertEquals(normalizeBrPhone("123456789"), "123456789");
});
