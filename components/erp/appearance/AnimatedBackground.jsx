"use client";

import { useEffect, useRef } from "react";
import { makeBackground } from "@/components/erp/appearance/backgrounds";

// One animated background on a canvas (components/erp/appearance/backgrounds.js).
//   settings: { kind, colors, density, speed, size, opacity }, bg: the page colour (hex)
//   still: draw it once and stop (motion off, or the system asks for less motion)
//   className: where it sits (the dashboard: fixed behind everything; a preview: a box)
// It pauses while the tab is hidden and redraws when its box changes size.
export default function AnimatedBackground({ settings, bg, still = false, className = "", fps = 60 }) {
  const canvas = useRef(null);
  const key = JSON.stringify([settings, bg, still, fps]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return undefined;
    const ctx = el.getContext("2d");
    const reduce = still || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let scene = null;
    let raf = 0;
    let last = 0;
    let t = 0;
    const minGap = 1000 / fps;

    const setup = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene = makeBackground(settings.kind, ctx, w, h, { ...settings, bg });
      // Still: a moment into the animation, so it isn't empty.
      if (reduce) for (let i = 0; i < 90; i++) scene.step(1 / 30, (t += 1 / 30));
      else scene.step(0, t);
    };
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (now - last < minGap) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      t += dt;
      scene.step(dt, t);
    };
    const start = () => {
      if (!reduce && !raf && !document.hidden) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisible = () => (document.hidden ? stop() : start());

    setup();
    start();
    const ro = new ResizeObserver(() => {
      setup();
    });
    ro.observe(el);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
    };
    // `key` stands for settings / bg / still / fps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <canvas ref={canvas} aria-hidden className={className} />;
}
