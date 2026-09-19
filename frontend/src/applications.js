const PAGE_SIZE = 100;

const HOT_MIN = 64;
const WARM_MIN = 40;

function textBlob(row) {
  return [
    row?.niche,
    row?.business_info,
    row?.company_size,
    row?.business_size,
    row?.task_volume,
    row?.need_volume,
    row?.task_type,
    row?.product,
    row?.role,
    row?.result_deadline,
    row?.comments,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
}

export function parseBudget(raw) {
  const original = String(raw ?? "").trim();
  if (!original) return 0;
  const compact = original.replace(/\s/g, "").toLowerCase().replace(",", ".");
  const million = compact.match(/^(\d+(?:\.\d+)?)(млн|million|m|м)$/);
  if (million) return Math.round(Number(million[1]) * 1_000_000);
  const thousand = compact.match(/^(\d+(?:\.\d+)?)(к|k)$/);
  if (thousand) return Math.round(Number(thousand[1]) * 1000);
  const digits = Number(compact.replace(/[^\d.]/g, ""));
  return Number.isFinite(digits) ? Math.round(digits) : 0;
}

export function parseHeadcount(row) {
  const company = String(row?.company_size || "").toLowerCase();
  const business = String(row?.business_size || "").toLowerCase();
  const text = `${company} ${business}`;
  const labeled = text.match(/(\d[\d\s]*)\s*(чел|сотруд|человек|штат)/);
  if (labeled) return Number(labeled[1].replace(/\s/g, "")) || 0;
  const source = /оборот|млрд|млн|₽|руб/.test(business) ? company : text;
  const nums = [...source.matchAll(/(\d+)/g)]
    .map((match) => Number(match[1]))
    .filter((value) => value > 0 && value <= 100_000);
  return nums.length ? Math.max(...nums) : 0;
}

export function parseDeadlineDays(raw) {
  const text = String(raw ?? "").toLowerCase();
  if (!text.trim()) return null;
  if (/asap|сразу|вчера|сегодня|послезавтра|к пятниц|к понедельник|горящ/.test(text)) return 3;
  if (/срочн/.test(text) && !/не\s+срочн/.test(text)) return 5;
  const days = text.match(/(\d+)\s*(день|дня|дней|сут)/);
  if (days) return Number(days[1]);
  const weeks = text.match(/(\d+)\s*(недел)/);
  if (weeks) return Number(weeks[1]) * 7;
  const months = text.match(/(\d+)\s*(месяц)/);
  if (months) return Number(months[1]) * 30;
  if (/недел/.test(text)) return 14;
  if (/месяц/.test(text)) return 30;
  return null;
}

function isDecisionMaker(role) {
  return /руковод|директор|основател|владел|ceo|owner|гендир|партн[её]р/.test(
    String(role || "").toLowerCase(),
  );
}

function hasLuxurySignal(blob) {
  return /премиум|премиальн|люкс|яхт|concierge|vip|вип|бутик|конфиденц/.test(blob);
}

function hasEnterpriseSignal(blob, people) {
  return people >= 80 || /холдинг|корпоратив|банк|автопарк|тендер|филиал|сеть/.test(blob);
}

function hasUrgencySignal(blob, days) {
  const negated = /не\s+срочн/.test(blob);
  const explicit =
    /asap|послезавтра|к пятниц|горящ/.test(blob) || (!negated && /срочн/.test(blob));
  return (days != null && days <= 7) || explicit;
}

function add(reasons, label, points) {
  if (!points) return 0;
  reasons.push({ label, points });
  return points;
}

export function analyzeApplication(row) {
  const blob = textBlob(row);
  const budget = parseBudget(row?.budget);
  const people = parseHeadcount(row);
  const days = parseDeadlineDays(`${row?.result_deadline || ""} ${row?.comments || ""}`);
  const decision = isDecisionMaker(row?.role);
  const luxury = hasLuxurySignal(blob);
  const enterprise = hasEnterpriseSignal(blob, people);
  const urgent = hasUrgencySignal(blob, days);
  const reasons = [];
  let heat = 0;

  if (decision) heat += add(reasons, "ЛПР: руководитель принимает решение сам", 18);
  else if (/сотруд|менедж|закуп/.test(String(row?.role || "").toLowerCase())) {
    heat += add(reasons, "Заявку оставил сотрудник, не первый лицо", 6);
  } else {
    heat += add(reasons, "Роль заполняющего не ясна", 2);
  }

  if (people >= 200) heat += add(reasons, `Крупная компания: ${people} человек`, 18);
  else if (people >= 50) heat += add(reasons, `Средне-крупная компания: ${people} человек`, 14);
  else if (people >= 15) heat += add(reasons, `Средняя команда: ${people} человек`, 10);
  else if (people >= 5) heat += add(reasons, `Небольшая команда: ${people} человек`, 6);
  else heat += add(reasons, people ? `Микробизнес: ${people} человек` : "Размер компании не указан", 3);

  if (budget >= 2_000_000) heat += add(reasons, `Бюджет ${money(budget)} — высокий чек`, 22);
  else if (budget >= 800_000) heat += add(reasons, `Бюджет ${money(budget)} — достойный чек`, 16);
  else if (budget >= 300_000) heat += add(reasons, `Бюджет ${money(budget)} — рабочий средний чек`, 12);
  else if (budget >= 100_000) heat += add(reasons, `Бюджет ${money(budget)} — скромный`, 7);
  else heat += add(reasons, budget ? `Бюджет ${money(budget)} — низкий` : "Бюджет не задан", 3);

  if (days == null) heat += add(reasons, "Срок не указан — приоритет средний", 5);
  else if (days <= 7) heat += add(reasons, `Срок ${days} дн. — горит`, 24);
  else if (days <= 21) heat += add(reasons, `Срок ${days} дн. — близко`, 14);
  else if (days <= 60) heat += add(reasons, `Срок ${days} дн. — спокойный горизонт`, 8);
  else heat += add(reasons, `Срок ${days} дн. — без спешки`, 3);

  if (/полный цикл|под ключ|внедрен|автопарк|тендер|сеть из|филиал/.test(blob)) {
    heat += add(reasons, "Объём задачи широкий: цикл, парк или тендер", 10);
  } else if (/запуск|сопровожден|пакет|комплекс/.test(blob)) {
    heat += add(reasons, "Объём задачи средний, есть конкретный контур", 6);
  } else if (/узнать|просто посмотр|консультац|поинтерес/.test(blob)) {
    heat += add(reasons, "Пока разведка, не заказ", 0);
  }

  if (luxury) heat += add(reasons, "Ниша премиальная / VIP", 8);
  else if (enterprise) heat += add(reasons, "Корпоративный контур", 6);

  if (urgent && days != null && days > 7) {
    heat += add(reasons, "В тексте заявки есть маркеры срочности", 8);
  }

  heat = Math.max(0, Math.min(100, heat));
  const tier = heat >= HOT_MIN ? "hot" : heat >= WARM_MIN ? "warm" : "cold";
  const department = assignDepartment({ blob, people, days, luxury, enterprise, urgent, product: row?.product });
  const personalManager =
    heat >= 68 && (decision || people >= 50 || budget >= 800_000 || luxury || enterprise);
  const worthTime = heat >= 42 || budget >= 250_000;

  return {
    heat,
    iceTemp: Math.round(heat * 0.8 - 20),
    tier,
    tierLabel: { hot: "Раскалённый лёд", warm: "Тающий лёд", cold: "Мёрзлый лёд" }[tier],
    queueLabel: { hot: "в начало очереди", warm: "обычная очередь", cold: "вниз списка" }[tier],
    budget,
    people,
    days,
    reasons,
    worthTime,
    worthLabel: worthTime ? "Да, разбирать в первую очередь" : "Нет, не тратить время старших",
    worthWhy: worthWhy({ worthTime, heat, budget, tier }),
    personalManager,
    managerLabel: personalManager ? "Нужен персональный менеджер" : "Общий менеджер / смена",
    managerWhy: managerWhy({ personalManager, decision, people, budget, luxury, enterprise, heat }),
    department,
    deadlineLabel: deadlineLabel(days),
    budgetLabel: budgetLabel(budget),
  };
}

function worthWhy({ worthTime, heat, budget, tier }) {
  if (!worthTime) {
    return "Слабый ЛПР или чек, размытый объём. Оставить на первую линию, не созывать разбор.";
  }
  if (tier === "hot") {
    return `Температура ${heat}: либо горит срок, либо крупный чек/компания. Стоит взять в работу сегодня.`;
  }
  return `Рабочий лид (${heat}, бюджет ${money(budget)}). Имеет смысл короткий созвон, без эскалации.`;
}

function managerWhy({ personalManager, decision, people, budget, luxury, enterprise, heat }) {
  if (personalManager && luxury) return "VIP-контур: лучше один закреплённый человек, без общей очереди.";
  if (personalManager && (people >= 50 || enterprise)) {
    return "Крупный клиент: нужен именной контакт, чтобы не потерять тендер.";
  }
  if (personalManager && budget >= 800_000) return "Высокий чек — ведёт персональный менеджер до сделки.";
  if (personalManager && decision) return "Говорит первое лицо: не перекидывать между сменами.";
  if (heat >= HOT_MIN) return "Срочность есть, но масштаб небольшой — достаточно дежурного менеджера.";
  return "Типовой запрос: закрывает общая линия без персонального закрепления.";
}

function assignDepartment({ blob, people, days, luxury, enterprise, urgent, product }) {
  if (luxury) {
    return { name: "VIP-сопровождение", why: "Премиальная ниша и запрос на закрытый сервис." };
  }
  if (enterprise || people >= 80) {
    return { name: "Корпоративные продажи", why: "Парк, тендер или крупная штатная структура." };
  }
  if (urgent || (days != null && days <= 7)) {
    return { name: "Оперативный цех", why: "Короткий срок — сразу в производство, не в долгую продажу." };
  }
  if (
    (/узнать|консультац|поинтерес|посмотреть/.test(blob) || people <= 2) &&
    !enterprise &&
    !luxury
  ) {
    return { name: "Первая линия", why: "Разведка и мелкие запросы, без загрузки старших." };
  }
  if (/полир|химчист|керамик|покраск|детейл/.test(`${blob} ${String(product || "").toLowerCase()}`)) {
    return { name: "Детейлинг", why: "Профильная услуга студии, без корпоративного контура." };
  }
  return { name: "Клиентский отдел", why: "Стандартный тёплый лид на общий разбор." };
}

function deadlineLabel(days) {
  if (days == null) return "срок не указан";
  if (days <= 7) return `${days} дн. · горит`;
  if (days <= 21) return `${days} дн. · близко`;
  if (days <= 60) return `${days} дн.`;
  return `${days} дн. · без спешки`;
}

function budgetLabel(budget) {
  if (!budget) return "бюджет не задан";
  if (budget >= 2_000_000) return "высокий чек";
  if (budget >= 800_000) return "сильный чек";
  if (budget >= 300_000) return "средний чек";
  if (budget >= 100_000) return "скромный чек";
  return "низкий чек";
}

export function money(n) {
  return new Intl.NumberFormat("ru-RU").format(Number(n) || 0) + " ₽";
}

export function rankApplications(rows) {
  return [...rows]
    .map((row) => ({ row, ice: analyzeApplication(row) }))
    .sort((a, b) => {
      if (b.ice.heat !== a.ice.heat) return b.ice.heat - a.ice.heat;
      return new Date(b.row.created_at || 0) - new Date(a.row.created_at || 0);
    });
}

export function queueStats(ranked) {
  const total = ranked.length;
  const hot = ranked.filter((item) => item.ice.tier === "hot").length;
  const warm = ranked.filter((item) => item.ice.tier === "warm").length;
  const cold = ranked.filter((item) => item.ice.tier === "cold").length;
  const vip = ranked.filter((item) => item.ice.personalManager).length;
  const worth = ranked.filter((item) => item.ice.worthTime).length;
  const budgets = ranked.map((item) => item.ice.budget).filter(Boolean);
  const avgBudget = budgets.length
    ? Math.round(budgets.reduce((sum, value) => sum + value, 0) / budgets.length)
    : 0;
  const avgHeat = total
    ? Math.round(ranked.reduce((sum, item) => sum + item.ice.heat, 0) / total)
    : 0;
  return { total, hot, warm, cold, vip, worth, avgBudget, avgHeat };
}

export async function loadApplications(fetcher) {
  const rows = [];
  let base = "/api/applications/";
  for (let skip = 0; skip < 2000; skip += PAGE_SIZE) {
    let chunk;
    try {
      chunk = await fetcher(`${base}?skip=${skip}&limit=${PAGE_SIZE}`);
    } catch (err) {
      if (skip === 0 && base === "/api/applications/") {
        base = "/api/leads";
        chunk = await fetcher(`${base}?skip=${skip}&limit=${PAGE_SIZE}`);
      } else {
        throw err;
      }
    }
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return rows;
}
