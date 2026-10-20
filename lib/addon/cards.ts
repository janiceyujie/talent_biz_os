// The Gmail add-on's cards (docs/design/gmail-addon.md, The card), as Google's
// card JSON (google.apps.card.v1): Google draws them in Gmail, on a computer
// and in the mobile apps. Pure: text comes in through `t`, every action points
// back at our one endpoint with an `action` parameter.

type Translate = (key: string, values?: Record<string, string | number>) => string;

type Button = { text: string; onClick: { action: { function: string; parameters: { key: string; value: string }[] } } | { openLink: { url: string; openAs?: "OVERLAY"; onClose?: "RELOAD" } } };
type Widget =
  | { textParagraph: { text: string } }
  | { decoratedText: { topLabel?: string; text: string; wrapText: true } }
  | {
      selectionInput: {
        name: string;
        label: string;
        type: "DROPDOWN";
        items: { text: string; value: string; selected: boolean }[];
        onChangeAction?: { function: string; parameters: { key: string; value: string }[] };
      };
    }
  | { buttonList: { buttons: Button[] } };
type Section = { header?: string; widgets: Widget[] };
export type Card = { header?: { title: string; subtitle?: string }; sections: Section[] };

/** The form fields Send reads. */
export const FIELD = { artist: "artist", project: "project" } as const;
/** The `action` parameter of each button. */
export type Action = "send" | "confirmLink" | "cancelLink" | "unlink" | "pickArtist";

/** Card text is the person's and the email's: Google reads a little HTML in it, so it's escaped. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function cards(t: Translate, endpoint: string) {
  const act = (text: string, action: Action, params: Record<string, string> = {}): Button => ({
    text,
    onClick: { action: { function: endpoint, parameters: [{ key: "action", value: action }, ...Object.entries(params).map(([key, value]) => ({ key, value }))] } },
  });
  const open = (text: string, url: string, reload = false): Button => ({
    text,
    onClick: { openLink: reload ? { url, openAs: "OVERLAY", onClose: "RELOAD" } : { url } },
  });
  const text = (s: string): Widget => ({ textParagraph: { text: esc(s) } });
  const buttons = (...b: Button[]): Widget => ({ buttonList: { buttons: b } });
  const header = { title: t("title") };
  const linkedAs = (person: string): Section => ({ widgets: [text(t("linkedAs", { email: person })), buttons(act(t("changeAccount"), "unlink"))] });

  return {
    /** Not linked: connect on our site; the card reloads when that window closes. */
    connect: (url: string): Card => ({ header, sections: [{ widgets: [text(t("connectIntro")), buttons(open(t("connect"), url, true))] }] }),

    /** Confirmed on our site; confirmed again here, which only this Gmail account can do. */
    confirmLink: (gmail: string, person: string): Card => ({
      header,
      sections: [{ widgets: [text(t("confirmLink", { gmail, person })), buttons(act(t("confirm"), "confirmLink"), act(t("cancel"), "cancelLink"))] }],
    }),

    /** Linked, but no artist to send to yet. */
    setup: (person: string, appUrl: string): Card => ({ header, sections: [{ widgets: [text(t("finishSetup")), buttons(open(t("openApp"), appUrl))] }, linkedAs(person)] }),

    /** No email open. */
    home: (person: string, appUrl: string): Card => ({ header, sections: [{ widgets: [text(t("openAnEmail")), buttons(open(t("openApp"), appUrl))] }, linkedAs(person)] }),

    /** The open conversation: where what's in already is, and the form for what isn't. */
    thread(v: {
      person: string;
      total: number;
      waiting: number;
      dismissed: number;
      filed: string[]; // project titles
      openUrl: string | null; // the newest message already in
      form: null | {
        fresh: number; // messages not in yet
        artists: { id: string; name: string }[];
        artistId: string;
        projects: { id: string; title: string }[];
        projectId: string;
      };
      notice: boolean; // a payment notice: sent only by the connected mailbox
    }): Card {
      const sections: Section[] = [];
      const status: Widget[] = [];
      for (const title of v.filed) status.push(text(t("filedUnder", { project: title })));
      if (v.waiting) status.push(text(t("waiting", { count: v.waiting })));
      if (v.dismissed) status.push(text(t("dismissed", { count: v.dismissed })));
      if (status.length) sections.push({ widgets: [...status, ...(v.openUrl ? [buttons(open(t("openApp"), v.openUrl))] : [])] });
      if (v.notice) sections.push({ widgets: [text(t("noticeOnlyMailbox"))] });
      else if (v.form) {
        const f = v.form;
        const widgets: Widget[] = [];
        if (status.length) widgets.push(text(t("newInThread", { count: f.fresh })));
        if (f.artists.length > 1)
          widgets.push({
            selectionInput: {
              name: FIELD.artist,
              label: t("artist"),
              type: "DROPDOWN",
              items: f.artists.map((a) => ({ text: a.name, value: a.id, selected: a.id === f.artistId })),
              // Another artist, other projects: the card is drawn again for them.
              onChangeAction: { function: endpoint, parameters: [{ key: "action", value: "pickArtist" }] },
            },
          });
        widgets.push({
          selectionInput: {
            name: FIELD.project,
            label: t("project"),
            type: "DROPDOWN",
            items: [{ text: t("decideInIntake"), value: "", selected: !f.projectId }, ...f.projects.map((p) => ({ text: p.title, value: p.id, selected: p.id === f.projectId }))],
          },
        });
        widgets.push(text(t("wholeThread", { count: v.total })));
        const params: Record<string, string> = f.artists.length > 1 ? {} : { [FIELD.artist]: f.artistId };
        widgets.push(buttons(act(status.length ? t("sendNew", { count: f.fresh }) : t("send"), "send", params)));
        sections.push({ header: t("sendHeading"), widgets });
      }
      sections.push(linkedAs(v.person));
      return { header, sections };
    },

    /** After Send. */
    sent: (v: { count: number; project: string | null; openUrl: string; person: string }): Card => ({
      header,
      sections: [
        {
          widgets: [
            text(t("sent", { count: v.count })),
            text(v.project ? t("sentConfirmProject", { project: v.project }) : t("sentConfirm")),
            buttons(open(t("openApp"), v.openUrl)),
          ],
        },
        linkedAs(v.person),
      ],
    }),

    /** Something went wrong; what to do is in the text. */
    problem: (message: string): Card => ({ header, sections: [{ widgets: [text(message)] }] }),
  };
}

/** A trigger's response: show this card. */
export const show = (card: Card) => ({ action: { navigations: [{ pushCard: card }] } });
/** A button's response: replace the card shown. */
export const replace = (card: Card) => ({ renderActions: { action: { navigations: [{ updateCard: card }] } } });
