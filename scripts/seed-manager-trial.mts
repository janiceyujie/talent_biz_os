import nextEnv from "@next/env";
import {createHash} from "node:crypto";
import {and,eq,inArray} from "drizzle-orm";
nextEnv.loadEnvConfig(process.cwd());
const {managerLocalEnabled}=await import("../lib/manager/config");
if(!managerLocalEnabled())throw new Error("manager_trial_requires_local_development");
const workspaceId=process.env.LOCAL_TRIAL_WORKSPACE_ID;
if(!workspaceId)throw new Error("local_trial_workspace_required");
const {db}=await import("../lib/db");
const s=await import("../lib/db/schema");
const owners=await db.select({personId:s.membership.personId}).from(s.membership).where(and(eq(s.membership.talentId,workspaceId),eq(s.membership.role,"owner"),eq(s.membership.status,"active")));
if(owners.length!==1)throw new Error("local_trial_requires_one_owner");
const owner=owners[0];
const id=(name:string)=>{const b=createHash("sha256").update(`manager-trial:${workspaceId}:${name}`).digest().subarray(0,16);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=b.toString("hex");return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
const artistIds=["A","B","C"].map(letter=>id(`artist:${letter}`));
const existing=await db.select({talentId:s.membership.talentId}).from(s.membership).where(and(eq(s.membership.personId,owner.personId),inArray(s.membership.role,["manager","agency_admin"]),eq(s.membership.status,"active")));
if(existing.some(row=>!artistIds.includes(row.talentId)))throw new Error("existing_manager_connections_preserved_remove_samples_or_use_fixture_test");
const note="Fictional local manager trial. Not a real artist, contract, award, message or payment.";
await db.transaction(async tx=>{
 await tx.insert(s.managerEntitlement).values({personId:owner.personId,plan:"manager",artistLimit:3,active:true,source:"local_trial"}).onConflictDoNothing();
 for(const [index,letter] of ["A","B","C"].entries()){
  const talentId=artistIds[index],personId=id(`owner:${letter}`),name=`Sample Artist ${letter}`;
  await tx.insert(s.person).values({id:personId,email:`manager-sample-${letter.toLowerCase()}-${workspaceId}@example.invalid`,displayName:name,emailVerified:false,locale:"zh-TW"}).onConflictDoNothing();
  // Fictional owners have no credential/provider account; no login or invitation mail is created.
  await tx.insert(s.talent).values({id:talentId,name,vertical:index===1?"influencer":index===2?"model":"music",timeZone:"Asia/Taipei"}).onConflictDoNothing();
  await tx.insert(s.membership).values({id:id(`ownership:${letter}`),talentId,personId,role:"owner",status:"active"}).onConflictDoNothing();
  await tx.insert(s.membership).values({id:id(`management:${letter}`),talentId,personId:owner.personId,role:"manager",status:"active"}).onConflictDoNothing();
  const projectId=id(`project:${letter}`);
  await tx.insert(s.project).values({id:projectId,talentId,title:`${name} sample collaboration`,counterparty:"Sample Studio",type:"other",stage:"signed",notes:note}).onConflictDoNothing();
  for(let n=0;n<12;n++){
   const date=new Date(Date.UTC(2026,9,13+n*4));const day=date.toISOString().slice(0,10);
   await tx.insert(s.calendarEvent).values({id:id(`event:${letter}:${n}`),talentId,projectId,kind:n%3===0?"meeting":"performance",title:`${name} · sample ${n%3===0?"planning meeting":"booking"}`,startDate:day,endDate:day,endTimeZone:"Asia/Taipei",startTime:`${10+index}:00`,endTime:`${11+index}:00`,timeZone:"Asia/Taipei",notes:note}).onConflictDoNothing();
  }
  for(let n=0;n<6;n++){
   await tx.insert(s.message).values({id:id(`message:${letter}:${n}`),talentId,projectId,submittedBy:personId,channel:"paste",receivedAt:new Date(Date.UTC(2026,9,2+n*2,8)),bodyText:`${name} — Sample collaboration inquiry ${n+1}\nPlease confirm scope, dates and the proposed fee.\n${note}`,dedupKey:id(`dedup:${letter}:${n}`),status:"confirmed"}).onConflictDoNothing();
   const currency=index===1?"USD":index===2?"HKD":"TWD",amount=(index===1?500:6000)+n*100;
   await tx.insert(s.payment).values({id:id(`payment:${letter}:${n}`),talentId,projectId,label:`Sample ${n%2===0?"booking fee":"production expense"}`,direction:n%2===0?"in":"out",amount,currency,recordedOn:`2026-10-${String(2+n).padStart(2,"0")}`,status:n<3?"settled":"expected",dueOn:n>=3?`2026-11-${String(n+2).padStart(2,"0")}`:null,notes:note}).onConflictDoNothing();
   if(n<3)await tx.insert(s.paymentReceipt).values({id:id(`receipt:${letter}:${n}`),talentId,paymentId:id(`payment:${letter}:${n}`),receivedOn:`2026-10-${String(4+n).padStart(2,"0")}`,cash:amount,withheld:0,recordedBy:personId}).onConflictDoNothing();
  }
 }
 const [opportunity]=await tx.select({id:s.grantOpportunity.id}).from(s.grantOpportunity).where(eq(s.grantOpportunity.source,"moc")).limit(1);
 if(opportunity){const applicationId=id("sample-grant"),todoId=id("sample-grant-task");
  await tx.insert(s.grantApplication).values({id:applicationId,talentId:artistIds[0],opportunityId:opportunity.id,notes:note}).onConflictDoNothing();
  await tx.insert(s.todo).values({id:todoId,talentId:artistIds[0],title:"Sample grant submission reminder",dueDate:"2026-10-26",dueTime:"15:00",timeZone:"Asia/Taipei",notes:note}).onConflictDoNothing();
  await tx.insert(s.grantTask).values({id:id("sample-grant-link"),applicationId,todoId,kind:"submission"}).onConflictDoNothing();
 }
});
console.log(JSON.stringify({sampleArtists:3,events:36,messages:18,payments:18,originalWorkspaceUnchanged:true}));process.exit(0);
