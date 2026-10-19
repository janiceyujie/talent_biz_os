import { z } from "zod";
import { usStates } from "./tax";

// ISO 3166-1 codes from the public-domain IANA tzdb country table.
export const addressCountries = ["AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI", "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW"] as const;
export const taiwanCities = ["taipei", "newTaipei", "taoyuan", "taichung", "tainan", "kaohsiung", "keelung", "hsinchuCity", "chiayiCity", "hsinchuCounty", "miaoli", "changhua", "nantou", "yunlin", "chiayiCounty", "pingtung", "yilan", "hualien", "taitung", "penghu", "kinmen", "lienchiang"] as const;
const cityNames: Record<string, string> = {
 taipei:"Taipei City", newTaipei:"New Taipei City", taoyuan:"Taoyuan City", taichung:"Taichung City", tainan:"Tainan City", kaohsiung:"Kaohsiung City", keelung:"Keelung City", hsinchuCity:"Hsinchu City", chiayiCity:"Chiayi City", hsinchuCounty:"Hsinchu County", miaoli:"Miaoli County", changhua:"Changhua County", nantou:"Nantou County", yunlin:"Yunlin County", chiayiCounty:"Chiayi County", pingtung:"Pingtung County", yilan:"Yilan County", hualien:"Hualien County", taitung:"Taitung County", penghu:"Penghu County", kinmen:"Kinmen County", lienchiang:"Lienchiang County"
};
const line = (max:number) => z.string().trim().max(max).refine(v => !/[\r\n]/.test(v));
export const postalAddressInput = z.strictObject({
 line1: line(160).refine(v=>!!v), line2: line(160), country: z.enum(addressCountries),
 region: line(80), city: line(80), postalCode: line(20),
}).superRefine((v, ctx)=>{
 if(v.country === "US" && (!(usStates as readonly string[]).includes(v.region) || !v.city || !/^\d{5}(-\d{4})?$/.test(v.postalCode))) ctx.addIssue({code:"custom",message:"address",path:["region"]});
 if(v.country === "TW" && (!(taiwanCities as readonly string[]).includes(v.region) || (v.postalCode !== "" && !/^\d{3}(\d{2,3})?$/.test(v.postalCode)))) ctx.addIssue({code:"custom",message:"address",path:["region"]});
});
export type PostalAddress = z.infer<typeof postalAddressInput>;
export type AddressDraft = Omit<PostalAddress,"country"> & {country:string};
export const emptyAddress = (): AddressDraft => ({line1:"",line2:"",country:"",region:"",city:"",postalCode:""});
/** Stable display text supports existing PDF and partner consumers; parts are stored separately. */
export function formatPostalAddress(a: AddressDraft): string {
 a = {...a, line1:a.line1.trim(), line2:a.line2.trim(), city:a.city.trim(), region:a.region.trim(), postalCode:a.postalCode.trim()};
 const region = a.country === "TW" ? (cityNames[a.region] || a.region) : a.region;
 const locality = [a.city, region].filter(Boolean).join(", ");
 const country = a.country ? new Intl.DisplayNames(["en"],{type:"region"}).of(a.country) : "";
 return [a.line1, a.line2, [locality, a.postalCode].filter(Boolean).join(" "), country].filter(Boolean).join("\n");
}
/** Never apply stale structured metadata after a legacy text-only address edit. */
export function matchingAddress(text:string, parts?: PostalAddress | null): PostalAddress | undefined {
 return parts && formatPostalAddress(parts) === text ? parts : undefined;
}
