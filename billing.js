import { supabase } from "./db.js";
import { config } from "./config.js";

export const PLAN_LABELS = { 30: "1 oy", 90: "3 oy", 365: "1 yil" };
export const PLANS = Object.keys(PLAN_LABELS).map((days) => ({
  days: Number(days),
  label: PLAN_LABELS[days],
  price: config.prices[days],
}));

export const paymeEnabled = () => Boolean(config.payme.merchantId && config.payme.key);
export const clickEnabled = () => Boolean(config.click.serviceId && config.click.merchantId && config.click.secretKey);

/** Payme to'lov havolasi (summa tiyinda) */
export function paymeUrl(order, returnUrl) {
  const params = [
    `m=${config.payme.merchantId}`,
    `ac.order_id=${order.id}`,
    `a=${order.amount_uzs * 100}`,
    "l=uz",
    `c=${returnUrl}`,
  ].join(";");
  const host = config.payme.test ? "https://test.paycom.uz" : "https://checkout.paycom.uz";
  return `${host}/${Buffer.from(params).toString("base64")}`;
}

/** Click to'lov havolasi (summa so'mda) */
export function clickUrl(order, returnUrl) {
  const query = new URLSearchParams({
    service_id: config.click.serviceId,
    merchant_id: config.click.merchantId,
    amount: String(order.amount_uzs),
    transaction_param: order.id,
    return_url: returnUrl,
  });
  return `https://my.click.uz/services/pay?${query}`;
}

/**
 * To'lov muvaffaqiyatli bo'lganda: buyurtmani "to'langan" qilib, Pro kunlarini qo'shadi.
 * Faqat bir marta ishlaydi (takroriy chaqiruvda hech narsa qilmaydi).
 */
export async function fulfillOrder(orderId) {
  const { data: order, error } = await supabase
    .from("orders")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "new")
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;

  const days = await supabase.rpc("extend_pro", { p_parent: order.parent_id, p_days: order.plan_days });
  if (days.error) throw days.error;
  return order;
}

/** To'lov bekor qilinganda (qaytarilganda) Pro kunlarini ayiradi. */
export async function revertOrder(orderId) {
  const { data: order, error } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .eq("status", "paid")
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;

  const days = await supabase.rpc("extend_pro", { p_parent: order.parent_id, p_days: -order.plan_days });
  if (days.error) throw days.error;
  return order;
}
