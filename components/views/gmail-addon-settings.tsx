"use client";

// Settings → Connected services → Gmail add-on (docs/design/gmail-addon.md): the
// Gmail accounts this person linked, each with Unlink. Linking starts in Gmail.
import { Mail, Unlink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { unlinkGmailAddon } from "@/lib/actions/addon";
import { SettingsRow } from "./settings-row";

export function GmailAddonSettings({ onNotice }: { onNotice: (text: string) => void }) {
  const { gmailAddon } = useAppData();
  const t = useTranslations("settings");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!gmailAddon.available)
    return (
      <SettingsRow icon={<Mail size={20} />} label={t("gmailTitle")} hint={[t("gmailBody")]}>
        <span className="mock-chip">{t("comingSoon")}</span>
      </SettingsRow>
    );
  return (
    <SettingsRow
      icon={<Mail size={20} />}
      label={t("gmailTitle")}
      hint={[t("gmailBody")]}
      description={gmailAddon.links.length ? undefined : t("addonNone")}
      error={error}
    >
      {!!gmailAddon.links.length && (
        <ul className="addon-links">
          {gmailAddon.links.map((l) => (
            <li key={l.id}>
              <span>{l.email}</span>
              <button
                type="button"
                className="secondary"
                disabled={pending}
                aria-label={t("addonUnlinkLabel", { email: l.email })}
                onClick={() =>
                  startTransition(async () => {
                    const failed = await unlinkGmailAddon(l.id);
                    setError(failed);
                    if (!failed) onNotice(t("addonUnlinked", { email: l.email }));
                  })
                }
              >
                <Unlink size={16} aria-hidden="true" />
                {t("addonUnlink")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </SettingsRow>
  );
}
