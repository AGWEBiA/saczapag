/**
 * Normaliza um número de telefone vindo da API do WhatsApp/Evolution.
 * Garante o prefixo 55, remove sufixos @... e trata o 9º dígito.
 */
export function normalizeBrPhone(raw: string): string {
  if (!raw) return "";

  // Remove tudo que não for dígito e o sufixo @... (ex: 5511999999999@s.whatsapp.net)
  let digits = String(raw).split("@")[0].replace(/\D/g, "");

  // Se o número for curto (ex: 1199999999), assume que falta o 55
  if (digits.length === 10 || digits.length === 11) {
    if (!digits.startsWith("55")) {
      digits = "55" + digits;
    }
  }

  // Trata o 9º dígito para números brasileiros (prefixo 55)
  // Regra simplificada: se tem 55 + 10 dígitos (DDD + 8 números), adiciona o 9.
  // Ex: 551188888888 -> 5511988888888
  if (digits.startsWith("55") && digits.length === 12) {
    digits = digits.slice(0, 4) + "9" + digits.slice(4);
  }

  return digits;
}

/**
 * Normaliza o JID (WhatsApp ID) para garantir consistência no banco.
 */
export function normalizeJid(jid: string): string {
  if (!jid) return "";
  if (jid.endsWith("@g.us")) return jid; // Grupos permanecem iguais
  
  const normalized = normalizeBrPhone(jid);
  return normalized + "@s.whatsapp.net";
}
