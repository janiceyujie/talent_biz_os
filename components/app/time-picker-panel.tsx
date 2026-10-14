"use client";
import { useTranslations } from "next-intl";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { halfHourTimes } from "@/lib/calendar/input";

export function TimePickerPanel({focusOptions,value,typed,onPick,onClose,optional}:{focusOptions:boolean;value:string;typed:string|null;onPick:(time:string)=>void;onClose:()=>void;optional:boolean}) {
  const t=useTranslations("dateTimeInput");
  const ref=useRef<HTMLDivElement>(null);
  const current=typed||value;
  const times=current&&!halfHourTimes.includes(current)?[current,...halfHourTimes]:halfHourTimes;
  useEffect(()=>{
    const menu=ref.current,selected=menu?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if(menu&&selected)menu.scrollTop=selected.offsetTop-menu.offsetTop-(menu.clientHeight-selected.offsetHeight)/2;
  },[current]);
  useEffect(()=>{
    if(focusOptions)(ref.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') || ref.current?.querySelector<HTMLButtonElement>('[data-time-index="0"]'))?.focus();
  },[focusOptions]);
  const key=(event:KeyboardEvent<HTMLButtonElement>,index:number)=>{
    const next=event.key==="ArrowDown"?Math.min(index+1,times.length-1):event.key==="ArrowUp"?Math.max(index-1,0):event.key==="Home"?0:event.key==="End"?times.length-1:null;
    if(next!==null){event.preventDefault();ref.current?.querySelector<HTMLButtonElement>(`[data-time-index="${next}"]`)?.focus();}
  };
  return <div className="time-picker-panel">
    <header><strong>{t("chooseTime")}</strong><button type="button" className="icon-button" aria-label={t("close")} onClick={onClose}>×</button></header>
    <div className="time-picker-options" ref={ref} role="group" aria-label={t("chooseTime")}>{times.map((time,index)=><button type="button" key={time} data-time-index={index} aria-pressed={time===current} onMouseDown={e=>e.preventDefault()} onKeyDown={e=>key(e,index)} onClick={()=>onPick(time)}>{time}</button>)}</div>
    <footer>{optional&&<button type="button" className="text-button" onClick={()=>onPick("")}>{t("clear")}</button>}<span className="date-time-help">{t("timeHint")}</span></footer>
  </div>;
}
