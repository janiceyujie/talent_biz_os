// Suggestions for travel place fields — common stations and airports, plus
// places already entered. Suggestions only: any text is accepted, and nothing
// here is a live timetable or flight lookup.
import type { Locale } from "@/lib/i18n/config";
import type { TransportMode } from "@/lib/types";

type Name = Record<Locale, string>;
const n = (zhTW: string, en: string): Name => ({ "zh-TW": zhTW, en });

const highSpeedRail: Name[] = [
  n("南港站", "Nangang Station"),
  n("台北站", "Taipei Station"),
  n("板橋站", "Banqiao Station"),
  n("桃園站", "Taoyuan Station"),
  n("新竹站", "Hsinchu Station"),
  n("苗栗站", "Miaoli Station"),
  n("台中站", "Taichung Station"),
  n("彰化站", "Changhua Station"),
  n("雲林站", "Yunlin Station"),
  n("嘉義站", "Chiayi Station"),
  n("台南站", "Tainan Station"),
  n("左營站", "Zuoying Station"),
];
const rail: Name[] = [
  n("台北站", "Taipei Station"),
  n("板橋站", "Banqiao Station"),
  n("桃園站", "Taoyuan Station"),
  n("新竹站", "Hsinchu Station"),
  n("台中站", "Taichung Station"),
  n("嘉義站", "Chiayi Station"),
  n("台南站", "Tainan Station"),
  n("高雄站", "Kaohsiung Station"),
  n("花蓮站", "Hualien Station"),
  n("台東站", "Taitung Station"),
];
const airports: Name[] = [
  n("TPE 桃園機場", "TPE Taoyuan Airport"),
  n("TSA 台北松山機場", "TSA Taipei Songshan Airport"),
  n("KHH 高雄機場", "KHH Kaohsiung Airport"),
  n("NRT 成田機場", "NRT Narita Airport"),
  n("HND 羽田機場", "HND Haneda Airport"),
  n("HKG 香港機場", "HKG Hong Kong Airport"),
  n("SIN 樟宜機場", "SIN Changi Airport"),
  n("ICN 仁川機場", "ICN Incheon Airport"),
  n("LAX 洛杉磯機場", "LAX Los Angeles Airport"),
  n("JFK 紐約甘迺迪機場", "JFK New York JFK Airport"),
];
const byMode: Partial<Record<TransportMode, Name[]>> = { high_speed_rail: highSpeedRail, train: rail, flight: airports };

export function placeSuggestions(mode: TransportMode | "", locale: Locale, previous: string[]) {
  const listed = (mode ? (byMode[mode] ?? []) : []).map((name) => name[locale]);
  return [...new Set([...listed, ...previous.filter(Boolean)])];
}
