import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

// Service role kaliti RLS'ni chetlab o'tadi, shuning uchun u faqat serverda ishlatiladi.
export const supabase = createClient(config.supabaseUrl, config.serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
