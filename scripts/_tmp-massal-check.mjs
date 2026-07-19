// SEMENTARA: verifikasi halaman cetak resi massal — jumlah halaman PDF
// harus = jumlah order PENDING/READY ber-resi, tiap label ~144mm.
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const prisma = new PrismaClient();
const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
if (!admin) throw new Error("Tidak ada user ADMIN");

// Pastikan ada minimal 2 order PENDING/READY ber-resi untuk diuji — kalau
// kurang, pinjam order ber-resi lain TANPA mengubah DB (cukup laporkan).
const eligible = await prisma.request.findMany({
  where: {
    items: { some: {} },
    status: { in: ["PENDING", "READY"] },
    resiNo: { not: null },
  },
  select: { id: true, resiNo: true, status: true },
});
console.log(
  "Order siap cetak massal:",
  eligible.length,
  eligible.map((o) => `${o.resiNo}(${o.status})`).join(", ") || "-",
);

const token = await new SignJWT({
  userId: admin.id,
  role: admin.role,
  name: admin.name,
})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(env.AUTH_SECRET ?? "ugorex-dev-secret"));

const candidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
const browser = candidates.find((p) => existsSync(p));
const PORT = 9224;
const proc = spawn(browser, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}\\ugx-massal-check`,
  "--no-first-run",
  "about:blank",
], { stdio: "ignore" });

for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}
const t = await (
  await fetch(`http://127.0.0.1:${PORT}/json/new?url=about:blank`, {
    method: "PUT",
  })
).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((res, rej) => ((ws.onopen = res), (ws.onerror = rej)));
let seq = 0;
const pending = new Map();
const events = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  } else if (msg.method) events.push(msg.method);
};
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Network.enable");
await send("Page.enable");
await send("Runtime.enable");
await send("Network.setCookie", {
  name: "ugorex_session",
  value: token,
  url: "http://localhost:3000",
});
await send("Page.navigate", { url: "http://localhost:3000/order/resi-massal" });
for (let i = 0; i < 80 && !events.includes("Page.loadEventFired"); i++) {
  await sleep(250);
}
await sleep(2500);

await send("Emulation.setEmulatedMedia", { media: "print" });
await sleep(400);
const { result } = await send("Runtime.evaluate", {
  returnByValue: true,
  expression: `(() => {
    window.dispatchEvent(new Event("beforeprint"));
    const mm = (px) => Math.round((px / 96) * 25.4 * 10) / 10;
    return [...document.querySelectorAll("[data-resi-fit]")].map((el) => {
      const r = el.getBoundingClientRect();
      return { z: el.style.getPropertyValue("--resi-zoom"), w: mm(r.width), h: mm(r.height) };
    });
  })()`,
});
console.log("Label per elemen (mm):", JSON.stringify(result.value));

const pdf = await send("Page.printToPDF", {
  preferCSSPageSize: true,
  printBackground: true,
});
const buf = Buffer.from(pdf.data, "base64");
writeFileSync(`${process.env.TEMP}\\ugx-massal-test.pdf`, buf);
const raw = buf.toString("latin1");
const pages = (raw.match(/\/Type[\s]*\/Page[^s]/g) ?? []).length;
const media = raw.match(/\/MediaBox[\s]*\[[^\]]+\]/)?.[0] ?? "?";
console.log(
  `PDF: ${pages} halaman (harus ${eligible.length}) · ${media} · ${buf.length} bytes`,
);

ws.close();
proc.kill();
await prisma.$disconnect();
