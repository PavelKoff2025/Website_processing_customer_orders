const DAY_MS = 24 * 60 * 60 * 1000;
const PERIODS = [
  { id: "day", label: "День", span: DAY_MS },
  { id: "week", label: "Неделя", span: 7 * DAY_MS },
  { id: "month", label: "Месяц", span: 30 * DAY_MS },
];

function parseJson(raw, fallback) {
  if (raw == null || raw === "") return fallback;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function parseCursorPositions(raw) {
  const parsed = parseJson(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((point) => ({
      x: Number(point?.x),
      y: Number(point?.y),
      t: Number(point?.t) || 0,
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function sessionDurations(rows) {
  const sorted = [...rows].sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    if (ta !== tb) return ta - tb;
    return Number(a.id || 0) - Number(b.id || 0);
  });
  const sessions = [];
  let current = [];
  for (const row of sorted) {
    const time = Number(row.time_on_page) || 0;
    const prev = current.at(-1);
    if (prev && time + 2 < (Number(prev.time_on_page) || 0)) {
      sessions.push(current);
      current = [];
    }
    current.push(row);
  }
  if (current.length) sessions.push(current);
  return sessions.map((session) => ({
    duration: Math.max(...session.map((row) => Number(row.time_on_page) || 0)),
    ended: new Date(session.at(-1).created_at || 0).getTime(),
  }));
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins === 0) return `${secs} сек`;
  return `${mins} мин ${secs} сек`;
}

export function periodStats(rows, now = Date.now()) {
  const sessions = sessionDurations(rows);
  return PERIODS.map((period) => {
    const inWindow = sessions.filter((session) => now - session.ended <= period.span);
    const durations = inWindow.map((session) => session.duration);
    const max = durations.length ? Math.max(...durations) : 0;
    const avg = durations.length
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : 0;
    return {
      id: period.id,
      label: period.label,
      count: durations.length,
      max,
      avg,
    };
  });
}

export function collectHeatPoints(rows) {
  const lastPoints = [];
  let richest = [];
  for (const row of rows) {
    const points = parseCursorPositions(row.cursor_positions);
    if (points.length > richest.length) richest = points;
    if (points.length) lastPoints.push(points.at(-1));
  }
  return lastPoints.length >= 12 ? lastPoints : richest;
}

export function drawHeatmap(canvas, points) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, canvas.clientWidth);
  const height = Math.max(240, canvas.clientHeight);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const pad = { l: 52, r: 24, t: 18, b: 42 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillRect(pad.l, pad.t, plotW, plotH);
  ctx.strokeStyle = "rgba(196,160,86,0.35)";
  ctx.strokeRect(pad.l, pad.t, plotW, plotH);

  const maxX = Math.max(1200, ...points.map((point) => point.x), 1);
  const maxY = Math.max(800, ...points.map((point) => point.y), 1);
  const toX = (x) => pad.l + (x / maxX) * plotW;
  const toY = (y) => pad.t + (y / maxY) * plotH;

  ctx.font = "11px Manrope, system-ui, sans-serif";
  ctx.fillStyle = "#7a7166";
  ctx.textAlign = "center";
  ctx.fillText("X, px", pad.l + plotW / 2, height - 12);
  ctx.save();
  ctx.translate(14, pad.t + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Y, px", 0, 0);
  ctx.restore();
  ctx.textAlign = "right";
  ctx.fillText("0", pad.l - 8, pad.t + 4);
  ctx.fillText(String(Math.round(maxY)), pad.l - 8, pad.t + plotH);
  ctx.textAlign = "center";
  ctx.fillText(String(Math.round(maxX)), pad.l + plotW, height - 24);

  if (!points.length) return;

  const bin = 40;
  const counts = new Map();
  for (const point of points) {
    const bx = Math.round(point.x / bin) * bin;
    const by = Math.round(point.y / bin) * bin;
    const key = `${bx}:${by}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const hottest = Math.max(...counts.values(), 1);

  for (const [key, count] of counts) {
    const [x, y] = key.split(":").map(Number);
    const heat = count / hottest;
    const radius = 7 + heat * 26;
    const px = toX(x);
    const py = toY(y);
    const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
    gradient.addColorStop(0, `rgba(196, ${Math.round(90 - heat * 70)}, ${Math.round(40 + (1 - heat) * 46)}, ${0.22 + heat * 0.55})`);
    gradient.addColorStop(1, "rgba(196,160,86,0)");
    ctx.beginPath();
    ctx.fillStyle = gradient;
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = `rgba(138, ${Math.round(60 - heat * 40)}, 24, ${0.35 + heat * 0.5})`;
    ctx.arc(px, py, 3 + heat * 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export async function loadBehaviorMetrics(fetcher) {
  const pageSize = 100;
  const rows = [];
  for (let skip = 0; skip < 1000; skip += pageSize) {
    const chunk = await fetcher(`/api/behavior-metrics/?skip=${skip}&limit=${pageSize}`);
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return rows;
}
