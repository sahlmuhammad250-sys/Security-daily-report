import { createClient } from "@supabase/supabase-js";

const PROJECT_ID = "gausloelinoodcppxbpa";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhdXNsb2VsaW5vb2RjcHB4YnBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMjczNDUsImV4cCI6MjEwMDgwMzM0NX0.D5YMln-BAxK69ttbzEmzJFAgs1J3fveBexonGpuz7KY";
const TABLE = "kv_store_60b930c2";
const KV_KEY = "laporan_harian_security";
const LS_KEY = "riwayat_laporan_security";
const MASTER_THL_KEY = "master_thl_names";
const LS_THL_KEY = "master_thl_names_local";

export const DEFAULT_THL_NAMES = [
  "Nur Hayadi", "Sri Tukul", "Wiyanto", "Umar Marjuki", "Ubayah Muhammadi",
  "Asat Thohir", "Aditya Admana", "Sugeng Purwanto", "Fahrizal FH", "Sadewa",
  "Ragil Imam Waluyo", "Sri Maryanto", "Abdul Anggit M", "Kasmi", "Sapriyah",
  "Jumadi", "Erni Widayanti", "Kurhan Muhksinin", "Galuh Hismawah", "Rizal Bagus Sasongko",
  "Abid Dhaifullah", "Ramadhon", "Wahyu Hidayat", "Ihksan Fakih", "Riyan",
  "Nasrul Syarifudin", "Safakur Usman Ridho", "Ervan Bagus Haryadi", "Sigit Budi Santoso",
  "Andika Indra Tyasa", "Joko Wiyono", "Oky Sujatmiko", "Afrizal Rehan Kurnianto", "Dimas Hermawan",
];

const supabase = createClient(`https://${PROJECT_ID}.supabase.co`, ANON_KEY);

export interface RiwayatItem {
  id: string;
  savedAt: string;
  data: any;
}

// ─── localStorage helpers ────────────────────────────────────────────────────
function lsGet(): RiwayatItem[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function lsSet(items: RiwayatItem[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch {}
}

// ─── Supabase helpers ────────────────────────────────────────────────────────
async function sbGet(): Promise<RiwayatItem[]> {
  const { data, error } = await supabase
    .from(TABLE).select("value").eq("key", KV_KEY).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.value as RiwayatItem[]) ?? [];
}
async function sbSet(items: RiwayatItem[]): Promise<void> {
  const { error } = await supabase
    .from(TABLE).upsert({ key: KV_KEY, value: items });
  if (error) throw new Error(error.message);
}

// ─── Merge: gabungkan localStorage + Supabase, dedup by id ──────────────────
function merge(a: RiwayatItem[], b: RiwayatItem[]): RiwayatItem[] {
  const map = new Map<string, RiwayatItem>();
  [...a, ...b].forEach(x => map.set(x.id, x));
  return Array.from(map.values()).sort(
    (x, y) => new Date(x.savedAt).getTime() - new Date(y.savedAt).getTime()
  );
}

// ─── Public API ──────────────────────────────────────────────────────────────
export async function apiGetLaporan(): Promise<RiwayatItem[]> {
  const local = lsGet();
  try {
    const remote = await sbGet();
    const merged = merge(local, remote);
    // Sync balik: simpan hasil merge ke keduanya
    lsSet(merged);
    try { await sbSet(merged); } catch {}
    return merged;
  } catch {
    // Supabase gagal → return localStorage saja
    return local;
  }
}

export async function apiSaveLaporan(item: RiwayatItem): Promise<void> {
  // Selalu simpan ke localStorage dulu (instant, tidak bisa gagal)
  const local = lsGet();
  const updated = [...local, item];
  lsSet(updated);
  // Coba sync ke Supabase di background
  try {
    const remote = await sbGet();
    await sbSet(merge(remote, [item]));
  } catch {
    // Supabase gagal → data sudah aman di localStorage
  }
}

export async function apiDeleteLaporan(id: string): Promise<void> {
  const local = lsGet().filter(x => x.id !== id);
  lsSet(local);
  try {
    const remote = await sbGet();
    await sbSet(remote.filter(x => x.id !== id));
  } catch {}
}

export async function apiDeleteAll(): Promise<void> {
  lsSet([]);
  try { await sbSet([]); } catch {}
}

// ─── Auto-draft (localStorage only, silent) ──────────────────────────────────
export function apiSaveAutoDraft(data: any): void {
  try { localStorage.setItem(AUTO_DRAFT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data })); } catch {}
}
export function apiLoadAutoDraft(): { savedAt: string; data: any } | null {
  try { const raw = localStorage.getItem(AUTO_DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function apiClearAutoDraft(): void {
  try { localStorage.removeItem(AUTO_DRAFT_KEY); } catch {}
}

// ─── Master THL API ──────────────────────────────────────────────────────────
export async function apiGetMasterThl(): Promise<string[]> {
  let localNames: string[] = [];
  try {
    const raw = localStorage.getItem(LS_THL_KEY);
    if (raw) localNames = JSON.parse(raw);
  } catch {}

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("value")
      .eq("key", MASTER_THL_KEY)
      .maybeSingle();

    if (!error && data?.value && Array.isArray(data.value) && data.value.length > 0) {
      const names = data.value as string[];
      try { localStorage.setItem(LS_THL_KEY, JSON.stringify(names)); } catch {}
      return names;
    }
  } catch {}

  if (localNames.length > 0) return localNames;

  // Fallback ke default 34 nama
  try { localStorage.setItem(LS_THL_KEY, JSON.stringify(DEFAULT_THL_NAMES)); } catch {}
  try {
    await supabase.from(TABLE).upsert({ key: MASTER_THL_KEY, value: DEFAULT_THL_NAMES });
  } catch {}
  return DEFAULT_THL_NAMES;
}

export async function apiSaveMasterThl(names: string[]): Promise<void> {
  try { localStorage.setItem(LS_THL_KEY, JSON.stringify(names)); } catch {}
  try {
    await supabase.from(TABLE).upsert({ key: MASTER_THL_KEY, value: names });
  } catch {}
}


// ─── Connection test ─────────────────────────────────────────────────────────
export type ConnectionStatus = {
  ok: boolean;
  latencyMs?: number;
  error?: string;
  tableExists?: boolean;
  rowCount?: number;
};

export async function apiTestConnection(): Promise<ConnectionStatus> {
  const start = Date.now();
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("key")
      .limit(1);
    const latencyMs = Date.now() - start;
    if (error) {
      return { ok: false, latencyMs, error: error.message, tableExists: false };
    }
    // Count rows in kv_store
    const { data: all } = await supabase.from(TABLE).select("key");
    const rowCount = all?.length ?? 0;
    return { ok: true, latencyMs, tableExists: true, rowCount };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}
