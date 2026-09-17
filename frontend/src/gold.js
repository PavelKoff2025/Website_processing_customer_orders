export function startGoldField(canvas) {
  const ctx = canvas.getContext("2d");
  const circles = Array.from({ length: 18 }, () => spawn());
  let width = 0;
  let height = 0;
  let running = true;

  function spawn() {
    return {
      x: Math.random(),
      y: Math.random(),
      r: 18 + Math.random() * 90,
      vx: (Math.random() - 0.5) * 0.00018,
      vy: (Math.random() - 0.5) * 0.00022,
      a: 0.05 + Math.random() * 0.12,
    };
  }

  function resize() {
    width = canvas.width = window.innerWidth * devicePixelRatio;
    height = canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function tick() {
    if (!running) return;
    ctx.clearRect(0, 0, width, height);
    for (const c of circles) {
      c.x += c.vx;
      c.y += c.vy;
      if (c.x < -0.1) c.x = 1.1;
      if (c.x > 1.1) c.x = -0.1;
      if (c.y < -0.1) c.y = 1.1;
      if (c.y > 1.1) c.y = -0.1;
      const x = c.x * width;
      const y = c.y * height;
      const g = ctx.createRadialGradient(x, y, 0, x, y, c.r * devicePixelRatio);
      g.addColorStop(0, `rgba(196, 160, 86, ${c.a + 0.08})`);
      g.addColorStop(1, "rgba(196, 160, 86, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, c.r * devicePixelRatio, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(tick);
  }

  resize();
  window.addEventListener("resize", resize);
  tick();
  return () => {
    running = false;
  };
}
