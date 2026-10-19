import test from "node:test";
import assert from "node:assert/strict";
import { taiwanCities, formatPostalAddress, postalAddressInput } from "./address";
import { taiwanDistricts, districtsForRegion, findTaiwanDistrict, changeAddressField } from "./taiwan-districts";
import zh from "../../messages/zh-TW.json";
import en from "../../messages/en.json";
const address = {line1:"1 Test Road",line2:"",country:"TW",region:"taipei",city:"中正區",postalCode:"100006"};
test("official district catalog covers 368 districts and 22 counties, including duplicate postal prefixes", () => {
 assert.equal(taiwanDistricts.length,368); assert.equal(new Set(taiwanDistricts.map(d=>d.id)).size,368);
 assert.deepEqual([...new Set(taiwanDistricts.map(d=>d.region))].sort(),[...taiwanCities].sort());
 for (const d of taiwanDistricts) { assert.match(d.postalCode,/^\d{3}$/);assert.equal(zh.invoices.address.districts[d.id as keyof typeof zh.invoices.address.districts],d.name);assert.ok(en.invoices.address.districts[d.id as keyof typeof en.invoices.address.districts]); }
 assert.equal(districtsForRegion("hsinchuCity").length,3); assert.ok(districtsForRegion("hsinchuCity").every(d=>d.postalCode==="300"));
 for (const [region,city,zip] of [["taipei","中正區","100"],["newTaipei","板橋區","220"],["kinmen","金城鎮","893"],["lienchiang","南竿鄉","209"],["chiayiCity","東區","600"]]) assert.equal(findTaiwanDistrict(region,city)?.postalCode,zip);
 assert.equal(findTaiwanDistrict("taipei","Zhongzheng Dist.")?.postalCode,"100");
});
test("district selection fills postal prefix; county/country changes clear stale dependent fields",()=>{
 const county=changeAddressField(address,"region","newTaipei");assert.equal(county.city,"");assert.equal(county.postalCode,"");
 const district=changeAddressField(county,"city","板橋區");assert.equal(district.postalCode,"220");assert.equal(postalAddressInput.safeParse(district).success,true);assert.match(formatPostalAddress(district),/220/);
 const country=changeAddressField(address,"country","US");assert.equal(country.region,"");assert.equal(country.city,"");assert.equal(country.postalCode,"");
});
test("manual full codes and legacy districts survive reloads/unrelated edits",()=>{
 for(const [key,value] of [["line1","2 Test Road"],["line2","Unit 3"],["region","taipei"],["city","中正區"]] as const) assert.equal(changeAddressField(address,key,value).postalCode,"100006");
 const legacy={...address,city:"Legacy district",postalCode:"817"};assert.equal(changeAddressField(legacy,"line1","3 Test Road").postalCode,"817");assert.equal(findTaiwanDistrict(legacy.region,legacy.city),undefined);assert.equal(postalAddressInput.safeParse(legacy).success,true);
 const us={...address,country:"US",region:"NY",city:"New York",postalCode:"10001"};assert.equal(changeAddressField(us,"city","Albany").postalCode,"10001");
});
