import districts from "./taiwan-districts.json";
import type { AddressDraft } from "./address";

type DistrictId = keyof typeof import("../../messages/en.json")["invoices"]["address"]["districts"];
export const taiwanDistricts = districts as (Omit<typeof districts[number], "id"> & { id: DistrictId })[];
export function districtsForRegion(region: string) {
  return taiwanDistricts.filter(d => d.region === region);
}
/** Accept existing Chinese or official English district names without rewriting stored addresses. */
export function findTaiwanDistrict(region: string, city: string) {
  return districtsForRegion(region).find(d => d.name === city.replaceAll("台", "臺") || d.id === `${region}_${city.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "")}`);
}
/** Only explicit selection changes reset dependent fields; manual full postal codes survive other edits. */
export function changeAddressField(address: AddressDraft, key: keyof AddressDraft, value: string): AddressDraft {
  if (address[key] === value) return address;
  const next = { ...address, [key]: value };
  if (key === "country") return { ...next, region: "", city: "", postalCode: "" };
  if (address.country === "TW") {
    if (key === "region") return { ...next, city: "", postalCode: "" };
    if (key === "city") return { ...next, postalCode: findTaiwanDistrict(address.region, value)?.postalCode || "" };
  }
  return next;
}
