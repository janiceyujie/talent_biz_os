import assert from "node:assert/strict";
import {test} from "node:test";
import {managerFinance} from "./finance";
const row={talentId:"A",currency:"TWD",amount:100,settledAmount:null,direction:"in",status:"expected",taxRate:5,taxIncluded:false,voidedAt:null};
test("manager finance separates artists and currencies, planned tax and actual settled cash",()=>{
  const groups=managerFinance([row,{...row,status:"settled",settledAmount:90},{...row,talentId:"B",currency:"USD",status:"settled",settledAmount:12},{...row,direction:"out"},{...row,status:"cancelled"},{...row,voidedAt:new Date()}]);
  assert.deepEqual(groups,[{artistId:"A",currency:"TWD",received:90,paid:0,receivable:105,payable:105},{artistId:"B",currency:"USD",received:12,paid:0,receivable:0,payable:0}]);
});
test("manager finance sums cents exactly and does not add tax twice to tax-inclusive amounts",()=>{
  assert.equal(managerFinance([{...row,amount:.1,taxRate:0},{...row,amount:.2,taxRate:0}])[0].receivable,.3);
  assert.equal(managerFinance([{...row,amount:105,taxIncluded:true}])[0].receivable,105);
});
