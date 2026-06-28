// Helper WhatsApp: format nomor lokal -> internasional (Indonesia) + bikin link wa.me

export function waNumber(phone?: string | null): string | null {
  if (!phone) return null;
  let n = phone.replace(/\D/g, "");
  if (!n) return null;
  if (n.startsWith("0")) n = "62" + n.slice(1);
  else if (!n.startsWith("62")) n = "62" + n;
  return n;
}

export function waLink(phone: string | null | undefined, message: string) {
  const n = waNumber(phone);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}
