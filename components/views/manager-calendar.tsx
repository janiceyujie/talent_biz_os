"use client";
import {useLocale,useTranslations} from "next-intl";
import {useState,type ReactNode} from "react";
import {InfoHint} from "@/components/app/info-hint";
import type {ManagerOverview} from "@/lib/manager/types";
export function ManagerCalendar({items,start,end,artistTag}:{items:ManagerOverview["calendar"];start:string;end:string;artistTag:(id:string)=>ReactNode}) {
  const t=useTranslations("manager"),locale=useLocale();const [day,setDay]=useState("");
  const months:string[]=[];
  for(let date=new Date(`${start.slice(0,7)}-01T12:00:00Z`);date.toISOString().slice(0,7)<=end.slice(0,7);date.setUTCMonth(date.getUTCMonth()+1))months.push(date.toISOString().slice(0,7));
  const [month,setMonth]=useState(start.slice(0,7));const first=new Date(`${month}-01T12:00:00Z`);
  const length=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  const monthEnd=`${month}-${String(length).padStart(2,"0")}`;
  const shown=items.filter(row=>row.date<=monthEnd&&(row.endDate||row.date)>=`${month}-01`&&(!day||(row.date<=day&&(row.endDate||row.date)>=day)));
  return <section className="manager-panel" aria-label={t("calendar")}><div className="manager-calendar-header"><h2>{t("calendar")}</h2><select aria-label={t("month")} value={month} onChange={event=>{setMonth(event.target.value);setDay("");}}>{months.map(value=><option key={value} value={value}>{value}</option>)}</select><button className="text-button" onClick={()=>setDay("")}>{t("wholeMonth")}</button><InfoHint label={t("calendar")} notes={[t("calendarHint")]}/></div>
    <div className="manager-month-grid">{Array.from({length:7},(_,index)=><span className="manager-weekday" key={`weekday${index}`}>{new Intl.DateTimeFormat(locale,{weekday:"short",timeZone:"UTC"}).format(new Date(Date.UTC(2024,0,7+index)))}</span>)}{Array.from({length:first.getUTCDay()},(_,index)=><span key={`pad${index}`}/>)}{Array.from({length},(_,index)=>{const date=`${month}-${String(index+1).padStart(2,"0")}`,rows=items.filter(row=>row.date<=date&&(row.endDate||row.date)>=date);return <button key={date} className={`manager-day ${day===date?"selected":""}`} disabled={date<start||date>end} aria-label={date<start||date>end?t("outsideRange",{date}):t("dayCount",{date,count:rows.length})} aria-pressed={day===date} onClick={()=>setDay(day===date?"":date)}><time dateTime={date}>{index+1}</time><span className="manager-day-count">{rows.length||""}</span><span className="manager-day-artists">{[...new Set(rows.map(row=>row.artistId))].map(id=><span key={id}>{artistTag(id)}</span>)}</span></button>;})}</div>
    <div className="manager-agenda">{!shown.length?<p className="muted">{t("noCalendar")}</p>:shown.map(row=><div className="manager-agenda-row" key={`${row.source}:${row.id}`}><time dateTime={row.date}>{row.date}<span>{row.time||t("noTime")}</span></time><div>{artistTag(row.artistId)}<strong>{row.title}</strong></div><InfoHint label={t("timeZone")} notes={[row.timeZone]}/></div>)}</div>
  </section>;
}
