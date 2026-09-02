import { createClient } from "@supabase/supabase-js";

const PROJECT_ID = "gausloelinoodcppxbpa";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhdXNsb2VsaW5vb2RjcHB4YnBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMjczNDUsImV4cCI6MjEwMDgwMzM0NX0.D5YMln-BAxK69ttbzEmzJFAgs1J3fveBexonGpuz7KY";
const TABLE = "kv_store_60b930c2";
const MASTER_THL_KEY = "master_thl_names";

const DEFAULT_THL_NAMES = [
  "Nur Hayadi", "Sri Tukul", "Wiyanto", "Umar Marjuki", "Ubayah Muhammadi",
  "Asat Thohir", "Aditya Admana", "Sugeng Purwanto", "Fahrizal FH", "Sadewa",
  "Ragil Imam Waluyo", "Sri Maryanto", "Abdul Anggit M", "Kasmi", "Sapriyah",
  "Jumadi", "Erni Widayanti", "Kurhan Muhksinin", "Galuh Hismawah", "Rizal Bagus Sasongko",
  "Abid Dhaifullah", "Ramadhon", "Wahyu Hidayat", "Ihksan Fakih", "Riyan",
  "Nasrul Syarifudin", "Safakur Usman Ridho", "Ervan Bagus Haryadi", "Sigit Budi Santoso",
  "Andika Indra Tyasa", "Joko Wiyono", "Oky Sujatmiko", "Afrizal Rehan Kurnianto", "Dimas Hermawan",
];

const supabase = createClient(`https://${PROJECT_ID}.supabase.co`, ANON_KEY);

async function seed() {
  console.log("Seeding master THL names to Supabase...");
  const { data, error } = await supabase
    .from(TABLE)
    .upsert({ key: MASTER_THL_KEY, value: DEFAULT_THL_NAMES });

  if (error) {
    console.error("Error seeding to Supabase:", error.message);
    process.exit(1);
  }

  console.log("Successfully seeded 34 THL master names to Supabase!");
  
  // Verify
  const { data: fetched, error: fetchErr } = await supabase
    .from(TABLE)
    .select("value")
    .eq("key", MASTER_THL_KEY)
    .single();

  if (fetchErr) {
    console.error("Verification failed:", fetchErr.message);
  } else {
    console.log("Verified! Data in Supabase count:", fetched.value?.length);
  }
}

seed();
