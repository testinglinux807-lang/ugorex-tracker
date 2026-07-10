import { Star } from "lucide-react";

// Baris 5 bintang dengan isian pecahan (mis. 4,2 → 4 penuh + 20% bintang
// ke-5) — dua lapis bintang, lapis atas (terisi warna brand) dipotong
// selebar persentase nilai. Murni CSS, aman dirender di server.
export function StarRating({
  value,
  size = "h-4 w-4",
}: {
  value: number; // 0-5
  size?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  const row = (cls: string) => (
    <span className={`flex w-max gap-0.5 ${cls}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} className={size} />
      ))}
    </span>
  );
  return (
    <span className="relative inline-block align-middle">
      {row("text-neutral-300")}
      <span
        className="absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: `${pct}%` }}
      >
        {row("fill-brand text-brand-dark")}
      </span>
    </span>
  );
}
