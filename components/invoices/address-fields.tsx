"use client";
import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { addressCountries, emptyAddress, formatPostalAddress, taiwanCities, type AddressDraft } from "@/lib/invoices/address";
import { InfoHint } from "@/components/app/info-hint";
import { changeAddressField, districtsForRegion, findTaiwanDistrict } from "@/lib/invoices/taiwan-districts";
import { usStates } from "@/lib/invoices/tax";

export function InvoiceAddressFields({label,text,value,onChange,disabled,section}: {
 label:string;text:string;value:AddressDraft|null;onChange:(text:string,value:AddressDraft|null)=>void;disabled:boolean;section:"seller"|"buyer";
}) {
 const t=useTranslations("invoices.address"), states=useTranslations("invoices.taxSetup.states"), locale=useLocale(), id=useId();
 const [original, setOriginal] = useState<string|null>(null);
 const names=new Intl.DisplayNames([locale],{type:"region"});
 const a=value || emptyAddress();
 const districtOptions = districtsForRegion(a.region);
 const selectedDistrict = findTaiwanDistrict(a.region, a.city);
 const change=(key:keyof AddressDraft,v:string)=>{
  const next=changeAddressField(a,key,v);
  onChange(formatPostalAddress(next),next);
 };
 const input=(key:Exclude<keyof AddressDraft,"country"|"region">,required=false,autoComplete?:string)=><label htmlFor={`${id}-${key}`}>{t(key)}<input id={`${id}-${key}`} value={a[key]} required={required} maxLength={key === "postalCode" ? 20 : key === "city" ? 80 : 160} autoComplete={autoComplete ? `section-${section} billing ${autoComplete}` : undefined} pattern={key === "postalCode" ? a.country === "US" ? "[0-9]{5}(-[0-9]{4})?" : a.country === "TW" ? "[0-9]{3}([0-9]{2,3})?" : undefined : undefined} placeholder={key === "postalCode" ? a.country === "US" ? "12345 / 12345-6789" : a.country === "TW" ? "100 / 10058 / 100006" : undefined : undefined} onChange={e=>change(key,e.target.value)}/></label>;
 return <fieldset className="invoice-address" disabled={disabled}><legend>{label}</legend>
  {!value && text ? <><label>{t("existing")}<textarea value={text} rows={3} maxLength={600} onChange={e=>onChange(e.target.value,null)}/></label><button type="button" className="text-button" onClick={()=>{setOriginal(text);const [line1,...rest]=text.split(/\r?\n/);const next={...emptyAddress(),line1,line2:rest.join(", ")};onChange(text,next);}}>{t("convert")}</button></> : <>
   <label htmlFor={`${id}-country`}>{t("country")}<select id={`${id}-country`} required value={a.country} autoComplete={`section-${section} billing country`} onChange={e=>change("country",e.target.value)}><option value="">{t("choose")}</option>{["US","TW",...addressCountries.filter(c=>c!=="US"&&c!=="TW").sort((a,b)=>(names.of(a)||a).localeCompare(names.of(b)||b,locale))].map(c=><option key={c} value={c}>{names.of(c)}</option>)}</select></label>
   {input("line1",true,"address-line1")}{input("line2",false,"address-line2")}
   <div className="invoice-fields"><label htmlFor={`${id}-region`}>{t(a.country === "TW" ? "county" : a.country === "US" ? "state" : "region")}
   {a.country === "US" || a.country === "TW" ? <select id={`${id}-region`} required value={a.region} autoComplete={`section-${section} billing address-level1`} onChange={e=>change("region",e.target.value)}><option value="">{t("choose")}</option>{a.country === "US" ? usStates.map(c=><option key={c} value={c}>{c} · {states(c)}</option>) : taiwanCities.map(c=><option key={c} value={c}>{t(`cities.${c}`)}</option>)}</select> : <input id={`${id}-region`} value={a.region} maxLength={80} autoComplete={`section-${section} billing address-level1`} onChange={e=>change("region",e.target.value)}/>}</label>
   {a.country === "TW" ? <label htmlFor={`${id}-city`}>{t("district")}<select id={`${id}-city`} value={selectedDistrict?.name || a.city} disabled={!a.region} autoComplete={`section-${section} billing address-level2`} onChange={e=>change("city",e.target.value)}><option value="">{t(a.region ? "choose" : "chooseCountyFirst")}</option>{a.city && !selectedDistrict && <option value={a.city}>{t("existingDistrict",{name:a.city})}</option>}{districtOptions.map(d=><option key={d.id} value={d.name}>{t(`districts.${d.id}`)}</option>)}</select></label> : input("city",a.country === "US","address-level2")}
   <div className="invoice-postal-field">{input("postalCode",a.country === "US","postal-code")}{a.country === "TW" && <InfoHint label={t("postalCode")} notes={[t("postalHelp")]} />}</div></div>
  </>}
  {original && value && <details><summary>{t("existing")}</summary><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{original}</p><button type="button" className="text-button" onClick={()=>{onChange(original,null);setOriginal(null);}}>{t("keepOriginal")}</button></details>}
 </fieldset>;
}
