"use client";

import { useEffect, useState } from "react";
import { Laptop } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api } from "@/lib/clientApi";
import { Card } from "@/components/erp/ui/fields";

// Profile: the company equipment and licences registered to me.
export default function MyAssets() {
  const { t } = useLanguage();
  const [list, setList] = useState(null);
  useEffect(() => {
    api("/api/assets?mine=1")
      .then((d) => setList(d.assets))
      .catch(() => setList([]));
  }, []);
  if (!list) return null;
  return (
    <Card>
      <p className="mb-3 flex items-center gap-2 font-semibold">
        <Laptop size={18} className="text-brand-orange" /> {t("erp.assets.mine")}
      </p>
      {!list.length ? (
        <p className="text-sm text-white/60">{t("erp.assets.mineNone")}</p>
      ) : (
        <ul className="divide-y divide-white/5 text-sm">
          {list.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-mono text-xs text-white/60" dir="ltr">
                  {a.tag}
                </span>{" "}
                {a.name}
              </span>
              <span className="text-xs text-white/60">
                {t(`erp.assets.type.${a.type}`)}
                {a.licenseExpiry ? ` · ${a.licenseExpiry}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
