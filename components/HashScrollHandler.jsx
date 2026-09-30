"use client";

import { useEffect } from "react";
import { scrollToSection } from "@/lib/scrollNav";

export default function HashScrollHandler() {
  useEffect(() => {
    const hash = window.location.hash?.replace("#", "");
    if (!hash) return;
    const timer = setTimeout(() => scrollToSection(hash), 150);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
