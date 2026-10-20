import assert from "node:assert/strict";
import { test } from "node:test";
import { briefingItems, snoozeReady } from "./briefing";
import { notificationIdPattern, withState, type Notification } from "./notifications";
const now = new Date("2026-10-17T14:00:00Z");
const base = { id:"invoice:11111111-1111-4111-8111-111111111111:1:2026-10-17", kind:"invoice" as const, title:"Client", number:"INV-1", status:"draft" as const, date:"2026-10-17", time:"", timeZone:"America/New_York", urgency:"today" as const, dueAt:null, href:"/finance" };
test("briefing hides active snoozes and returns them when due even after reloading state", () => {
 const state = {[base.id]:{readAt:null, snoozedUntil:"2026-10-17T16:00:00Z"}};
 assert.equal(briefingItems(withState([base],state,now),state,now,"America/New_York").length,0);
 const later=new Date("2026-10-17T16:01:00Z");
 assert.equal(briefingItems(withState([base],state,later),state,later,"America/New_York").length,1);
 assert.equal(snoozeReady(base.id,state,later),true);
 assert.equal(snoozeReady(base.id,{[base.id]:{...state[base.id],readAt:later.toISOString()}},later),false);
});
test("calendar dates use the workspace zone rather than the event's remote wall date", () => {
 const event: Notification={...base,kind:"calendar",source:"event",calendarKind:"meeting",marker:null,location:"",date:"2026-10-18",time:"01:00",timeZone:"Asia/Tokyo",dueAt:Date.parse("2026-10-17T16:00:00Z")};
 assert.equal(briefingItems(withState([event],{},now),{},now,"America/New_York").length,1);
 assert.equal(briefingItems(withState([{...event,dueAt:Date.parse("2026-10-18T16:00:00Z")}],{},now),{},now,"America/New_York").length,0);
});
test("read invoices stay in the daily agenda until resolved; future invoices do not", () => {
 const state = {[base.id]:{readAt:now.toISOString(),snoozedUntil:null}};
 assert.equal(briefingItems(withState([base],state,now),state,now,"America/New_York").length,1);
 assert.equal(briefingItems(withState([{...base,date:"2026-10-18"}],{},now),{},now,"America/New_York").length,0);
 assert.ok(notificationIdPattern.test(base.id));
 assert.equal(notificationIdPattern.test(base.id.replace(":1:",":0:")),false);
});


test("manager briefing uses selected artists with labels and never falls back to owner records", async () => {
 const {portfolioReminderData}=await import("./briefing");
 const {notifications}=await import("./notifications");
 const own={talent:{timeZone:"UTC"},calendar:[{title:"Private owner event"}],payments:[{label:"Private owner payment"}],projects:[],notificationState:{},preview:true,previewDate:"2026-10-07"} as unknown as import("@/lib/types").AppData;
 const events=["Alpha","Beta","Gamma"].map((name,i)=>({id:`00000000-0000-4000-8000-00000000000${i}`,artistId:name,artistName:name,title:"Rehearsal",source:"event" as const,kind:"meeting" as const,date:"2026-10-17",time:"18:00",timeZone:"UTC",location:"",projectId:null,suggestedProjectId:null,notes:"",done:false,archived:false,travel:null,endDate:"",endTime:""}));
 const workspace={artists:[],selectedIds:["Alpha","Beta","Gamma"],calendar:events,payments:[],projects:[],limited:false};
 const all=portfolioReminderData(own,workspace);
 assert.deepEqual(notifications(all,now,true).map(n=>n.title).sort(),["Alpha · Rehearsal","Beta · Rehearsal","Gamma · Rehearsal"]);
 const one=portfolioReminderData(own,{...workspace,selectedIds:["Beta"]});
 assert.deepEqual(one.calendar.map(n=>n.title),["Beta · Rehearsal"]);
 assert.equal(one.preview,false);assert.equal(one.previewDate,undefined);
 assert.deepEqual(portfolioReminderData(own).calendar,[]);
 assert.deepEqual(portfolioReminderData(own).payments,[]);
 assert.deepEqual(portfolioReminderData(own,{...workspace,selectedIds:[]}).calendar,[]);
 assert.equal(own.calendar[0].title,"Private owner event");
});


test("completed and archived todos stay out even with expired snoozes; reopening restores them", async () => {
 const {notifications}=await import("./notifications");
 const todo={id:"00000000-0000-4000-8000-000000000001",title:"Deliver stage plan",source:"todo",kind:"deliverable",date:"2026-10-17",time:"",timeZone:"UTC",done:false,archived:false,projectId:null};
 const data={talent:{timeZone:"UTC"},calendar:[todo],payments:[],projects:[],notificationState:{}} as unknown as import("@/lib/types").AppData;
 const rows=notifications(data,now,true);
 assert.equal(rows.length,1);
 const state={[rows[0].id]:{readAt:null,snoozedUntil:"2026-10-17T12:00:00Z"}};
 for(const flags of [{done:true,archived:false},{done:false,archived:true}]) {
  const completed={...data,calendar:data.calendar.map(row=>({...row,...flags}))};
  assert.equal(briefingItems(withState(notifications(completed,now,true),state,now),state,now,"UTC").length,0);
 }
 assert.equal(briefingItems(withState(rows,state,now),state,now,"UTC").length,1);
});
