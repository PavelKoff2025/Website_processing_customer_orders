const VISIT_KEY = "autello_return_count";

function bumpReturns() {
  const next = Number(localStorage.getItem(VISIT_KEY) || "0") + 1;
  localStorage.setItem(VISIT_KEY, String(next));
  return next;
}

export function createTracker() {
  const started = performance.now();
  const buttonsClicked = [];
  const cursorHovers = [];
  const hoverTimers = new WeakMap();
  const returnCount = bumpReturns();

  document.addEventListener("click", (event) => {
    const btn = event.target.closest("button, .chip, .submit");
    if (!btn) return;
    buttonsClicked.push({
      name: btn.dataset.track || btn.dataset.value || btn.textContent.trim(),
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
  };
}
