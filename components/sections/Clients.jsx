"use client";

import SectionHeader from "@/components/sections/SectionHeader";

export default function Clients({ data }) {
  const items = (data?.items || []).filter((c) => c.logoUrl);
  if (items.length === 0) return null;

  // The track holds the logos twice and slides by half its width, so the loop is seamless.
  const track = [...items, ...items];

  return (
    <section id="clients" className="bg-brand-navy-light py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SectionHeader title={data.title} subtitle={data.subtitle} />
      </div>

      <div
        dir="ltr"
        className="group relative mt-14 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]"
      >
        <div className="flex w-max animate-marquee gap-6 group-hover:[animation-play-state:paused]">
          {track.map((client, i) => (
            <div
              key={i}
              aria-hidden={i >= items.length}
              className="flex h-28 w-44 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-brand-navy p-3 transition-all duration-300 hover:border-brand-orange/40 sm:h-32 sm:w-52"
              title={client.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={client.logoUrl}
                alt={client.name || ""}
                loading="lazy"
                className="max-h-full max-w-full object-contain opacity-80 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
