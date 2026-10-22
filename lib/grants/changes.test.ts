import {test} from 'node:test';
import assert from 'node:assert/strict';
import {opportunityChange} from './changes';
import {notificationIdPattern,withState} from '../domain/notifications';
import {briefingItems} from '../domain/briefing';
import type {Notification} from '../domain/notifications';
const original={opensOn:'2026-10-01',closesOn:'2026-10-31'};
test('same dates on daily refresh, editorial changes and source adoption produce no new notification',()=>{assert.equal(opportunityChange(original,{...original}),null);});
test('new opportunities, extensions, shortened deadlines and unknown dates retain before/after values',()=>{
 assert.equal(opportunityChange(undefined,original)?.kind,'new');
 for(const deadline of ['2026-11-10','2026-10-20',null]){const event=opportunityChange(original,{...original,closesOn:deadline})!;assert.equal(event.oldClosesOn,'2026-10-31');assert.equal(event.newClosesOn,deadline);assert.equal(event.kind,'dates');}
});
test('changing back to the original deadline is a real new event',()=>{assert.ok(opportunityChange({...original,closesOn:'2026-11-10'},original));});
test('read opportunity versions leave the daily briefing; another version remains unread',()=>{
 const id='opportunity:00000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-000000000002';assert.ok(notificationIdPattern.test(id));
 const n:Notification={id,kind:'opportunity',changeKind:'dates',title:'Test',...{oldOpensOn:original.opensOn,newOpensOn:original.opensOn,oldClosesOn:original.closesOn,newClosesOn:null},date:'2026-10-20',time:'',timeZone:'UTC',urgency:'today',dueAt:null,href:'/grants'};
 const state={[id]:{readAt:'2026-10-20T12:00:00Z',snoozedUntil:null}},now=new Date('2026-10-20T13:00:00Z');
 assert.equal(briefingItems(withState([n],state,now),state,now,'UTC').length,0);
 assert.equal(briefingItems(withState([{...n,id:id.replace('000001:','000003:')}],state,now),state,now,'UTC').length,1);
 assert.equal(briefingItems(withState([{...n,date:'2026-10-21'}],{},now),{},now,'America/New_York').length,1,'Published changes are visible across UTC/local midnight');
});
