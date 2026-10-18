"use client";

import { ExternalLink, Headphones, Mic2, Music2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { SettingsGroup, SettingsRow } from "./settings-row";

// Launchers are deliberately separate from OAuth-connected services.
// Platform login, artist/show access and analytics remain on the official site.
const platforms = [
  {key:"spotifyArtists",dashboard:"https://artists.spotify.com/c",help:"https://support.spotify.com/us/artists/article/exporting-data/",Icon:Music2},
  {key:"spotifyCreators",dashboard:"https://creators.spotify.com/pod/login",help:"https://support.spotify.com/us/creators/article/downloading-your-shows-analytics-data/",Icon:Mic2},
  {key:"appleMusicArtists",dashboard:"https://artists.apple.com/a",help:"https://artists.apple.com/support/1105-understand-your-analytics",Icon:Headphones},
] as const;

export function CreatorPlatformSettings() {
  const t=useTranslations("creatorPlatforms");
  return <SettingsGroup collapsible title={t("title")} hint={[t("accessHelp"),t("syncHelp")]}>
    {platforms.map(({key,dashboard,help,Icon})=><SettingsRow key={key} label={t(`${key}.name`)} description={t(`${key}.metrics`)} hint={[t(`${key}.access`),t(`${key}.export`)]} icon={<Icon size={20}/>}>
      <div className="creator-platform-actions">
        <a className="secondary" href={dashboard} target="_blank" rel="noopener noreferrer" aria-label={t("openNamed",{platform:t(`${key}.name`)})}>{t("open")}<ExternalLink size={15} aria-hidden="true"/></a>
        <a className="creator-platform-export" href={help} target="_blank" rel="noopener noreferrer" aria-label={t("exportNamed",{platform:t(`${key}.name`)})}>{t("exportHelp")}</a>
      </div>
    </SettingsRow>)}
    <div className="creator-platform-note">{t("externalOnly")}</div>
  </SettingsGroup>;
}
