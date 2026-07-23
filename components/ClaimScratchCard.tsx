"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Check, ArrowRight, Sparkles } from "lucide-react";
import { LoadingLink } from "@/components/LoadingLink";
import { revealMonthlyBonus } from "@/app/actions/config";

const REVEAL_THRESHOLD = 0.7; // 70% tergores (beneran, bukan 1-2 usapan) = sisanya auto kebuka
const SAMPLE_STEP = 6; // px, jarak sampel buat ngitung % tergores (murah)
const BRUSH_RADIUS = 9; // px - kecil biar butuh gosokan asli, bukan sekali sentuh langsung kebuka

// Kartu gosok beneran (canvas, digores pakai jari/mouse) buat buka kode
// voucher Target Bulanan - dipakai di TargetBonusCard. Lapisan abu-abu di
// atas kode dihapus sedikit demi sedikit sepanjang jalur yang digores
// (globalCompositeOperation "destination-out"); begitu >=70% kegores,
// sisanya langsung kebuka semua & di-catat ke server (StoreMonthlyBonus.
// claimedAt) lewat revealMonthlyBonus - jadi cukup gores SEKALI, refresh
// berikutnya langsung tampil kode (alreadyRevealed=true). Nerapin ke order
// restok tetap jadi aksi terpisah (tombol "Pakai di Order").
export function ClaimScratchCard({
  code,
  alreadyRevealed = false,
}: {
  code: string;
  alreadyRevealed?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratching = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [revealed, setRevealed] = useState(alreadyRevealed);
  const [copied, setCopied] = useState(false);

  function reveal() {
    setRevealed(true);
    if (!alreadyRevealed) revealMonthlyBonus().catch(() => {});
  }

  useEffect(() => {
    if (alreadyRevealed) return; // sudah kebuka - canvas gores tak dirender
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function paintCover() {
      if (!ctx || !canvas) return;
      ctx.globalCompositeOperation = "source-over";
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, "#52525b");
      grad.addColorStop(1, "#27272a");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(255,255,255,.8)";
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        "✦ Gores buat buka kode ✦",
        canvas.width / 2,
        canvas.height / 2,
      );
    }
    function resize() {
      if (!canvas || !wrap) return;
      const rect = wrap.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      paintCover();
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getPos(e: React.PointerEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function scratchDot(x: number, y: number) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, BRUSH_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  function scratchedRatio(): number {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return 0;
    const { width, height } = canvas;
    if (width === 0 || height === 0) return 0;
    const data = ctx.getImageData(0, 0, width, height).data;
    let cleared = 0;
    let total = 0;
    for (let y = 0; y < height; y += SAMPLE_STEP) {
      for (let x = 0; x < width; x += SAMPLE_STEP) {
        total++;
        if (data[(y * width + x) * 4 + 3] < 20) cleared++;
      }
    }
    return total > 0 ? cleared / total : 0;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (revealed) return;
    scratching.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = getPos(e);
    lastPoint.current = p;
    scratchDot(p.x, p.y);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!scratching.current || revealed) return;
    const p = getPos(e);
    const last = lastPoint.current ?? p;
    // Interpolasi antar titik biar goresannya nyambung pas gerak cepat.
    const dist = Math.hypot(p.x - last.x, p.y - last.y);
    const steps = Math.max(1, Math.ceil(dist / 6));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      scratchDot(last.x + (p.x - last.x) * t, last.y + (p.y - last.y) * t);
    }
    lastPoint.current = p;
    if (scratchedRatio() >= REVEAL_THRESHOLD) reveal();
  }

  function onPointerUp() {
    scratching.current = false;
    lastPoint.current = null;
  }

  function copyCode() {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-neutral-400">
        <Sparkles className="h-3 w-3 shrink-0" /> Kode voucher kamu
      </p>
      <div
        ref={wrapRef}
        className="relative h-16 overflow-hidden rounded-lg bg-neutral-900"
      >
        {/* Kode selalu rata tengah - tombol Salin di-float ke pojok biar
            tidak menggeser posisi kode dari center. */}
        <div className="flex h-full items-center justify-center px-3">
          <span className="text-center font-mono text-xl font-extrabold tracking-wide text-brand">
            {code}
          </span>
        </div>
        <button
          type="button"
          onClick={copyCode}
          className={`absolute right-1.5 top-1.5 flex items-center gap-1 rounded-lg border border-white/20 bg-neutral-900/70 px-2 py-1 text-[11px] font-semibold text-neutral-200 hover:bg-white/10 ${
            revealed ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> Tersalin
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Salin
            </>
          )}
        </button>
        {!revealed && (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        )}
      </div>
      {revealed && (
        <LoadingLink
          href="/order?claimBonus=1"
          loadingText="Menyiapkan keranjang…"
          icon={<ArrowRight className="h-3.5 w-3.5 shrink-0" />}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-brand py-2.5 text-xs font-bold text-neutral-900 hover:opacity-90"
        >
          Pakai di Order
        </LoadingLink>
      )}
    </div>
  );
}
