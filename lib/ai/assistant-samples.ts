import type { Project } from "@/lib/types";
import type { AssistantSource } from "./assistant-context";
// Adapted from prototype sampleWorkspace(true). Dates are fixed for reproducible evaluation.
// This isolated synthetic portfolio is never inserted into PostgreSQL.
export function assistantSamples(): AssistantSource {
  const rows = [
    ["brand", "Autumn Brand Short Video [Sample]", "Morrow Studio", "brand_deal", "in_progress", 96000],
    ["show", "Coastal Music Festival [Sample]", "Island Stage", "gig", "negotiating", 120000],
    ["film", "City Brand Film [Sample]", "Morrow Studio", "brand_deal", "in_progress", 180000],
    ["audio", "Headphone Unboxing [Sample]", "Morrow Studio", "sponsored_post", "collecting_payment", 40000],
    ["license", "Opening Music License [Sample]", "Morrow Studio", "licensing", "closed", 30000],
  ] as const;
  const projects: Project[] = rows.map(([id,title,counterparty,type,stage,quotedAmount]) => ({ id,title,counterparty,type,stage,quotedAmount,counterpartyId:null,clientId:null,artist:id === "film" ? "Lin Yi-An [Sample]" : "Max Aidan [Sample]",currency:"TWD",taxRate:5,taxIncluded:false,details: { deliverables:id === "brand" ? "One Reel and three Stories" : id === "show" ? "45-minute performance" : id === "film" ? "60-second film and three vertical clips" : id === "audio" ? "Unboxing video delivered" : "Opening music license", ...(id === "brand" ? { rights:"90 days of organic use; paid advertising excluded", contractNotes:"Signed, synthetic example only" } : {}) },notes:"Synthetic fixture adapted from prototype; unprovided terms remain unknown.",nextAction:null,archived:false,updatedAt:"2026-10-07T12:00:00.000Z" }));
  const ledger = [
    ["brand-deposit","brand","in",48000,"settled","2026-10-07"], ["brand-balance","brand","in",48000,"expected","2026-10-21"],
    ["film-deposit","film","in",90000,"settled","2026-09-25"], ["film-balance","film","in",90000,"expected","2026-10-21"],
    ["audio-balance","audio","in",40000,"expected","2026-10-04"], ["license-income","license","in",30000,"settled","2026-09-25"],
    ["film-equipment","film","out",12000,"settled","2026-09-25"], ["film-editing","film","out",18000,"expected","2026-10-08"],
  ] as const;
  const payments: AssistantSource["payments"] = ledger.map(([id,projectId,direction,amount,status,date]) => ({id,projectId,direction,amount,status,label:id,projectType:projects.find(p=>p.id===projectId)!.type,installment:"regular",currency:"TWD",taxRate:5,taxIncluded:false,recordedDate:date,dueDate:date,settledAmount:status === "settled" ? amount * 1.05 : null,settledDate:status === "settled" ? date : null,invoiceRef:"",notes:"Synthetic",voided:false}));
  const calendar: AssistantSource["calendar"] = [["brand","Brand first cut delivery","2026-10-08","14:00"],["film","Film storyboard review","2026-10-07","15:00"]].map(([projectId,title,date,time],i)=>({id:`sample-task-${i}`,projectId,title,date,time,timeZone:"Asia/Taipei",source:"todo",kind:"deliverable",location:"Online",notes:"Synthetic",done:false,archived:false,travel:null,endDate:"",endTime:""}));
  return {talent:{id:"synthetic-portfolio",name:"Prototype Sample Portfolio",timeZone:"Asia/Taipei"},projects,payments,calendar,projectDetails:Object.fromEntries(projects.map(p=>[p.id,{projectId:p.id,details:p.details,notes:p.notes,offerText:"",people:[],organizations:[],timeline:[]}]))};
}
