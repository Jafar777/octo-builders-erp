// The animated dashboard backgrounds (lib/appearance.js BACKGROUNDS), drawn on a canvas.
// Each maker gets the canvas context, its size and the person's settings:
//   colors [3 hex], density / speed / size / opacity (0–100), bg (the page colour)
// and returns { step(dt, t) } — dt and t in seconds. Drawing is light: a few hundred
// shapes at most, so it runs smoothly behind the dashboard.

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const TAU = Math.PI * 2;

// 0–100 settings → multipliers.
const k = (o) => ({
  n: 0.15 + (o.density / 100) * 1.85,
  v: 0.15 + (o.speed / 100) * 2.1,
  s: 0.45 + (o.size / 100) * 1.6,
  a: o.opacity / 100,
});
// How many shapes for this screen size (`base` on a 1440 × 900 screen at density 50).
const count = (w, h, base, n) => Math.max(4, Math.round(((base * (w * h)) / (1440 * 900)) * n));

function hexRgb(hex) {
  const v = parseInt(String(hex).slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const rgba = (hex, a) => {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

function clear(ctx, w, h, bg, trail = 1) {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = trail >= 1 ? bg : rgba(bg, trail);
  ctx.fillRect(0, 0, w, h);
}

// ---------- shapes ----------
function heart(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
  ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
  ctx.fill();
}
function petal(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * 0.9, -s * 0.2, 0, s);
  ctx.quadraticCurveTo(-s * 0.9, -s * 0.2, 0, -s);
  ctx.fill();
}
function polygon(ctx, sides, r) {
  ctx.beginPath();
  for (let i = 0; i <= sides; i++) {
    const a = (i / sides) * TAU - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

// ---------- the backgrounds ----------
const MAKERS = {
  none(ctx, w, h, o) {
    return { step: () => clear(ctx, w, h, o.bg) };
  },

  // Cherry blossom petals drifting down and turning.
  petals(ctx, w, h, o) {
    const m = k(o);
    const make = (top) => ({ x: rand(0, w), y: top ? rand(-h, 0) : rand(0, h), r: rand(5, 11) * m.s, vy: rand(18, 42), sway: rand(0.6, 1.6), phase: rand(0, TAU), rot: rand(0, TAU), vr: rand(-1.2, 1.2), c: pick(o.colors.slice(0, 2)) });
    const list = Array.from({ length: count(w, h, 70, m.n) }, () => make(false));
    return {
      step(dt, t) {
        clear(ctx, w, h, o.bg);
        for (const p of list) {
          p.y += p.vy * m.v * dt;
          p.x += Math.sin(t * p.sway + p.phase) * 26 * m.v * dt + 10 * m.v * dt;
          p.rot += p.vr * m.v * dt;
          if (p.y > h + 20 || p.x > w + 20) Object.assign(p, make(true), { y: -20 });
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(t * 1.5 + p.phase)));
          ctx.globalAlpha = m.a * 0.85;
          ctx.fillStyle = p.c;
          petal(ctx, p.r);
          ctx.restore();
        }
      },
    };
  },

  // Five-petal flowers floating, slowly turning and breathing.
  flowers(ctx, w, h, o) {
    const m = k(o);
    const list = Array.from({ length: count(w, h, 26, m.n) }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(10, 22) * m.s, vx: rand(-8, 8), vy: rand(-10, -3), rot: rand(0, TAU), vr: rand(-0.4, 0.4), phase: rand(0, TAU), c: pick(o.colors.slice(0, 2)) }));
    return {
      step(dt, t) {
        clear(ctx, w, h, o.bg);
        for (const f of list) {
          f.x += f.vx * m.v * dt;
          f.y += f.vy * m.v * dt;
          f.rot += f.vr * m.v * dt;
          if (f.y < -40) f.y = h + 40;
          if (f.x < -40) f.x = w + 40;
          if (f.x > w + 40) f.x = -40;
          const r = f.r * (0.9 + 0.1 * Math.sin(t * 1.2 + f.phase));
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.rotate(f.rot);
          ctx.globalAlpha = m.a * 0.75;
          ctx.fillStyle = f.c;
          for (let i = 0; i < 5; i++) {
            ctx.rotate(TAU / 5);
            ctx.beginPath();
            ctx.ellipse(0, -r * 0.6, r * 0.38, r * 0.62, 0, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = m.a;
          ctx.fillStyle = o.colors[1] === f.c ? o.colors[0] : o.colors[1];
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.26, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      },
    };
  },

  // Hearts rising and fading.
  hearts(ctx, w, h, o) {
    const m = k(o);
    const make = (bottom) => ({ x: rand(0, w), y: bottom ? h + rand(0, 80) : rand(0, h), s: rand(12, 30) * m.s, vy: rand(20, 50), phase: rand(0, TAU), c: pick(o.colors) });
    const list = Array.from({ length: count(w, h, 40, m.n) }, () => make(false));
    return {
      step(dt, t) {
        clear(ctx, w, h, o.bg);
        for (const p of list) {
          p.y -= p.vy * m.v * dt;
          const x = p.x + Math.sin(t * 1.3 + p.phase) * 18;
          if (p.y < -p.s * 2) Object.assign(p, make(true));
          const life = Math.min(1, p.y / (h * 0.35));
          ctx.globalAlpha = m.a * Math.max(0, life) * 0.85;
          ctx.fillStyle = p.c;
          const beat = 1 + 0.08 * Math.sin(t * 6 + p.phase);
          heart(ctx, x, p.y, p.s * beat);
        }
      },
    };
  },

  // Falling code, like a terminal from a film.
  matrix(ctx, w, h, o) {
    const m = k(o);
    const glyphs = "01アイウエオカキクケコサシスセソタチツテトナニヌネノ01ابتثجحخدذرزسشصضطظعغفقكلمنهوي<>/{}[]=+*#$%".split("");
    const size = Math.round(15 * m.s);
    const cols = Math.ceil(w / size);
    const drops = Array.from({ length: cols }, () => ({ y: rand(-h, 0) / size, v: rand(6, 14), on: Math.random() < 0.35 + 0.6 * (o.density / 100) }));
    clear(ctx, w, h, o.bg);
    return {
      step(dt) {
        clear(ctx, w, h, o.bg, 0.12 + 0.1 * (1 - o.speed / 100));
        ctx.font = `${size}px monospace`;
        ctx.textBaseline = "top";
        drops.forEach((d, i) => {
          if (!d.on) return;
          const before = Math.floor(d.y);
          d.y += d.v * m.v * dt;
          if (Math.floor(d.y) === before) return;
          const y = Math.floor(d.y) * size;
          ctx.globalAlpha = m.a;
          ctx.fillStyle = o.colors[2];
          ctx.fillText(pick(glyphs), i * size, y);
          ctx.fillStyle = o.colors[0];
          ctx.globalAlpha = m.a * 0.8;
          ctx.fillText(pick(glyphs), i * size, y - size);
          if (y > h && Math.random() > 0.96) Object.assign(d, { y: 0, v: rand(6, 14), on: Math.random() < 0.35 + 0.6 * (o.density / 100) });
        });
      },
    };
  },

  // A scrolling grid, a scanning line, glitch bars and hex readings.
  cyber(ctx, w, h, o) {
    const m = k(o);
    const gap = Math.round(46 * m.s);
    let offset = 0;
    let scan = 0;
    const tags = Array.from({ length: count(w, h, 14, m.n) }, () => ({ x: rand(0, w), y: rand(0, h), life: rand(0, 3), text: "" }));
    const hex = () => `0x${Math.floor(Math.random() * 0xffffff).toString(16).toUpperCase().padStart(6, "0")}`;
    return {
      step(dt) {
        clear(ctx, w, h, o.bg);
        offset = (offset + 22 * m.v * dt) % gap;
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(o.colors[0], 0.13 * m.a);
        ctx.beginPath();
        for (let x = -gap + offset; x < w; x += gap) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
        }
        for (let y = -gap + offset; y < h; y += gap) {
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();
        scan = (scan + 140 * m.v * dt) % (h + 200);
        const g = ctx.createLinearGradient(0, scan - 120, 0, scan);
        g.addColorStop(0, rgba(o.colors[0], 0));
        g.addColorStop(1, rgba(o.colors[0], 0.22 * m.a));
        ctx.fillStyle = g;
        ctx.fillRect(0, scan - 120, w, 120);
        if (Math.random() < 0.08 * m.v) {
          ctx.globalAlpha = 0.35 * m.a;
          ctx.fillStyle = pick([o.colors[0], o.colors[1]]);
          ctx.fillRect(0, rand(0, h), w, rand(2, 10));
          ctx.globalAlpha = 1;
        }
        ctx.font = `${Math.round(12 * m.s)}px monospace`;
        for (const tg of tags) {
          tg.life -= dt * m.v;
          if (tg.life <= 0) Object.assign(tg, { x: rand(0, w - 80), y: rand(0, h), life: rand(1.5, 4), text: hex() });
          ctx.globalAlpha = Math.min(1, tg.life) * 0.7 * m.a;
          ctx.fillStyle = o.colors[2];
          ctx.fillText(tg.text, tg.x, tg.y);
        }
        ctx.globalAlpha = 1;
      },
    };
  },

  // Flying through stars (warp).
  stars(ctx, w, h, o) {
    const m = k(o);
    const list = Array.from({ length: count(w, h, 260, m.n) }, () => ({ x: rand(-1, 1), y: rand(-1, 1), z: rand(0.05, 1), c: pick(o.colors) }));
    return {
      step(dt) {
        clear(ctx, w, h, o.bg, 0.55);
        const cx = w / 2;
        const cy = h / 2;
        for (const s of list) {
          const pz = s.z;
          s.z -= 0.18 * m.v * dt;
          if (s.z <= 0.02) Object.assign(s, { x: rand(-1, 1), y: rand(-1, 1), z: 1 });
          const sx = cx + (s.x / s.z) * cx;
          const sy = cy + (s.y / s.z) * cy;
          const px = cx + (s.x / pz) * cx;
          const py = cy + (s.y / pz) * cy;
          if (sx < 0 || sx > w || sy < 0 || sy > h) continue;
          ctx.globalAlpha = m.a * (1 - s.z);
          ctx.strokeStyle = s.c;
          ctx.lineWidth = (1 - s.z) * 2.6 * m.s;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(sx, sy);
          ctx.stroke();
        }
      },
    };
  },

  // Northern lights: soft glowing ribbons.
  aurora(ctx, w, h, o) {
    const m = k(o);
    const bands = Math.max(2, Math.round(2 + m.n * 1.5));
    return {
      step(dt, t) {
        clear(ctx, w, h, o.bg);
        ctx.globalCompositeOperation = "lighter";
        for (let b = 0; b < bands; b++) {
          const c = o.colors[b % 3];
          const base = h * (0.25 + (b / bands) * 0.4);
          const amp = h * 0.09 * m.s;
          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let x = 0; x <= w; x += 24) {
            const y = base + Math.sin(x * 0.004 + t * 0.35 * m.v + b) * amp + Math.sin(x * 0.011 - t * 0.2 * m.v + b * 2) * amp * 0.5;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.closePath();
          const g = ctx.createLinearGradient(0, base - amp * 2, 0, h);
          g.addColorStop(0, rgba(c, 0));
          g.addColorStop(0.25, rgba(c, 0.32 * m.a));
          g.addColorStop(1, rgba(c, 0));
          ctx.fillStyle = g;
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
      },
    };
  },

  // Bubbles rising, wobbling, with a shine.
  bubbles(ctx, w, h, o) {
    const m = k(o);
    const make = (bottom) => ({ x: rand(0, w), y: bottom ? h + rand(10, 80) : rand(0, h), r: rand(5, 22) * m.s, vy: rand(25, 60), phase: rand(0, TAU), c: pick(o.colors.slice(0, 2)) });
    const list = Array.from({ length: count(w, h, 55, m.n) }, () => make(false));
    return {
      step(dt, t) {
        clear(ctx, w, h, o.bg);
        for (const b of list) {
          b.y -= b.vy * m.v * dt;
          if (b.y < -b.r * 2) Object.assign(b, make(true));
          const x = b.x + Math.sin(t * 2 + b.phase) * 6;
          ctx.globalAlpha = m.a * 0.7;
          ctx.strokeStyle = b.c;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(x, b.y, b.r, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = m.a * 0.12;
          ctx.fillStyle = b.c;
          ctx.fill();
          ctx.globalAlpha = m.a * 0.8;
          ctx.fillStyle = o.colors[2];
          ctx.beginPath();
          ctx.arc(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.18, 0, TAU);
          ctx.fill();
        }
      },
    };
  },

  // Snow falling softly.
  snow(ctx, w, h, o) {
    const m = k(o);
    const make = (top) => ({ x: rand(0, w), y: top ? -10 : rand(0, h), r: rand(1, 4) * m.s, vy: rand(20, 55), phase: rand(0, TAU), c: pick(o.colors) });
    const list = Array.from({ length: count(w, h, 220, m.n) }, () => make(false));
    return {
      step(dt, t) {
        clear(ctx, w, h, o.bg);
        for (const f of list) {
          f.y += f.vy * (0.5 + f.r / 4) * m.v * dt;
          f.x += Math.sin(t * 0.8 + f.phase) * 12 * dt;
          if (f.y > h + 10) Object.assign(f, make(true));
          ctx.globalAlpha = m.a * (0.4 + f.r / 8);
          ctx.fillStyle = f.c;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r, 0, TAU);
          ctx.fill();
        }
      },
    };
  },

  // Fireflies wandering and glowing.
  fireflies(ctx, w, h, o) {
    const m = k(o);
    const list = Array.from({ length: count(w, h, 60, m.n) }, () => ({ x: rand(0, w), y: rand(0, h), a: rand(0, TAU), v: rand(10, 30), phase: rand(0, TAU), r: rand(1.5, 3.5) * m.s, c: pick(o.colors) }));
    return {
      step(dt, t) {
        clear(ctx, w, h, o.bg);
        ctx.globalCompositeOperation = "lighter";
        for (const f of list) {
          f.a += rand(-1.5, 1.5) * dt;
          f.x = (f.x + Math.cos(f.a) * f.v * m.v * dt + w) % w;
          f.y = (f.y + Math.sin(f.a) * f.v * m.v * dt + h) % h;
          const glow = 0.35 + 0.65 * Math.max(0, Math.sin(t * 1.6 + f.phase));
          const r = f.r * 6;
          const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
          g.addColorStop(0, rgba(f.c, glow * m.a));
          g.addColorStop(0.3, rgba(f.c, glow * 0.35 * m.a));
          g.addColorStop(1, rgba(f.c, 0));
          ctx.fillStyle = g;
          ctx.fillRect(f.x - r, f.y - r, r * 2, r * 2);
        }
        ctx.globalCompositeOperation = "source-over";
      },
    };
  },

  // Points drifting, joined by lines when close.
  network(ctx, w, h, o) {
    const m = k(o);
    const list = Array.from({ length: Math.min(150, count(w, h, 80, m.n)) }, () => ({ x: rand(0, w), y: rand(0, h), vx: rand(-20, 20), vy: rand(-20, 20), c: pick(o.colors.slice(0, 2)) }));
    const reach = 150 * m.s;
    return {
      step(dt) {
        clear(ctx, w, h, o.bg);
        for (const p of list) {
          p.x += p.vx * m.v * dt;
          p.y += p.vy * m.v * dt;
          if (p.x < 0 || p.x > w) p.vx *= -1;
          if (p.y < 0 || p.y > h) p.vy *= -1;
        }
        ctx.lineWidth = 1;
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            const a = list[i];
            const b = list[j];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d > reach) continue;
            ctx.globalAlpha = (1 - d / reach) * 0.5 * m.a;
            ctx.strokeStyle = a.c;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = m.a;
        for (const p of list) {
          ctx.fillStyle = o.colors[2];
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.8 * m.s, 0, TAU);
          ctx.fill();
        }
      },
    };
  },

  // Rain streaks with a lightning flash now and then.
  rain(ctx, w, h, o) {
    const m = k(o);
    const make = () => ({ x: rand(-100, w), y: rand(-h, 0), l: rand(12, 26) * m.s, v: rand(600, 900), c: pick(o.colors.slice(0, 2)) });
    const list = Array.from({ length: count(w, h, 200, m.n) }, make);
    let flash = 0;
    return {
      step(dt) {
        clear(ctx, w, h, o.bg);
        if (flash > 0) {
          ctx.globalAlpha = flash * 0.25 * m.a;
          ctx.fillStyle = o.colors[2];
          ctx.fillRect(0, 0, w, h);
          flash -= dt * 2.5;
        } else if (Math.random() < 0.002 * m.v) flash = 1;
        ctx.lineWidth = 1.2;
        for (const d of list) {
          d.y += d.v * m.v * 0.5 * dt;
          d.x += d.v * m.v * 0.08 * dt;
          if (d.y > h) Object.assign(d, make(), { y: -20 });
          ctx.globalAlpha = 0.55 * m.a;
          ctx.strokeStyle = d.c;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + d.l * 0.16, d.y + d.l);
          ctx.stroke();
        }
      },
    };
  },

  // Flowing lines, like silk or the sea at sunset.
  waves(ctx, w, h, o) {
    const m = k(o);
    const lines = Math.round(6 + 10 * (o.density / 100));
    return {
      step(dt, t) {
        clear(ctx, w, h, o.bg);
        ctx.lineWidth = 1.5 * m.s;
        for (let i = 0; i < lines; i++) {
          const p = i / lines;
          ctx.globalAlpha = (0.25 + 0.5 * Math.sin(p * Math.PI)) * m.a;
          ctx.strokeStyle = o.colors[i % 3];
          ctx.beginPath();
          for (let x = 0; x <= w; x += 16) {
            const y = h * (0.3 + p * 0.55) + Math.sin(x * 0.006 + t * 0.6 * m.v + i * 0.5) * 40 * m.s + Math.sin(x * 0.013 - t * 0.4 * m.v + i) * 18 * m.s;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      },
    };
  },

  // Confetti tumbling down.
  confetti(ctx, w, h, o) {
    const m = k(o);
    const make = (top) => ({ x: rand(0, w), y: top ? -10 : rand(0, h), w: rand(5, 10) * m.s, h: rand(8, 16) * m.s, vy: rand(40, 90), vx: rand(-20, 20), rot: rand(0, TAU), vr: rand(-4, 4), flip: rand(0, TAU), c: pick(o.colors) });
    const list = Array.from({ length: count(w, h, 120, m.n) }, () => make(false));
    return {
      step(dt, t) {
        clear(ctx, w, h, o.bg);
        for (const c of list) {
          c.y += c.vy * m.v * dt;
          c.x += c.vx * m.v * dt;
          c.rot += c.vr * m.v * dt;
          if (c.y > h + 20) Object.assign(c, make(true));
          ctx.save();
          ctx.translate(c.x, c.y);
          ctx.rotate(c.rot);
          ctx.scale(1, Math.cos(t * 5 + c.flip));
          ctx.globalAlpha = m.a * 0.9;
          ctx.fillStyle = c.c;
          ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
          ctx.restore();
        }
      },
    };
  },

  // Autumn leaves falling and spinning.
  leaves(ctx, w, h, o) {
    const m = k(o);
    const make = (top) => ({ x: rand(0, w), y: top ? -30 : rand(0, h), s: rand(9, 18) * m.s, vy: rand(25, 55), sway: rand(0.5, 1.4), phase: rand(0, TAU), rot: rand(0, TAU), vr: rand(-1.5, 1.5), c: pick(o.colors) });
    const list = Array.from({ length: count(w, h, 45, m.n) }, () => make(false));
    return {
      step(dt, t) {
        clear(ctx, w, h, o.bg);
        for (const l of list) {
          l.y += l.vy * m.v * dt;
          l.x += Math.sin(t * l.sway + l.phase) * 40 * m.v * dt;
          l.rot += l.vr * m.v * dt;
          if (l.y > h + 30) Object.assign(l, make(true));
          ctx.save();
          ctx.translate(l.x, l.y);
          ctx.rotate(l.rot);
          ctx.globalAlpha = m.a * 0.85;
          ctx.fillStyle = l.c;
          ctx.beginPath();
          ctx.moveTo(0, -l.s);
          ctx.quadraticCurveTo(l.s * 0.7, 0, 0, l.s);
          ctx.quadraticCurveTo(-l.s * 0.7, 0, 0, -l.s);
          ctx.fill();
          ctx.strokeStyle = rgba(o.bg, 0.5);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, -l.s);
          ctx.lineTo(0, l.s * 1.2);
          ctx.stroke();
          ctx.restore();
        }
      },
    };
  },

  // Neon outlines (triangles, squares, hexagons) floating and turning.
  geometric(ctx, w, h, o) {
    const m = k(o);
    const list = Array.from({ length: count(w, h, 30, m.n) }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(14, 40) * m.s, sides: pick([3, 4, 6]), rot: rand(0, TAU), vr: rand(-0.5, 0.5), vx: rand(-12, 12), vy: rand(-12, 12), c: pick(o.colors) }));
    return {
      step(dt) {
        clear(ctx, w, h, o.bg);
        ctx.lineWidth = 1.6;
        for (const g of list) {
          g.x = (g.x + g.vx * m.v * dt + w + 80) % (w + 80);
          g.y = (g.y + g.vy * m.v * dt + h + 80) % (h + 80);
          g.rot += g.vr * m.v * dt;
          ctx.save();
          ctx.translate(g.x - 40, g.y - 40);
          ctx.rotate(g.rot);
          ctx.globalAlpha = m.a * 0.75;
          ctx.strokeStyle = g.c;
          ctx.shadowColor = g.c;
          ctx.shadowBlur = 10;
          polygon(ctx, g.sides, g.r);
          ctx.stroke();
          ctx.restore();
        }
        ctx.shadowBlur = 0;
      },
    };
  },

  // Big soft colour blobs, like a lava lamp.
  blobs(ctx, w, h, o) {
    const m = k(o);
    const list = Array.from({ length: Math.max(3, Math.round(3 + m.n * 2.5)) }, (_, i) => ({ x: rand(0, w), y: rand(0, h), r: rand(0.18, 0.32) * Math.min(w, h) * m.s, vx: rand(-25, 25), vy: rand(-25, 25), c: o.colors[i % 3] }));
    return {
      step(dt) {
        clear(ctx, w, h, o.bg);
        ctx.globalCompositeOperation = "lighter";
        for (const b of list) {
          b.x += b.vx * m.v * dt;
          b.y += b.vy * m.v * dt;
          if (b.x < -b.r * 0.5 || b.x > w + b.r * 0.5) b.vx *= -1;
          if (b.y < -b.r * 0.5 || b.y > h + b.r * 0.5) b.vy *= -1;
          const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
          g.addColorStop(0, rgba(b.c, 0.45 * m.a));
          g.addColorStop(1, rgba(b.c, 0));
          ctx.fillStyle = g;
          ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
        }
        ctx.globalCompositeOperation = "source-over";
      },
    };
  },

  // A retro sun over a neon grid racing towards you.
  synthwave(ctx, w, h, o) {
    const m = k(o);
    let z = 0;
    return {
      step(dt) {
        clear(ctx, w, h, o.bg);
        const horizon = h * 0.55;
        const sr = Math.min(w, h) * 0.18 * m.s;
        const sx = w / 2;
        const sy = horizon - sr * 0.35;
        const sun = ctx.createLinearGradient(0, sy - sr, 0, sy + sr);
        sun.addColorStop(0, o.colors[2]);
        sun.addColorStop(1, o.colors[0]);
        ctx.globalAlpha = 0.85 * m.a;
        ctx.fillStyle = sun;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, TAU);
        ctx.fill();
        ctx.fillStyle = o.bg;
        for (let i = 0; i < 6; i++) {
          const y = sy + sr * (0.1 + i * 0.16);
          ctx.fillRect(sx - sr, y, sr * 2, 2 + i * 1.6);
        }
        ctx.fillStyle = o.bg;
        ctx.fillRect(0, horizon, w, h - horizon);
        z = (z + 0.6 * m.v * dt) % 1;
        ctx.strokeStyle = o.colors[1];
        ctx.lineWidth = 1.3;
        ctx.globalAlpha = 0.7 * m.a;
        const lines = Math.round(10 + 10 * (o.density / 100));
        for (let i = 0; i < lines; i++) {
          const p = (i + z) / lines;
          const y = horizon + (h - horizon) * p * p;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        for (let i = -16; i <= 16; i++) {
          ctx.beginPath();
          ctx.moveTo(sx + i * 18, horizon);
          ctx.lineTo(sx + i * w * 0.12, h);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
    };
  },
};

// The maker for `kind` (falls back to a plain page).
export function makeBackground(kind, ctx, w, h, options) {
  return (MAKERS[kind] || MAKERS.none)(ctx, w, h, options);
}
