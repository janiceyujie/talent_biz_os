import type { AppData, InboxMessage } from "@/lib/types";
import { assistantSamples } from "./assistant-samples";

// Pure display fixtures. No database, mailbox or model calls.
export function workspaceSamples(real: AppData): AppData {
  const portfolio = assistantSamples();
  const mail = [
    ["show", "Festival booking inquiry [Sample]", "inquiry", "We would like to invite Max Aidan for a 45-minute set at Coastal Music Festival. Our proposed fee is TWD 120,000 before tax. Please confirm availability and send your technical rider. Travel and accommodation are still to be agreed.", 120000],
    ["brand", "Revised usage terms [Sample]", "contract", "For the Autumn Brand Short Video project, please review our proposed contract revision: add 30 days of paid advertising usage. This is a request, not an agreed change. Please quote the additional usage fee before we finalize the contract.", 0],
    ["film", "Storyboard review [Sample]", "logistics", "Please join the storyboard review at 15:00 Asia/Taipei on October 7, 2026. We will review the 60-second film and three vertical edits. The existing project fee remains unchanged.", 0],
    ["audio", "Outstanding balance follow-up [Sample]", "payment", "The TWD 42,000 tax-inclusive balance for Headphone Unboxing was due October 4. Our finance team is checking the payment date. No transfer has been confirmed yet.", 42000],
    ["brand", "Deposit payment notice [Sample]", "payment", "We have sent the TWD 50,400 tax-inclusive deposit for Autumn Brand Short Video. Please reconcile it with your bank records. This sample notice corresponds to the existing sample deposit, not a second payment.", 50400],
    [null, "Creator tools weekly newsletter [Sample]", "other", "This week's creator newsletter: editing tips, new camera accessories and a seasonal software promotion. This is a synthetic newsletter example, not a work offer. No response is needed.", 0],
  ] as const;
  const inbox: InboxMessage[] = mail.map(([projectId,title,intent,body,amount],i) => ({
    id:`preview-mail-${i}`,channel:"forwarded_email",body,receivedAt:`2026-10-07T${String(8-i).padStart(2,"0")}:00:00.000Z`,
    status:i===4?"confirmed":"analyzed",failure:null,projectId,files:[],
    analysis:{title,summary:body,intent,projectType:portfolio.projects.find(p=>p.id===projectId)?.type??"other",language:"en",transcript:"",transcriptWithheld:false,
      counterparty:{name:projectId==="show"?"Alex [Sample]":"Sam [Sample]",company:projectId==="show"?"Island Stage":"Morrow Studio",email:"sample@example.com",phone:""},
      dates:[],money:{amount:amount||null,currency:amount?"TWD":"",taxIncluded:i===0?false:amount?true:null,asStated:amount?String(amount):""},paymentTerms:"",replyBy:"",replyByStated:"",details:{},asks:[],missing:[],assumptions:[],flags:[],confidence:intent==="other"?0.2:0.95,
      modelVersion:"synthetic-fixture",promptVersion:"preview-v1"}
  }));
  return {...real,...portfolio,calendar:portfolio.calendar.map(c=>c.projectId==="film"?{...c,source:"event",kind:"meeting"}:c),preview:true,previewProjectDetails:portfolio.projectDetails,organizations:[],distinctOrganizations:[],projectPeople:[],previewDate:"2026-10-07",inbox,
    contacts:[{id:"preview-contact",role:"counterparty",organizationId:null,name:"Sam [Sample]",company:"Morrow Studio",email:"sample@example.com",phone:"",notes:"Synthetic contact",archived:false}],
    projects:portfolio.projects.map(p=>({...p,nextAction:p.id==="show"?{id:"preview-next-show",title:"Confirm festival availability [Sample]",dueDate:"2026-10-08"}:p.nextAction,updatedAt:p.id==="show"?"2026-09-25T12:00:00.000Z":p.updatedAt})),
    contracts:[],templates:[],drafts:[],files:[],externalEvents:[],notificationState:{},preferences:{"overview.layout":null},calendarFeed:false};
}
