"use client";

export function SuccessPopup({
  show,
  title,
  subtitle,
}: {
  show: boolean;
  title: string;
  subtitle?: string;
}) {
  if (!show) return null;
  return (
    <div className="animate-ugfade fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="animate-ugscalein flex w-72 max-w-full flex-col items-center gap-3 rounded-3xl bg-white p-8 text-center shadow-2xl">
        <svg viewBox="0 0 52 52" className="h-24 w-24">
          {/* lingkaran lime digambar */}
          <circle
            cx="26"
            cy="26"
            r="24"
            fill="none"
            stroke="#d2ec0a"
            strokeWidth="3"
            className="ug-ring origin-center -rotate-90"
          />
          {/* check digambar */}
          <path
            d="M15 27 l7 7 l15 -16"
            fill="none"
            stroke="#171717"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="ug-tick"
          />
        </svg>
        <p className="text-lg font-bold">{title}</p>
        {subtitle && <p className="text-sm text-neutral-500">{subtitle}</p>}
      </div>
    </div>
  );
}
