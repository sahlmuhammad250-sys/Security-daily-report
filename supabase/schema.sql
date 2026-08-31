-- ============================================================
-- LAPORAN HARIAN SECURITY – BMW KLATEN
-- Supabase / PostgreSQL Schema
-- Generated: 2026-08-30
-- ============================================================

-- Enable UUID extension (already available in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- 1. LAPORAN  (master record per laporan harian)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS laporan (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  saved_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Informasi Umum
  lokasi          TEXT        NOT NULL DEFAULT 'Bayer Juara',
  client          TEXT        NOT NULL DEFAULT 'PT Bayer Juara Indonesia',
  hari            TEXT,                          -- Senin … Minggu
  tanggal         DATE,                          -- tanggal laporan
  shift           TEXT,                          -- 'Semua Shift' | 'Pagi (07.00–15.00)' | …
  salam           TEXT,

  -- Pimpinan Bayer Juara
  pimpinan_hadir  TEXT        NOT NULL DEFAULT 'Tidak ada',  -- 'Tidak ada' | 'Hadir'
  pimpinan_nama   TEXT,

  -- Catatan akhir (free text sections F, G, H)
  penanganan      TEXT,         -- F. Penanganan
  kendala         TEXT,         -- G. Kendala
  info_tambahan   TEXT,         -- H. Informasi Tambahan

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE laporan IS 'Master record untuk setiap Laporan Harian Security';

-- ─────────────────────────────────────────────────────────────
-- 2. SHIFT_PERSONEL  (satu row per shift per laporan)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shift_personel (
  id          UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  laporan_id  UUID  NOT NULL REFERENCES laporan(id) ON DELETE CASCADE,

  shift       TEXT  NOT NULL CHECK (shift IN ('Pagi', 'Siang', 'Malam')),
  jam_mulai   TEXT,                  -- '07:00'
  jam_selesai TEXT                   -- '15:00'
);

COMMENT ON TABLE shift_personel IS 'Satu baris per shift dalam laporan; anggota & chief ada di tabel anak';

-- ─────────────────────────────────────────────────────────────
-- 3. ANGGOTA_TUGAS  (anggota yang bertugas per shift)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anggota_tugas (
  id              UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  shift_id        UUID  NOT NULL REFERENCES shift_personel(id) ON DELETE CASCADE,

  urutan          INT   NOT NULL DEFAULT 1,      -- nomor urut tampilan
  nama            TEXT,
  no_hp           TEXT
);

COMMENT ON TABLE anggota_tugas IS 'Anggota security yang bertugas pada sebuah shift';

-- ─────────────────────────────────────────────────────────────
-- 4. CHIEF_CONTROLLER  (chief per shift)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chief_controller (
  id          UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  shift_id    UUID  NOT NULL REFERENCES shift_personel(id) ON DELETE CASCADE,

  urutan      INT   NOT NULL DEFAULT 1,
  nama        TEXT,
  jam_datang  TEXT,
  jam_pulang  TEXT
);

COMMENT ON TABLE chief_controller IS 'Chief controller yang mengawasi sebuah shift';

-- ─────────────────────────────────────────────────────────────
-- 5. ANGGOTA_LIBUR  (anggota yang tidak hadir)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anggota_libur (
  id          UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  laporan_id  UUID  NOT NULL REFERENCES laporan(id) ON DELETE CASCADE,

  urutan      INT   NOT NULL DEFAULT 1,
  nama        TEXT,
  keterangan  TEXT                    -- 'Sakit' | 'Izin' | 'Libur' | …
);

COMMENT ON TABLE anggota_libur IS 'Anggota security yang libur / tidak hadir pada hari laporan';

-- ─────────────────────────────────────────────────────────────
-- 6. CUACA  (kondisi cuaca per shift)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cuaca (
  id          UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  laporan_id  UUID  NOT NULL REFERENCES laporan(id) ON DELETE CASCADE,

  urutan      INT   NOT NULL DEFAULT 1,
  shift       TEXT  CHECK (shift IN ('Pagi', 'Siang', 'Malam')),
  jam_mulai   TEXT,
  jam_selesai TEXT,
  kondisi     TEXT  DEFAULT 'Tidak Hujan'
              CHECK (kondisi IN ('Tidak Hujan', 'Hujan Ringan', 'Hujan Sedang', 'Hujan Lebat')),
  suhu        TEXT,                   -- misal '35' (°C)
  keterangan  TEXT
);

COMMENT ON TABLE cuaca IS 'Kondisi cuaca yang dicatat per shift dalam laporan';

-- ─────────────────────────────────────────────────────────────
-- 7. PATROLI  (catatan patroli / aktivitas operasional)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patroli (
  id                  UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  laporan_id          UUID  NOT NULL REFERENCES laporan(id) ON DELETE CASCADE,

  urutan              INT   NOT NULL DEFAULT 1,
  pelapor             TEXT,
  jam                 TEXT,                         -- jam patroli, mis. '08:00'
  jumlah_personil     TEXT  DEFAULT '2',
  obyek               TEXT  DEFAULT 'Area kantor dan lahan',
  temuan              TEXT  DEFAULT 'Nihil'
                      CHECK (temuan IN ('Nihil', 'Ada temuan')),
  catatan_temuan      TEXT,
  penanganan_patroli  TEXT
);

COMMENT ON TABLE patroli IS 'Setiap ronde patroli yang dilakukan dalam satu laporan harian';

-- ─────────────────────────────────────────────────────────────
-- 8. KARYAWAN_MASUK  (aktivitas keluar–masuk berbagai kategori)
-- Kategori: 'KBJ' = Karyawan Bayer Juara
--           'KBW' = Karyawan BMW (Bumawa)
--           'MHSW' = Mahasiswa Magang
--           'THL'  = Pekerja THL
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS karyawan_masuk (
  id          UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  laporan_id  UUID  NOT NULL REFERENCES laporan(id) ON DELETE CASCADE,

  kategori    TEXT  NOT NULL
              CHECK (kategori IN ('KBJ', 'KBW', 'MHSW', 'THL')),
  urutan      INT   NOT NULL DEFAULT 1,
  nama        TEXT,
  jam_masuk   TEXT,
  jam_keluar  TEXT
);

COMMENT ON TABLE karyawan_masuk IS 'Data keluar–masuk karyawan / magang / THL per laporan';

-- ─────────────────────────────────────────────────────────────
-- 9. TAMU  (tamu yang berkunjung)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tamu (
  id          UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  laporan_id  UUID  NOT NULL REFERENCES laporan(id) ON DELETE CASCADE,

  urutan      INT   NOT NULL DEFAULT 1,
  nama        TEXT,
  instansi    TEXT,                   -- instansi / keperluan tamu
  jam_masuk   TEXT,
  jam_keluar  TEXT
);

COMMENT ON TABLE tamu IS 'Data tamu yang berkunjung ke Bayer Juara pada hari laporan';

-- ─────────────────────────────────────────────────────────────
-- 10. TEMUAN  (kejadian / temuan yang dicatat)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS temuan (
  id          UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  laporan_id  UUID  NOT NULL REFERENCES laporan(id) ON DELETE CASCADE,

  urutan      INT   NOT NULL DEFAULT 1,
  waktu       TEXT,                   -- 'HH:MM'
  pelapor     TEXT,
  kronologis  TEXT
);

COMMENT ON TABLE temuan IS 'Temuan / kejadian yang dicatat dalam laporan harian';

-- ─────────────────────────────────────────────────────────────
-- 11. KV_STORE  (key-value store yang sudah ada di proyek ini)
-- Tabel ini dipakai oleh api.ts saat ini untuk menyimpan
-- seluruh laporan sebagai JSON blob. Dipertahankan agar
-- backward-compatible dengan kode yang ada.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kv_store_60b930c2 (
  key    TEXT  PRIMARY KEY,
  value  JSONB NOT NULL DEFAULT '[]'::jsonb
);

COMMENT ON TABLE kv_store_60b930c2
  IS 'Key-value store legacy; dipakai api.ts untuk menyimpan riwayat laporan sebagai JSONB array';

-- ─────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_laporan_tanggal       ON laporan          (tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_shift_personel_laporan ON shift_personel  (laporan_id);
CREATE INDEX IF NOT EXISTS idx_anggota_tugas_shift    ON anggota_tugas   (shift_id);
CREATE INDEX IF NOT EXISTS idx_chief_shift            ON chief_controller (shift_id);
CREATE INDEX IF NOT EXISTS idx_anggota_libur_laporan  ON anggota_libur   (laporan_id);
CREATE INDEX IF NOT EXISTS idx_cuaca_laporan          ON cuaca           (laporan_id);
CREATE INDEX IF NOT EXISTS idx_patroli_laporan        ON patroli         (laporan_id);
CREATE INDEX IF NOT EXISTS idx_karyawan_laporan       ON karyawan_masuk  (laporan_id);
CREATE INDEX IF NOT EXISTS idx_karyawan_kategori      ON karyawan_masuk  (laporan_id, kategori);
CREATE INDEX IF NOT EXISTS idx_tamu_laporan           ON tamu            (laporan_id);
CREATE INDEX IF NOT EXISTS idx_temuan_laporan         ON temuan          (laporan_id);

-- ─────────────────────────────────────────────────────────────
-- AUTO-UPDATE updated_at TRIGGER
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_laporan_updated_at ON laporan;
CREATE TRIGGER trg_laporan_updated_at
  BEFORE UPDATE ON laporan
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- Supabase requires RLS to be enabled. The anon key is used
-- by the frontend, so we allow full access for now.
-- Tighten these policies if you add authentication.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE laporan           ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_personel    ENABLE ROW LEVEL SECURITY;
ALTER TABLE anggota_tugas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chief_controller  ENABLE ROW LEVEL SECURITY;
ALTER TABLE anggota_libur     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuaca              ENABLE ROW LEVEL SECURITY;
ALTER TABLE patroli            ENABLE ROW LEVEL SECURITY;
ALTER TABLE karyawan_masuk     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tamu               ENABLE ROW LEVEL SECURITY;
ALTER TABLE temuan             ENABLE ROW LEVEL SECURITY;
ALTER TABLE kv_store_60b930c2  ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read & write (public app, no login required)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'laporan','shift_personel','anggota_tugas','chief_controller',
    'anggota_libur','cuaca','patroli','karyawan_masuk','tamu',
    'temuan','kv_store_60b930c2'
  ]
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS allow_all ON %I;
       CREATE POLICY allow_all ON %I FOR ALL TO anon USING (true) WITH CHECK (true);',
      tbl, tbl
    );
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- USEFUL VIEWS
-- ─────────────────────────────────────────────────────────────

-- Ringkasan laporan (untuk daftar riwayat)
CREATE OR REPLACE VIEW v_laporan_ringkasan AS
SELECT
  l.id,
  l.saved_at,
  l.lokasi,
  l.client,
  l.hari,
  l.tanggal,
  l.shift,
  l.pimpinan_hadir,
  l.pimpinan_nama,
  COUNT(DISTINCT sp.id)  AS jumlah_shift,
  COUNT(DISTINCT at2.id) AS jumlah_anggota,
  COUNT(DISTINCT al.id)  AS jumlah_libur,
  COUNT(DISTINCT p.id)   AS jumlah_patroli,
  COUNT(DISTINCT km.id)  AS jumlah_karyawan,
  COUNT(DISTINCT t.id)   AS jumlah_tamu,
  COUNT(DISTINCT tm.id)  AS jumlah_temuan
FROM laporan l
LEFT JOIN shift_personel sp ON sp.laporan_id = l.id
LEFT JOIN anggota_tugas  at2 ON at2.shift_id = sp.id
LEFT JOIN anggota_libur  al  ON al.laporan_id = l.id
LEFT JOIN patroli        p   ON p.laporan_id  = l.id
LEFT JOIN karyawan_masuk km  ON km.laporan_id = l.id
LEFT JOIN tamu           t   ON t.laporan_id  = l.id
LEFT JOIN temuan         tm  ON tm.laporan_id = l.id
GROUP BY l.id;

COMMENT ON VIEW v_laporan_ringkasan
  IS 'Ringkasan per laporan: jumlah shift, anggota, patroli, tamu, dan temuan';
