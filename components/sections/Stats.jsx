"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, animate } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";

// Counts up the leading number of values like "14+" or "340 m²" once visible;
// anything that doesn't start with a number is shown as-is.
function CountUp({ value }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const match = /^(\d+)(.*)$/.exec(value || "");
  const [display, setDisplay] = useState(match ? `0${match[2]}` : value);

  useEffect(() => {
    if (!inView || !match) return;
    const target = Number(match[1]);
    const suffix = match[2];
    const controls = animate(0, target, {
      duration: 1.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(`${Math.round(v)}${suffix}`),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value]);

  return (
    <span ref={ref} dir="ltr">
      {display}
    </span>
  );
}

export default function Stats({ data }) {
  const { lang } = useLanguage();
  const items = data?.items || [];
  if (items.length === 0) return null;

  return (
    <section className="relative z-10 -mt-16 px-4 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto grid max-w-6xl grid-cols-2 overflow-hidden rounded-3xl border border-white/10 bg-brand-navy-light/90 shadow-2xl shadow-black/40 backdrop-blur-xl lg:grid-cols-4"
      >
        {items.map((item, i) => (
          <div
            key={i}
            className="border-white/10 p-6 text-center sm:p-8 [&:not(:last-child)]:border-e max-lg:[&:nth-child(2n)]:border-e-0 max-lg:[&:nth-child(-n+2)]:border-b"
          >
            <div className="text-3xl font-extrabold text-brand-orange sm:text-4xl">
              <CountUp value={item.value} />
            </div>
            <div className="mt-2 text-sm text-white/70 sm:text-base">{item.label?.[lang]}</div>
          </div>
        ))}
      </motion.div>
    </section>
  );
}
