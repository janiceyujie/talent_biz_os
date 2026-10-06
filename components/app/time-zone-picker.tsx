"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toLocale } from "@/lib/i18n/config";
import { canonicalZone, zoneOptions } from "@/lib/time-zones";
import { Combobox } from "./combobox";

/**
 * Choose an IANA time zone by city (either language), zone name, or offset.
 * Only real zones can be chosen: typing filters the list, and leaving the
 * field keeps an exact zone name or goes back to the last choice. With
 * `name`, it also submits the zone in a plain form.
 */
export function TimeZonePicker({
  label,
  value,
  onChange,
  required,
  name,
  hideLabel,
}: {
  label: string;
  value: string;
  onChange: (zone: string) => void;
  required?: boolean;
  name?: string;
  hideLabel?: boolean;
}) {
  const t = useTranslations("timeZone");
  const locale = toLocale(useLocale());
  const options = useMemo(() => zoneOptions(locale), [locale]);
  const [query, setQuery] = useState<string | null>(null); // null: showing the current choice
  const current = options.find((o) => o.zone === value);
  const display = current ? describe(current.city, current.zone, current.offset) : value;
  const q = (query ?? "").trim().toLowerCase();
  const matches = (q ? options.filter((o) => o.search.includes(q)) : options.filter((o) => o.city)).slice(0, 30);
  const commit = (zone: string) => {
    onChange(zone);
    setQuery(null);
  };
  return (
    <>
      <Combobox
        label={label}
        hideLabel={hideLabel}
        required={required}
        text={query ?? display}
        onText={setQuery}
        options={matches.map((o) => ({ id: o.zone, primary: o.city || o.zone, secondary: o.city ? `${o.zone} · ${o.offset}` : o.offset }))}
        onPick={commit}
        onBlur={() => {
          // A typed zone name, or text matching exactly one zone, counts as a choice; anything else goes back.
          const typed = query !== null && (canonicalZone(query) || (q && matches.length === 1 ? matches[0].zone : null));
          if (typed) commit(typed);
          else setQuery(null);
        }}
        clearLabel={t("clear")}
        onClear={value && !required ? () => commit("") : undefined}
        hint={query !== null && !matches.length ? t("noMatch") : undefined}
      />
      {name && <input type="hidden" name={name} value={value} />}
    </>
  );
}

function describe(city: string, zone: string, offset: string) {
  return city ? `${city} · ${zone} (${offset})` : `${zone} (${offset})`;
}
