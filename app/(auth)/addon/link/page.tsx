import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FormMessage } from "@/components/form";
import { SignOutButton } from "@/components/sign-out-button";
import { requestFor } from "@/lib/addon/link";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { ConfirmLink } from "./confirm-link";

// Our site's half of linking a Gmail account to the Gmail add-on (docs/design/gmail-addon.md,
// Linking): signed in as usual, the person confirms both accounts here; then the card in
// Gmail asks once more, which only that Gmail account can answer.
export default async function AddonLinkPage({ searchParams }: PageProps<"/addon/link">) {
  const t = await getTranslations("addonLink");
  const token = String((await searchParams).token ?? "");
  const here = `/addon/link?${new URLSearchParams({ token })}`;
  const session = await getSession();
  if (!session) redirect(`/sign-in?${new URLSearchParams({ next: here })}`);

  const request = token ? await requestFor(token) : null;
  if (!request || (request.personId && request.personId !== session.personId))
    return (
      <div className="auth-stack">
        <h1>{t("title")}</h1>
        <FormMessage tone="error">{t("expired")}</FormMessage>
      </div>
    );

  const done = request.personId === session.personId;
  const hasArtist = !!(await getCurrentTalent(session.personId));
  return (
    <div className="auth-stack">
      <h1>{t("title")}</h1>
      {done ? (
        <>
          <FormMessage tone="info">{t("done")}</FormMessage>
          {!hasArtist && <Link href="/onboarding">{t("finishSetup")}</Link>}
        </>
      ) : (
        <>
          <p>{t("confirm", { gmail: request.googleEmail, person: session.email })}</p>
          <ConfirmLink token={token} />
          <p className="muted">{t("notYou")}</p>
          <SignOutButton className="secondary full" to={`/sign-in?${new URLSearchParams({ next: here })}`} />
        </>
      )}
    </div>
  );
}
