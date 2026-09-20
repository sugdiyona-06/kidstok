import { Router } from "express";
import { supabase } from "../db.js";
import { config } from "../config.js";
import { requireAuth } from "../auth.js";
import { HttpError, int, isUuid } from "../util.js";
import { PLANS, clickEnabled, clickUrl, paymeEnabled, paymeUrl } from "../billing.js";

export const orders = Router();

// Obuna rejalari va qaysi to'lov usullari yoqilgani (ochiq)
orders.get("/plans", (_req, res) => {
  res.json({ plans: PLANS, providers: { payme: paymeEnabled(), click: clickEnabled() }, contactUrl: config.proContactUrl });
});

orders.post("/orders", requireAuth, async (req, res) => {
  const plan = PLANS.find((p) => p.days === int(req.body?.plan_days));
  if (!plan) throw new HttpError(400, "Obuna rejasi noto'g'ri");

  const provider = req.body?.provider;
  if (provider === "payme" && !paymeEnabled()) throw new HttpError(400, "Payme hozircha ulanmagan");
  if (provider === "click" && !clickEnabled()) throw new HttpError(400, "Click hozircha ulanmagan");
  if (provider !== "payme" && provider !== "click") throw new HttpError(400, "To'lov usulini tanlang");

  // Suiiste'molga qarshi: bir soatda 10 tadan ko'p buyurtma yaratib bo'lmaydi
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const recent = await supabase.from("orders").select("*", { count: "exact", head: true }).eq("parent_id", req.user.id).gte("created_at", since);
  if ((recent.count ?? 0) >= 10) throw new HttpError(429, "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring");

  const { data: order, error } = await supabase.from("orders").insert({ parent_id: req.user.id, plan_days: plan.days, amount_uzs: plan.price }).select().single();
  if (error) throw error;

  const base = config.siteUrl || `${req.protocol}://${req.get("host")}`;
  const returnUrl = `${base}/pro?order=${order.id}`;
  res.status(201).json({
    order_id: order.id,
    amount_uzs: order.amount_uzs,
    pay_url: provider === "payme" ? paymeUrl(order, returnUrl) : clickUrl(order, returnUrl),
  });
});

// To'lovdan qaytgach sahifa buyurtma holatini shu yerdan tekshiradi
orders.get("/orders/:id", requireAuth, async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, "Buyurtma topilmadi");
  const { data, error } = await supabase.from("orders").select("id, status, plan_days, amount_uzs").eq("id", req.params.id).eq("parent_id", req.user.id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Buyurtma topilmadi");
  res.json(data);
});
