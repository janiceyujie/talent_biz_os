"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { addDateDays, addDateMonths } from "@/lib/calendar/input";

/** Calendar grid uses wall dates in UTC only for arithmetic; no event-zone conversion. */
export function DatePickerPanel({value,today,onPick,onClose,optional}:{value:string;today:string;onPick:(date:string)=>void;onClose:()=>void;optional:boolean}) {
  const t=useTranslations("dateTimeInput"),locale=useLocale();
  const [cursor,setCursor]=useState(value||today);
  const ref=useRef<HTMLDivElement>(null);
  const first=`${cursor.slice(0,7)}-01`;
  const offset=new Date(`${first}T12:00:00Z`).getUTCDay();
  const days=Array.from({length:42},(_,i)=>addDateDays(first,i-offset));
  const month=new Intl.DateTimeFormat(locale,{year:"numeric",month:"long",timeZone:"UTC"}).format(new Date(`${first}T12:00:00Z`));
  const fullDate=(date:string)=>new Intl.DateTimeFormat(locale,{dateStyle:"full",timeZone:"UTC"}).format(new Date(`${date}T12:00:00Z`));
  useEffect(()=>{ref.current?.querySelector<HTMLButtonElement>(`[data-day="${cursor}"]`)?.focus();},[cursor]);
  const key=(event:KeyboardEvent<HTMLButtonElement>,date:string)=>{
    let next:string|undefined;
    if(event.key==="ArrowLeft")next=addDateDays(date,-1);
    if(event.key==="ArrowRight")next=addDateDays(date,1);
    if(event.key==="ArrowUp")next=addDateDays(date,-7);
    if(event.key==="ArrowDown")next=addDateDays(date,7);
    if(event.key==="PageUp")next=addDateMonths(date,-1);
    if(event.key==="PageDown")next=addDateMonths(date,1);
    if(event.key==="Home")next=addDateDays(date,-new Date(`${date}T12:00:00Z`).getUTCDay());
    if(event.key==="End")next=addDateDays(date,6-new Date(`${date}T12:00:00Z`).getUTCDay());
    if(next){event.preventDefault();setCursor(next);}
  };
  return <div ref={ref} className="date-picker-panel">
    <header><button type="button" aria-label={t("previousMonth")} className="icon-button" onClick={()=>setCursor(addDateMonths(cursor,-1))}><ChevronLeft size={16}/></button><strong aria-live="polite">{month}</strong><button type="button" aria-label={t("nextMonth")} className="icon-button" onClick={()=>setCursor(addDateMonths(cursor,1))}><ChevronRight size={16}/></button><button type="button" className="icon-button" aria-label={t("close")} onClick={onClose}>×</button></header>
    <div className="date-picker-weekdays" aria-hidden="true">{Array.from({length:7},(_,i)=><span key={i}>{new Intl.DateTimeFormat(locale,{weekday:"narrow",timeZone:"UTC"}).format(new Date(Date.UTC(2024,0,7+i)))}</span>)}</div>
    <div role="grid" aria-label={month} className="date-picker-grid">{Array.from({length:6},(_,row)=><div role="row" key={row}>{days.slice(row*7,row*7+7).map(date=><div role="gridcell" key={date} aria-selected={date===value}><button type="button" data-day={date} tabIndex={date===cursor?0:-1} aria-label={fullDate(date)} aria-current={date===today?"date":undefined} className={[date===value?"selected":"",date===today?"today":"",date.slice(0,7)!==cursor.slice(0,7)?"outside":""].join(" ")} onKeyDown={e=>key(e,date)} onClick={()=>onPick(date)}>{Number(date.slice(-2))}</button></div>)}</div>)}</div>
    <footer><button type="button" className="text-button" onClick={()=>onPick(today)}>{t("today")}</button>{optional&&<button type="button" className="text-button" onClick={()=>onPick("")}>{t("clear")}</button>}</footer>
    <p className="date-time-help">{t("dateHint")}</p>
  </div>;
}
