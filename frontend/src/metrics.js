const VISIT_KEY = "autello_return_count";
const METRICS_URL = "/api/behavior-metrics/";
const MAX_CURSOR_POINTS = 1800;

function bumpReturns() {
  const next = Number(localStorage.getItem(VISIT_KEY) || "0") + 1;
  localStorage.setItem(VISIT_KEY, String(next));
  return next;
}

function buttonName(el) {
  const labeled = el.dataset.track || el.dataset.value || el.getAttribute("name") || el.id;
  if (labeled) return labeled;
  return el.textContent.trim().replace(/\s+/g, " ").slice(0, 80) || el.tagName.toLowerCase();
}

export function createTracker() {
  const started = performance.now();
  const buttonsClicked = [];
  const buttonCounts = {};
  const cursorHovers = [];
  const cursorPositions = [];
  const hoverTimers = new WeakMap();
  const returnCount = bumpReturns();
  let lastCursor = { x: 0, y: 0 };
  let sending = false;

  document.addEventListener("pointermove", (event) => {
    lastCursor = {
      x: Math.round(event.pageX),
      y: Math.round(event.pageY),
    };
  });

  document.addEventListener("click", (event) => {
    const btn = event.target.closest("button, .chip, .submit, [role='button']");
    if (!btn) return;
    const name = buttonName(btn);
    buttonCounts[name] = (buttonCounts[name] || 0) + 1;
    buttonsClicked.push({
      name,
      ts: new Date().toISOString(),
    });
  });

  document.addEventListener("pointerover", (event) => {
    const field = event.target.closest("label, .chip, .submit, .block");
    if (!field || hoverTimers.has(field)) return;
    const began = performance.now();
    hoverTimers.set(field, began);
  });

  document.addEventListener("pointerout", (event) => {
    const field = event.target.closest("label, .chip, .submit, .block");
    if (!field) return;
    const began = hoverTimers.get(field);
    if (began == null) return;
    hoverTimers.delete(field);
    const duration = performance.now() - began;
    if (duration < 450) return;
    const box = field.getBoundingClientRect();
    cursorHovers.push({
      selector: field.tagName.toLowerCase(),
      title: field.querySelector("span, h2")?.textContent?.trim() || "",
      duration_ms: Math.round(duration),
      x: Math.round(box.left + box.width / 2),
      y: Math.round(box.top + box.height / 2),
    });
  });

  function timeOnPage() {
    return Math.floor((performance.now() - started) / 1000);
  }

  function sampleCursor() {
    cursorPositions.push({
      x: lastCursor.x,
      y: lastCursor.y,
      t: timeOnPage(),
    });
    if (cursorPositions.length > MAX_CURSOR_POINTS) {
      cursorPositions.splice(0, cursorPositions.length - MAX_CURSOR_POINTS);
    }
  }

  function behaviorPayload() {
    return {
      application_id: 0,
      time_on_page: timeOnPage(),
      buttons_clicked: JSON.stringify(buttonCounts),
      cursor_positions: JSON.stringify(cursorPositions),
      return_frequency: 0,
    };
  }

  async function sendSnapshot() {
    if (sending) return;
    sending = true;
    try {
      await fetch(METRICS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(behaviorPayload()),
        keepalive: true,
      });
    } catch {
      /* трекинг не должен ломать форму */
    } finally {
      sending = false;
    }
  }

  function tick() {
    if (document.visibilityState !== "visible") return;
    sampleCursor();
    sendSnapshot();
  }

  const timer = window.setInterval(tick, 1000);

  window.addEventListener("pagehide", () => {
    const body = JSON.stringify(behaviorPayload());
    if (navigator.sendBeacon) {
      navigator.sendBeacon(METRICS_URL, new Blob([body], { type: "application/json" }));
      return;
    }
    sendSnapshot();
  });

  return {
    snapshot() {
      return {
        time_on_page: Number(((performance.now() - started) / 1000).toFixed(2)),
        buttons_clicked: buttonsClicked.slice(-40),
        cursor_hovers: cursorHovers.slice(-40),
        return_count: returnCount,
        technical_info: {
          user_agent: navigator.userAgent,
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          screen: `${screen.width}x${screen.height}`,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          referrer: document.referrer,
        },
      };
    },
    stop() {
      window.clearInterval(timer);
    },
  };
}
