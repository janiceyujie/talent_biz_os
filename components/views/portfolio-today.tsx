"use client";
import Link from "next/link";
import {useTranslations} from "next-intl";
import {useAppData} from "@/components/app/app-data";
import {usePortfolio} from "@/components/app/portfolio-provider";
import {InfoHint} from "@/components/app/info-hint";
import {dateInZone} from "@/lib/domain/dates";
import {summarize} from "@/lib/domain/workflow";
import {supportedCurrencies} from "@/lib/domain/money";
import {useMoney} from "@/lib/i18n/format";
export function PortfolioToday() {
  const data=useAppData(),scope=usePortfolio(),t=useTranslations("portfolio"),money=useMoney();
  const today=dateInZone(data.talent.timeZone);
  const tasks=data.calendar.filter(item=>item.source==="todo"&&!item.done&&!item.archived&&item.date<=today);
  const upcoming=data.calendar.filter(item=>!item.archived&&!item.done&&((item.endDate||item.travel?.endDate||item.date)>=today)).sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const currencyTotals=supportedCurrencies.filter(currency=>data.payments.some(row=>row.currency===currency&&!row.voided&&row.status!=="cancelled")).map(currency=>({currency,...summarize(data,"","9999-12-31",currency)}));
  return <div className="portfolio-today">
    <section className="surface padded portfolio-upcoming"><div className="section-header"><h2>{t("upcoming")}</h2><Link className="secondary compact" href={scope?.href("/calendar")||"/calendar"}>{t("openCalendar")}</Link></div>
      {upcoming.slice(0,8).map(item=><div className="portfolio-schedule-row" key={`${item.source}:${item.id}`}><span className="portfolio-record-artist">{item.artistName}</span><strong>{item.title}</strong><time>{item.date} {item.time}<small>{item.timeZone}</small></time></div>)}
      {!upcoming.length&&<p className="empty">{t("noUpcoming")}</p>}
      {upcoming.length>8&&<Link className="text-button" href={scope?.href("/calendar")||"/calendar"}>{t("more",{count:upcoming.length-8})}</Link>}
    </section>
    <section className="surface padded"><div className="section-header"><h2>{t("due")}</h2><InfoHint label={t("due")} notes={[t("dueHint")]}/></div>{tasks.slice(0,8).map(item=><div className="portfolio-schedule-row" key={item.id}><span className="portfolio-record-artist">{item.artistName}</span><strong>{item.title}</strong><time>{item.date} {item.time}</time></div>)}{!tasks.length&&<p className="empty">{t("noDue")}</p>}{tasks.length>8&&<Link className="text-button" href={scope?.href("/calendar")||"/calendar"}>{t("more",{count:tasks.length-8})}</Link>}</section>
    <section className="surface padded"><div className="section-header"><h2>{t("money")}</h2><Link className="secondary compact" href={scope?.href("/finance")||"/finance"}>{t("openFinance")}</Link></div><div className="portfolio-money">{currencyTotals.map(row=><article key={row.currency}><strong>{row.currency}</strong><dl><div><dt>{t("receivable")}</dt><dd>{money(row.receivable,row.currency)}</dd></div><div><dt>{t("payable")}</dt><dd>{money(row.payable,row.currency)}</dd></div></dl></article>)}</div>{!currencyTotals.length&&<p className="empty">{t("noMoney")}</p>}</section>
  </div>;
}
