"use client";
import { CalendarDays, Clock3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { parseDateInput, parseTimeInput } from "@/lib/calendar/input";
import { DatePickerPanel } from "./date-picker-panel";
import { TimePickerPanel } from "./time-picker-panel";

/** Typed dates/times and a native top-layer popover share one canonical string value. */
export function DateTimeInput({kind,label,value,onChange,today,required=false,hideLabel=false,field,name,disabled=false,className=""}:{kind:"date"|"time";label:string;value:string;onChange:(value:string)=>void;today:string;required?:boolean;hideLabel?:boolean;field?:string;name?:string;disabled?:boolean;className?:string}) {
  const t=useTranslations("dateTimeInput");
  const id=useId(),errorId=`${id}-error`,panelId=`${id}-panel`;
  const input=useRef<HTMLInputElement>(null),panel=useRef<HTMLDivElement>(null);
  const focused=useRef(false);
  const [query,setQuery]=useState<string|null>(null),[error,setError]=useState("");
  const [focusOptions,setFocusOptions]=useState(false);
  const [open,setOpen]=useState(false),[position,setPosition]=useState<CSSProperties>({});
  const parse=kind==="date"?parseDateInput:parseTimeInput;
  const display=(v:string)=>kind==="date"?v.replaceAll("-","/"):v;
  const invalid=t(kind==="date"?"invalidDate":"invalidTime");
  useEffect(()=>{if(!focused.current){queueMicrotask(()=>{setQuery(null);setError("");input.current?.setCustomValidity("");});}},[value]);
  const place=()=>{
    const rect=input.current?.getBoundingClientRect();if(!rect)return;
    const viewportWidth=document.documentElement.clientWidth;
    const width=Math.min(kind==="date"?304:240,viewportWidth-24);
    const height=panel.current?.offsetHeight || (kind==="date"?384:320);
    const top=rect.bottom+8+height<=window.innerHeight?rect.bottom+8:Math.max(12,rect.top-height-8);
    const left=Math.max(12,Math.min(rect.left,viewportWidth-width-12));
    setPosition({left,top,width,maxHeight:window.innerHeight-24});
  };
  useLayoutEffect(()=>{if(open)place();},[open,kind,position.width]); // eslint-disable-line react-hooks/exhaustive-deps -- measure native popover after its children mount
  useEffect(()=>{
    if(!open)return;
    window.addEventListener("resize",place);window.addEventListener("scroll",place,true);
    return ()=>{window.removeEventListener("resize",place);window.removeEventListener("scroll",place,true);};
  },[open,kind]); // eslint-disable-line react-hooks/exhaustive-deps -- place reads current refs and viewport
  const close=()=>{panel.current?.hidePopover();input.current?.focus();};
  const show=(keyboard=false)=>{setFocusOptions(keyboard);place();panel.current?.showPopover();};
  const commit=(raw:string,blur=false)=>{
    const parsed=parse(raw);
    if(parsed===""&&required){input.current?.setCustomValidity(t("required"));if(blur)setError(t("required"));return;}
    input.current?.setCustomValidity(parsed===null?invalid:"");
    if(parsed===null){if(blur)setError(invalid);return;}
    setError("");onChange(parsed);if(blur)setQuery(null);
  };
  const pick=(next:string)=>{input.current?.setCustomValidity("");setError("");setQuery(null);onChange(next);close();};
  const onKey=(event:KeyboardEvent<HTMLInputElement>)=>{
    if(event.key==="ArrowDown" || (kind==="time" && event.key==="ArrowUp")){event.preventDefault();show(true);}
    if(event.key==="Enter"){event.preventDefault();commit(query??display(value),true);if(open)close();}
    if(event.key==="Escape"&&open){event.preventDefault();event.stopPropagation();close();}
  };
  return <div className={`date-time-field ${className}`}>
    <label htmlFor={id} className={hideLabel?"sr-only":""}>{label}{required&&!hideLabel?" *":""}</label>
    <div className="date-time-control">
      <input ref={input} role="combobox" aria-autocomplete="none" id={id} aria-label={label} data-field={field} type="text" inputMode="numeric" autoComplete="off" placeholder={t(kind==="date"?"datePlaceholder":"timePlaceholder")} maxLength={kind==="date"?12:20} required={required} disabled={disabled} value={query??display(value)} aria-invalid={!!error} aria-describedby={error?errorId:undefined} aria-haspopup="dialog" aria-controls={panelId} aria-expanded={open} onFocus={()=>{focused.current=true;}} onChange={e=>{setQuery(e.target.value);setError("");commit(e.target.value);}} onBlur={()=>{focused.current=false;commit(query??display(value),true);}} onInvalid={()=>setError(input.current?.validity.valueMissing?t("required"):invalid)} onKeyDown={onKey}/>
      <button type="button" className="date-time-trigger" disabled={disabled} aria-label={t(kind==="date"?"openDate":"openTime",{label})} aria-expanded={open} aria-controls={panelId} onClick={()=>open?close():show()}>{kind==="date"?<CalendarDays size={17} aria-hidden="true"/>:<Clock3 size={17} aria-hidden="true"/>}</button>
    </div>
    {name&&<input type="hidden" name={name} value={value}/>}
    {error&&<small id={errorId} className="date-time-error" role="alert">{error}</small>}
    <div ref={panel} id={panelId} popover="auto" role="dialog" aria-label={t(kind==="date"?"openDate":"openTime",{label})} className="date-time-popover" style={position} onToggle={e=>setOpen(e.newState==="open")} onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();close();}}}>
      {open&&(kind==="date"?<DatePickerPanel value={parseDateInput(value)||""} today={today} optional={!required} onPick={pick} onClose={close}/>:<TimePickerPanel focusOptions={focusOptions} value={value} typed={query===null?null:parseTimeInput(query)} optional={!required} onPick={pick} onClose={close}/>)}
    </div>
  </div>;
}
