import type en from "./messages/en.json";
import type { Locale } from "./lib/i18n/config";

// Types every t("…") key against the reference catalog.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof en;
  }
}
