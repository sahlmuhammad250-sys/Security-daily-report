import { useState, useEffect, useCallback, useRef } from "react";
import { apiGetLaporan, apiSaveLaporan, apiDeleteLaporan, apiDeleteAll, apiSaveAutoDraft, apiLoadAutoDraft, apiClearAutoDraft, apiTestConnection, apiGetMasterThl, apiSaveMasterThl, type ConnectionStatus } from "@/lib/api";
import {
  Shield, Users, Cloud, Activity, ArrowLeftRight,
  AlertTriangle, ChevronRight, Plus, Trash2, Printer,
  CheckCircle2, Clock, Sun, CloudRain, FileText,
  History, Trash, X, ChevronDown, ChevronUp, Eye,
  UserX, UserCheck, Pencil, BookOpen, Save,
  Database, Wifi, WifiOff, RefreshCw, Loader2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Shift = "Pagi" | "Siang" | "Malam";

interface AnggotaItem { id: number; nama: string; noHp: string; }
interface ChiefItem   { id: number; nama: string; jamDatang: string; jamPulang: string; }
interface ShiftRow { shift: Shift; jamMulai: string; jamSelesai: string; anggota: AnggotaItem[]; chiefs: ChiefItem[]; }
// kept for backward compat with old saved data
interface PersonelRow { id: number; shift: Shift; jamMulai: string; jamSelesai: string; anggota: string; noHp: string; chief: string; jamChief: string; }
interface LiburRow    { id: number; nama: string; keterangan: string; }
interface CuacaRow   { id: number; shift: Shift; jamMulai: string; jamSelesai: string; kondisi: string; suhu: string; keterangan: string; }
interface PatroliRow { id: number; pelapor: string; jam: string; jumlahPersonil: string; obyek: string; temuan: string; catatanTemuan: string; penangananPatroli: string; }
interface KaryawanRow{ id: number; nama: string; jamMasuk: string; jamKeluar: string; }
interface TamuRow    { id: number; nama: string; instansi: string; jamMasuk: string; jamKeluar: string; }
interface TemuanRow  { id: number; waktu: string; pelapor: string; kronologis: string; }

interface LaporanData {
  info: Record<string, string>;
  shifts: ShiftRow[]; libur: LiburRow[];
  pimpinanHadir: string; pimpinanNama: string;
  cuaca: CuacaRow[]; patroli: PatroliRow[];
  kbj: KaryawanRow[]; kbw: KaryawanRow[]; mhsw: KaryawanRow[]; thl: KaryawanRow[];
  tamu: TamuRow[]; temuan: TemuanRow[];
  penanganan: string; kendala: string; infoTambahan: string;
}

interface RiwayatItem { id: string; savedAt: string; data: LaporanData; }
interface DraftItem   { id: string; savedAt: string; label: string; data: LaporanData; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _seq = 1;
const uid = () => _seq++;
const shiftTime: Record<Shift, [string, string]> = { Pagi:["07:00","15:00"], Siang:["15:00","23:00"], Malam:["23:00","07:00"] };
const mkAnggota = (): AnggotaItem => ({ id: uid(), nama: "", noHp: "" });
const mkChief   = (): ChiefItem   => ({ id: uid(), nama: "", jamDatang: "", jamPulang: "" });
const mkShift = (s: Shift): ShiftRow => ({ shift: s, jamMulai: shiftTime[s][0], jamSelesai: shiftTime[s][1], anggota: [mkAnggota()], chiefs: [mkChief()] });
const defaultShifts = (): ShiftRow[] => (["Pagi","Siang","Malam"] as Shift[]).map(mkShift);
const mkLibur    = (): LiburRow    => ({ id:uid(), nama:"", keterangan:"" });
const mkCuaca    = (s: Shift = "Pagi"): CuacaRow => ({ id:uid(), shift:s, jamMulai:shiftTime[s][0], jamSelesai:shiftTime[s][1], kondisi:"Tidak Hujan", suhu:"", keterangan:"" });
const mkPatroli  = (): PatroliRow  => ({ id:uid(), pelapor:"", jam:"", jumlahPersonil:"2", obyek:"Area kantor dan lahan", temuan:"Nihil", catatanTemuan:"", penangananPatroli:"" });

const defaultPatroli = (): PatroliRow[] => [
  "08:00","11:00","14:00",
  "16:00","19:00","22:00",
  "00:00","02:00","04:00","06:00",
].map(jam => ({ id: uid(), pelapor: "", jam, jumlahPersonil: "2", obyek: "Area kantor dan lahan", temuan: "Nihil", catatanTemuan: "", penangananPatroli: "" }));
const mkKaryawan = (): KaryawanRow => ({ id:uid(), nama:"", jamMasuk:"", jamKeluar:"" });

const DEFAULT_THL_NAMES = [
  "Nur Hayadi","Sri Tukul","Wiyanto","Umar Marjuki","Ubayah Muhammadi",
  "Asat Thohir","Aditya Admana","Sugeng Purwanto","Fahrizal FH","Sadewa",
  "Ragil Imam Waluyo","Sri Maryanto","Abdul Anggit M","Kasmi","Sapriyah",
  "Jumadi","Erni Widayanti","Kurhan Muhksinin","Galuh Hismawah","Rizal Bagus Sasongko",
  "Abid Dhaifullah","Ramadhon","Wahyu Hidayat","Ihksan Fakih","Riyan",
  "Nasrul Syarifudin","Safakur Usman Ridho","Ervan Bagus Haryadi","Sigit Budi Santoso",
  "Andika Indra Tyasa","Joko Wiyono","Oky Sujatmiko","Afrizal Rehan Kurnianto","Dimas Hermawan",
];
const defaultThl = (): KaryawanRow[] => DEFAULT_THL_NAMES.map(nama => ({ id: uid(), nama, jamMasuk: "07:00", jamKeluar: "15:00" }));
const mkTamu     = (): TamuRow     => ({ id:uid(), nama:"", instansi:"", jamMasuk:"", jamKeluar:"" });
const mkTemuan   = (): TemuanRow   => ({ id:uid(), waktu:"", pelapor:"", kronologis:"" });

const STORAGE_KEY = "riwayat_laporan_security";
const loadRiwayat = (): RiwayatItem[] => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]"); } catch { return []; } };
const saveRiwayat = (items: RiwayatItem[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(items));

const DRAFT_KEY = "draft_laporan_security";
const loadDrafts = (): DraftItem[] => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)||"[]"); } catch { return []; } };
const saveDraftsToStorage = (items: DraftItem[]) => localStorage.setItem(DRAFT_KEY, JSON.stringify(items));

// ─── Form Primitives ──────────────────────────────────────────────────────────

const inp = "w-full border border-[#dde1ea] rounded-md px-3 py-2 text-sm text-[#1a1d23] bg-white placeholder-[#9ca3af] focus:outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/15 transition-all";
function Inp({ value, onChange, placeholder, type="text", cls="" }: { value:string; onChange:(v:string)=>void; placeholder?:string; type?:string; cls?:string }) {
  return <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className={`${inp} ${cls}`} />;
}
function Sel<T extends string>({ value, onChange, options }: { value:T; onChange:(v:T)=>void; options:T[] }) {
  return <select value={value} onChange={e=>onChange(e.target.value as T)} className={`${inp} appearance-none cursor-pointer`}>{options.map(o=><option key={o} value={o}>{o}</option>)}</select>;
}
function Textarea({ value, onChange, placeholder }: { value:string; onChange:(v:string)=>void; placeholder?:string }) {
  return <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={3} className={`${inp} resize-none`} />;
}
function BtnAdd({ onClick, label="Tambah Baris" }: { onClick:()=>void; label?:string }) {
  return <button onClick={onClick} className="mt-3 flex items-center gap-1.5 text-sm text-[#1a56db] hover:text-[#1348c0] font-medium transition-colors"><Plus size={15}/>{label}</button>;
}
function BtnDel({ onClick }: { onClick:()=>void }) {
  return <button onClick={onClick} className="text-[#d1d5db] hover:text-[#e02424] p-1 rounded hover:bg-red-50 transition-colors"><Trash2 size={14}/></button>;
}
function SCard({ title, icon, count, children, accent }: { title:string; icon:React.ReactNode; count?:number; children:React.ReactNode; accent?:string }) {
  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${accent??"border-[#dde1ea]"}`}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#f0f2f7] bg-[#fafbfd]">
        <div className="flex items-center gap-2.5"><span className="text-[#1a56db]">{icon}</span><span className="font-semibold text-[#1a1d23] text-sm">{title}</span></div>
        {count!==undefined && <span className="text-xs font-semibold text-[#6b7280] bg-[#f0f2f7] px-2.5 py-0.5 rounded-full">{count} data</span>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
function Th({ children, w }: { children?:React.ReactNode; w?:string }) {
  return <th className={`text-left text-xs font-semibold text-[#6b7280] uppercase tracking-wider px-3 py-2.5 bg-[#f8f9fb] border-b border-[#edf0f5] whitespace-nowrap ${w??""}`}>{children}</th>;
}
function Td({ children }: { children:React.ReactNode }) { return <td className="px-3 py-2 border-b border-[#f4f6f9] align-middle">{children}</td>; }
function TNo({ n }: { n:number }) { return <Td><span className="text-xs font-semibold text-[#9ca3af] w-6 inline-block text-center">{n}</span></Td>; }
function EmptyRow({ cols, msg }: { cols:number; msg?:string }) { return <tr><td colSpan={cols} className="text-center py-5 text-sm text-[#9ca3af]">{msg??"Belum ada data"}</td></tr>; }

// ─── Form Sections ────────────────────────────────────────────────────────────

// ─── Date range helper ─────────────────────────────────────────────────────────
function formatTgl(iso: string) {
  if (!iso) return "—";
  const [y,m,d] = iso.split("-");
  const bln = ["","Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  return `${d} ${bln[parseInt(m)]} ${y}`;
}
function rangeTgl(mulai: string, selesai: string) {
  if (!mulai && !selesai) return "—";
  if (!selesai || mulai === selesai) return formatTgl(mulai);
  return `${formatTgl(mulai)} – ${formatTgl(selesai)}`;
}

function SeksiInfoUmum({ info, setInfo }: { info:Record<string,string>; setInfo:(k:string,v:string)=>void }) {
  const HARI = ["Senin","Selasa","Rabu","Kamis","Jumat","Sabtu","Minggu"];
  const SHIFT_OPTS = ["Pagi (07.00–15.00)","Siang (15.00–23.00)","Malam (23.00–07.00)","Semua Shift"];
  return (
    <SCard title="Informasi Umum Laporan" icon={<FileText size={16}/>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Lokasi & Client — dikunci, tidak bisa diedit */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[#374151]">Lokasi / Project</label>
          <div className="w-full border border-[#dde1ea] rounded-md px-3 py-2 text-sm text-[#1a1d23] bg-[#f8f9fb] font-semibold">Bayer Juara</div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[#374151]">Nama Client</label>
          <div className="w-full border border-[#dde1ea] rounded-md px-3 py-2 text-sm text-[#1a1d23] bg-[#f8f9fb] font-semibold">PT Bayer Juara Indonesia</div>
        </div>

        {/* Hari & Tanggal — bisa diedit */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[#374151]">Hari</label>
          <Sel value={(info.hari??"Senin") as any} onChange={(v:string)=>setInfo("hari",v)} options={HARI as any}/>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[#374151]">Tanggal</label>
          <Inp type="date" value={info.tanggal??""} onChange={v=>setInfo("tanggal",v)}/>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="text-xs font-semibold text-[#374151]">Laporan Shift</label>
          <Sel value={(info.shift??"Semua Shift") as any} onChange={(v:string)=>setInfo("shift",v)} options={SHIFT_OPTS as any}/>
        </div>
      </div>
    </SCard>
  );
}

function SeksiPersonel({ shifts, setShifts, libur, setLibur, pimpinanHadir, setPimpinanHadir, pimpinanNama, setPimpinanNama }: {
  shifts:ShiftRow[]; setShifts:(r:ShiftRow[])=>void;
  libur:LiburRow[]; setLibur:(r:LiburRow[])=>void;
  pimpinanHadir:string; setPimpinanHadir:(v:string)=>void;
  pimpinanNama:string; setPimpinanNama:(v:string)=>void;
}) {
  const updAnggota = (s: Shift, id: number, k: keyof AnggotaItem, v: string) =>
    setShifts(shifts.map(x => x.shift !== s ? x : { ...x, anggota: x.anggota.map(a => a.id === id ? { ...a, [k]: v } : a) }));
  const addAnggota = (s: Shift) =>
    setShifts(shifts.map(x => x.shift !== s ? x : { ...x, anggota: [...x.anggota, mkAnggota()] }));
  const delAnggota = (s: Shift, id: number) =>
    setShifts(shifts.map(x => x.shift !== s ? x : { ...x, anggota: x.anggota.filter(a => a.id !== id) }));
  const updChief = (s: Shift, id: number, k: keyof ChiefItem, v: string) =>
    setShifts(shifts.map(x => x.shift !== s ? x : { ...x, chiefs: (x.chiefs||[]).map(c => c.id === id ? { ...c, [k]: v } : c) }));
  const addChief = (s: Shift) =>
    setShifts(shifts.map(x => x.shift !== s ? x : { ...x, chiefs: [...(x.chiefs||[]), mkChief()] }));
  const delChief = (s: Shift, id: number) =>
    setShifts(shifts.map(x => x.shift !== s ? x : { ...x, chiefs: (x.chiefs||[]).filter(c => c.id !== id) }));
  const updL = (id:number,k:keyof LiburRow,v:string) => setLibur(libur.map(x=>x.id===id?{...x,[k]:v}:x));

  return (
    <div className="space-y-4">
      <SCard title="A. Anggota Yang Bertugas" icon={<Users size={16}/>}>
        <div className="space-y-4">
          {shifts.map(sr => (
            <div key={sr.shift} className="border border-[#edf0f5] rounded-xl overflow-hidden">
              {/* Header shift */}
              <div className={`flex items-center justify-between px-4 py-2.5 ${sr.shift==="Pagi"?"bg-amber-50 border-b border-amber-100":sr.shift==="Siang"?"bg-blue-50 border-b border-blue-100":"bg-indigo-50 border-b border-indigo-100"}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${sr.shift==="Pagi"?"bg-amber-400 text-white":sr.shift==="Siang"?"bg-blue-500 text-white":"bg-indigo-600 text-white"}`}>{sr.shift}</span>
                  <span className="text-xs text-[#6b7280] font-medium">{sr.jamMulai} – {sr.jamSelesai}</span>
                </div>
                <button onClick={()=>addAnggota(sr.shift)} className="flex items-center gap-1 text-xs font-semibold text-[#1a56db] hover:text-[#1348c0] transition-colors">
                  <Plus size={13}/> Tambah Anggota
                </button>
              </div>

              <div className="p-3 space-y-2">
                {/* Daftar anggota */}
                {sr.anggota.map((a,i) => (
                  <div key={a.id} className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#9ca3af] w-5 text-center shrink-0">{i+1}</span>
                    <div className="flex-1 min-w-0"><Inp value={a.nama} onChange={v=>updAnggota(sr.shift,a.id,"nama",v)} placeholder="Nama anggota"/></div>
                    {i===0&&<div className="w-36 shrink-0"><Inp value={a.noHp} onChange={v=>updAnggota(sr.shift,a.id,"noHp",v)} placeholder="No. HP"/></div>}
                    {sr.anggota.length>1&&<BtnDel onClick={()=>delAnggota(sr.shift,a.id)}/>}
                  </div>
                ))}

                {/* Chief Controller */}
                <div className="mt-3 pt-3 border-t border-[#f0f2f7]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider">Chief Controller</p>
                    <button onClick={()=>addChief(sr.shift)} className="flex items-center gap-1 text-xs font-semibold text-[#1a56db] hover:text-[#1348c0] transition-colors">
                      <Plus size={13}/> Tambah Chief
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(sr.chiefs||[]).map(c=>(
                      <div key={c.id} className="flex items-center gap-2 flex-wrap">
                        <div className="flex-1 min-w-[160px]"><Inp value={c.nama} onChange={v=>updChief(sr.shift,c.id,"nama",v)} placeholder="Nama chief controller"/></div>
                        <div className="flex items-center gap-1.5">
                          <Clock size={13} className="text-[#9ca3af] shrink-0"/>
                          <Inp value={c.jamDatang} onChange={v=>updChief(sr.shift,c.id,"jamDatang",v)} placeholder="Jam datang" cls="w-28"/>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock size={13} className="text-[#9ca3af] shrink-0"/>
                          <Inp value={c.jamPulang} onChange={v=>updChief(sr.shift,c.id,"jamPulang",v)} placeholder="Jam pulang" cls="w-28"/>
                        </div>
                        {(sr.chiefs||[]).length>1&&<BtnDel onClick={()=>delChief(sr.shift,c.id)}/>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SCard>

      <SCard title="Anggota Yang Libur / Tidak Hadir" icon={<UserX size={16}/>} count={libur.length} accent="border-[#fde8e8]">
        <div className="overflow-x-auto rounded-lg border border-[#edf0f5]">
          <table className="w-full text-sm"><thead><tr>
            <Th w="w-8">No</Th><Th>Nama Anggota</Th><Th>Keterangan</Th><Th w="w-10"></Th>
          </tr></thead><tbody>
            {libur.map((r,i)=>(
              <tr key={r.id} className="hover:bg-[#fafbfd] transition-colors">
                <TNo n={i+1}/>
                <Td><Inp value={r.nama} onChange={v=>updL(r.id,"nama",v)} placeholder="Nama anggota"/></Td>
                <Td><Inp value={r.keterangan} onChange={v=>updL(r.id,"keterangan",v)} placeholder="Sakit / Izin / Libur"/></Td>
                <Td><BtnDel onClick={()=>setLibur(libur.filter(x=>x.id!==r.id))}/></Td>
              </tr>
            ))}
            {libur.length===0&&<EmptyRow cols={4} msg="Tidak ada anggota yang libur"/>}
          </tbody></table>
        </div>
        <BtnAdd onClick={()=>setLibur([...libur,mkLibur()])} label="Tambah Anggota Libur"/>
      </SCard>

      <SCard title="Pimpinan Bayer Juara" icon={<UserCheck size={16}/>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5"><label className="text-xs font-semibold text-[#374151]">Kehadiran Pimpinan</label>
            <Sel value={pimpinanHadir as any} onChange={setPimpinanHadir} options={["Tidak ada","Hadir"] as any}/>
          </div>
          {pimpinanHadir==="Hadir"&&<div className="flex flex-col gap-1.5"><label className="text-xs font-semibold text-[#374151]">Nama Pimpinan</label><Inp value={pimpinanNama} onChange={setPimpinanNama} placeholder="Nama pimpinan"/></div>}
        </div>
      </SCard>
    </div>
  );
}

function SeksiCuaca({ rows, setRows }: { rows:CuacaRow[]; setRows:(r:CuacaRow[])=>void }) {
  const upd = (id:number,k:keyof CuacaRow,v:string) => setRows(rows.map(x=>x.id===id?{...x,[k]:v}:x));
  return (
    <SCard title="B. Kondisi Cuaca" icon={<Cloud size={16}/>} count={rows.length}>
      <div className="overflow-x-auto rounded-lg border border-[#edf0f5]">
        <table className="w-full text-sm"><thead><tr>
          <Th w="w-8">No</Th><Th w="w-28">Shift</Th><Th w="w-24">Jam Mulai</Th><Th w="w-24">Jam Selesai</Th>
          <Th w="w-40">Kondisi</Th><Th w="w-28">Suhu (°C)</Th><Th>Keterangan</Th><Th w="w-10"></Th>
        </tr></thead><tbody>
          {rows.map((r,i)=>(
            <tr key={r.id} className="hover:bg-[#fafbfd] transition-colors">
              <TNo n={i+1}/>
              <Td><Sel value={r.shift} onChange={v=>{upd(r.id,"shift",v);upd(r.id,"jamMulai",shiftTime[v][0]);upd(r.id,"jamSelesai",shiftTime[v][1]);}} options={["Pagi","Siang","Malam"]}/></Td>
              <Td><Inp value={r.jamMulai} onChange={v=>upd(r.id,"jamMulai",v)} placeholder="07:00"/></Td>
              <Td><Inp value={r.jamSelesai} onChange={v=>upd(r.id,"jamSelesai",v)} placeholder="15:00"/></Td>
              <Td><div className="flex items-center gap-2">{r.kondisi==="Tidak Hujan"?<Sun size={14} className="text-yellow-500 shrink-0"/>:<CloudRain size={14} className="text-blue-400 shrink-0"/>}<Sel value={r.kondisi as any} onChange={v=>upd(r.id,"kondisi",v)} options={["Tidak Hujan","Hujan Ringan","Hujan Sedang","Hujan Lebat"] as any}/></div></Td>
              <Td><Inp value={r.suhu} onChange={v=>upd(r.id,"suhu",v)} placeholder="35"/></Td>
              <Td><Inp value={r.keterangan} onChange={v=>upd(r.id,"keterangan",v)} placeholder="Cuaca cerah..."/></Td>
              <Td><BtnDel onClick={()=>setRows(rows.filter(x=>x.id!==r.id))}/></Td>
            </tr>
          ))}
          {rows.length===0&&<EmptyRow cols={8}/>}
        </tbody></table>
      </div>
    </SCard>
  );
}

function SeksiAktivitas({ rows, setRows }: { rows:PatroliRow[]; setRows:(r:PatroliRow[])=>void }) {
  const upd = (id:number,k:keyof PatroliRow,v:string) => setRows(rows.map(x=>x.id===id?{...x,[k]:v}:x));
  return (
    <SCard title="C. Catatan Patroli" icon={<Activity size={16}/>} count={rows.length}>
      <div className="space-y-3">
        {rows.map((r,i)=>(
          <div key={r.id} className={`rounded-xl border overflow-hidden ${r.temuan==="Ada temuan" ? "border-amber-300" : "border-[#edf0f5]"}`}>
            {/* Baris utama */}
            <div className="grid grid-cols-[28px_1fr_90px_1fr_150px_36px] gap-0 items-stretch text-sm">
              {/* No */}
              <div className="flex items-center justify-center bg-[#f8f9fb] border-r border-[#edf0f5] text-xs font-semibold text-[#9ca3af]">{i+1}</div>
              {/* Pelapor */}
              <div className="border-r border-[#edf0f5] px-3 py-2 flex flex-col gap-0.5">
                <span className="text-[10px] text-[#9ca3af] font-semibold uppercase tracking-wide">Pelapor</span>
                <Inp value={r.pelapor} onChange={v=>upd(r.id,"pelapor",v)} placeholder="Nama pelapor"/>
              </div>
              {/* Jam */}
              <div className="border-r border-[#edf0f5] px-3 py-2 flex flex-col gap-0.5">
                <span className="text-[10px] text-[#9ca3af] font-semibold uppercase tracking-wide">Jam Patroli</span>
                <Inp value={r.jam} onChange={v=>upd(r.id,"jam",v)} placeholder="00:00"/>
              </div>
              {/* Obyek */}
              <div className="border-r border-[#edf0f5] px-3 py-2 flex flex-col gap-0.5">
                <span className="text-[10px] text-[#9ca3af] font-semibold uppercase tracking-wide">Obyek Patroli</span>
                <Inp value={r.obyek} onChange={v=>upd(r.id,"obyek",v)} placeholder="Area kantor dan lahan"/>
              </div>
              {/* Status Temuan */}
              <div className="border-r border-[#edf0f5] px-3 py-2 flex flex-col gap-0.5">
                <span className="text-[10px] text-[#9ca3af] font-semibold uppercase tracking-wide">Status Temuan</span>
                <div className="flex items-center gap-1.5">
                  <Sel value={r.temuan as any} onChange={v=>upd(r.id,"temuan",v)} options={["Nihil","Ada temuan"] as any}/>
                  {r.temuan==="Nihil"
                    ? <CheckCircle2 size={15} className="text-green-500 shrink-0"/>
                    : <AlertTriangle size={15} className="text-amber-500 shrink-0"/>
                  }
                </div>
              </div>
              {/* Hapus */}
              <div className="flex items-center justify-center bg-[#f8f9fb]">
                <BtnDel onClick={()=>setRows(rows.filter(x=>x.id!==r.id))}/>
              </div>
            </div>

            {/* Panel detail temuan — muncul hanya jika "Ada temuan" */}
            {r.temuan==="Ada temuan" && (
              <div className="bg-amber-50 border-t border-amber-200 px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                    <AlertTriangle size={12}/> Catatan Barang / Kejadian Temuan
                  </label>
                  <Textarea value={r.catatanTemuan} onChange={v=>upd(r.id,"catatanTemuan",v)} placeholder="Deskripsikan apa yang ditemukan saat patroli..."/>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                    <CheckCircle2 size={12}/> Penanganan yang Dilakukan
                  </label>
                  <Textarea value={r.penangananPatroli} onChange={v=>upd(r.id,"penangananPatroli",v)} placeholder="Langkah penanganan yang sudah diambil..."/>
                </div>
              </div>
            )}
          </div>
        ))}

        {rows.length===0 && (
          <div className="rounded-xl border border-dashed border-[#dde1ea] text-center py-8 text-sm text-[#9ca3af]">
            Belum ada data patroli
          </div>
        )}
      </div>
      <BtnAdd onClick={()=>{
        const JAM_SEQ = ["08:00","11:00","14:00","16:00","19:00","22:00","00:00","02:00","04:00","06:00"];
        const jam = JAM_SEQ[rows.length % JAM_SEQ.length];
        setRows([...rows,{...mkPatroli(),jam}]);
      }}/>
    </SCard>
  );
}

function KaryawanTable({ title, rows, setRows, onResetDefault }: { title:string; rows:KaryawanRow[]; setRows:(r:KaryawanRow[])=>void; onResetDefault?:()=>void }) {
  const upd = (id:number,k:keyof KaryawanRow,v:string) => setRows(rows.map(x=>x.id===id?{...x,[k]:v}:x));
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-[#374151]">{title} <span className="text-xs font-normal text-[#9ca3af]">({rows.length} orang)</span></p>
        {onResetDefault && (
          <button
            onClick={onResetDefault}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#1a56db] hover:text-[#1348c0] bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md transition-colors"
            title="Muat 34 Nama THL Standar"
          >
            <RefreshCw size={13}/> Muat 34 Nama THL Default
          </button>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-[#edf0f5]">
        <table className="w-full text-sm"><thead><tr>
          <Th w="w-8">No</Th><Th>Nama</Th><Th w="w-36">Jam Masuk</Th><Th w="w-36">Jam Keluar</Th><Th w="w-10"></Th>
        </tr></thead><tbody>
          {rows.map((r,i)=>(
            <tr key={r.id} className="hover:bg-[#fafbfd] transition-colors">
              <TNo n={i+1}/>
              <Td><Inp value={r.nama} onChange={v=>upd(r.id,"nama",v)} placeholder="Nama"/></Td>
              <Td><div className="flex items-center gap-1.5"><Clock size={13} className="text-[#9ca3af] shrink-0"/><Inp value={r.jamMasuk} onChange={v=>upd(r.id,"jamMasuk",v)} placeholder="07:00"/></div></Td>
              <Td><div className="flex items-center gap-1.5"><Clock size={13} className="text-[#9ca3af] shrink-0"/><Inp value={r.jamKeluar} onChange={v=>upd(r.id,"jamKeluar",v)} placeholder="15:00"/></div></Td>
              <Td><BtnDel onClick={()=>setRows(rows.filter(x=>x.id!==r.id))}/></Td>
            </tr>
          ))}
          {rows.length===0&&(
            <tr>
              <td colSpan={5} className="text-center py-6">
                <p className="text-sm text-[#9ca3af] mb-2">Belum ada data</p>
                {onResetDefault && (
                  <button
                    onClick={onResetDefault}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#1a56db] hover:bg-[#1348c0] px-3 py-1.5 rounded-lg shadow-sm transition-colors"
                  >
                    <RefreshCw size={13}/> Muat 34 Nama THL Default
                  </button>
                )}
              </td>
            </tr>
          )}
        </tbody></table>
      </div>
      <div className="flex items-center justify-between mt-3">
        <BtnAdd onClick={()=>setRows([...rows,mkKaryawan()])} label="Tambah Orang"/>
        {onResetDefault && rows.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm("Apakah Anda yakin ingin menghapus semua baris THL?")) {
                setRows([]);
              }
            }}
            className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
          >
            Kosongkan Daftar THL
          </button>
        )}
      </div>
    </div>
  );
}

function SeksiKelMasuk({ kbj,setKbj,kbw,setKbw,mhsw,setMhsw,thl,setThl,tamu,setTamu }: {
  kbj:KaryawanRow[];setKbj:(r:KaryawanRow[])=>void;
  kbw:KaryawanRow[];setKbw:(r:KaryawanRow[])=>void;
  mhsw:KaryawanRow[];setMhsw:(r:KaryawanRow[])=>void;
  thl:KaryawanRow[];setThl:(r:KaryawanRow[])=>void;
  tamu:TamuRow[];setTamu:(r:TamuRow[])=>void;
}) {
  const updT = (id:number,k:keyof TamuRow,v:string) => setTamu(tamu.map(x=>x.id===id?{...x,[k]:v}:x));
  const total = kbj.length+kbw.length+mhsw.length+thl.length+tamu.length;
  return (
    <SCard title="D. Aktivitas Keluar Masuk" icon={<ArrowLeftRight size={16}/>} count={total}>
      <div className="space-y-6">
        <KaryawanTable title="Karyawan Bayer Juara" rows={kbj} setRows={setKbj}/>
        <div className="border-t border-[#f0f2f7]"/>
        <KaryawanTable title="Karyawan BMW (Bumawa)" rows={kbw} setRows={setKbw}/>
        <div className="border-t border-[#f0f2f7]"/>
        <KaryawanTable title="Mahasiswa Magang" rows={mhsw} setRows={setMhsw}/>
        <div className="border-t border-[#f0f2f7]"/>
        <KaryawanTable title="Pekerja THL" rows={thl} setRows={setThl} onResetDefault={() => setThl(defaultThl())}/>
        <div className="border-t border-[#f0f2f7]"/>
        <div>
          <p className="text-sm font-semibold text-[#374151] mb-2">Tamu Bayer Juara <span className="text-xs font-normal text-[#9ca3af]">({tamu.length} tamu)</span></p>
          <div className="overflow-x-auto rounded-lg border border-[#edf0f5]">
            <table className="w-full text-sm"><thead><tr>
              <Th w="w-8">No</Th><Th>Nama Tamu</Th><Th>Instansi / Keperluan</Th><Th w="w-32">Jam Masuk</Th><Th w="w-32">Jam Keluar</Th><Th w="w-10"></Th>
            </tr></thead><tbody>
              {tamu.map((r,i)=>(
                <tr key={r.id} className="hover:bg-[#fafbfd] transition-colors">
                  <TNo n={i+1}/>
                  <Td><Inp value={r.nama} onChange={v=>updT(r.id,"nama",v)} placeholder="Nama tamu"/></Td>
                  <Td><Inp value={r.instansi} onChange={v=>updT(r.id,"instansi",v)} placeholder="Instansi / keperluan"/></Td>
                  <Td><Inp value={r.jamMasuk} onChange={v=>updT(r.id,"jamMasuk",v)} placeholder="07:00"/></Td>
                  <Td><Inp value={r.jamKeluar} onChange={v=>updT(r.id,"jamKeluar",v)} placeholder="15:00"/></Td>
                  <Td><BtnDel onClick={()=>setTamu(tamu.filter(x=>x.id!==r.id))}/></Td>
                </tr>
              ))}
              {tamu.length===0&&<EmptyRow cols={6} msg="Tidak ada tamu"/>}
            </tbody></table>
          </div>
          <BtnAdd onClick={()=>setTamu([...tamu,mkTamu()])} label="Tambah Tamu"/>
        </div>
      </div>
    </SCard>
  );
}

function SeksiTemuan({ rows,setRows,penanganan,setPenanganan,kendala,setKendala,infoTmb,setInfoTmb }: {
  rows:TemuanRow[];setRows:(r:TemuanRow[])=>void;
  penanganan:string;setPenanganan:(v:string)=>void;
  kendala:string;setKendala:(v:string)=>void;
  infoTmb:string;setInfoTmb:(v:string)=>void;
}) {
  const upd = (id:number,k:keyof TemuanRow,v:string) => setRows(rows.map(x=>x.id===id?{...x,[k]:v}:x));
  return (
    <div className="space-y-4">
      <SCard title="E. Temuan dan Kejadian" icon={<AlertTriangle size={16}/>} count={rows.length}>
        <div className="overflow-x-auto rounded-lg border border-[#edf0f5]">
          <table className="w-full text-sm"><thead><tr>
            <Th w="w-8">No</Th><Th w="w-28">Waktu</Th><Th>Pelapor</Th><Th>Kronologis</Th><Th w="w-10"></Th>
          </tr></thead><tbody>
            {rows.map((r,i)=>(
              <tr key={r.id} className="hover:bg-[#fafbfd] transition-colors">
                <TNo n={i+1}/>
                <Td><Inp value={r.waktu} onChange={v=>upd(r.id,"waktu",v)} placeholder="HH:MM"/></Td>
                <Td><Inp value={r.pelapor} onChange={v=>upd(r.id,"pelapor",v)} placeholder="Nama pelapor"/></Td>
                <Td><Inp value={r.kronologis} onChange={v=>upd(r.id,"kronologis",v)} placeholder="Uraian kejadian..."/></Td>
                <Td><BtnDel onClick={()=>setRows(rows.filter(x=>x.id!==r.id))}/></Td>
              </tr>
            ))}
            {rows.length===0&&<tr><td colSpan={5} className="text-center py-6"><div className="flex flex-col items-center gap-1.5 text-[#9ca3af]"><CheckCircle2 size={20} className="text-green-400"/><span className="text-sm">Tidak ada temuan — kondisi aman</span></div></td></tr>}
          </tbody></table>
        </div>
        <BtnAdd onClick={()=>setRows([...rows,mkTemuan()])} label="Tambah Kejadian"/>
      </SCard>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[{label:"F. Penanganan",val:penanganan,set:setPenanganan,ph:"Tindakan penanganan..."},{label:"G. Kendala",val:kendala,set:setKendala,ph:"Kendala yang dihadapi..."},{label:"H. Informasi Tambahan",val:infoTmb,set:setInfoTmb,ph:"Informasi lainnya..."}].map(f=>(
          <SCard key={f.label} title={f.label} icon={<FileText size={16}/>}>
            <Textarea value={f.val} onChange={f.set} placeholder={f.ph}/>
            {!f.val&&<p className="text-xs text-[#9ca3af] mt-2">Kosongkan jika tidak ada</p>}
          </SCard>
        ))}
      </div>
    </div>
  );
}

// ─── Preview Modal — tampilan persis format laporan resmi ─────────────────────

function PreviewModal({ data, onClose, onCetak }: { data:LaporanData; onClose:()=>void; onCetak:()=>void }) {
  const { info, shifts, libur, pimpinanHadir, pimpinanNama, cuaca, patroli, kbj, kbw, mhsw, thl, tamu, temuan, penanganan, kendala, infoTambahan } = data;

  // Tabel resmi ala PDF
  const DocTable = ({ head, rows, striped=true }: { head:string[]; rows:(string|number)[][]; striped?:boolean }) => (
    <table className="w-full border-collapse text-xs mb-4" style={{borderSpacing:0}}>
      <thead>
        <tr>{head.map((h,i)=><th key={i} className="border border-[#c8c8c8] bg-[#dbeafe] px-3 py-2 text-left font-bold text-[#222] text-[11px]">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.length===0
          ? <tr><td colSpan={head.length} className="border border-[#c8c8c8] px-3 py-3 text-center text-[#999] italic">Tidak ada data</td></tr>
          : rows.map((row,i)=>(
            <tr key={i} className={striped&&i%2!==0?"bg-[#f9f9f9]":""}>
              {row.map((cell,j)=><td key={j} className="border border-[#c8c8c8] px-3 py-1.5 text-[#333] align-top">{cell||"—"}</td>)}
            </tr>
          ))
        }
      </tbody>
    </table>
  );

  const SubHead = ({ label }: { label:string }) => (
    <div className="bg-[#1a3a6b] text-white font-bold text-xs px-3 py-1.5 mb-0 tracking-wide">{label}</div>
  );

  const SecHeader = ({ letter, title }: { letter:string; title:string }) => (
    <div className="flex items-baseline gap-2 mb-2 mt-5">
      <span className="text-[15px] font-bold text-[#1a56db]">{letter}.</span>
      <span className="text-[15px] font-bold text-[#1a56db]">{title}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl my-4" onClick={e=>e.stopPropagation()}>

        {/* Modal toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#edf0f5] bg-[#fafbfd] rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#1a56db] flex items-center justify-center"><Eye size={14} className="text-white"/></div>
            <div><p className="font-bold text-[#1a1d23] text-sm leading-tight">Pratinjau Laporan</p><p className="text-[11px] text-[#9ca3af]">Periksa sebelum mencetak</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm text-[#6b7280] border border-[#dde1ea] px-3 py-1.5 rounded-lg hover:bg-[#f4f6f9] transition-all font-medium">← Kembali Edit</button>
            <button onClick={onCetak} className="flex items-center gap-1.5 text-sm font-bold bg-[#1a56db] text-white px-4 py-1.5 rounded-lg hover:bg-[#1348c0] transition-all shadow">
              <Printer size={14}/> Cetak & Simpan
            </button>
          </div>
        </div>

        {/* Dokumen */}
        <div className="p-8 bg-white" style={{fontFamily:"Arial, sans-serif"}}>

          {/* Kop */}
          <div className="text-center mb-1">
            <p className="text-[10px] text-[#888] uppercase tracking-widest font-semibold">LAPORAN HARIAN SECURITY – BMW KLATEN</p>
            <h1 className="text-[26px] font-black text-[#1a1d23] leading-tight mt-0.5">LAPORAN HARIAN SECURITY</h1>
            <p className="text-[13px] text-[#555] mt-0.5">BMW Klaten — Client: {info.lokasi||"Bayer Juara"}</p>
          </div>

          {/* Banner hijau */}
          <div className="bg-[#2d6a2d] text-white text-center font-bold text-[13px] py-2.5 mt-3 mb-4 tracking-wide">
            LAPORAN HARIAN SECURITY
          </div>

          {/* Informasi Umum */}
          <div className="mb-4">
            <p className="text-[13px] font-bold text-[#c47a00] mb-1">Informasi Umum</p>
            <table className="text-[12px] text-[#222]">
              <tbody>
                <tr><td className="pr-4 py-0.5 font-bold w-36">Lokasi/Project</td><td className="pr-2">:</td><td className="font-bold">Bayer Juara</td></tr>
                <tr><td className="pr-4 py-0.5 font-bold">Nama Client</td><td className="pr-2">:</td><td className="font-bold">PT Bayer Juara Indonesia</td></tr>
                <tr><td className="pr-4 py-0.5 font-bold">Hari/Tanggal</td><td className="pr-2">:</td><td className="font-bold">{info.hari}, {formatTgl(info.tanggal||"")}</td></tr>
                {info.shift&&<tr><td className="pr-4 py-0.5 font-bold">Laporan Shift</td><td className="pr-2">:</td><td>{info.shift}</td></tr>}
                {info.salam&&<tr><td className="pr-4 py-0.5 font-bold">Salam</td><td className="pr-2">:</td><td className="italic text-[#555]">{info.salam}</td></tr>}
              </tbody>
            </table>
          </div>

          {/* A. Personel */}
          <SecHeader letter="A" title="Personel"/>
          <table className="w-full border-collapse text-xs mb-3">
            <thead><tr>
              <th className="border border-[#c8c8c8] bg-[#dbeafe] px-3 py-2 font-bold text-[11px] text-center w-16">Shift</th>
              <th className="border border-[#c8c8c8] bg-[#dbeafe] px-3 py-2 font-bold text-[11px] text-center w-28">Jam</th>
              <th className="border border-[#c8c8c8] bg-[#dbeafe] px-3 py-2 font-bold text-[11px] text-left">Anggota Bertugas</th>
              <th className="border border-[#c8c8c8] bg-[#dbeafe] px-3 py-2 font-bold text-[11px] text-left">Chief Controller</th>
            </tr></thead>
            <tbody>
              {(shifts||[]).map(sr=>(
                <tr key={sr.shift}>
                  <td className="border border-[#c8c8c8] px-3 py-2 font-bold text-[#333] text-center align-middle text-[11px]">{sr.shift}</td>
                  <td className="border border-[#c8c8c8] px-3 py-2 text-[#333] text-center align-middle text-[11px]">{sr.jamMulai} - {sr.jamSelesai}</td>
                  <td className="border border-[#c8c8c8] px-3 py-0 text-[#333] align-top">
                    {(sr.anggota||[]).map((a,i,arr)=><div key={i} className={`py-1.5 text-[11px] ${i<arr.length-1?"border-b border-[#e0e0e0]":""}`}>{a.nama||"—"}{a.noHp&&<span className="text-[#777]"> (Hp {a.noHp})</span>}</div>)}
                  </td>
                  <td className="border border-[#c8c8c8] px-3 py-0 text-[#333] align-top">
                    {(sr.chiefs||[]).map((c,i,arr)=><div key={c.id} className={`py-1.5 text-[11px] ${i<arr.length-1?"border-b border-[#e0e0e0]":""}`}>{c.nama||"—"}{c.nama&&c.jamDatang&&<span className="text-[#777]"> ({c.jamDatang}{c.jamPulang&&` – ${c.jamPulang}`})</span>}</div>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {libur.length>0&&(
            <div className="mb-3">
              <p className="text-[11px] font-bold text-[#888] mb-1">Anggota Libur / Tidak Hadir:</p>
              <div className="text-[11px] text-[#444] pl-2">{libur.map((r,i)=><div key={i}>• {r.nama}{r.keterangan&&<span className="text-[#777]"> — {r.keterangan}</span>}</div>)}</div>
            </div>
          )}
          <div className="text-[11px] text-[#333] mb-3">
            <span className="font-bold">Pimpinan Bayer Juara: </span>
            {pimpinanHadir==="Hadir"?<span>Hadir — {pimpinanNama||"—"}</span>:<span className="text-[#555]">Tidak ada</span>}
          </div>

          {/* B. Cuaca */}
          <SecHeader letter="B" title="Kondisi Cuaca"/>
          <DocTable head={["Shift","Jam","Hujan/Terang","Keterangan"]}
            rows={cuaca.map(r=>[r.shift,`${r.jamMulai} - ${r.jamSelesai}`,r.kondisi,`Cuaca ${r.kondisi==="Tidak Hujan"?"cerah":"hujan"}${r.suhu?` dengan suhu ${r.suhu}°C`:""}`])}/>

          {/* C. Aktivitas Operasional */}
          <SecHeader letter="C" title="Aktivitas Operasional"/>
          <DocTable head={["No","Pelapor","Jam Patroli","Obyek","Status Temuan","Catatan Temuan","Penanganan"]}
            rows={patroli.map((r,i)=>[i+1,r.pelapor,r.jam,r.obyek,r.temuan==="Nihil"?"Nihil":r.temuan,r.temuan==="Ada temuan"?(r.catatanTemuan||"—"):"",r.temuan==="Ada temuan"?(r.penangananPatroli||"—"):""])}/>

          {/* D. Keluar Masuk */}
          <SecHeader letter="D" title="Aktivitas Keluar Masuk"/>
          {[
            {label:"KARYAWAN BAYER JUARA", rows:kbj, cols:["NO","NAMA","JAM MASUK","JAM KELUAR"]},
            {label:"KARYAWAN BUMAWA", rows:kbw, cols:["NO","NAMA","JAM MASUK","JAM KELUAR"]},
            {label:"MAHASISWA MAGANG", rows:mhsw, cols:["NO","NAMA","JAM MASUK","JAM KELUAR"]},
            {label:"PEKERJA THL", rows:thl, cols:["NO","NAMA","JAM MASUK","JAM KELUAR"]},
          ].map(g=>(
            <div key={g.label} className="mb-3">
              <SubHead label={g.label}/>
              <DocTable head={g.cols} rows={g.rows.map((r,i)=>[i+1,(r as KaryawanRow).nama,r.jamMasuk,r.jamKeluar])} striped/>
            </div>
          ))}
          <div className="mb-4">
            <SubHead label="TAMU BAYER JUARA"/>
            <DocTable head={["NO","NAMA","INSTANSI","JAM MASUK","JAM KELUAR"]}
              rows={tamu.length?tamu.map((r,i)=>[i+1,r.nama,r.instansi,r.jamMasuk,r.jamKeluar]):[["-","-","-","Tidak ada tamu",""]]}/>
          </div>

          {/* E. Temuan */}
          <SecHeader letter="E" title="Temuan dan Kejadian"/>
          <DocTable head={["WAKTU","PELAPOR","KRONOLOGIS"]}
            rows={temuan.length?temuan.map(r=>[r.waktu,r.pelapor,r.kronologis]):[["-","-","Tidak ada"]]}/>

          {/* F G H */}
          {[["F","Penanganan",penanganan||"Tidak dilaporkan"],["G","Kendala",kendala||"Tidak ada"],["H","Informasi Tambahan",infoTambahan||"Tidak ada"]].map(([l,t,v])=>(
            <div key={l} className="mb-3">
              <p className="text-[14px] font-bold text-[#1a56db] mb-0.5">{l}. {t}</p>
              <p className="text-[12px] text-[#555] italic pl-1">{v}</p>
            </div>
          ))}

          <div className="mt-6 pt-3 border-t border-[#e0e0e0] flex justify-between text-[9px] text-[#aaa]">
            <span>Dicetak: {new Date().toLocaleString("id-ID")}</span>
            <span>BMW Klaten Security System</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Print Area (window.print) ────────────────────────────────────────────────

function PrintArea({ data }: { data:LaporanData }) {
  const { info, shifts, libur, pimpinanHadir, pimpinanNama, cuaca, patroli, kbj, kbw, mhsw, thl, tamu, temuan, penanganan, kendala, infoTambahan } = data;

  const s = {
    tbl: {width:"100%",borderCollapse:"collapse" as const,fontSize:"9.5px",marginBottom:"8px"},
    thBase: {border:"1px solid #999",background:"#dbeafe",padding:"3px 6px",fontWeight:"bold" as const,textAlign:"left" as const},
    thC:   {border:"1px solid #999",background:"#dbeafe",padding:"3px 6px",fontWeight:"bold" as const,textAlign:"center" as const,whiteSpace:"nowrap" as const},
    td:    {border:"1px solid #bbb",padding:"2px 6px",verticalAlign:"top" as const,lineHeight:"1.4"},
    tdC:   {border:"1px solid #bbb",padding:"2px 6px",verticalAlign:"middle" as const,textAlign:"center" as const,whiteSpace:"nowrap" as const},
    tdNo:  {border:"1px solid #bbb",padding:"2px 4px",verticalAlign:"middle" as const,textAlign:"center" as const,whiteSpace:"nowrap" as const,width:"24px"},
    thNo:  {border:"1px solid #999",background:"#dbeafe",padding:"3px 4px",fontWeight:"bold" as const,textAlign:"center" as const,width:"24px"},
  };

  const DT = ({head,rows,noCol=true}:{head:string[];rows:(string|number)[][];noCol?:boolean}) => (
    <table style={s.tbl}>
      <thead><tr>
        {head.map((h,i)=>{
          const isNo = noCol && i===0;
          return <th key={i} style={isNo ? s.thNo : (i<=1&&noCol ? s.thC : s.thBase)}>{h}</th>;
        })}
      </tr></thead>
      <tbody>{rows.length===0
        ? <tr><td colSpan={head.length} style={{...s.td,textAlign:"center",color:"#999"}}>Tidak ada data</td></tr>
        : rows.map((row,i)=>(
          <tr key={i} style={{background:i%2!==0?"#f7f7f7":"#fff"}}>
            {row.map((c,j)=>{
              const isNo = noCol && j===0;
              return <td key={j} style={isNo ? s.tdNo : (j===1&&noCol ? s.tdC : s.td)}>{c||"—"}</td>;
            })}
          </tr>
        ))
      }</tbody>
    </table>
  );

  const SH = ({t}:{t:string}) => (
    <div style={{background:"#1a3a6b",color:"white",fontWeight:"bold",fontSize:"9.5px",padding:"3px 6px",marginBottom:"0",marginTop:"4px"}}>{t}</div>
  );
  const SecH = ({l,t}:{l:string;t:string}) => (
    <p style={{fontWeight:"bold",color:"#1a56db",fontSize:"11px",margin:"10px 0 3px",borderBottom:"1px solid #dbeafe",paddingBottom:"2px"}}>{l}. {t}</p>
  );

  return (
    <div data-print className="hidden print:block" style={{fontFamily:"Arial,sans-serif",color:"#111",boxSizing:"border-box",width:"180mm",maxWidth:"180mm",margin:"0 auto"}}>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 1.5cm; }
          html, body { width: 210mm !important; max-width: 210mm !important; overflow: visible !important; height: auto !important; margin: 0 !important; padding: 0 !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      {/* Kop */}
      <div style={{textAlign:"center",marginBottom:"6px",borderBottom:"2px solid #1a56db",paddingBottom:"6px"}}>
        <div style={{fontSize:"16px",fontWeight:"900",letterSpacing:"1px"}}>LAPORAN HARIAN SECURITY</div>
        <div style={{fontSize:"10px",color:"#555"}}>BMW Klaten &mdash; Client: PT Bayer Juara Indonesia</div>
      </div>

      {/* Info umum */}
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:"9.5px",marginBottom:"8px"}}>
        <tbody>
          {[["Lokasi / Project","Bayer Juara"],["Nama Client","PT Bayer Juara Indonesia"],["Hari / Tanggal",`${info.hari}, ${formatTgl(info.tanggal||"")}`],["Laporan Shift",info.shift||"Semua Shift"]].map(([l,v])=>(
            <tr key={l}>
              <td style={{padding:"1px 0",fontWeight:"bold",width:"130px"}}>{l}</td>
              <td style={{padding:"1px 4px",width:"10px"}}>:</td>
              <td style={{padding:"1px 0"}}>{v||"—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* A. Personel */}
      <SecH l="A" t="Personel"/>
      <table style={{...s.tbl,tableLayout:"auto"}}>
        <thead><tr>
          <th style={{...s.thC,width:"42px"}}>Shift</th>
          <th style={{...s.thC,width:"80px"}}>Jam</th>
          <th style={s.thBase}>Anggota Bertugas</th>
          <th style={s.thBase}>Chief Controller</th>
        </tr></thead>
        <tbody>
          {(shifts||[]).map(sr=>(
            <tr key={sr.shift}>
              <td style={{...s.tdC,fontWeight:"bold"}}>{sr.shift}</td>
              <td style={s.tdC}>{sr.jamMulai} - {sr.jamSelesai}</td>
              <td style={{...s.td,padding:"0 6px"}}>
                {(sr.anggota||[]).map((a,i,arr)=>(
                  <div key={i} style={{padding:"2px 0",borderBottom:i<arr.length-1?"1px solid #e8e8e8":""}}>
                    {a.nama||"—"}{a.noHp&&<span style={{color:"#666"}}> (Hp {a.noHp})</span>}
                  </div>
                ))}
              </td>
              <td style={{...s.td,padding:"0 6px"}}>
                {(sr.chiefs||[]).map((c,i,arr)=>(
                  <div key={c.id} style={{padding:"2px 0",borderBottom:i<arr.length-1?"1px solid #e8e8e8":""}}>
                    {c.nama||"—"}{c.nama&&c.jamDatang&&<span style={{color:"#666"}}> ({c.jamDatang}{c.jamPulang&&` – ${c.jamPulang}`})</span>}
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {libur.length>0&&<div style={{fontSize:"9.5px",margin:"3px 0 6px"}}><b>Anggota Libur:</b> {libur.map(r=>`${r.nama}${r.keterangan?` (${r.keterangan})`:""}`).join(", ")}</div>}
      <div style={{fontSize:"9.5px",marginBottom:"6px"}}><b>Pimpinan Bayer Juara:</b> {pimpinanHadir==="Hadir"?`Hadir — ${pimpinanNama}`:"Tidak ada"}</div>

      {/* B. Cuaca */}
      <SecH l="B" t="Kondisi Cuaca"/>
      <DT head={["No","Shift","Jam","Cuaca","Keterangan"]} rows={cuaca.map((r,i)=>[i+1,r.shift,`${r.jamMulai} - ${r.jamSelesai}`,r.kondisi,r.suhu?`Suhu ${r.suhu}°C`:""])}/>

      {/* C. Aktivitas */}
      <SecH l="C" t="Aktivitas Operasional"/>
      <DT head={["No","Pelapor","Jam","Obyek","Status","Catatan Temuan","Penanganan"]}
        rows={patroli.map((r,i)=>[i+1,r.pelapor,r.jam,r.obyek,r.temuan==="Nihil"?"Nihil":"Ada Temuan",r.temuan==="Ada temuan"?(r.catatanTemuan||"—"):"",r.temuan==="Ada temuan"?(r.penangananPatroli||"—"):""])}/>

      {/* D. Keluar Masuk */}
      <SecH l="D" t="Aktivitas Keluar Masuk"/>
      {[{l:"KARYAWAN BAYER JUARA",r:kbj},{l:"KARYAWAN BUMAWA",r:kbw},{l:"MAHASISWA MAGANG",r:mhsw},{l:"PEKERJA THL",r:thl}].map(g=>(
        <div key={g.l} style={{marginBottom:"4px"}}>
          <SH t={g.l}/>
          <DT head={["No","Nama","Jam Masuk","Jam Keluar"]} rows={g.r.map((r,i)=>[i+1,(r as KaryawanRow).nama,r.jamMasuk||"—",r.jamKeluar||"—"])}/>
        </div>
      ))}
      <SH t="TAMU BAYER JUARA"/>
      <DT head={["No","Nama","Instansi","Jam Masuk","Jam Keluar"]} rows={tamu.length?tamu.map((r,i)=>[i+1,r.nama,r.instansi,r.jamMasuk||"—",r.jamKeluar||"—"]):[["-","—","—","Tidak ada tamu",""]]}/>

      {/* E–H */}
      <SecH l="E" t="Temuan dan Kejadian"/>
      <DT head={["No","Waktu","Pelapor","Kronologis"]} rows={temuan.length?temuan.map((r,i)=>[i+1,r.waktu,r.pelapor,r.kronologis]):[["-","—","—","Tidak ada"]]}/>
      {([["F","Penanganan",penanganan||"Tidak dilaporkan"],["G","Kendala",kendala||"Tidak ada"],["H","Informasi Tambahan",infoTambahan||"Tidak ada"]] as [string,string,string][]).map(([l,t,v])=>(
        <div key={l} style={{marginBottom:"5px"}}>
          <p style={{fontWeight:"bold",color:"#1a56db",fontSize:"10px",margin:"8px 0 2px"}}>{l}. {t}</p>
          <p style={{fontSize:"9.5px",margin:0,paddingLeft:"4px",color:"#333"}}>{v}</p>
        </div>
      ))}

      <div style={{marginTop:"16px",paddingTop:"6px",borderTop:"1px solid #ccc",display:"flex",justifyContent:"space-between",fontSize:"8px",color:"#aaa"}}>
        <span>Dicetak: {new Date().toLocaleString("id-ID")}</span>
        <span>BMW Klaten Security System</span>
      </div>
    </div>
  );
}

// ─── Riwayat Laporan Detail (format sama seperti preview) ────────────────────

function RiwayatDetail({ data }: { data: LaporanData }) {
  const { info, shifts, libur, pimpinanHadir, pimpinanNama, cuaca, patroli, kbj, kbw, mhsw, thl, tamu, temuan, penanganan, kendala, infoTambahan } = data;

  const DT = ({ head, rows }: { head: string[]; rows: (string | number)[][] }) => (
    <table className="w-full border-collapse text-[11px] mb-3">
      <thead><tr>{head.map((h, i) => <th key={i} className="border border-[#c8c8c8] bg-[#dbeafe] px-2 py-1.5 text-left font-bold text-[10px]">{h}</th>)}</tr></thead>
      <tbody>
        {rows.length === 0
          ? <tr><td colSpan={head.length} className="border border-[#c8c8c8] px-2 py-2 text-center text-[#999] italic text-[10px]">Tidak ada data</td></tr>
          : rows.map((row, i) => (
            <tr key={i} className={i % 2 !== 0 ? "bg-[#f9f9f9]" : ""}>
              {row.map((cell, j) => <td key={j} className="border border-[#c8c8c8] px-2 py-1 text-[#333] align-top">{cell || "—"}</td>)}
            </tr>
          ))}
      </tbody>
    </table>
  );

  const SubH = ({ label }: { label: string }) => (
    <div className="bg-[#1a3a6b] text-white font-bold text-[10px] px-2 py-1 mb-0">{label}</div>
  );

  const SecH = ({ l, t }: { l: string; t: string }) => (
    <p className="font-bold text-[#1a56db] text-[13px] mt-4 mb-1">{l}. {t}</p>
  );

  return (
    <div className="p-5 bg-white" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Kop */}
      <div className="text-center mb-1">
        <p className="text-[9px] text-[#888] uppercase tracking-widest font-semibold">LAPORAN HARIAN SECURITY – BMW KLATEN</p>
        <h2 className="text-[20px] font-black text-[#1a1d23] leading-tight mt-0.5">LAPORAN HARIAN SECURITY</h2>
        <p className="text-[11px] text-[#555] mt-0.5">BMW Klaten — Client: {info.lokasi || "Bayer Juara"}</p>
      </div>
      <div className="bg-[#2d6a2d] text-white text-center font-bold text-[11px] py-2 mt-2 mb-3 tracking-wide">
        LAPORAN HARIAN SECURITY
      </div>

      {/* Info Umum */}
      <div className="mb-3">
        <p className="text-[11px] font-bold text-[#c47a00] mb-1">Informasi Umum</p>
        <table className="text-[11px] text-[#222]">
          <tbody>
            <tr><td className="pr-3 py-0.5 font-bold w-32">Lokasi/Project</td><td className="pr-2">:</td><td className="font-bold">{info.lokasi || "—"}</td></tr>
            <tr><td className="pr-3 py-0.5 font-bold">Nama Client</td><td className="pr-2">:</td><td className="font-bold">{info.client || "—"}</td></tr>
            <tr><td className="pr-3 py-0.5 font-bold">Hari/Tanggal</td><td className="pr-2">:</td><td className="font-bold">{info.hari}, {formatTgl(info.tanggal || "")}</td></tr>
            {info.shift && <tr><td className="pr-3 py-0.5 font-bold">Shift</td><td className="pr-2">:</td><td>{info.shift}</td></tr>}
            {info.salam && <tr><td className="pr-3 py-0.5 font-bold">Salam</td><td className="pr-2">:</td><td className="italic text-[#555]">{info.salam}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* A. Personel */}
      <SecH l="A" t="Personel" />
      <table className="w-full border-collapse text-[11px] mb-2">
        <thead><tr>
          <th className="border border-[#c8c8c8] bg-[#dbeafe] px-2 py-1.5 font-bold text-[10px] text-center w-14">Shift</th>
          <th className="border border-[#c8c8c8] bg-[#dbeafe] px-2 py-1.5 font-bold text-[10px] text-center w-24">Jam</th>
          <th className="border border-[#c8c8c8] bg-[#dbeafe] px-2 py-1.5 font-bold text-[10px] text-left">Anggota Bertugas</th>
          <th className="border border-[#c8c8c8] bg-[#dbeafe] px-2 py-1.5 font-bold text-[10px] text-left">Chief Controller</th>
        </tr></thead>
        <tbody>
          {(shifts||[]).map(sr => (
            <tr key={sr.shift}>
              <td className="border border-[#c8c8c8] px-2 py-1 font-bold text-[#333] text-center align-middle">{sr.shift}</td>
              <td className="border border-[#c8c8c8] px-2 py-1 text-[#333] text-center align-middle">{sr.jamMulai} - {sr.jamSelesai}</td>
              <td className="border border-[#c8c8c8] px-2 py-0 text-[#333] align-top">
                {(sr.anggota||[]).map((a,i,arr)=><div key={i} className={`py-1 ${i<arr.length-1?"border-b border-[#e0e0e0]":""}`}>{a.nama||"—"}{a.noHp&&<span className="text-[#777]"> (Hp {a.noHp})</span>}</div>)}
              </td>
              <td className="border border-[#c8c8c8] px-2 py-0 text-[#333] align-top">
                {(sr.chiefs||[]).map((c,i,arr)=><div key={c.id} className={`py-1 ${i<arr.length-1?"border-b border-[#e0e0e0]":""}`}>{c.nama||"—"}{c.nama&&c.jamDatang&&<span className="text-[#777]"> ({c.jamDatang}{c.jamPulang&&` – ${c.jamPulang}`})</span>}</div>)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {libur.length > 0 && (
        <div className="text-[11px] text-[#444] mb-1">
          <b>Anggota Libur:</b> {libur.map(r => `${r.nama}${r.keterangan ? ` (${r.keterangan})` : ""}`).join(", ")}
        </div>
      )}
      <div className="text-[11px] text-[#333] mb-3">
        <b>Pimpinan:</b> {pimpinanHadir === "Hadir" ? `Hadir — ${pimpinanNama || "—"}` : "Tidak ada"}
      </div>

      {/* B. Cuaca */}
      <SecH l="B" t="Kondisi Cuaca" />
      <DT head={["Shift", "Jam", "Kondisi", "Keterangan"]}
        rows={cuaca.map(r => [r.shift, `${r.jamMulai} - ${r.jamSelesai}`, r.kondisi, r.suhu ? `Suhu ${r.suhu}°C` : ""])} />

      {/* C. Patroli */}
      <SecH l="C" t="Aktivitas Operasional" />
      <DT head={["No", "Pelapor", "Jam", "Obyek", "Status", "Catatan Temuan", "Penanganan"]}
        rows={patroli.map((r, i) => [i + 1, r.pelapor, r.jam, r.obyek, r.temuan === "Nihil" ? "Nihil" : r.temuan, r.temuan === "Ada temuan" ? (r.catatanTemuan || "—") : "", r.temuan === "Ada temuan" ? (r.penangananPatroli || "—") : ""])} />

      {/* D. Keluar Masuk */}
      <SecH l="D" t="Aktivitas Keluar Masuk" />
      {([
        { label: "KARYAWAN BAYER JUARA", rows: kbj },
        { label: "KARYAWAN BUMAWA", rows: kbw },
        { label: "MAHASISWA MAGANG", rows: mhsw },
        { label: "PEKERJA THL", rows: thl },
      ] as { label: string; rows: KaryawanRow[] }[]).map(g => (
        <div key={g.label} className="mb-2">
          <SubH label={g.label} />
          <DT head={["No", "Nama", "Jam Masuk", "Jam Keluar"]}
            rows={g.rows.map((r, i) => [i + 1, r.nama, r.jamMasuk, r.jamKeluar])} />
        </div>
      ))}
      <div className="mb-2">
        <SubH label="TAMU BAYER JUARA" />
        <DT head={["No", "Nama", "Instansi", "Jam Masuk", "Jam Keluar"]}
          rows={tamu.length ? tamu.map((r, i) => [i + 1, r.nama, r.instansi, r.jamMasuk, r.jamKeluar]) : [["-", "-", "-", "Tidak ada tamu", ""]]} />
      </div>

      {/* E. Temuan */}
      <SecH l="E" t="Temuan dan Kejadian" />
      <DT head={["Waktu", "Pelapor", "Kronologis"]}
        rows={temuan.length ? temuan.map(r => [r.waktu, r.pelapor, r.kronologis]) : [["-", "-", "Tidak ada"]]} />

      {/* F G H */}
      {([["F", "Penanganan", penanganan || "Tidak dilaporkan"], ["G", "Kendala", kendala || "Tidak ada"], ["H", "Informasi Tambahan", infoTambahan || "Tidak ada"]] as [string, string, string][]).map(([l, t, v]) => (
        <div key={l} className="mb-2">
          <p className="font-bold text-[#1a56db] text-[12px] mt-3 mb-0.5">{l}. {t}</p>
          <p className="text-[11px] italic text-[#555] pl-1">{v}</p>
        </div>
      ))}

      <div className="mt-4 pt-2 border-t border-[#e0e0e0] flex justify-between text-[9px] text-[#aaa]">
        <span>Disimpan: {new Date().toLocaleString("id-ID")}</span>
        <span>BMW Klaten Security System</span>
      </div>
    </div>
  );
}

// ─── Draft Modal ─────────────────────────────────────────────────────────────

function DraftModal({ onClose, onLoad, onCountChange }: {
  onClose: ()=>void;
  onLoad: (d: DraftItem)=>void;
  onCountChange: (n: number)=>void;
}) {
  const [drafts, setDrafts] = useState<DraftItem[]>(() => [...loadDrafts()].reverse());

  const hapus = (id: string) => {
    const updated = loadDrafts().filter(d => d.id !== id);
    saveDraftsToStorage(updated);
    setDrafts([...updated].reverse());
    onCountChange(updated.length);
  };

  const hapusSemua = () => {
    if (!confirm("Hapus semua draft?")) return;
    saveDraftsToStorage([]);
    setDrafts([]);
    onCountChange(0);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0f2f7] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#fef3c7] flex items-center justify-center"><BookOpen size={16} className="text-[#d97706]"/></div>
            <div>
              <p className="font-bold text-[#1a1d23] text-sm">Draft Laporan</p>
              <p className="text-xs text-[#9ca3af]">{drafts.length} draft tersimpan</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {drafts.length>0&&<button onClick={hapusSemua} className="text-xs text-[#e02424] hover:underline font-semibold px-2 py-1 rounded hover:bg-red-50 transition-colors">Hapus Semua</button>}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#f4f6f9] text-[#6b7280] transition-colors"><X size={16}/></button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {drafts.length===0 ? (
            <div className="text-center py-14 text-[#9ca3af]">
              <BookOpen size={32} className="mx-auto mb-2 opacity-25"/>
              <p className="text-sm font-medium">Belum ada draft</p>
              <p className="text-xs mt-1">Klik "Simpan Draft" untuk menyimpan laporan yang sedang dikerjakan</p>
            </div>
          ) : drafts.map(d=>(
            <div key={d.id} className="flex items-center justify-between p-3 border border-[#dde1ea] rounded-xl hover:border-[#c7d7f9] hover:bg-[#fafbff] transition-all gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#fef3c7] flex items-center justify-center shrink-0"><FileText size={14} className="text-[#d97706]"/></div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#1a1d23] truncate">{d.label||"Draft tanpa judul"}</p>
                  <p className="text-[11px] text-[#9ca3af]">Disimpan {new Date(d.savedAt).toLocaleString("id-ID")}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={()=>onLoad(d)} className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#1a56db] hover:bg-[#1348c0] px-3 py-1.5 rounded-lg transition-colors">
                  <Pencil size={12}/> Lanjut Edit
                </button>
                <button onClick={()=>hapus(d.id)} className="p-1.5 rounded-lg text-[#d1d5db] hover:text-[#e02424] hover:bg-red-50 transition-colors"><Trash size={13}/></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Riwayat Modal ────────────────────────────────────────────────────────────

function RiwayatModal({ onClose, onCountChange, onCetakUlang, onEdit }: { onClose: ()=>void; onCountChange: (n:number)=>void; onCetakUlang: (data: LaporanData)=>void; onEdit: (data: LaporanData)=>void }) {
  const [items, setItems] = useState<RiwayatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const muat = useCallback(() => {
    setLoading(true); setError("");
    apiGetLaporan()
      .then(data => { setItems(data); onCountChange(data.length); })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { muat(); }, []);

  const hapus = async (id: string) => {
    if (!confirm("Hapus laporan ini?")) return;
    try {
      await apiDeleteLaporan(id);
      const u = items.filter(x => x.id !== id);
      setItems(u); onCountChange(u.length);
      if (expanded === id) setExpanded(null);
    } catch { alert("Gagal menghapus laporan"); }
  };
  const hapusSemua = async () => {
    if (!confirm("Hapus semua riwayat?")) return;
    try {
      await apiDeleteAll();
      setItems([]); onCountChange(0); setExpanded(null);
    } catch { alert("Gagal menghapus semua laporan"); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0f2f7] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#eff4ff] flex items-center justify-center"><History size={16} className="text-[#1a56db]" /></div>
            <div>
              <p className="font-bold text-[#1a1d23] text-sm">Riwayat Laporan</p>
              <p className="text-xs text-[#9ca3af]">{items.length} laporan tersimpan</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 && <button onClick={hapusSemua} className="text-xs text-[#e02424] hover:underline font-semibold px-2 py-1 rounded hover:bg-red-50 transition-colors">Hapus Semua</button>}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#f4f6f9] text-[#6b7280] transition-colors"><X size={16} /></button>
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {loading && (
            <div className="text-center py-16 text-[#9ca3af]">
              <div className="w-8 h-8 border-2 border-[#1a56db] border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
              <p className="text-sm">Memuat riwayat dari Supabase...</p>
            </div>
          )}
          {!loading && error && (
            <div className="text-center py-16">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
                <X size={20} className="text-red-400"/>
              </div>
              <p className="text-sm font-semibold text-red-500 mb-1">Gagal memuat riwayat</p>
              <p className="text-xs text-[#9ca3af] mb-4 max-w-xs mx-auto">{error}</p>
              <button onClick={muat} className="text-sm font-semibold text-[#1a56db] border border-[#1a56db] px-4 py-2 rounded-lg hover:bg-[#eff4ff] transition-colors">
                Coba Lagi
              </button>
            </div>
          )}
          {!loading && !error && items.length === 0 && (
            <div className="text-center py-16 text-[#9ca3af]">
              <History size={36} className="mx-auto mb-3 opacity-25" />
              <p className="text-sm font-medium">Belum ada riwayat</p>
              <p className="text-xs mt-1">Cetak laporan untuk menyimpan ke riwayat</p>
            </div>
          )}
          {!loading && !error && [...items].reverse().map(item => {
            const d = item.data.info;
            const isOpen = expanded === item.id;
            return (
              <div key={item.id} className="border border-[#dde1ea] rounded-xl overflow-hidden shadow-sm">
                {/* Row header */}
                <div
                  className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${isOpen ? "bg-[#eff4ff] border-b border-[#c7d7f9]" : "bg-[#fafbfd] hover:bg-[#f0f4ff]"}`}
                  onClick={() => setExpanded(isOpen ? null : item.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isOpen ? "bg-[#1a56db]" : "bg-[#e8edf5]"}`}>
                      <FileText size={15} className={isOpen ? "text-white" : "text-[#1a56db]"} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#1a1d23]">
                        {d.lokasi || "Tanpa Lokasi"} — {d.hari}
                      </p>
                      <p className="text-xs font-semibold text-[#1a56db]">
                        {formatTgl(d.tanggal || "")}
                      </p>
                      <p className="text-[11px] text-[#9ca3af]">
                        Disimpan {new Date(item.savedAt).toLocaleString("id-ID")} · {d.shift || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isOpen && (
                      <>
                        <button
                          onClick={e => { e.stopPropagation(); onEdit(item.data); }}
                          className="flex items-center gap-1.5 text-xs font-semibold text-[#1a56db] bg-[#eff4ff] hover:bg-[#dbeafe] border border-[#c7d7f9] px-3 py-1.5 rounded-lg transition-colors"
                          title="Edit laporan ini"
                        >
                          <Pencil size={12}/> Edit
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); onCetakUlang(item.data); }}
                          className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#1a56db] hover:bg-[#1348c0] px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                          title="Cetak ulang laporan ini"
                        >
                          <Printer size={13}/> Cetak PDF
                        </button>
                      </>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); hapus(item.id); }}
                      className="p-1.5 rounded-lg text-[#d1d5db] hover:text-[#e02424] hover:bg-red-50 transition-colors"
                      title="Hapus laporan ini"
                    >
                      <Trash size={14} />
                    </button>
                    <div className={`p-1.5 rounded-lg transition-colors ${isOpen ? "text-[#1a56db]" : "text-[#9ca3af]"}`}>
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </div>

                {/* Isi laporan lengkap */}
                {isOpen && (
                  <div className="border-t border-[#dde1ea]">
                    <RiwayatDetail data={item.data} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

// ─── Debug Modal (cek koneksi Supabase) ──────────────────────────────────────

function DebugModal({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true); setStatus(null);
    const result = await apiTestConnection();
    setStatus(result);
    setChecking(false);
  }, []);

  useEffect(() => { check(); }, []);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0f2f7]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#eff4ff] flex items-center justify-center">
              <Database size={16} className="text-[#1a56db]"/>
            </div>
            <div>
              <p className="font-bold text-[#1a1d23] text-sm">Debug Koneksi Supabase</p>
              <p className="text-xs text-[#9ca3af]">Cek status database</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#f4f6f9] text-[#6b7280] transition-colors"><X size={16}/></button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Status card */}
          {checking && (
            <div className="flex flex-col items-center py-8 gap-3 text-[#9ca3af]">
              <Loader2 size={28} className="animate-spin text-[#1a56db]"/>
              <p className="text-sm font-medium">Menghubungi Supabase...</p>
            </div>
          )}

          {!checking && status && (
            <>
              {/* Connection pill */}
              <div className={`flex items-center gap-3 rounded-xl px-4 py-3 ${status.ok ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                {status.ok
                  ? <Wifi size={20} className="text-green-600 shrink-0"/>
                  : <WifiOff size={20} className="text-red-500 shrink-0"/>}
                <div>
                  <p className={`font-bold text-sm ${status.ok ? "text-green-700" : "text-red-600"}`}>
                    {status.ok ? "Terhubung ✓" : "Gagal Terhubung ✗"}
                  </p>
                  {status.ok && <p className="text-xs text-green-600">Latensi: {status.latencyMs} ms</p>}
                </div>
              </div>

              {/* Detail rows */}
              <div className="rounded-xl border border-[#edf0f5] overflow-hidden text-sm">
                {[
                  { label: "Project ID",     val: "gausloelinoodcppxbpa" },
                  { label: "Tabel",          val: "kv_store_60b930c2" },
                  { label: "Tabel ada?",     val: status.tableExists ? "✓ Ya" : "✗ Tidak", ok: status.tableExists },
                  { label: "Jumlah row",     val: status.tableExists ? String(status.rowCount ?? 0) : "—" },
                  { label: "Latensi",        val: status.latencyMs != null ? `${status.latencyMs} ms` : "—" },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between px-4 py-2.5 border-b border-[#f4f6f9] last:border-0">
                    <span className="text-[#6b7280] font-medium">{r.label}</span>
                    <span className={`font-semibold ${r.ok === false ? "text-red-500" : r.ok === true ? "text-green-600" : "text-[#1a1d23]"}`}>{r.val}</span>
                  </div>
                ))}
              </div>

              {/* Error detail */}
              {status.error && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                  <p className="text-xs font-bold text-red-600 mb-1">Pesan Error:</p>
                  <p className="text-xs text-red-700 font-mono break-all">{status.error}</p>
                  <div className="mt-3 text-xs text-red-600 space-y-1">
                    <p className="font-bold">Kemungkinan penyebab:</p>
                    <p>• Tabel <code className="bg-red-100 px-1 rounded">kv_store_60b930c2</code> belum dibuat — jalankan <code className="bg-red-100 px-1 rounded">schema.sql</code> di Supabase SQL Editor</p>
                    <p>• RLS Policy belum aktif — pastikan policy <code className="bg-red-100 px-1 rounded">allow_all</code> untuk anon sudah ada</p>
                    <p>• Project Supabase sedang pause / tidak aktif</p>
                  </div>
                </div>
              )}

              {status.ok && (
                <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-700">
                  <p className="font-bold mb-1">ℹ️ Info Storage:</p>
                  <p>Data laporan disimpan sebagai JSON blob di kolom <code className="bg-blue-100 px-1 rounded">value</code> dengan key <code className="bg-blue-100 px-1 rounded">laporan_harian_security</code>.</p>
                  <p className="mt-1">Untuk melihat data: buka Supabase → Table Editor → <code className="bg-blue-100 px-1 rounded">kv_store_60b930c2</code>.</p>
                </div>
              )}
            </>
          )}

          {/* Cek ulang button */}
          <button
            onClick={check}
            disabled={checking}
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-[#1a56db] border border-[#1a56db] px-4 py-2.5 rounded-xl hover:bg-[#eff4ff] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={checking ? "animate-spin" : ""}/>
            {checking ? "Mengecek..." : "Cek Ulang"}
          </button>
        </div>
      </div>
    </div>
  );
}

const NAV = [
  {id:"info",label:"Info Umum",icon:FileText,short:"Info"},
  {id:"personel",label:"Personel",icon:Users,short:"Personel"},
  {id:"cuaca",label:"Cuaca",icon:Cloud,short:"Cuaca"},
  {id:"aktivitas",label:"Aktivitas Operasional",icon:Activity,short:"Aktivitas"},
  {id:"kelmasuk",label:"Keluar Masuk",icon:ArrowLeftRight,short:"Kel/Masuk"},
  {id:"temuan",label:"Temuan & Catatan",icon:AlertTriangle,short:"Temuan"},
];

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab]                     = useState("info");
  const [showRiwayat, setShowRiwayat]     = useState(false);
  const [showPreview, setShowPreview]     = useState(false);
  const [showDraft, setShowDraft]         = useState(false);
  const [showDebug, setShowDebug]         = useState(false);
  const [riwayatCount, setRiwayatCount]   = useState(() => loadRiwayat().length);
  const [draftCount, setDraftCount]       = useState(() => loadDrafts().length);
  const [draftSaved, setDraftSaved]       = useState(false);
  const [printData, setPrintData]         = useState<LaporanData | null>(null);

  // ─ Save-to-DB state
  const [saveStatus, setSaveStatus]       = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [saveMsg, setSaveMsg]             = useState("");

  // ─ Auto-save debounce ref
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [info, setInfoData]     = useState<Record<string,string>>({hari:"Kamis",tanggal:"",shift:"Semua Shift",salam:""});
  const [shifts, setShifts]     = useState<ShiftRow[]>(defaultShifts());
  const [libur, setLibur]       = useState<LiburRow[]>([]);
  const [pimpinanHadir, setPimpinanHadir] = useState("Tidak ada");
  const [pimpinanNama, setPimpinanNama]   = useState("");
  const [cuaca, setCuaca]       = useState<CuacaRow[]>([mkCuaca("Pagi"),mkCuaca("Siang"),mkCuaca("Malam")]);
  const [patroli, setPatroli]   = useState<PatroliRow[]>(defaultPatroli());
  const [kbj, setKbj]   = useState<KaryawanRow[]>([]);
  const [kbw, setKbw]   = useState<KaryawanRow[]>([]);
  const [mhsw, setMhsw] = useState<KaryawanRow[]>([]);
  const [thl, setThl]   = useState<KaryawanRow[]>(defaultThl());
  const [tamu, setTamu] = useState<TamuRow[]>([]);
  const [temuan, setTemuan]           = useState<TemuanRow[]>([]);
  const [penanganan, setPenanganan]   = useState("");
  const [kendala, setKendala]         = useState("");
  const [infoTambahan, setInfoTambahan] = useState("");

  const buildData = (): LaporanData => ({ info: {...info, lokasi:"Bayer Juara", client:"PT Bayer Juara Indonesia"}, shifts, libur, pimpinanHadir, pimpinanNama, cuaca, patroli, kbj, kbw, mhsw, thl, tamu, temuan, penanganan, kendala, infoTambahan });

  const loadDataIntoForm = (d: LaporanData) => {
    setInfoData(d.info);
    setShifts(d.shifts?.length ? d.shifts : defaultShifts());
    setLibur(d.libur ?? []);
    setPimpinanHadir(d.pimpinanHadir ?? "Tidak ada");
    setPimpinanNama(d.pimpinanNama ?? "");
    setCuaca(d.cuaca ?? []);
    setPatroli(d.patroli ?? []);
    setKbj(d.kbj ?? []);
    setKbw(d.kbw ?? []);
    setMhsw(d.mhsw ?? []);
    setThl(d.thl?.length ? d.thl : defaultThl());
    setTamu(d.tamu ?? []);
    setTemuan(d.temuan ?? []);
    setPenanganan(d.penanganan ?? "");
    setKendala(d.kendala ?? "");
    setInfoTambahan(d.infoTambahan ?? "");
  };

  const handleSimpanDraft = () => {
    const data = buildData();
    const label = `${data.info.hari||"Draft"}${data.info.tanggal ? ` · ${formatTgl(data.info.tanggal)}` : ""}`;
    const existing = loadDrafts();
    const newDraft: DraftItem = { id: Date.now().toString(), savedAt: new Date().toISOString(), label, data };
    const updated = [...existing, newDraft].slice(-10);
    saveDraftsToStorage(updated);
    setDraftCount(updated.length);
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 2500);
  };

  const handleLoadDraft = (d: DraftItem) => {
    loadDataIntoForm(d.data);
    setShowDraft(false);
    setTab("info");
  };

  const handleEditRiwayat = (data: LaporanData) => {
    loadDataIntoForm(data);
    setShowRiwayat(false);
    setTab("info");
  };

  useEffect(() => {
    document.title = "Laporan Harian Security – BMW Klaten";
    // Ambil jumlah laporan dari Supabase untuk badge riwayat
    apiGetLaporan().then(data => setRiwayatCount(data.length)).catch(()=>{});
    // Restore auto-draft jika ada
    const autoDraft = apiLoadAutoDraft();
    if (autoDraft) {
      const mins = Math.round((Date.now() - new Date(autoDraft.savedAt).getTime()) / 60000);
      const label = mins < 60 ? `${mins} menit lalu` : `${Math.round(mins/60)} jam lalu`;
      const ok = window.confirm(`Ditemukan auto-save dari ${label}. Muat kembali?`);
      if (ok) loadDataIntoForm(autoDraft.data);
    }
    // Ambil master THL dari Supabase
    apiGetMasterThl().then(names => {
      if (names && names.length > 0) {
        setThl(names.map(nama => ({ id: uid(), nama, jamMasuk: "07:00", jamKeluar: "15:00" })));
      }
    }).catch(() => {});
  }, []);

  // Auto-save ke localStorage setiap kali form berubah (debounce 2 detik)
  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      apiSaveAutoDraft(buildData());
    }, 2000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [info, shifts, libur, pimpinanHadir, pimpinanNama, cuaca, patroli, kbj, kbw, mhsw, thl, tamu, temuan, penanganan, kendala, infoTambahan]);

  // Simpan langsung ke database (tanpa cetak)
  const handleSimpanDB = async () => {
    setSaveStatus("saving"); setSaveMsg("");
    try {
      const data = buildData();
      const newItem: RiwayatItem = { id: Date.now().toString(), savedAt: new Date().toISOString(), data };
      await apiSaveLaporan(newItem);
      apiClearAutoDraft();
      setRiwayatCount(c => c + 1);
      setSaveStatus("ok");
      setSaveMsg("Berhasil disimpan ke database!");
    } catch (e: any) {
      setSaveStatus("error");
      setSaveMsg(e?.message ?? "Gagal menyimpan ke database");
    } finally {
      setTimeout(() => setSaveStatus("idle"), 3500);
    }
  };

  const handleCetakSekarang = async () => {
    const data = buildData();
    const newItem: RiwayatItem = { id: Date.now().toString(), savedAt: new Date().toISOString(), data };
    await apiSaveLaporan(newItem); // selalu berhasil (localStorage sebagai fallback)
    apiClearAutoDraft();
    setRiwayatCount(c => c + 1);
    setShowPreview(false);
    const judulCetak = `Laporan Security – ${data.info.lokasi||"BMW Klaten"} – ${formatTgl(data.info.tanggal||"")}`;
    document.title = judulCetak;
    setTimeout(() => {
      window.print();
      setTimeout(() => { document.title = "Laporan Harian Security – BMW Klaten"; }, 2000);
    }, 150);
  };

  const handleCetakUlang = (data: LaporanData) => {
    setPrintData(data);
    setShowRiwayat(false);
    const judul = `Laporan Security – ${data.info.lokasi||"BMW Klaten"} – ${data.info.hari||""}`;
    document.title = judul;
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.title = "Laporan Harian Security – BMW Klaten";
        setPrintData(null);
      }, 2000);
    }, 200);
  };

  const navCounts: Record<string,number|undefined> = {
    personel:shifts.reduce((acc,s)=>acc+s.anggota.length,0), cuaca:cuaca.length, aktivitas:patroli.length,
    kelmasuk:kbj.length+kbw.length+mhsw.length+thl.length+tamu.length,
    temuan:temuan.length,
  };
  const currentIdx = NAV.findIndex(n=>n.id===tab);
  const previewData = buildData();

  return (
    <div className="min-h-screen bg-[#f4f6f9]" style={{fontFamily:"'Inter',sans-serif"}}>
      <PrintArea data={printData ?? previewData}/>
      <div className="print:hidden">
        {/* Top bar */}
        <div className="bg-white border-b border-[#dde1ea] shadow-sm sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#1a56db] flex items-center justify-center shadow-sm"><Shield size={15} className="text-white"/></div>
              <div><p className="text-sm font-bold text-[#1a1d23] leading-tight">Laporan Harian Security</p><p className="text-xs text-[#6b7280] leading-tight">Bayer Juara{info.tanggal?` · ${formatTgl(info.tanggal)}`:""}</p></div>
            </div>
            <div className="flex items-center gap-2">
              {/* Auto-save indicator */}
              <span className="hidden sm:flex items-center gap-1 text-[10px] text-[#9ca3af] font-medium select-none" title="Auto-save aktif">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/> Auto-save
              </span>
              {/* Simpan ke DB */}
              <button
                onClick={handleSimpanDB}
                disabled={saveStatus === "saving"}
                className={`relative flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-all ${
                  saveStatus === "saving" ? "border-blue-300 text-blue-500 bg-blue-50 cursor-wait" :
                  saveStatus === "ok"     ? "border-green-400 text-green-700 bg-green-50" :
                  saveStatus === "error"  ? "border-red-400 text-red-600 bg-red-50" :
                  "border-[#dde1ea] text-[#4b5563] hover:text-[#1a1d23] hover:bg-[#f8f9fb]"
                }`}
                title={saveMsg || "Simpan langsung ke database"}
              >
                {saveStatus === "saving" ? <Loader2 size={14} className="animate-spin"/> :
                 saveStatus === "ok"     ? <CheckCircle2 size={14}/> :
                 saveStatus === "error"  ? <X size={14}/> :
                 <Database size={14}/>}
                <span className="hidden sm:inline">
                  {saveStatus === "saving" ? "Menyimpan..." :
                   saveStatus === "ok"     ? "Tersimpan!" :
                   saveStatus === "error"  ? "Gagal!" :
                   "Simpan ke DB"}
                </span>
              </button>
              {/* Simpan Draft */}
              <button
                onClick={handleSimpanDraft}
                className={`relative flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-all ${draftSaved ? "border-green-400 text-green-700 bg-green-50" : "border-[#dde1ea] text-[#4b5563] hover:text-[#1a1d23] hover:bg-[#f8f9fb]"}`}
                title="Simpan sebagai draft"
              >
                <Save size={14}/>
                <span className="hidden sm:inline">{draftSaved ? "Tersimpan!" : "Simpan Draft"}</span>
              </button>
              {/* Draft */}
              <button onClick={()=>setShowDraft(true)} className="relative flex items-center gap-2 text-sm font-medium text-[#4b5563] hover:text-[#1a1d23] border border-[#dde1ea] px-3 py-2 rounded-lg hover:bg-[#f8f9fb] transition-all">
                <BookOpen size={15}/><span className="hidden sm:inline">Draft</span>
                {draftCount>0&&<span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#d97706] text-white text-[9px] font-bold rounded-full flex items-center justify-center">{draftCount}</span>}
              </button>
              {/* Riwayat */}
              <button onClick={()=>setShowRiwayat(true)} className="relative flex items-center gap-2 text-sm font-medium text-[#4b5563] hover:text-[#1a1d23] border border-[#dde1ea] px-3 py-2 rounded-lg hover:bg-[#f8f9fb] transition-all">
                <History size={15}/><span className="hidden sm:inline">Riwayat</span>
                {riwayatCount>0&&<span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#1a56db] text-white text-[9px] font-bold rounded-full flex items-center justify-center">{riwayatCount}</span>}
              </button>
              {/* Debug */}
              <button onClick={()=>setShowDebug(true)} className="flex items-center gap-1.5 text-sm font-medium text-[#4b5563] hover:text-[#1a1d23] border border-[#dde1ea] px-3 py-2 rounded-lg hover:bg-[#f8f9fb] transition-all" title="Cek koneksi Supabase">
                <Wifi size={15}/>
              </button>
              <button onClick={()=>setShowPreview(true)} className="flex items-center gap-2 text-sm font-semibold bg-[#1a56db] text-white px-4 py-2 rounded-lg hover:bg-[#1348c0] transition-all shadow-sm">
                <Eye size={15}/><span>Cetak & Simpan</span>
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex gap-6">
          {/* Sidebar */}
          <aside className="hidden lg:flex flex-col w-52 shrink-0">
            <div className="bg-white rounded-xl border border-[#dde1ea] shadow-sm overflow-hidden sticky top-20">
              <div className="px-4 py-3 border-b border-[#f0f2f7]"><p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider">Seksi Laporan</p></div>
              <nav className="p-2 space-y-0.5">
                {NAV.map(n=>{const Icon=n.icon;const count=navCounts[n.id];const active=tab===n.id;return(
                  <button key={n.id} onClick={()=>setTab(n.id)} className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm transition-all text-left ${active?"bg-[#eff4ff] text-[#1a56db] font-semibold":"text-[#4b5563] hover:bg-[#f8f9fb] hover:text-[#1a1d23]"}`}>
                    <div className="flex items-center gap-2.5"><Icon size={15} className={active?"text-[#1a56db]":"text-[#9ca3af]"}/><span>{n.label}</span></div>
                    {count!==undefined&&count>0&&<span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${active?"bg-[#1a56db]/15 text-[#1a56db]":"bg-[#f0f2f7] text-[#6b7280]"}`}>{count}</span>}
                  </button>
                );})}
              </nav>
            </div>
          </aside>

          {/* Mobile tabs */}
          <div className="lg:hidden w-full mb-4 -mt-2">
            <div className="bg-white rounded-xl border border-[#dde1ea] shadow-sm p-1 flex gap-1 overflow-x-auto">
              {NAV.map(n=>{const Icon=n.icon;return(<button key={n.id} onClick={()=>setTab(n.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${tab===n.id?"bg-[#1a56db] text-white":"text-[#6b7280] hover:bg-[#f8f9fb]"}`}><Icon size={13}/>{n.short}</button>);})}
            </div>
          </div>

          {/* Main */}
          <main className="flex-1 min-w-0 space-y-4">
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-[#9ca3af]">
              <span>Laporan</span><ChevronRight size={12}/><span className="text-[#1a1d23] font-medium">{NAV.find(n=>n.id===tab)?.label}</span>
            </div>

            {tab==="info"      && <SeksiInfoUmum info={info} setInfo={(k,v)=>setInfoData(p=>({...p,[k]:v}))}/>}
            {tab==="personel"  && <SeksiPersonel shifts={shifts} setShifts={setShifts} libur={libur} setLibur={setLibur} pimpinanHadir={pimpinanHadir} setPimpinanHadir={setPimpinanHadir} pimpinanNama={pimpinanNama} setPimpinanNama={setPimpinanNama}/>}
            {tab==="cuaca"     && <SeksiCuaca rows={cuaca} setRows={setCuaca}/>}
            {tab==="aktivitas" && <SeksiAktivitas rows={patroli} setRows={setPatroli}/>}
            {tab==="kelmasuk"  && <SeksiKelMasuk kbj={kbj} setKbj={setKbj} kbw={kbw} setKbw={setKbw} mhsw={mhsw} setMhsw={setMhsw} thl={thl} setThl={setThl} tamu={tamu} setTamu={setTamu}/>}
            {tab==="temuan"    && <SeksiTemuan rows={temuan} setRows={setTemuan} penanganan={penanganan} setPenanganan={setPenanganan} kendala={kendala} setKendala={setKendala} infoTmb={infoTambahan} setInfoTmb={setInfoTambahan}/>}

            <div className="flex justify-between pt-2">
              <button disabled={currentIdx===0} onClick={()=>setTab(NAV[currentIdx-1].id)} className="text-sm font-medium text-[#6b7280] hover:text-[#1a1d23] disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1">← Sebelumnya</button>
              <button disabled={currentIdx===NAV.length-1} onClick={()=>setTab(NAV[currentIdx+1].id)} className="text-sm font-semibold text-[#1a56db] hover:text-[#1348c0] disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1">Selanjutnya <ChevronRight size={15}/></button>
            </div>
          </main>
        </div>
      </div>

      {showPreview&&<PreviewModal data={previewData} onClose={()=>setShowPreview(false)} onCetak={handleCetakSekarang}/>}
      {showDraft&&<DraftModal onClose={()=>setShowDraft(false)} onLoad={handleLoadDraft} onCountChange={setDraftCount}/>}
      {showRiwayat&&<RiwayatModal onClose={()=>setShowRiwayat(false)} onCountChange={setRiwayatCount} onCetakUlang={handleCetakUlang} onEdit={handleEditRiwayat}/>}
      {showDebug&&<DebugModal onClose={()=>setShowDebug(false)}/>}
      {/* Save-to-DB toast */}
      {saveStatus !== "idle" && (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold transition-all ${
          saveStatus === "saving" ? "bg-blue-600 text-white" :
          saveStatus === "ok"     ? "bg-green-600 text-white" :
          "bg-red-600 text-white"
        }`}>
          {saveStatus === "saving" && <Loader2 size={16} className="animate-spin"/>}
          {saveStatus === "ok"     && <CheckCircle2 size={16}/>}
          {saveStatus === "error"  && <WifiOff size={16}/>}
          {saveMsg || (saveStatus === "saving" ? "Menyimpan ke database..." : "")}
        </div>
      )}
    </div>
  );
}
