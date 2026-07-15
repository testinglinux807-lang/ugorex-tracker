// Pembatas percobaan login (anti brute-force) — in-memory sliding window.
// Catatan: di serverless, tiap instance punya memori sendiri sehingga batas
// efektifnya bisa lebih longgar dari angka di sini; tetap cukup untuk
// menggagalkan tebak-tebakan password massal karena bcrypt sudah lambat.

const WINDOW_MS = 15 * 60 * 1000; // 15 menit
const MAX_FAILS = 5;

const fails = new Map<string, number[]>();

// Buang entri kadaluarsa supaya map tidak tumbuh tanpa batas.
function prune(key: string, now: number) {
  const list = (fails.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length === 0) fails.delete(key);
  else fails.set(key, list);
  return list;
}

// true = masih boleh mencoba login.
export function loginAllowed(key: string) {
  return prune(key, Date.now()).length < MAX_FAILS;
}

export function recordLoginFail(key: string) {
  const now = Date.now();
  fails.set(key, [...prune(key, now), now]);
}

export function clearLoginFails(key: string) {
  fails.delete(key);
}
