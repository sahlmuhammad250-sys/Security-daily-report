import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";

const app = new Hono();
const KV_KEY = "laporan_harian_security";

app.use('*', logger(console.log));
app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
}));

app.get("/make-server-60b930c2/health", (c) => c.json({ status: "ok" }));

// GET semua laporan
app.get("/make-server-60b930c2/laporan", async (c) => {
  try {
    const data = await kv.get(KV_KEY);
    return c.json({ laporan: data ?? [] });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// POST simpan laporan baru
app.post("/make-server-60b930c2/laporan", async (c) => {
  try {
    const body = await c.req.json();
    const existing: any[] = (await kv.get(KV_KEY)) ?? [];
    const newItem = {
      id: body.id ?? Date.now().toString(),
      savedAt: body.savedAt ?? new Date().toISOString(),
      data: body.data,
    };
    const updated = [...existing, newItem];
    await kv.set(KV_KEY, updated);
    return c.json({ success: true, item: newItem });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// DELETE satu laporan berdasarkan id
app.delete("/make-server-60b930c2/laporan/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const existing: any[] = (await kv.get(KV_KEY)) ?? [];
    const updated = existing.filter((x: any) => x.id !== id);
    await kv.set(KV_KEY, updated);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// DELETE semua laporan
app.delete("/make-server-60b930c2/laporan", async (c) => {
  try {
    await kv.set(KV_KEY, []);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

Deno.serve(app.fetch);
