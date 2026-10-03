"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { appearances, type Appearance, type Role } from "@/lib/roles";

// The assistant character: one original figure (ported from the prototype)
// with role props — headphones, clipboard, camera… — and three looks. Purely
// presentational. Animations live in experience.css and stop under
// prefers-reduced-motion.

const roleColor: Record<Role, string> = {
  musician: "#597862",
  manager: "#566b8b",
  video: "#9b7357",
  influencer: "#8b6886",
  model: "#a06853",
  other: "#76785d",
};

const hair: Record<Appearance, string> = {
  female: "M39 42q-6-26 19-26 22-1 24 20L64 25Q53 41 39 42",
  male: "M40 44q-9-24 12-27 26-6 30 17l-9-5q-6 12-32 8",
  non_binary: "M39 38q-4-19 19-20 22 0 24 18l-11-6-8 6-10-5-9 9z",
};

export function RolePortrait({
  role,
  appearance = "non_binary",
  busy = false,
  animated = false,
}: {
  role: Role;
  appearance?: Appearance;
  busy?: boolean;
  animated?: boolean;
}) {
  const color = roleColor[role];
  return (
    <svg
      className={animated ? (busy ? "avatar-working" : "avatar-greeting") : ""}
      viewBox="0 0 120 132"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="60" cy="121" rx="32" ry="5" fill="#202c2a" opacity=".09" />
      <circle cx="60" cy="61" r="48" fill={color} opacity=".09" />
      <circle cx="98" cy="26" r="3" fill={color} opacity=".5" />
      <path d="M18 81v8m-4-4h8" stroke={color} opacity=".45" strokeWidth="2" />
      <g className="avatar-person" stroke="#293c36" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        {appearance === "female" && <path d="M37 34q0-21 24-21 24 0 24 27l3 36H32l4-31z" fill="#293c36" />}
        <path className="avatar-leg-left" d="M47 101v16l-10 4h18l3-20" fill="#293c36" />
        <path className="avatar-leg-right" d="M65 101l3 20h18l-11-5v-15" fill="#293c36" />
        <path d="M40 76q0-12 20-12t20 12l3 29H37z" fill={color} />
        <path d="M53 64l7 9 7-9" fill="#f3c9a6" />
        <g className="avatar-wave">
          <path d="M41 76L28 64l-3-17" stroke={color} strokeWidth="12" />
          <path d="M25 48l-3-9m3 9 3-10m-3 10-8-6" stroke="#dba980" strokeWidth="4" />
        </g>
        <path d="M79 78l9 13-10 7" stroke={color} strokeWidth="11" />
        <rect x="39" y="24" width="42" height="41" rx="19" fill="#f3c9a6" />
        <path d={hair[appearance]} fill={appearance === "non_binary" ? "#5b4135" : "#293c36"} />
        {appearance === "female" && (
          <>
            <circle cx="39" cy="52" r="2.8" fill="#d6b56b" stroke="none" />
            <circle cx="81" cy="52" r="2.8" fill="#d6b56b" stroke="none" />
          </>
        )}
        <g className="avatar-eyes" fill="#293c36" stroke="none">
          <circle cx="52" cy="45" r="2" />
          <circle cx="68" cy="45" r="2" />
        </g>
        <path d="M55 55q5 4 10 0" />
        {role === "manager" && (
          <>
            <path d="M44 43h13v8H44zm19 0h13v8H63zm-6 3h6" />
            <rect x="62" y="80" width="23" height="29" rx="3" fill="#f3f0dc" />
            <path d="M68 88h10m-10 6h10m-10 6h6" />
          </>
        )}
        {role === "musician" && (
          <>
            <path d="M35 37q0-24 25-24t25 24" />
            <path d="M35 36v12m50-12v12" strokeWidth="6" />
            <path d="M75 103l-7-17" stroke="#f3f0dc" strokeWidth="7" />
            <ellipse cx="66" cy="82" rx="7" ry="9" fill="#293c36" transform="rotate(-20 66 82)" />
          </>
        )}
        {role === "video" && (
          <>
            <path d="M45 66l17 20" stroke="#f3f0dc" />
            <rect x="58" y="83" width="32" height="23" rx="4" fill="#f3f0dc" />
            <circle cx="74" cy="95" r="7" fill={color} />
            <path d="M63 82v-4h9v4" />
          </>
        )}
        {role === "influencer" && (
          <>
            <rect x="68" y="77" width="19" height="31" rx="4" fill="#f3f0dc" />
            <path d="M74 82h7m-8 19h5" />
            <path d="M94 57l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#d6b56b" stroke="none" />
          </>
        )}
        {role === "model" && (
          <>
            <path d="M42 72l17 24 18-25" stroke="#f3f0dc" strokeWidth="7" />
            <path d="M81 39l6 4-6 4-3-4z" fill="#d6b56b" />
            <path d="M94 62v10m-5-5h10" stroke="#b58d48" />
          </>
        )}
        {role === "other" && (
          <>
            <path d="M59 83l15 3 13-3v23l-13 3-15-3z" fill="#f3f0dc" />
            <path d="M74 87v18m-10-15 6 1m8 0 5-1" />
          </>
        )}
      </g>
    </svg>
  );
}

/** The character as a button: click to replay the wave. */
export function RoleAvatar({ role, appearance, busy = false }: { role: Role; appearance: Appearance; busy?: boolean }) {
  const t = useTranslations("roles");
  const [greeting, setGreeting] = useState(0);
  return (
    <button
      type="button"
      className="role-avatar"
      aria-label={t("avatarWave", { role: t(`${role}.label`) })}
      title={t("avatarHint")}
      onClick={() => setGreeting((n) => n + 1)}
    >
      <RolePortrait key={`${role}-${appearance}-${greeting}-${busy}`} role={role} appearance={appearance} busy={busy} animated />
    </button>
  );
}

export function AvatarChoices({
  role,
  value,
  onChange,
}: {
  role: Role;
  value: Appearance;
  onChange: (value: Appearance) => void;
}) {
  const t = useTranslations("roles");
  return (
    <fieldset className="avatar-choices">
      <legend>{t("assistantLook")}</legend>
      {appearances.map((appearance) => (
        <label key={appearance} className={value === appearance ? "selected" : ""}>
          <input
            type="radio"
            name="appearance"
            value={appearance}
            checked={value === appearance}
            onChange={() => onChange(appearance)}
          />
          <RolePortrait role={role} appearance={appearance} />
          <span>{t(`appearance.${appearance}`)}</span>
        </label>
      ))}
    </fieldset>
  );
}
