import crypto from "node:crypto";
import { Router } from "express";
import { supabase } from "../db.js";
import { config } from "../config.js";
import { clickEnabled, fulfillOrder, paymeEnabled, revertOrder } from "../billing.js";
import { isUuid } from "../util.js";

export const payments = Router();

/* ==================================================================== */
/*  PAYME (Merchant API, JSON-RPC)                                       */
/*  Payme kabinetida "Endpoint URL": https://SAYT/api/payments/payme     */
/* ==================================================================== */
const PAYME_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 soat ichida bajarilmasa tranzaksiya bekor bo'ladi

const T = (uz, ru, en) => ({ uz, ru, en });

class RpcError extends Error {
  constructor(code, message, data) {
    super(message.en);
    this.code = code;
    this.msg = message;
    this.data = data;
  }
}

const E = {
  auth: () => new RpcError(-32504, T("Ruxsat yo'q", "Недостаточно привилегий для выполнения метода", "Insufficient privilege to perform this method")),
  method: () => new RpcError(-32601, T("Metod topilmadi", "Метод не найден", "Method not found")),
  wrongAmount: () => new RpcError(-31001, T("Noto'g'ri summa", "Неверная сумма", "Wrong amount")),
  txNotFound: () => new RpcError(-31003, T("Tranzaksiya topilmadi", "Транзакция не найдена", "Transaction not found")),
  cantPerform: () => new RpcError(-31008, T("Amalni bajarib bo'lmaydi", "Невозможно выполнить операцию", "Unable to perform operation")),
  orderNotFound: () => new RpcError(-31050, T("Buyurtma topilmadi", "Заказ не найден", "Order not found"), "order_id"),
  orderClosed: () => new RpcError(-31051, T("Buyurtma to'langan yoki bekor qilingan", "Заказ оплачен или отменён", "Order is already paid or cancelled"), "order_id"),
  orderBusy: () => new RpcError(-31099, T("Buyurtma uchun boshqa tranzaksiya mavjud", "Для заказа есть другая транзакция", "Another transaction exists for this order"), "order_id"),
};

function paymeAuthorized(req) {
  if (!paymeEnabled()) return false;
  const expected = Buffer.from(Buffer.from(`Paycom:${config.payme.key}`).toString("base64"));
  const given = Buffer.from((req.headers.authorization ?? "").replace(/^Basic\s+/i, "").trim());
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

async function findOrder(account) {
  const id = account?.order_id;
  if (!isUuid(id)) throw E.orderNotFound();
  const { data, error } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw E.orderNotFound();
  return data;
}

function checkOrder(order, amount) {
  if (Number(amount) !== order.amount_uzs * 100) throw E.wrongAmount();
  if (order.status !== "new") throw E.orderClosed();
}

async function getTx(providerTransId) {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("provider", "payme")
    .eq("provider_trans_id", String(providerTransId))
    .maybeSingle();
  if (error) throw error;
  return data;
}

const txState = (tx) => ({
  create_time: tx.create_time,
  perform_time: tx.perform_time,
  cancel_time: tx.cancel_time,
  transaction: tx.id,
  state: tx.state,
  reason: tx.reason ?? null,
});

const timedOut = (tx) => Date.now() - tx.create_time > PAYME_TIMEOUT_MS;

async function cancelPending(tx, reason) {
  await supabase.from("payments").update({ state: -1, cancel_time: Date.now(), reason }).eq("id", tx.id).eq("state", 1);
}

const PAYME_METHODS = {
  async CheckPerformTransaction({ amount, account }) {
    checkOrder(await findOrder(account), amount);
    return { allow: true };
  },

  async CreateTransaction({ id, time, amount, account }) {
    const existing = await getTx(id);
    if (existing) {
      if (existing.state !== 1) throw E.cantPerform();
      if (timedOut(existing)) {
        await cancelPending(existing, 4);
        throw E.cantPerform();
      }
      return { create_time: existing.create_time, transaction: existing.id, state: 1 };
    }

    const order = await findOrder(account);
    checkOrder(order, amount);

    const busy = await supabase.from("payments").select("id").eq("order_id", order.id).in("state", [1, 2]).limit(1);
    if (busy.error) throw busy.error;
    if (busy.data.length) throw E.orderBusy();

    const now = Date.now();
    const { data, error } = await supabase
      .from("payments")
      .insert({ order_id: order.id, provider: "payme", provider_trans_id: String(id), state: 1, amount_tiyin: amount, provider_time: time, create_time: now })
      .select()
      .single();
    if (error) {
      // Bir vaqtda kelgan takroriy so'rov: mavjudini qaytaramiz
      const again = await getTx(id);
      if (again?.state === 1) return { create_time: again.create_time, transaction: again.id, state: 1 };
      throw error;
    }
    return { create_time: data.create_time, transaction: data.id, state: 1 };
  },

  async PerformTransaction({ id }) {
    const tx = await getTx(id);
    if (!tx) throw E.txNotFound();
    if (tx.state === 2) return { transaction: tx.id, perform_time: tx.perform_time, state: 2 };
    if (tx.state !== 1) throw E.cantPerform();
    if (timedOut(tx)) {
      await cancelPending(tx, 4);
      throw E.cantPerform();
    }

    const performed = await supabase
      .from("payments")
      .update({ state: 2, perform_time: Date.now() })
      .eq("id", tx.id)
      .eq("state", 1)
      .select()
      .maybeSingle();
    if (performed.error) throw performed.error;
    if (performed.data) await fulfillOrder(tx.order_id);

    const current = performed.data ?? (await getTx(id));
    return { transaction: current.id, perform_time: current.perform_time, state: current.state };
  },

  async CancelTransaction({ id, reason }) {
    const tx = await getTx(id);
    if (!tx) throw E.txNotFound();

    if (tx.state === 1) {
      const cancelled = await supabase
        .from("payments")
        .update({ state: -1, cancel_time: Date.now(), reason })
        .eq("id", tx.id)
        .eq("state", 1)
        .select()
        .maybeSingle();
      if (cancelled.error) throw cancelled.error;
      const cur = cancelled.data ?? (await getTx(id));
      return { transaction: cur.id, cancel_time: cur.cancel_time, state: cur.state };
    }

    if (tx.state === 2) {
      // Bajarilgan to'lov qaytariladi: Pro kunlari ayiriladi
      const refunded = await supabase
        .from("payments")
        .update({ state: -2, cancel_time: Date.now(), reason })
        .eq("id", tx.id)
        .eq("state", 2)
        .select()
        .maybeSingle();
      if (refunded.error) throw refunded.error;
      if (refunded.data) await revertOrder(tx.order_id);
      const cur = refunded.data ?? (await getTx(id));
      return { transaction: cur.id, cancel_time: cur.cancel_time, state: cur.state };
    }

    return { transaction: tx.id, cancel_time: tx.cancel_time, state: tx.state };
  },

  async CheckTransaction({ id }) {
    const tx = await getTx(id);
    if (!tx) throw E.txNotFound();
    return txState(tx);
  },

  async GetStatement({ from, to }) {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("provider", "payme")
      .gte("provider_time", from)
      .lte("provider_time", to)
      .order("provider_time", { ascending: true });
    if (error) throw error;
    return {
      transactions: data.map((tx) => ({
        id: tx.provider_trans_id,
        time: tx.provider_time,
        amount: tx.amount_tiyin,
        account: { order_id: tx.order_id },
        ...txState(tx),
      })),
    };
  },
};

payments.post("/payments/payme", async (req, res) => {
  const { id = null, method, params } = req.body ?? {};
  try {
    if (!paymeAuthorized(req)) throw E.auth();
    const handler = Object.hasOwn(PAYME_METHODS, method) ? PAYME_METHODS[method] : null;
    if (!handler) throw E.method();
    res.json({ result: await handler(params ?? {}), id });
  } catch (err) {
    if (err instanceof RpcError) return res.json({ error: { code: err.code, message: err.msg, data: err.data }, id });
    throw err;
  }
});

/* ==================================================================== */
/*  CLICK (Shop API: prepare va complete)                                */
/*  Click kabinetida:                                                    */
/*    Prepare URL:  https://SAYT/api/payments/click/prepare              */
/*    Complete URL: https://SAYT/api/payments/click/complete             */
/* ==================================================================== */
const md5 = (text) => crypto.createHash("md5").update(text).digest("hex");

const CLICK_ERRORS = {
  sign: { error: -1, error_note: "SIGN CHECK FAILED!" },
  amount: { error: -2, error_note: "Incorrect parameter amount" },
  action: { error: -3, error_note: "Action not found" },
  paid: { error: -4, error_note: "Already paid" },
  noOrder: { error: -5, error_note: "User does not exist" },
  noTx: { error: -6, error_note: "Transaction does not exist" },
  cancelled: { error: -9, error_note: "Transaction cancelled" },
  request: { error: -8, error_note: "Error in request from click" },
};

function clickSignOk(p, withPrepareId) {
  const parts = [p.click_trans_id, p.service_id, config.click.secretKey, p.merchant_trans_id];
  if (withPrepareId) parts.push(p.merchant_prepare_id);
  parts.push(p.amount, p.action, p.sign_time);
  return typeof p.sign_string === "string" && md5(parts.join("")) === p.sign_string.toLowerCase();
}

const clickBase = (p) => ({ click_trans_id: p.click_trans_id, merchant_trans_id: p.merchant_trans_id });

payments.post("/payments/click/prepare", async (req, res) => {
  const p = req.body ?? {};
  const base = clickBase(p);
  if (!clickEnabled() || String(p.service_id) !== config.click.serviceId) return res.json({ ...base, ...CLICK_ERRORS.request });
  if (!clickSignOk(p, false)) return res.json({ ...base, ...CLICK_ERRORS.sign });
  if (String(p.action) !== "0") return res.json({ ...base, ...CLICK_ERRORS.action });
  if (!isUuid(p.merchant_trans_id)) return res.json({ ...base, ...CLICK_ERRORS.noOrder });

  const { data: order, error } = await supabase.from("orders").select("*").eq("id", p.merchant_trans_id).maybeSingle();
  if (error) throw error;
  if (!order) return res.json({ ...base, ...CLICK_ERRORS.noOrder });
  if (order.status === "paid") return res.json({ ...base, ...CLICK_ERRORS.paid });
  if (order.status === "cancelled") return res.json({ ...base, ...CLICK_ERRORS.cancelled });
  if (Number(p.amount) !== order.amount_uzs) return res.json({ ...base, ...CLICK_ERRORS.amount });

  // Takroriy prepare: avvalgisini qaytaramiz
  const existing = await supabase.from("payments").select("*").eq("provider", "click").eq("provider_trans_id", String(p.click_trans_id)).maybeSingle();
  if (existing.error) throw existing.error;
  let tx = existing.data;
  if (tx && tx.state === -1) return res.json({ ...base, ...CLICK_ERRORS.cancelled });

  if (!tx) {
    const now = Date.now();
    const created = await supabase
      .from("payments")
      .insert({ order_id: order.id, provider: "click", provider_trans_id: String(p.click_trans_id), state: 1, amount_tiyin: order.amount_uzs * 100, provider_time: now, create_time: now })
      .select()
      .single();
    if (created.error) throw created.error;
    tx = created.data;
  }
  res.json({ ...base, merchant_prepare_id: Number(tx.seq), error: 0, error_note: "Success" });
});

payments.post("/payments/click/complete", async (req, res) => {
  const p = req.body ?? {};
  const base = clickBase(p);
  if (!clickEnabled() || String(p.service_id) !== config.click.serviceId) return res.json({ ...base, ...CLICK_ERRORS.request });
  if (!clickSignOk(p, true)) return res.json({ ...base, ...CLICK_ERRORS.sign });
  if (String(p.action) !== "1") return res.json({ ...base, ...CLICK_ERRORS.action });
  if (!isUuid(p.merchant_trans_id)) return res.json({ ...base, ...CLICK_ERRORS.noOrder });

  const found = await supabase.from("payments").select("*, order:orders(*)").eq("provider", "click").eq("seq", Number(p.merchant_prepare_id)).maybeSingle();
  if (found.error) throw found.error;
  const tx = found.data;
  if (!tx || tx.order_id !== p.merchant_trans_id) return res.json({ ...base, ...CLICK_ERRORS.noTx });
  if (tx.state === 2) return res.json({ ...base, ...CLICK_ERRORS.paid });
  if (tx.state < 0) return res.json({ ...base, ...CLICK_ERRORS.cancelled });
  if (Number(p.amount) !== tx.order.amount_uzs) return res.json({ ...base, ...CLICK_ERRORS.amount });

  // Click to'lovni bajara olmagan bo'lsa (error < 0), tranzaksiyani bekor qilamiz
  if (Number(p.error) < 0) {
    await supabase.from("payments").update({ state: -1, cancel_time: Date.now(), reason: Number(p.error) }).eq("id", tx.id).eq("state", 1);
    return res.json({ ...base, ...CLICK_ERRORS.cancelled });
  }

  const done = await supabase
    .from("payments")
    .update({ state: 2, perform_time: Date.now() })
    .eq("id", tx.id)
    .eq("state", 1)
    .select()
    .maybeSingle();
  if (done.error) throw done.error;
  if (!done.data) return res.json({ ...base, ...CLICK_ERRORS.paid });

  await fulfillOrder(tx.order_id);
  res.json({ ...base, merchant_confirm_id: Number(tx.seq), error: 0, error_note: "Success" });
});
