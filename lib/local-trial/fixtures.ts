import { createHash } from "node:crypto";
import { addDateMonths, parseDateInput } from "../calendar/input";
import { isSigned } from "../domain/phases";
import type * as s from "../db/schema";
import type { ProjectType } from "../project-types";
import type { Stage } from "../types";
import type { MessageAnalysis } from "../ai/analysis";

export const TRIAL_VERSION = "local-trial-v1";
export function trialId(workspace: string, month: string, key: string) {
  const hex = createHash("sha256").update(`${TRIAL_VERSION}:${workspace}:${month}:${key}`).digest("hex").slice(0, 32).split("");
  hex[12] = "5"; hex[16] = "8";
  return `${hex.slice(0,8).join("")}-${hex.slice(8,12).join("")}-${hex.slice(12,16).join("")}-${hex.slice(16,20).join("")}-${hex.slice(20).join("")}`;
}

/** All content below is intentional synthetic user data, never a model result or real mail. */
export function trialFixtures(talentId: string, personId: string, startMonth: string, timeZone: string) {
  if (!/^\d{4}-\d{2}$/.test(startMonth) || !parseDateInput(`${startMonth}-01`)) throw new Error("A valid start month is required");
  const secondMonth = addDateMonths(`${startMonth}-01`, 1).slice(0,7);
  const date = (month: 0|1, day: number) => `${month ? secondMonth : startMonth}-${String(day).padStart(2,"0")}`;
  const stamp = (d: string) => new Date(`${d}T04:00:00.000Z`);
  const id = (key: string) => trialId(talentId,startMonth,key);
  const note = "本機試用範例；人物、合作、金額及進度均為虛構，不代表實際邀約、簽約、送件或入帳。";
  const label = (value: string) => `範例｜${value}`;
  const organizations: (typeof s.organization.$inferInsert)[] = ["海岸演出製作","晨光品牌工作室","映日影像","新聲 Podcast","Harbour Creative","創作支持基金","North Sound Licensing","Tokyo Media"].map((name,i)=>({id:id(`org-${i}`),talentId,name:label(name),notes:note}));
  const contacts: (typeof s.contact.$inferInsert)[] = organizations.map((o,i)=>({id:id(`contact-${i}`),talentId,organizationId:o.id,role:"counterparty",name:label(["Alex Chen","林雨安","Sam Wu","周欣怡","Jamie Wong","陳品妤","Taylor Reed","Aoi Tanaka"][i]),company:o.name,email:`trial-${i}@example.invalid`,notes:note}));
  contacts.push({id:id("artist"),talentId,role:"artist",name:label("Max Aidan"),email:"artist@example.invalid",notes:note},{id:id("manager"),talentId,role:"manager",name:label("Jordan 經紀人"),email:"manager@example.invalid",notes:note});
  type Deal = {key:string;title:string;type:ProjectType;stage:Stage;fee:number|null;currency:"TWD"|"USD"|"HKD"|"EUR"|"GBP"|"JPY";org:number;month:0|1;day:number;work:string};
  const deals: Deal[] = [
    {key:"festival",title:"海岸音樂節演出",type:"gig",stage:"in_progress",fee:120000,currency:"TWD",org:0,month:0,day:24,work:"45 分鐘演出；彩排及音控確認"},
    {key:"brand",title:"秋季品牌短影片",type:"brand_deal",stage:"in_progress",fee:96000,currency:"TWD",org:1,month:0,day:18,work:"1 支 Reel、3 則限時動態；2 次修改"},
    {key:"headphone",title:"耳機開箱業配",type:"sponsored_post",stage:"collecting_payment",fee:40000,currency:"TWD",org:1,month:0,day:5,work:"1 支 YouTube 開箱影片；已交件，尾款待收"},
    {key:"license",title:"片頭音樂授權",type:"licensing",stage:"closed",fee:30000,currency:"TWD",org:2,month:0,day:2,work:"非專屬音樂授權；台灣、6 個月"},
    {key:"model",title:"冬季形象拍攝",type:"brand_deal",stage:"signed",fee:60000,currency:"TWD",org:1,month:1,day:5,work:"半日形象拍攝；12 張修圖；使用 90 天"},
    {key:"video",title:"城市品牌影片製作",type:"brand_deal",stage:"signed",fee:180000,currency:"TWD",org:2,month:1,day:18,work:"60 秒主影片、3 支直式剪輯；腳本及初剪審核"},
    {key:"podcast",title:"創作者 Podcast 訪談",type:"other",stage:"in_progress",fee:1600,currency:"USD",org:3,month:0,day:21,work:"60 分鐘錄製；1 集節目、2 支精華短片"},
    {key:"hong-kong",title:"香港品牌活動",type:"gig",stage:"signed",fee:18000,currency:"HKD",org:4,month:1,day:28,work:"30 分鐘現場演出；交通住宿另列"},
    {key:"europe-license",title:"歐洲節目音樂授權",type:"licensing",stage:"in_progress",fee:1200,currency:"EUR",org:6,month:0,day:26,work:"節目背景音樂；歐盟非專屬授權 6 個月"},
    {key:"europe",title:"歐洲短片音樂授權洽談",type:"licensing",stage:"negotiating",fee:2500,currency:"EUR",org:6,month:1,day:25,work:"授權地域及付費廣告權利尚待確認"},
    {key:"new-show",title:"11 月新演出邀約",type:"gig",stage:"offer",fee:null,currency:"TWD",org:0,month:1,day:30,work:"預計 40 分鐘演出；預算尚未確定"},
    {key:"workshop",title:"藝術共創工作坊",type:"other",stage:"signed",fee:75000,currency:"TWD",org:5,month:1,day:12,work:"2 場工作坊；成果照片及結案資料"},
    {key:"oct-film",title:"10 月形象影片",type:"brand_deal",stage:"collecting_payment",fee:110000,currency:"TWD",org:2,month:0,day:9,work:"主影片已交件；核對尾款及發票"},
    {key:"declined",title:"已婉拒的免費曝光邀約",type:"other",stage:"declined",fee:null,currency:"TWD",org:3,month:0,day:16,work:"無預算，已婉拒"},
    {key:"cancelled",title:"取消的快閃演出",type:"gig",stage:"cancelled",fee:20000,currency:"TWD",org:0,month:0,day:20,work:"主辦取消；無實際收付款"},
    {key:"london",title:"英國線上音樂授權",type:"licensing",stage:"signed",fee:900,currency:"GBP",org:6,month:1,day:20,work:"線上節目非專屬授權；12 個月"},
    {key:"japan",title:"日本短片音樂授權",type:"licensing",stage:"closed",fee:90000,currency:"JPY",org:7,month:0,day:6,work:"日本短片授權；已完成及收款"},
  ];
  const projects: (typeof s.project.$inferInsert)[] = deals.map(d=>({id:id(`project-${d.key}`),talentId,title:label(d.title),counterparty:organizations[d.org].name!,counterpartyId:contacts[d.org].id,type:d.type,stage:d.stage,quotedAmount:d.fee,quoteCurrency:d.currency,taxRate:d.currency==="TWD"?5:0,taxIncluded:false,notes:note,details:{deliverables:d.work,rights:d.type==="licensing"?d.work:"自然曝光使用 90 天，付費廣告另議",contractNotes:note,dates:[{what:d.work,date:date(d.month,d.day),time:"15:00",timeZone}],toConfirm:d.stage==="offer"||d.stage==="negotiating"?["確認預算、使用範圍、付款期限及交件時間"]:[]},createdAt:stamp(date(0,1)),updatedAt:stamp(date(0,Math.min(12,Math.max(1,d.day-5))))}));
  const projectOrganizations: (typeof s.projectOrganization.$inferInsert)[] = deals.map(d=>({id:id(`project-org-${d.key}`),talentId,projectId:id(`project-${d.key}`),organizationId:organizations[d.org].id!,role:"Client",isPrimary:true}));
  const projectContacts: (typeof s.projectContact.$inferInsert)[] = deals.map(d=>({id:id(`project-contact-${d.key}`),talentId,projectId:id(`project-${d.key}`),contactId:id("manager"),label:"Manager"}));
  const payments: (typeof s.payment.$inferInsert)[] = [];
  const events: (typeof s.calendarEvent.$inferInsert)[] = [];
  const todos: (typeof s.todo.$inferInsert)[] = [];
  const contracts: (typeof s.contract.$inferInsert)[] = [];
  for (const d of deals) {
    const projectId = id(`project-${d.key}`), day=date(d.month,d.day), earlier=date(d.month,Math.max(1,d.day-4));
    if (!isSigned(d.stage)) {
      if(d.stage==="offer"||d.stage==="negotiating") todos.push({id:id(`reply-${d.key}`),talentId,projectId,type:"reply",title:label(`回覆${d.title}的合作條件`),dueDate:date(0,d.stage==="offer"?13:14),timeZone,status:"open",notes:note});
      continue;
    }
    const closed=d.stage==="closed",collecting=d.stage==="collecting_payment";
    const depositDate=date(0,Math.min(10,Math.max(1,d.day-4)));
    payments.push({id:id(`payment-${d.key}-deposit`),talentId,projectId,direction:"in",installment:"deposit",label:label(`${d.title}訂金`),amount:d.fee!/2,currency:d.currency,taxRate:d.currency==="TWD"?5:0,taxIncluded:false,recordedOn:depositDate,dueOn:depositDate,status:"settled",settledOn:depositDate,settledAmount:d.fee!/2*(d.currency==="TWD"?1.05:1),invoiceRef:`TRIAL-${d.key}-D`,notes:note});
    const due=closed?day:date(d.month,Math.min(30,d.day+5));
    const balanceId=id(`payment-${d.key}-balance`);
    payments.push({id:balanceId,talentId,projectId,direction:"in",installment:"balance",label:label(`${d.title}尾款`),amount:d.fee!/2,currency:d.currency,taxRate:d.currency==="TWD"?5:0,taxIncluded:false,recordedOn:earlier,dueOn:due,status:closed?"settled":"expected",settledOn:closed?day:null,settledAmount:closed?d.fee!/2*(d.currency==="TWD"?1.05:1):null,invoiceRef:`TRIAL-${d.key}-B`,notes:note});
    payments.push({id:id(`cost-${d.key}`),talentId,projectId,direction:"out",label:label(`${d.title}製作／交通成本`),amount:Math.round(d.fee!*.12),currency:d.currency,taxRate:0,taxIncluded:true,recordedOn:earlier,dueOn:day,status:closed||collecting?"settled":"expected",settledOn:closed||collecting?day:null,settledAmount:closed||collecting?Math.round(d.fee!*.12):null,notes:note});
    for(const [suffix,eventDay,time,title] of [["prep",earlier,"11:00",`${d.title}準備會議`],["main",day,"15:00",d.title]] as const) events.push({id:id(`event-${d.key}-${suffix}`),talentId,projectId,kind:suffix==="main"&&d.type==="gig"?"performance":"meeting",title:label(title),startDate:eventDay,startTime:time,endDate:eventDay,endTime:suffix==="main"?"16:00":"11:45",endTimeZone:timeZone,timeZone,location:d.key==="hong-kong"?"香港（範例場地）":"線上／台北（範例場地）",status:"confirmed",notes:note});
    todos.push({id:id(`deliverable-${d.key}`),talentId,projectId,type:"deliverable",title:label(`${d.title}交件／確認資料`),dueDate:earlier,dueTime:"14:00",timeZone,status:closed||collecting?"done":"open",completedAt:closed||collecting?stamp(earlier):null,notes:note});
    if(!closed) todos.push({id:id(`collect-${d.key}`),talentId,projectId,paymentId:balanceId,type:"custom",title:label(`整理${d.title}的發票與收款憑證`),dueDate:due,timeZone,status:"open",notes:note});
    contracts.push({id:id(`contract-${d.key}-1`),talentId,projectId,versionNumber:1,status:"signed",signedAt:stamp(depositDate),createdAt:stamp(depositDate),terms:{fee:d.fee,taxIncluded:false,paymentTerms:"50% 訂金；交件後 5 日內結清尾款",keyTerms:`${d.work}。${note}`,fields:{},dates:[{what:d.work,date:day,time:"15:00",timeZone}]},diff:[]});
  }
  // A proposed revision remains a proposal and does not overwrite the agreed terms.
  contracts.push({id:id("contract-brand-2"),talentId,projectId:id("project-brand"),versionNumber:2,supersedesId:id("contract-brand-1"),status:"changes_requested",createdAt:stamp(date(0,11)),terms:{fee:108000,taxIncluded:false,paymentTerms:"50% 訂金；交件後 5 日內結清尾款",keyTerms:`新增 30 天付費廣告使用；尚未同意。${note}`,fields:{},dates:[]},diff:[{key:"fee",before:"96000",after:"108000"},{key:"keyTerms",before:"自然曝光使用 90 天，付費廣告另議",after:"提議增加 30 天付費廣告使用"}]});
  events.push({id:id("travel-festival"),talentId,projectId:id("project-festival"),kind:"travel",title:label("音樂節交通"),startDate:date(0,23),startTime:"10:15",timeZone,endDate:date(0,23),endTime:"12:10",endTimeZone:timeZone,transportMode:"train",operator:"範例鐵路",serviceNumber:"TRIAL-123",destination:"範例演出城市",notes:note}, {id:id("stay-festival"),talentId,projectId:id("project-festival"),kind:"accommodation",title:label("音樂節住宿"),startDate:date(0,23),startTime:"15:00",timeZone,endDate:date(0,25),endTime:"11:00",endTimeZone:timeZone,hotelName:"範例海岸旅店",notes:note});
  for(const [i,day] of [date(0,5),date(0,12),date(0,19),date(0,26),date(1,2),date(1,9),date(1,16),date(1,23),date(1,30)].entries()) events.push({id:id(`weekly-${i}`),talentId,kind:"meeting",title:label("每週工作整理"),startDate:day,startTime:"09:30",endDate:day,endTime:"10:00",endTimeZone:timeZone,timeZone,location:"線上",notes:note});
  const messages: (typeof s.message.$inferInsert)[] = [],analyses: (typeof s.messageAnalysis.$inferInsert)[] = [];
  for(const [i,d] of deals.entries()) {
    const intent=d.stage==="offer"?"inquiry":d.stage==="negotiating"?"negotiation":d.stage==="collecting_payment"?"payment":d.stage==="cancelled"?"cancellation":d.stage==="declined"?"other":d.stage==="signed"?"confirmation":"logistics";
    const msgId=id(`message-${d.key}`),title=label(`${d.title}合作來信`);
    const body=`主旨：${title}\n您好，關於${d.title}，預計${date(d.month,d.day)} 15:00（${timeZone}）。內容：${d.work}。${d.fee===null?"請提供報價。":`合作費用 ${d.currency} ${d.fee.toLocaleString("en-US")}（未稅）。`}${intent==="payment"?"尾款尚未確認入帳，請協助核對。":"請協助確認時間與合作細節。"}\n${note}`;
    messages.push({id:msgId,talentId,projectId:id(`project-${d.key}`),submittedBy:personId,channel:"forwarded_email",receivedAt:stamp(date(0,Math.min(12,i+1))),bodyText:body,dedupKey:id(`dedup-${d.key}`),status:d.stage==="declined"?"dismissed":d.stage==="closed"?"confirmed":"analyzed"});
    const analysis: MessageAnalysis={intent,projectType:d.type,language:"zh-TW",title,summary:body,transcript:"",transcriptWithheld:false,counterparty:{name:contacts[d.org].name!,company:organizations[d.org].name!,email:contacts[d.org].email!,phone:""},dates:[{what:d.work,date:date(d.month,d.day),time:"15:00",timeZone,asStated:`${date(d.month,d.day)} 15:00`}],money:{amount:d.fee,currency:d.currency,taxIncluded:false,asStated:d.fee===null?"":`${d.currency} ${d.fee}`},paymentTerms:"",replyBy:date(0,Math.min(15,i+3)),replyByStated:"",details:{},asks:["確認合作細節"],missing:d.stage==="offer"?["預算與使用權利"]:[],assumptions:[],flags:[],confidence:.95};
    analyses.push({id:id(`analysis-${d.key}`),messageId:msgId,talentId,intent,analysis,confidence:.95,modelVersion:"synthetic-fixture:no-api-call",promptVersion:TRIAL_VERSION});
  }
  for(const [i,title] of ["剪輯工具優惠電子報","創作者活動快訊"].entries()) {
    const msgId=id(`newsletter-${i}`);messages.push({id:msgId,talentId,submittedBy:personId,channel:"forwarded_email",receivedAt:stamp(date(0,10+i)),bodyText:`範例｜${title}\n這是試用的廣告／電子報，不是工作邀約，也不需要回覆。\n${note}`,dedupKey:id(`newsletter-dedup-${i}`),status:"dismissed"});
  }
  const templates: (typeof s.replyTemplate.$inferInsert)[] = [];
  for(const type of ["gig","brand_deal","sponsored_post","licensing","other"] as const) for(const language of ["zh-TW","en"] as const) {
    templates.push({id:id(`reply-template-${type}-${language}`),talentId,projectType:type,kind:"template",language,title:language==="en"?`[Sample] ${type} scope and quote`:label(`${type} 確認合作與報價`),body:language==="en"?"Hi {{counterparty}}, thank you for the invitation. Please confirm the date, deliverables, usage rights and payment schedule. Once confirmed, I will prepare a quote. This is a local trial template.":"您好 {{counterparty}}，謝謝邀約。請提供合作日期、交付內容、使用範圍與付款安排，確認後我會整理報價供您參考。這是本機試用範本。",tone:"professional"});
    templates.push({id:id(`past-reply-${type}-${language}`),talentId,projectType:type,kind:"past_reply",language,title:language==="en"?`[Sample] ${type} past reply`:label(`${type} 過往回覆`),body:language==="en"?"Thank you for the details. The scope includes one delivery and two revision rounds. Paid advertising is quoted separately. Please confirm the deposit and balance dates. Synthetic past reply only.":"謝謝提供資訊。本次範圍包含一份交付內容與兩次修改，付費廣告使用另行報價。請協助確認訂金與尾款日期。此為虛構的過往回覆。",tone:"professional"});
  }
  return {startMonth,secondMonth,note,id,date,deals,organizations,contacts,projects,projectOrganizations,projectContacts,payments,events,todos,contracts,messages,analyses,templates};
}
