import assert from "node:assert/strict";
import {test} from "node:test";
import {calendarLoadRange,workspaceQuery} from "./workspace-query";
import {managerMessageCursor} from "./message-page";
test("calendar windows contain adjacent weeks including leap years and year boundaries",()=>{
 assert.deepEqual(calendarLoadRange("2026-12-31"),{start:"2026-11-24",end:"2027-01-07"});
 assert.deepEqual(calendarLoadRange("2028-02-29"),{start:"2028-01-25",end:"2028-03-07"});
 assert.throws(()=>calendarLoadRange("2026-02-30"));
});
test("invalid views, dates and currencies fail before database reads",()=>{
 for(const query of ["view=unknown","view=calendar","view=calendar&start=2026-01-01&end=2026-12-31","start=2026-02-30&end=2026-03-01","start=2026-03-01","currency=bogus"])
  assert.throws(()=>workspaceQuery(new URLSearchParams(query)),query);
 assert.equal(workspaceQuery(new URLSearchParams("view=finance&currency=USD")).currency,"USD");
 assert.equal(workspaceQuery(new URLSearchParams("view=reminders")).view,"reminders");
});
test("message cursors reject malformed time and identifiers",()=>{
 const value="2026-10-18T12:00:00.000Z|11111111-1111-4111-8111-111111111111";
 assert.equal(managerMessageCursor(value)?.at,value.split("|")[0]);
 for(const cursor of ["bad","2026-99-01T12:00:00.000Z|11111111-1111-4111-8111-111111111111",value+"|extra",value.replace("11111111-1111-4111-8111-111111111111","no")])assert.throws(()=>managerMessageCursor(cursor));
});
