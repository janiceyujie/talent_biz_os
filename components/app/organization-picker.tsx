"use client";

import { useTranslations } from "next-intl";
import { useAppData } from "./app-data";
import { Combobox } from "./combobox";

export type OrganizationValue = { name: string; organizationId: string };

const NEW = "new-organization";

/**
 * An organisation, picked or typed new (decision 0012). Typing searches the
 * talent's organisations; picking one links it (by id); a typed name that
 * isn't one is created when the form is saved. `exclude` leaves out those
 * already there (e.g. on the project).
 */
export function OrganizationPicker({
  label,
  value,
  onChange,
  exclude = [],
  required = true,
}: {
  label: string;
  value: OrganizationValue;
  onChange: (value: OrganizationValue) => void;
  exclude?: string[];
  required?: boolean;
}) {
  const data = useAppData();
  const t = useTranslations("editor");
  const typed = value.name.trim();
  const query = typed.toLowerCase();
  const matches = data.organizations
    .filter((o) => (!o.archived && !exclude.includes(o.id)) || o.id === value.organizationId)
    .filter((o) => !query || o.name.toLowerCase().includes(query))
    .slice(0, 8);
  const exact = matches.some((o) => o.name.toLowerCase() === query);
  return (
    <Combobox
      label={label}
      required={required}
      placeholder={t("orgPlaceholder")}
      text={value.name}
      onText={(name) => onChange({ name, organizationId: "" })}
      explicitPick
      options={[
        ...matches.map((o) => ({ id: o.id, primary: o.name })),
        ...(typed && !exact ? [{ id: NEW, primary: t("orgNew", { name: typed }) }] : []),
      ]}
      onPick={(id) => {
        if (id === NEW) return onChange({ name: typed, organizationId: "" });
        onChange({ name: data.organizations.find((o) => o.id === id)?.name ?? "", organizationId: id });
      }}
      hint={value.organizationId ? t("orgLinked") : typed ? t("orgWillCreate") : undefined}
    />
  );
}
