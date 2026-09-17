import "./style.css";
import { startGoldField } from "./gold.js";
import { createTracker } from "./metrics.js";

const form = document.querySelector("#lead-form");
const success = document.querySelector("#success");
const errorBox = document.querySelector("#form-error");
const serviceSelect = document.querySelector("#service-select");
const budgetSlider = document.querySelector("#budget-slider");
const budgetValue = document.querySelector("#budget-value");
const tracker = createTracker();
const catalog = [];

startGoldField(document.querySelector("#gold-field"));

function money(n) {
  return new Intl.NumberFormat("ru-RU").format(n) + " ₽";
}

function parseBound(raw, fallback) {
  const text = String(raw ?? "").replace(/\s/g, "").toLowerCase();
  if (!text) return fallback;
  if (text.endsWith("к") || text.endsWith("k")) return Math.round(parseFloat(text) * 1000) || fallback;
  if (text.endsWith("м") || text.endsWith("m")) return Math.round(parseFloat(text) * 1_000_000) || fallback;
  const n = Number(text.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function serviceName(item) {
  if (typeof item === "string") return item;
  return item?.name || item?.title || item?.code || "Услуга";
}

function bindChips(root, hiddenName) {
  root.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      root.querySelectorAll(".chip").forEach((el) => el.classList.remove("is-on"));
      chip.classList.add("is-on");
      form.elements[hiddenName].value = chip.dataset.value;
    });
  });
}

function renderProducts(rows) {
  catalog.length = 0;
  serviceSelect.innerHTML = '<option value="">Выберите услугу</option>';
  rows.forEach((row) => {
    const names = (row.services || []).map(serviceName).filter(Boolean);
    const name = names[0] || `Услуга #${row.id}`;
    catalog.push({
      name,
      min: row.budget_min,
      max: row.budget_max,
    });
    const option = document.createElement("option");
    option.value = name;
    option.textContent = `${name} · ${row.budget_min}–${row.budget_max}`;
    serviceSelect.append(option);
  });
}

function setupBudget(minRaw, maxRaw) {
  const min = parseBound(minRaw, 100000);
  const max = Math.max(parseBound(maxRaw, 10_000_000), min + 1);
  const mid = Math.round((min + max) / 2);
  budgetSlider.min = String(min);
  budgetSlider.max = String(max);
  budgetSlider.step = String(Math.max(1000, Math.round((max - min) / 100)));
  budgetSlider.value = String(mid);
  document.querySelector("#budget-min-label").textContent = money(min);
  document.querySelector("#budget-max-label").textContent = money(max);
  budgetValue.textContent = money(mid);
}

budgetSlider.addEventListener("input", () => {
  budgetValue.textContent = money(Number(budgetSlider.value));
});

bindChips(document.querySelector('[data-name="role"]'), "role");
bindChips(document.querySelector('[data-name="preferred_contact"]'), "preferred_contact");

async function loadAdmin() {
  try {
    const res = await fetch("/api/admin");
    if (!res.ok) throw new Error("admin");
    const rows = await res.json();
    renderProducts(Array.isArray(rows) ? rows : []);
    setupBudget("15000", "150000");
  } catch {
    renderProducts([]);
    setupBudget("100000", "10000000");
  }
}

serviceSelect.addEventListener("change", () => {
  const item = catalog.find((entry) => entry.name === serviceSelect.value);
  if (item) setupBudget(item.min, item.max);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  const payload = Object.fromEntries(new FormData(form).entries());
  if (!payload.phone && !payload.email) {
    errorBox.hidden = false;
    errorBox.textContent = "Укажите телефон или email.";
    return;
  }
  if (!payload.role) payload.role = "";
  payload.metrics = tracker.snapshot();

  const button = form.querySelector(".submit");
  button.disabled = true;
  try {
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || "Не удалось отправить заявку.");
    }
    const created = await res.json();
    form.hidden = true;
    success.hidden = false;
    document.querySelector("#lead-id").textContent = created.lead?.id ?? "—";
  } catch (err) {
    errorBox.hidden = false;
    errorBox.textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

loadAdmin();
