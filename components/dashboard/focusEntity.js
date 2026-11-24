"use client";

// Points at the thing a notification is about, on whatever page shows it: lists tag their
// rows with data-entity="<kind>:<id>" (a task, a leave request, a project…), and this
// finds them, scrolls the first into view and makes them glow for a few seconds.
// Pages load their data after they open, so it waits (up to `waitMs`) for the rows.

// "task:abc" for a notification { entityType, entityId }, or null.
export const entityKey = (n) => (n?.entityType && n?.entityId ? `${n.entityType}:${n.entityId}` : null);

const GLOW_CLASS = "entity-glow";
const GLOW_MS = 6000;
const find = (keys) => keys.flatMap((k) => [...document.querySelectorAll(`[data-entity~="${CSS.escape(k)}"]`)]);

let stopLast = null;

// `keys`: entity keys. Returns a function that stops waiting.
export function focusEntities(keys, { waitMs = 10000 } = {}) {
  const wanted = [...new Set((keys || []).filter(Boolean))];
  if (!wanted.length || typeof document === "undefined") return () => {};
  stopLast?.();
  let done = false;
  let observer = null;
  let timer = null;

  const glow = (els) => {
    done = true;
    observer?.disconnect();
    clearTimeout(timer);
    const visible = els.filter((el) => el.getClientRects().length > 0);
    const first = visible[0] || els[0];
    first?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    for (const el of els) {
      el.classList.remove(GLOW_CLASS);
      // Restart the animation when it's already glowing.
      void el.offsetWidth;
      el.classList.add(GLOW_CLASS);
      setTimeout(() => el.classList.remove(GLOW_CLASS), GLOW_MS);
    }
  };
  const tryNow = () => {
    if (done) return;
    const els = find(wanted);
    if (els.length) glow(els);
  };

  tryNow();
  if (!done) {
    observer = new MutationObserver(() => tryNow());
    observer.observe(document.body, { childList: true, subtree: true });
    timer = setTimeout(() => {
      done = true;
      observer?.disconnect();
    }, waitMs);
  }
  const stop = () => {
    done = true;
    observer?.disconnect();
    clearTimeout(timer);
  };
  stopLast = stop;
  return stop;
}

// Is that thing on the page right now?
export const isOnPage = (key) => Boolean(key) && typeof document !== "undefined" && find([key]).length > 0;
