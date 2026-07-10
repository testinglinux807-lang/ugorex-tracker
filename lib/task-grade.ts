// Grade KPI sales dari tugas admin (menu Tugas). Aturannya sederhana dan
// sengaja transparan supaya sales tahu cara nilainya naik:
//   - selesai tepat waktu (atau tanpa tenggat)  = poin penuh
//   - selesai telat (lewat tenggat)             = setengah poin
//   - belum selesai & sudah lewat tenggat       = 0 poin
//   - belum selesai & belum tenggat             = tidak dihitung (masih jalan)
// Tugas "Penting" (priority HIGH) berbobot 2×. Skor akhir diskalakan 0-5
// bintang. Aturan telat memakai pembanding yang sama dengan tampilan
// tenggat merah di halaman Tugas (lewat timestamp dueDate).

export type GradeableTask = {
  status: string; // PENDING | DONE
  priority: string; // HIGH | NORMAL
  dueDate: Date | null;
  completedAt: Date | null;
};

export type TaskGrade = {
  stars: number | null; // 0-5, 1 desimal; null = belum ada tugas yang dinilai
  onTime: number; // selesai tepat waktu
  late: number; // selesai tapi telat
  overdue: number; // belum selesai & lewat tenggat
};

export function taskGrade(
  tasks: GradeableTask[],
  now: Date = new Date(),
): TaskGrade {
  let earned = 0;
  let total = 0;
  let onTime = 0;
  let late = 0;
  let overdue = 0;

  for (const t of tasks) {
    const w = t.priority === "HIGH" ? 2 : 1;
    if (t.status === "DONE") {
      const isLate =
        t.dueDate != null &&
        t.completedAt != null &&
        t.completedAt > t.dueDate;
      total += w;
      earned += isLate ? w * 0.5 : w;
      if (isLate) late += 1;
      else onTime += 1;
    } else if (t.dueDate != null && t.dueDate < now) {
      total += w;
      overdue += 1;
    }
  }

  return {
    stars: total === 0 ? null : Math.round((earned / total) * 5 * 10) / 10,
    onTime,
    late,
    overdue,
  };
}

// Ringkasan satu baris di bawah bintang, mis. "3 tepat waktu · 1 telat".
export function gradeSummary(g: TaskGrade): string {
  const parts: string[] = [];
  if (g.onTime > 0) parts.push(`${g.onTime} tepat waktu`);
  if (g.late > 0) parts.push(`${g.late} telat`);
  if (g.overdue > 0) parts.push(`${g.overdue} lewat tenggat`);
  return parts.length > 0 ? parts.join(" · ") : "Belum ada tugas dinilai";
}
