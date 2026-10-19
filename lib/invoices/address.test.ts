import test from "node:test";
import assert from "node:assert/strict";
import { addressCountries, taiwanCities, postalAddressInput, formatPostalAddress, matchingAddress } from "./address";
import { usStates } from "./tax";
import { invoiceDefaultsInput } from "./defaults";
import { buyerBillingFields } from "./buyer-writeback";
import { invoiceBuyers } from "./buyers";
const us = {line1:"100 Example Road",line2:"Suite 2",country:"US" as const,region:"NY",city:"New York",postalCode:"10001"};
test("address options include 50 states and DC, all Taiwan counties/cities, and ISO countries",()=>{
 assert.equal(usStates.length,51); assert.equal(new Set(usStates).size,51);assert.ok(usStates.includes("DC"));
 assert.equal(taiwanCities.length,22);assert.equal(new Set(taiwanCities).size,22);assert.ok(taiwanCities.includes("lienchiang"));assert.ok(taiwanCities.includes("kinmen"));assert.equal(addressCountries.length,249);
});
test("country-specific validation rejects stale region and invalid ZIP",()=>{
 assert.equal(postalAddressInput.safeParse(us).success,true);
 for(const patch of [{region:"taipei"},{postalCode:"abc"},{city:""},{country:"ZZ"},{line1:"bad\nline"}]) assert.equal(postalAddressInput.safeParse({...us,...patch}).success,false);
 assert.equal(postalAddressInput.safeParse({...us,postalCode:"10001-1234"}).success,true);
 assert.equal(postalAddressInput.safeParse({...us,country:"TW",region:"taipei",city:"",postalCode:"100006"}).success,true);
 assert.equal(postalAddressInput.safeParse({...us,country:"TW",region:"NY"}).success,false);
});
test("PDF text and structured parts round trip; stale partner metadata is not applied",()=>{
 const text=formatPostalAddress(us);assert.equal(formatPostalAddress({...us,line1:" 100 Example Road ",city:" New York "}),text);assert.equal(text,"100 Example Road\nSuite 2\nNew York, NY 10001\nUnited States");
 assert.deepEqual(matchingAddress(text,us),us);assert.equal(matchingAddress("Changed manually",us),undefined);
 const rows=invoiceBuyers([], [{id:"test",name:"Test",notes:"",archived:false,billingAddress:text,billingAddressParts:us}]);assert.deepEqual(rows[0].buyerAddressParts,us);
 const defaults={sellerName:"Test",sellerAddress:text,sellerAddressParts:us,sellerEmail:"test@example.invalid",paymentInstructions:"Test only"};
 assert.deepEqual(invoiceDefaultsInput.parse(JSON.parse(JSON.stringify(defaults))),defaults);
 assert.equal(invoiceDefaultsInput.safeParse({...defaults,sellerAddress:"different"}).success,false);
 assert.equal(buyerBillingFields.safeParse({address:text,addressParts:us}).success,true);
 assert.equal(buyerBillingFields.safeParse({addressParts:us,email:"test@example.invalid"}).success,false);
 assert.equal(invoiceDefaultsInput.safeParse({...defaults,sellerAddress:"Legacy address",sellerAddressParts:undefined}).success,true);
});
