import assert from "node:assert/strict";
import {test} from "node:test";
import {parseDateInput,parseTimeInput,addDateDays,addDateMonths} from "./input";
test("typed dates keep explicit year-month-day order and reject impossible dates",()=>{
  for(const text of ["20261012","2026/10/12","2026-10-12","２０２６１０１２"])assert.equal(parseDateInput(text),"2026-10-12");
  assert.equal(parseDateInput("2024/2/29"),"2024-02-29");
  for(const text of ["2026/2/29","2026/13/1","202610","10/12/2026","2026/4/31","2026/0/1","2026/1/0"])assert.equal(parseDateInput(text),null);
  assert.equal(parseDateInput(""),"");
});
test("typed times support numeric shorthand, arbitrary minutes and explicit AM/PM",()=>{
  for(const [text,value] of [["930","09:30"],["1530","15:30"],["9","09:00"],["9:3","09:03"],["0947","09:47"],["３３０pm","15:30"],["12am","00:00"],["12:30 PM","12:30"],["0000","00:00"],["2359","23:59"]])assert.equal(parseTimeInput(text),value);
  for(const text of ["2400","2360","13pm","0am","99999","9.5","-100"])assert.equal(parseTimeInput(text),null);
  assert.equal(parseTimeInput(""),"");
});
test("calendar navigation crosses month/year and clamps leap days without timezone changes",()=>{
  assert.equal(addDateDays("2026-12-31",1),"2027-01-01");
  assert.equal(addDateDays("2024-03-01",-1),"2024-02-29");
  assert.equal(addDateMonths("2026-01-31",1),"2026-02-28");
  assert.equal(addDateMonths("2024-01-31",1),"2024-02-29");
  assert.equal(addDateMonths("2026-12-31",1),"2027-01-31");
});
