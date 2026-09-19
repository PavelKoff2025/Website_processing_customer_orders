import "./style.css";
import { startGoldField } from "./gold.js";
import { collectHeatPoints, drawHeatmap, formatDuration, loadBehaviorMetrics, periodStats } from "./stats.js";
import {
  loadApplications,
  money,
  queueStats,
  rankApplications,
} from "./applications.js";

const TOKEN_KEY = "autello.admin.token";

const authView = document.querySelector("#auth-view");
const panelView = document.querySelector("#panel-view");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");
const registerBtn = document.querySelector("#register-btn");
const loginBtn = document.querySelector("#login-btn");
const logoutBtn = document.querySelector("#logout-btn");
const headerNote = document.querySelector("#header-note");
const adminHello = document.querySelector("#admin-hello");

startGoldField(document.querySelector("#gold-field"));

function token() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setToken(value) {
  if (value) localStorage.setItem(TOKEN_KEY, value);
  else localStorage.removeItem(TOKEN_KEY);
}

function apiError(body, fallback) {
  const detail = body?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  return fallback;
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const jwt = token();
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(path, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && jwt && path !== "/api/auth/login") {
    setToken("");
    showAuth();
  }
  if (!res.ok) {
    throw new Error(apiError(body, `Ошибка ${res.status}`));
  }
  return body;
}

function showError(node, message) {
  if (!node) return;
  node.hidden = !message;
  node.textContent = message || "";
}

function showAuth() {
  authView.hidden = false;
  panelView.hidden = true;
  headerNote.textContent = "Admin";
}

function showPanel(admin) {
  authView.hidden = true;
  panelView.hidden = false;
  headerNote.textContent = admin.login;
  adminHello.textContent = admin.login;
}

function fmtDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function serviceName(item) {
  if (typeof item === "string") return item;
  return item?.name || item?.title || item?.code || "Услуга";
}

async function refreshRegisterButton() {
  try {
    const status = await api("/api/auth/check");
    registerBtn.hidden = Boolean(status.has_admins || status.exists);
  } catch {
    registerBtn.hidden = true;
  }
}

async function submitAuth(mode) {
  showError(authError, "");
  const login = document.querySelector("#auth-login").value;
  const password = document.querySelector("#auth-password").value;
  const path = mode === "register" ? "/api/auth/register" : "/api/auth/login";
  const button = mode === "register" ? registerBtn : loginBtn;
  button.disabled = true;
  try {
    const data = await api(path, {
      method: "POST",
      body: JSON.stringify({ login, password }),
    });
    setToken(data.access_token);
    await enterPanel(data.admin);
  } catch (err) {
    showError(authError, err.message);
  } finally {
    button.disabled = false;
  }
}

authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitAuth("login");
});

registerBtn.addEventListener("click", () => {
  submitAuth("register");
});

logoutBtn.addEventListener("click", () => {
  setToken("");
  showAuth();
  refreshRegisterButton();
});

const statsModal = document.querySelector("#stats-modal");
const statsError = document.querySelector("#stats-error");
const heatmapCanvas = document.querySelector("#heatmap-canvas");
const heatmapEmpty = document.querySelector("#heatmap-empty");
let heatPoints = [];
let heatRedraw = null;

function visitWord(count) {
  const n10 = count % 10;
  const n100 = count % 100;
  if (n10 === 1 && n100 !== 11) return "визит";
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return "визита";
  return "визитов";
}

function renderPeriodCards(stats) {
  stats.forEach((item) => {
    const card = document.querySelector(`.stats-card[data-period="${item.id}"]`);
    if (!card) return;
    const avg = card.querySelector(".stats-avg");
    const max = card.querySelector(".stats-max");
    if (!item.count) {
      avg.textContent = "нет визитов";
      max.textContent = "среднее и максимум появятся после визитов на форму";
      return;
    }
    avg.textContent = formatDuration(item.avg);
    max.textContent = `макс. ${formatDuration(item.max)} · ${item.count} ${visitWord(item.count)}`;
  });
}

function paintHeatmap() {
  if (statsModal.hidden || !heatmapCanvas) return;
  drawHeatmap(heatmapCanvas, heatPoints);
}

async function openStats() {
  showError(statsError, "");
  statsModal.hidden = false;
  document.body.style.overflow = "hidden";
  try {
    const rows = await loadBehaviorMetrics(api);
    renderPeriodCards(periodStats(rows));
    heatPoints = collectHeatPoints(rows);
    heatmapEmpty.hidden = heatPoints.length > 0;
    requestAnimationFrame(() => {
      paintHeatmap();
      window.setTimeout(paintHeatmap, 40);
    });
  } catch (err) {
    renderPeriodCards(periodStats([]));
    heatPoints = [];
    heatmapEmpty.hidden = false;
    showError(statsError, err.message);
    requestAnimationFrame(paintHeatmap);
  }
}

function closeStats() {
  statsModal.hidden = true;
  document.body.style.overflow = "";
}

document.querySelector("#stats-open").addEventListener("click", openStats);
document.querySelector("#stats-close").addEventListener("click", closeStats);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !statsModal.hidden) closeStats();
});
window.addEventListener("resize", () => {
  window.clearTimeout(heatRedraw);
  heatRedraw = window.setTimeout(paintHeatmap, 80);
});

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((el) => el.classList.remove("is-on"));
    btn.classList.add("is-on");
    const tab = btn.dataset.tab;
    document.querySelectorAll(".admin-card").forEach((card) => {
      card.hidden = card.id !== `tab-${tab}`;
    });
  });
});

let appsRanked = [];
let appsFilter = "all";
let selectedAppId = null;

function personName(lead) {
  return [lead.last_name, lead.first_name, lead.patronymic].filter(Boolean).join(" ") || "Без имени";
}

function iceTempText(ice) {
  const sign = ice.iceTemp > 0 ? "+" : "";
  return `${sign}${ice.iceTemp}°`;
}

function renderIceStats(stats) {
  const map = {
    total: [
      stats.total,
      stats.avgHeat
        ? `средняя ${stats.avgHeat} · чек ${stats.avgBudget ? money(stats.avgBudget) : "—"}`
        : "в очереди",
    ],
    hot: [stats.hot, "в начало списка"],
    warm: [stats.warm, "обычная очередь"],
    cold: [stats.cold, "вниз списка"],
    vip: [stats.vip, stats.worth ? `${stats.worth} стоит времени` : "нужен именной контакт"],
  };
  Object.entries(map).forEach(([key, [value, note]]) => {
    const card = document.querySelector(`.ice-stat[data-stat="${key}"]`);
    if (!card) return;
    card.querySelector(".ice-stat-value").textContent = String(value);
    card.querySelector(".ice-stat-note").textContent = note;
  });
}

function visibleApps() {
  return appsRanked.filter((item) => {
    if (appsFilter === "all") return true;
    if (appsFilter === "vip") return item.ice.personalManager;
    return item.ice.tier === appsFilter;
  });
}

function renderAppsTable() {
  const tbody = document.querySelector("#leads-table tbody");
  const empty = document.querySelector("#leads-empty");
  const visible = visibleApps();
  tbody.innerHTML = "";
  empty.hidden = visible.length > 0;
  if (!visible.length) {
    empty.textContent = appsRanked.length
      ? "В этом срезе заявок нет."
      : "Заявок пока нет.";
  }
  visible.forEach(({ row: lead, ice }) => {
    const tr = document.createElement("tr");
    tr.dataset.id = String(lead.id);
    if (selectedAppId === lead.id) tr.classList.add("is-on");
    tr.innerHTML = `
      <td>
        <span class="ice-pill" data-tier="${ice.tier}">
          <strong>${escapeHtml(iceTempText(ice))}</strong>
          <span>${escapeHtml(ice.tierLabel)}</span>
        </span>
      </td>
      <td>
        <strong>${escapeHtml(personName(lead))}</strong>
        <span class="cell-sub">${escapeHtml(lead.role || "роль не указана")} · ${escapeHtml(lead.product || "услуга не выбрана")}</span>
      </td>
      <td>
        ${escapeHtml(lead.niche || "ниша не указана")}
        <span class="cell-sub">${escapeHtml(lead.company_size || lead.business_size || "размер не указан")}</span>
      </td>
      <td>
        ${ice.budget ? escapeHtml(money(ice.budget)) : "—"}
        <span class="cell-sub">${escapeHtml(ice.budgetLabel)}</span>
      </td>
      <td>${escapeHtml(lead.result_deadline || ice.deadlineLabel)}</td>
      <td>
        ${escapeHtml(ice.department.name)}
        <span class="cell-sub">${ice.personalManager ? "персональный менеджер" : "общая линия"}</span>
      </td>
      <td>${ice.worthTime ? "брать" : "не брать"}</td>
    `;
    tr.addEventListener("click", () => openLead(lead.id, tr));
    tbody.append(tr);
  });
}

function contactLinks(lead) {
  const links = [];
  if (lead.phone) {
    links.push(`<a class="submit compact" href="tel:${encodeURI(lead.phone)}">Позвонить</a>`);
  }
  if (lead.email) {
    links.push(`<a class="ghost compact" href="mailto:${encodeURI(lead.email)}">Написать на почту</a>`);
  }
  const channel = String(lead.preferred_contact || "").toLowerCase();
  if (channel === "telegram" && lead.phone) {
    const nick = String(lead.phone).replace(/[^\d+]/g, "");
    links.push(`<a class="ghost compact" href="https://t.me/${encodeURIComponent(nick)}" target="_blank" rel="noreferrer">Telegram</a>`);
  }
  if (channel === "whatsapp" && lead.phone) {
    const digits = String(lead.phone).replace(/\D/g, "");
    links.push(`<a class="ghost compact" href="https://wa.me/${encodeURIComponent(digits)}" target="_blank" rel="noreferrer">WhatsApp</a>`);
  }
  return links.join("");
}

async function openLead(id, row) {
  selectedAppId = id;
  document.querySelectorAll("#leads-table tbody tr").forEach((el) => el.classList.remove("is-on"));
  row.classList.add("is-on");
  const item = appsRanked.find((entry) => entry.row.id === id);
  const lead = item?.row || {};
  const ice = item?.ice;
  let metrics = null;
  try {
    const pack = await api(`/api/applications/${id}`);
    metrics = pack.metrics;
  } catch {
    try {
      const pack = await api(`/api/leads/${id}`);
      metrics = pack.metrics;
    } catch {
      metrics = null;
    }
  }
  const details = document.querySelector("#lead-details");
  details.hidden = false;
  if (!ice) {
    details.innerHTML = `<h3>Заявка №${lead.id || id}</h3><p class="muted">Не удалось разобрать заявку.</p>`;
    details.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }
  details.innerHTML = `
    <header class="ice-hero" data-tier="${ice.tier}">
      <p class="ice-temp">${escapeHtml(iceTempText(ice))}</p>
      <div>
        <p class="eyebrow">${escapeHtml(ice.queueLabel)}</p>
        <h3>${escapeHtml(personName(lead))} · заявка №${lead.id}</h3>
        <p class="muted">${escapeHtml(ice.tierLabel)} · ${ice.heat} из 100 · ${escapeHtml(ice.department.name)}</p>
      </div>
    </header>
    <section class="ice-verdicts">
      <article>
        <h4>Тратить время?</h4>
        <p>${escapeHtml(ice.worthLabel)}</p>
        <p class="muted">${escapeHtml(ice.worthWhy)}</p>
      </article>
      <article>
        <h4>Персональный менеджер</h4>
        <p>${escapeHtml(ice.managerLabel)}</p>
        <p class="muted">${escapeHtml(ice.managerWhy)}</p>
      </article>
      <article>
        <h4>Отдел</h4>
        <p>${escapeHtml(ice.department.name)}</p>
        <p class="muted">${escapeHtml(ice.department.why)}</p>
      </article>
    </section>
    <section class="ice-reasons">
      <h4>Почему такой лёд</h4>
      <ul>
        ${ice.reasons.map((reason) => `<li><span>+${reason.points}</span>${escapeHtml(reason.label)}</li>`).join("")}
      </ul>
    </section>
    <dl class="facts">
      <div><dt>Ниша</dt><dd>${escapeHtml(lead.niche || "—")}</dd></div>
      <div><dt>О бизнесе</dt><dd>${escapeHtml(lead.business_info || "—")}</dd></div>
      <div><dt>Компания</dt><dd>${escapeHtml(lead.company_size || "—")}</dd></div>
      <div><dt>Масштаб</dt><dd>${escapeHtml(lead.business_size || "—")}</dd></div>
      <div><dt>Роль</dt><dd>${escapeHtml(lead.role || "—")}</dd></div>
      <div><dt>Услуга</dt><dd>${escapeHtml(lead.product || "—")}</dd></div>
      <div><dt>Тип задачи</dt><dd>${escapeHtml(lead.task_type || "—")}</dd></div>
      <div><dt>Объём задачи</dt><dd>${escapeHtml(lead.task_volume || "—")}</dd></div>
      <div><dt>Объём потребности</dt><dd>${escapeHtml(lead.need_volume || "—")}</dd></div>
      <div><dt>Бюджет</dt><dd>${ice.budget ? escapeHtml(money(ice.budget)) : escapeHtml(lead.budget || "—")} · ${escapeHtml(ice.budgetLabel)}</dd></div>
      <div><dt>Срок</dt><dd>${escapeHtml(lead.result_deadline || "—")} · ${escapeHtml(ice.deadlineLabel)}</dd></div>
      <div><dt>Связь</dt><dd>${escapeHtml(lead.preferred_contact || "—")} · ${escapeHtml(lead.convenient_time || "время не указано")}</dd></div>
      <div><dt>Телефон</dt><dd>${escapeHtml(lead.phone || "—")}</dd></div>
      <div><dt>Email</dt><dd>${escapeHtml(lead.email || "—")}</dd></div>
      <div><dt>Комментарий</dt><dd>${escapeHtml(lead.comments || "—")}</dd></div>
    </dl>
    <div class="contact-bar">${contactLinks(lead) || '<p class="muted">Контакта нет — связаться нельзя.</p>'}</div>
    ${metrics ? `<p class="muted">На странице: ${Number(metrics.time_on_page || 0).toFixed(0)} с · возвратов: ${metrics.return_count || 0}</p>` : ""}
  `;
  details.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function loadLeads() {
  const details = document.querySelector("#lead-details");
  const errorNode = document.querySelector("#apps-error");
  showError(errorNode, "");
  try {
    const rows = await loadApplications(api);
    appsRanked = rankApplications(rows);
    renderIceStats(queueStats(appsRanked));
    if (selectedAppId && !appsRanked.some((item) => item.row.id === selectedAppId)) {
      selectedAppId = null;
      details.hidden = true;
    }
    renderAppsTable();
    if (selectedAppId) {
      const active = document.querySelector(`#leads-table tbody tr[data-id="${selectedAppId}"]`);
      if (active) await openLead(selectedAppId, active);
    }
  } catch (err) {
    appsRanked = [];
    renderIceStats(queueStats([]));
    renderAppsTable();
    details.hidden = true;
    showError(errorNode, err.message);
  }
}

document.querySelectorAll("[data-ice-filter]").forEach((btn) => {
  btn.addEventListener("click", () => {
    appsFilter = btn.dataset.iceFilter;
    document.querySelectorAll("[data-ice-filter]").forEach((el) => el.classList.toggle("is-on", el === btn));
    renderAppsTable();
  });
});

document.querySelector("#apps-refresh").addEventListener("click", () => {
  loadLeads();
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const serviceError = document.querySelector("#service-error");
const serviceHint = document.querySelector("#service-toolbar-hint");
const serviceButtons = {
  add: document.querySelector("#service-add"),
  edit: document.querySelector("#service-edit"),
  save: document.querySelector("#service-save"),
  cancel: document.querySelector("#service-cancel"),
  remove: document.querySelector("#service-delete"),
  refresh: document.querySelector("#service-refresh"),
};

let servicesCache = [];
let selectedServiceId = null;
let serviceMode = "view";
let serviceDraft = null;
let serviceBusy = false;

function slugify(name) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return slug || `svc-${Date.now()}`;
}

function rowTitle(row) {
  const name = (row?.services || []).map(serviceName).filter(Boolean)[0];
  if (name) return name;
  return row?.id ? `Услуга #${row.id}` : "Новая услуга";
}

function rowDraft(row) {
  return {
    name: rowTitle(row),
    budget_min: String(row?.budget_min ?? ""),
    budget_max: String(row?.budget_max ?? ""),
  };
}

function selectedService() {
  return servicesCache.find((row) => row.id === selectedServiceId) || null;
}

function setServiceBusy(value) {
  serviceBusy = value;
  updateServiceToolbar();
}

function updateServiceToolbar() {
  const editing = serviceMode !== "view";
  const hasRow = Boolean(selectedService());
  serviceButtons.add.disabled = serviceBusy || editing;
  serviceButtons.edit.disabled = serviceBusy || editing || !hasRow;
  serviceButtons.save.disabled = serviceBusy || !editing;
  serviceButtons.cancel.disabled = serviceBusy || !editing;
  serviceButtons.remove.disabled = serviceBusy || editing || !hasRow;
  serviceButtons.refresh.disabled = serviceBusy || editing;
  if (serviceMode === "create") serviceHint.textContent = "Новая строка — заполните поля и сохраните";
  else if (serviceMode === "edit") serviceHint.textContent = `Редактирование №${selectedServiceId}`;
  else if (hasRow) serviceHint.textContent = `Выбрана запись №${selectedServiceId}`;
  else serviceHint.textContent = "Выберите строку";
}

function servicePayload(row, draft) {
  const name = draft.name.trim();
  const rest = Array.isArray(row?.services) ? row.services.slice(1) : [];
  const first = row?.services?.[0];
  const code =
    typeof first === "object" && first?.code && serviceName(first) === name
      ? first.code
      : slugify(name);
  return {
    services: [{ code, name }, ...rest],
    budget_min: draft.budget_min.trim(),
    budget_max: draft.budget_max.trim(),
  };
}

function bindDraftInputs(tr) {
  tr.querySelectorAll("[data-field]").forEach((input) => {
    input.addEventListener("input", () => {
      serviceDraft[input.dataset.field] = input.value;
    });
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveService();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancelServiceEdit();
      }
    });
  });
}

function appendServiceCells(tr, values, editable) {
  const fields = [
    ["name", values.name],
    ["budget_min", values.budget_min],
    ["budget_max", values.budget_max],
  ];
  fields.forEach(([field, value]) => {
    const td = document.createElement("td");
    if (editable) {
      const input = document.createElement("input");
      input.dataset.field = field;
      input.value = value;
      input.setAttribute(
        "aria-label",
        { name: "Название услуги", budget_min: "Мин. бюджет", budget_max: "Макс. бюджет" }[field],
      );
      td.append(input);
    } else {
      td.textContent = value || "—";
    }
    tr.append(td);
  });
}

function renderServicesTable() {
  const tbody = document.querySelector("#services-table tbody");
  const empty = document.querySelector("#services-empty");
  tbody.innerHTML = "";
  empty.hidden = servicesCache.length > 0 || serviceMode === "create";

  servicesCache.forEach((row) => {
    const editing = serviceMode === "edit" && selectedServiceId === row.id;
    const tr = document.createElement("tr");
    tr.dataset.id = String(row.id);
    if (selectedServiceId === row.id) tr.classList.add("is-on");
    if (editing) tr.classList.add("is-editing");
    tr.innerHTML = `<td>${row.id}</td>`;
    appendServiceCells(tr, editing ? serviceDraft : rowDraft(row), editing);
    const updated = document.createElement("td");
    updated.textContent = fmtDate(row.updated_at);
    tr.append(updated);
    tr.addEventListener("click", () => selectServiceRow(row.id));
    tr.addEventListener("dblclick", () => {
      selectServiceRow(row.id);
      startServiceEdit();
    });
    if (editing) bindDraftInputs(tr);
    tbody.append(tr);
  });

  if (serviceMode === "create") {
    const tr = document.createElement("tr");
    tr.classList.add("is-on", "is-editing");
    tr.innerHTML = "<td>—</td>";
    appendServiceCells(tr, serviceDraft, true);
    const updated = document.createElement("td");
    updated.textContent = "не сохранено";
    tr.append(updated);
    bindDraftInputs(tr);
    tbody.append(tr);
  }

  updateServiceToolbar();
  const focus = document.querySelector("#services-table input[data-field='name']");
  if (focus) {
    focus.focus();
    focus.select();
  }
}

function selectServiceRow(id) {
  if (serviceBusy || serviceMode !== "view") return;
  selectedServiceId = id;
  showError(serviceError, "");
  renderServicesTable();
}

function startServiceCreate() {
  if (serviceBusy || serviceMode !== "view") return;
  selectedServiceId = null;
  serviceMode = "create";
  serviceDraft = { name: "", budget_min: "", budget_max: "" };
  showError(serviceError, "");
  renderServicesTable();
}

function startServiceEdit() {
  const row = selectedService();
  if (serviceBusy || serviceMode !== "view" || !row) return;
  serviceMode = "edit";
  serviceDraft = rowDraft(row);
  showError(serviceError, "");
  renderServicesTable();
}

function cancelServiceEdit() {
  if (serviceBusy) return;
  serviceMode = "view";
  serviceDraft = null;
  showError(serviceError, "");
  renderServicesTable();
}

async function saveService() {
  if (serviceBusy || serviceMode === "view" || !serviceDraft) return;
  const name = serviceDraft.name.trim();
  const budgetMin = serviceDraft.budget_min.trim();
  const budgetMax = serviceDraft.budget_max.trim();
  if (!name || !budgetMin || !budgetMax) {
    showError(serviceError, "Заполните название и оба значения бюджета.");
    return;
  }
  const row = serviceMode === "edit" ? selectedService() : null;
  const payload = servicePayload(row, serviceDraft);
  setServiceBusy(true);
  showError(serviceError, "");
  try {
    if (serviceMode === "edit" && row) {
      const saved = await api(`/api/admin/${row.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      selectedServiceId = saved.id;
    } else {
      const saved = await api("/api/admin", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      selectedServiceId = saved.id;
    }
    serviceMode = "view";
    serviceDraft = null;
    await loadServices();
  } catch (err) {
    showError(serviceError, err.message);
    updateServiceToolbar();
  } finally {
    serviceBusy = false;
    updateServiceToolbar();
  }
}

async function deleteService() {
  const row = selectedService();
  if (serviceBusy || serviceMode !== "view" || !row) return;
  const name = rowTitle(row);
  if (!confirm(`Удалить услугу «${name}» (№${row.id})?`)) return;
  setServiceBusy(true);
  showError(serviceError, "");
  try {
    await api(`/api/admin/${row.id}`, { method: "DELETE" });
    selectedServiceId = null;
    await loadServices();
  } catch (err) {
    showError(serviceError, err.message);
  } finally {
    serviceBusy = false;
    updateServiceToolbar();
  }
}

async function loadServices() {
  try {
    const rows = await api("/api/admin");
    servicesCache = Array.isArray(rows) ? rows : [];
    showError(serviceError, "");
  } catch (err) {
    servicesCache = [];
    showError(serviceError, err.message);
  }
  if (selectedServiceId && !servicesCache.some((row) => row.id === selectedServiceId)) {
    selectedServiceId = null;
  }
  if (serviceMode !== "view") {
    serviceMode = "view";
    serviceDraft = null;
  }
  renderServicesTable();
}

updateServiceToolbar();

serviceButtons.add.addEventListener("click", startServiceCreate);
serviceButtons.edit.addEventListener("click", startServiceEdit);
serviceButtons.save.addEventListener("click", saveService);
serviceButtons.cancel.addEventListener("click", cancelServiceEdit);
serviceButtons.remove.addEventListener("click", deleteService);
serviceButtons.refresh.addEventListener("click", async () => {
  if (serviceBusy || serviceMode !== "view") return;
  showError(serviceError, "");
  setServiceBusy(true);
  try {
    await loadServices();
  } catch (err) {
    showError(serviceError, err.message);
  } finally {
    serviceBusy = false;
    updateServiceToolbar();
  }
});

async function loadAdmins() {
  const rows = await api("/api/admins");
  const list = document.querySelector("#admins-list");
  list.innerHTML = "";
  rows.forEach((row) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div>
        <strong>${escapeHtml(row.login)}</strong>
        <span class="muted">с ${fmtDate(row.created_at)}</span>
      </div>
      <button type="button" class="chip" data-del>Удалить</button>
    `;
    li.querySelector("[data-del]").addEventListener("click", async () => {
      if (!confirm(`Удалить администратора «${row.login}»?`)) return;
      try {
        await api(`/api/admins/${row.id}`, { method: "DELETE" });
        await loadAdmins();
      } catch (err) {
        showError(document.querySelector("#admin-error"), err.message);
      }
    });
    list.append(li);
  });
}

document.querySelector("#admin-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorNode = document.querySelector("#admin-error");
  showError(errorNode, "");
  try {
    await api("/api/admins", {
      method: "POST",
      body: JSON.stringify({
        login: document.querySelector("#new-admin-login").value,
        password: document.querySelector("#new-admin-password").value,
      }),
    });
    event.target.reset();
    await loadAdmins();
  } catch (err) {
    showError(errorNode, err.message);
  }
});

async function enterPanel(admin) {
  showPanel(admin);
  registerBtn.hidden = true;
  await Promise.all([loadLeads(), loadServices(), loadAdmins()]);
}

async function boot() {
  await refreshRegisterButton();
  const jwt = token();
  if (!jwt) {
    showAuth();
    return;
  }
  try {
    const me = await api("/api/auth/me");
    await enterPanel(me);
  } catch {
    setToken("");
    showAuth();
  }
}

boot();
