import { $, getSupabase, mountChrome } from "./core.js";

mountChrome("profile");

const form = $("#reset-form");
const errorBox = $("#reset-error");
const noteBox = $("#reset-note");

const sb = await getSupabase();
// Havoladagi maxfiy kalitni supabase-js o'zi o'qib, vaqtinchalik sessiya yaratadi
const { data } = await sb.auth.getSession();

if (data.session) form.hidden = false;
else $("#reset-invalid").hidden = false;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  const password = $("#new-password").value;
  if (password !== $("#new-password2").value) {
    errorBox.textContent = "Parollar bir xil emas";
    errorBox.hidden = false;
    return;
  }
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  const { error } = await sb.auth.updateUser({ password });
  if (error) {
    errorBox.textContent = /same|different/i.test(error.message) ? "Yangi parol eskisidan farq qilishi kerak" : "Parolni saqlab bo'lmadi. Havola eskirgan bo'lishi mumkin.";
    errorBox.hidden = false;
    button.disabled = false;
    return;
  }
  form.hidden = true;
  noteBox.textContent = "Parol yangilandi. Profilga o'tkazilyapsiz...";
  noteBox.hidden = false;
  setTimeout(() => (location.href = "/profile"), 1500);
});
