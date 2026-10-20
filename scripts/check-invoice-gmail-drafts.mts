/** Local-only Gmail draft acceptance checks with a fake Gmail API and disposable identities. */
import env from "@next/env";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { writeFile, readFile } from "node:fs/promises";
env.loadEnvConfig(process.cwd());
Object.assign(process.env, { INVOICE_GMAIL_DRAFTS_ENABLED:"1", INVOICE_GMAIL_API_URL:"http://127.0.0.1:54500/gmail/v1", GOOGLE_OAUTH_TOKEN_URL:"http://127.0.0.1:54500/token", GOOGLE_CLIENT_ID:"synthetic-client", GOOGLE_CLIENT_SECRET:"synthetic-secret", BETTER_AUTH_URL:"http://localhost:3002", NEXT_DIST_DIR:process.env.INVOICE_QA_DIST_DIR || ".next-test" });
const base = "http://localhost:3002";
const local = (value: string) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname);
assert.equal(process.env.APP_ENV, "development");
for (const url of [
  base,
  process.env.DATABASE_URL!,
  process.env.SMTP_URL!,
  process.env.STORAGE_S3_ENDPOINT!,
])
  assert.ok(local(url), "Local targets only");
const { db } = await import("../lib/db");
const s = await import("../lib/db/schema");
const { default: postgres } = await import("postgres");
const q = postgres(process.env.DATABASE_URL!);
const { hashPassword } = await import("better-auth/crypto");
const { prepareInvoices } = await import("../lib/invoices/service");
const { PDFDocument } = await import("pdf-lib");
const suffix = randomBytes(5).toString("hex");
const people = Array.from({ length: 3 }, (_, i) => ({
  personId: randomUUID(),
  talentId: randomUUID(),
  projectId: randomUUID(),
  name: `Invoice QA ${i}`,
  email: `invoice-qa-${suffix}-${i}@example.invalid`,
  password: randomBytes(20).toString("base64url"),
}));
const cookies: string[] = [];
const [artist, , manager] = people;
const today = new Date().toISOString().slice(0, 10),
  later = "2099-10-31";
let checks = 0;
const ok = (value: unknown, label: string) => {
  assert.ok(value, label);
  checks++;
};
const request = (path: string, cookie = "", body?: unknown, origin = base) =>
  fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      Cookie: cookie,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
const post = async (path: string, body: unknown, cookie = cookies[0]) => {
  const r = await request(path, cookie, body);
  return { status: r.status, data: await r.json() };
};
async function action(name: string, args: unknown[], cookie = cookies[0]) {
  const manifest = JSON.parse(
    await readFile(`${process.env.NEXT_DIST_DIR}/dev/server/server-reference-manifest.json`, "utf8"),
  );
  const entry = Object.entries(manifest.node).find(
    ([, v]) => (v as { exportedName: string }).exportedName === name,
  );
  assert.ok(entry, `Missing action ${name}`);
  const r = await fetch(base + "/finance", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: base,
      "Content-Type": "text/plain;charset=UTF-8",
      "Next-Action": entry[0],
    },
    body: JSON.stringify(args),
  });
  const body = await r.text();
  assert.equal(r.status, 200);
  const root = body.split("\n").find((line) => line.startsWith("0:"));
  assert.ok(root);
  const id = JSON.parse(root.slice(2)).a?.replace("$@", "");
  const result = body
    .split("\n")
    .findLast(
      (line) =>
        line.startsWith(`${id}:`) &&
        /^(null|"|\[|\{)/.test(line.slice(String(id).length + 1)),
    );
  assert.ok(result);
  return JSON.parse(result.slice(String(id).length + 1));
}
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
const { seal }=await import("../lib/keys");
const { toColumns,tokenAad }=await import("../lib/mail/token");
const { GMAIL_SCOPE,GMAIL_COMPOSE_SCOPE }=await import("../lib/mail/scope");
const {processInvoiceGmail}=await import("../lib/invoices/gmail-worker");
const {run}=await import("graphile-worker");
type MockMessage={id:string;raw:string;labels:string[];messageId:string;internalDate:string};
const messages=new Map<string,MockMessage>(),drafts=new Map<string,string>();
let creates=0,sendCalls=0,updates=0,loseNext=false,tokenDenied=false,failNext=false;
const apiMessage=(m:MockMessage)=>({id:m.id,threadId:m.id,labelIds:m.labels,internalDate:m.internalDate,payload:{headers:[{name:"Message-ID",value:m.messageId}]}});
const fake=createServer(async(req,res)=>{
 try {
  const url=new URL(req.url!,"http://127.0.0.1:54500");let body="";for await(const part of req)body+=part;
  const reply=(status:number,data:unknown)=>{res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify(data));};
  if(url.pathname==="/token")return reply(tokenDenied?400:200,tokenDenied?{error:"invalid_grant"}:{access_token:"synthetic-access",expires_in:3600});
  if(url.pathname.includes("/send")){sendCalls++;return reply(500,{});}
  if(req.method==="PUT"||req.method==="DELETE"){updates++;return reply(500,{});}
  if(url.pathname==="/gmail/v1/users/me/drafts"&&req.method==="POST"){
   creates++;const raw=Buffer.from(JSON.parse(body).message.raw,"base64url").toString();
   const messageId=raw.match(/^Message-ID:\s*(.+)$/mi)?.[1].trim();if(!messageId)return reply(400,{});
   const id=(1000+creates).toString(16),draftId=`r-${id}`;
   const message={id,raw,labels:["DRAFT"],messageId,internalDate:String(Date.now())};messages.set(id,message);drafts.set(draftId,id);
   if(loseNext){loseNext=false;return reply(503,{error:"responseLostAfterCreation"});}
   return reply(200,{id:draftId,message:apiMessage(message)});
  }
  if(failNext){failNext=false;return reply(503,{error:"temporary"});}
  if(url.pathname==="/gmail/v1/users/me/drafts")return reply(200,{drafts:[...drafts].map(([id,msg])=>({id,message:{id:msg}}))});
  if(url.pathname.startsWith("/gmail/v1/users/me/drafts/")){
   const id=decodeURIComponent(url.pathname.split("/").at(-1)!);const m=messages.get(drafts.get(id)||"");return m?reply(200,{id,message:apiMessage(m)}):reply(404,{});
  }
  if(url.pathname==="/gmail/v1/users/me/messages"){
   const q=url.searchParams.get("q")||"";return reply(200,{messages:[...messages.values()].filter(m=>q.includes(m.messageId.replace(/[<>]/g,""))).map(m=>({id:m.id}))});
  }
  if(url.pathname.startsWith("/gmail/v1/users/me/messages/")){
   const m=messages.get(url.pathname.split("/").at(-1)!);return m?reply(200,apiMessage(m)):reply(404,{});
  }
  return reply(404,{});
 }catch{res.writeHead(500);res.end("{}");}
});
await new Promise<void>((resolve,reject)=>{fake.once("error",reject);fake.listen(54500,"127.0.0.1",resolve);});
const nextLog=createWriteStream("/private/tmp/invoice-gmail-next.log");
const next=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--hostname","127.0.0.1","--port","3002"],{env:{...process.env},stdio:["ignore","pipe","pipe"]});
next.stdout.pipe(nextLog);next.stderr.pipe(nextLog);
let runner:Awaited<ReturnType<typeof run>>|undefined;
const wait=async(check:()=>Promise<boolean>,label:string)=>{for(let i=0;i<120;i++){if(await check())return;await new Promise(r=>setTimeout(r,250));}throw new Error(`Timeout: ${label}`);};
const row=async(id:string)=>(await q`select * from invoice where id=${id} and talent_id=${artist.talentId}`)[0];
const status=async(id:string,value:string)=>wait(async()=> (await row(id))?.status===value,`invoice ${value}`);
try {
 await wait(async()=>fetch(base+"/sign-in").then(r=>r.ok).catch(()=>false),"Next ready");
 runner=await run({connectionString:process.env.DATABASE_URL,concurrency:2,pollInterval:100,taskList:{"invoice.gmail":async p=>processInvoiceGmail(p as Parameters<typeof processInvoiceGmail>[0])},noHandleSignals:true});
  for (const p of people) {
    await db.insert(s.person).values({
      id: p.personId,
      email: p.email,
      emailVerified: true,
      displayName: p.name,
      locale: "zh-TW",
    });
    await db.insert(s.authAccount).values({
      personId: p.personId,
      accountId: p.personId,
      providerId: "credential",
      password: await hashPassword(p.password),
    });
    await db.insert(s.talent).values({
      id: p.talentId,
      name: p.name,
      vertical: "music",
      timeZone: "UTC",
    });
    await db.insert(s.membership).values({
      talentId: p.talentId,
      personId: p.personId,
      role: "owner",
      status: "active",
    });
    await db.insert(s.project).values({
      id: p.projectId,
      talentId: p.talentId,
      title: "Synthetic USD performance",
      counterparty: "Test Client",
      type: "other",
      stage: "signed",
      quoteCurrency: "USD",
    });
    const r = await request("/api/auth/sign-in/email", "", {
      email: p.email,
      password: p.password,
    });
    ok(r.status === 200, "Fixture login");
    cookies.push(
      r.headers
        .getSetCookie()
        .map((v) => v.split(";")[0])
        .join(";"),
    );
  }
  await db.insert(s.membership).values({
    personId: manager.personId,
    talentId: artist.talentId,
    role: "manager",
    status: "active",
  });
  // Readiness is a PostgreSQL preference, never an official issuance permission.
  ok((await request("/api/invoices/taiwan-setup")).status === 401, "Taiwan setup requires login");
  const setup = {registered:true,businessName:"Synthetic Taiwan Studio",taxId:"12345675",route:"turnkey",providerName:"",numberTracksReady:true};
  const ready = await post("/api/invoices/taiwan-setup", setup);
  ok(ready.status === 200 && ready.data.readiness.available === false, "Turnkey setup saves without enabling official issuance");
  ok(ready.data.readiness.pending.join() === "connection", "Authorized transmission remains required");
  const reloaded = await (await request("/api/invoices/taiwan-setup", cookies[0])).json();
  ok(reloaded.setup.businessName === setup.businessName, "Taiwan setup survives a fresh request");
  ok((await q`select value from preference where talent_id=${artist.talentId} and person_id=${artist.personId} and key='invoice.taiwan-setup'`).length === 1, "Setup is stored in PostgreSQL");
  ok((await (await request("/api/invoices/taiwan-setup", cookies[1])).json()).setup.businessName === "", "Another workspace cannot read setup");
  ok((await post("/api/invoices/taiwan-setup", {...setup, available:true})).status !== 200, "Client cannot enable issuance");
  ok((await request("/api/invoices/taiwan-setup", cookies[0], setup, "https://example.invalid")).status !== 200, "Cross-origin setup rejected");
  const {taiwanSetup} = await import("../lib/invoices/taiwan-setup-service");
  await assert.rejects(() => taiwanSetup(artist.talentId, manager.personId, setup)); checks++;
  // The project continuation returns the exact new receivable; no title matching or duplicate insert.
  await request("/finance", cookies[1]);
  const receivable = {projectId: people[1].projectId, label: "Continuation regression", direction: "in", installment: "regular", amount: 250, currency: "USD", taxRate: 0, taxIncluded: false, recordedDate: today, dueDate: today, status: "expected"};
  const continuedPayment = await action("savePaymentWithId", [receivable], cookies[1]);
  ok(typeof continuedPayment.id === "string", "Save returns a stable payment ID for invoice continuation");
  const savedRows = await q`select * from payment where talent_id=${people[1].talentId} and id=${continuedPayment.id}`;
  ok(savedRows.length===1 && savedRows[0].currency==="USD", "Continuation saves one correctly scoped USD receivable");
  ok(!!(await action("savePaymentWithId", [{...receivable,projectId:artist.projectId}], cookies[1])).error, "Continuation rejects another workspace project");
  ok(!!(await action("savePaymentWithId", [{...receivable,amount:-1}], cookies[1])).error, "Continuation preserves amount validation");
  await request("/projects", cookies[1]);
  const splitProject = randomUUID();
  await db.insert(s.project).values({id:splitProject,talentId:people[1].talentId,title:"USD split regression",counterparty:"Test Client",type:"performance",stage:"signed",quoteCurrency:"USD",quotedAmount:1000,taxRate:0});
  ok(await action("createPaymentPlan", [{projectId:splitProject,percent:50,depositDue:today,balanceDue:today}],cookies[1])===null, "USD deposit and balance can be created");
  const splitRows=await q`select currency,amount from payment where project_id=${splitProject}`;
  ok(splitRows.length===2 && splitRows.every(p=>p.currency==="USD" && Number(p.amount)===500), "Deposit and balance inherit project currency");
  const payments = await db
    .insert(s.payment)
    .values(
      Array.from({ length: 30 }, (_, i) => ({
        talentId: artist.talentId,
        projectId: artist.projectId,
        label: `Synthetic performance ${i}`,
        direction: "in" as const,
        amount: 1000 + i,
        currency: "USD",
        taxRate: 0,
        taxIncluded: false,
        recordedOn: today,
        dueOn: later,
      })),
    )
    .returning();
  const input = {
    paymentId: payments[0].id,
    issueOn: today,
    dueOn: later,
    documentLanguage: "en",
    sellerName: "Taloox Test Artist / 測試音樂工作室",
    sellerAddress: "100 Example Avenue\nNew York, NY 10001",
    sellerEmail: "seller@example.invalid",
    buyerName: "Example Events / 測試活動公司",
    buyerAddress: "200 Example Street\nNew York, NY 10002",
    recipient: `invoice-test-${suffix}@example.invalid`,
    description: "Live performance fee / 現場演出費用",
    paymentInstructions:
      "Synthetic test only. Do not transfer funds.\nPayment instructions must be confirmed before a real invoice is sent.",
    taxNote:
      "Test fixture: no tax assessed. Not a determination of taxability.",
    subject: `Invoice acceptance ${suffix}`,
    body: "This is a synthetic invoice test. No payment is due.",
    taxConfirmed: true,
  };

  const taxReview = {country:"US",state:"NY",location:"200 Example Street, New York, NY 10002",treatment:"taxable",rate:8.875,included:false,source:"Synthetic QA rate only; no tax determination"};
  ok((await request("/api/invoices/tax-catalogue?state=CA&saleOn="+today)).status===401,"Tax catalogue requires authentication");
  const cataloguePage=await (await request("/api/invoices/tax-catalogue?state=CA&saleOn="+today,cookies[0])).json();
  ok(cataloguePage.items.length===20 && cataloguePage.nextOffset===20,"Locality catalogue is paginated in the database");
  const nextCataloguePage=await (await request("/api/invoices/tax-catalogue?state=CA&saleOn="+today+"&offset=20",cookies[0])).json();
  ok(!nextCataloguePage.items.some((r:{id:string})=>cataloguePage.items.some((s:{id:string})=>r.id===s.id)),"Locality pages do not overlap");
  const locality=cataloguePage.items[0];
  const catalogue={state:"CA",sellerState:"CA",saleOn:today,category:"photography",delivery:"physical",collection:"registered",exemption:"none",location:"Synthetic California tax test address",jurisdictionId:locality.id,jurisdictionConfirmed:true,standardSaleConfirmed:true};
  const merch = {...catalogue, category:"merchandise", merchandiseScope:"ordinaryInPerson"};
  ok((await post("/api/invoices/tax-catalogue", merch)).data.status === "ready", "Reviewed California ordinary merch uses combined locality rate");
  ok((await post("/api/invoices/tax-catalogue", {...merch,merchandiseScope:"other"})).data.status === "review", "Other merchandise needs review");
  ok((await post("/api/invoices/tax-catalogue", {...catalogue,category:"ticketAdmissions"})).data.reason === "admissions", "Tickets do not reuse merch tax");
  const resolved=await post("/api/invoices/tax-catalogue",catalogue);
  ok(resolved.status===200 && resolved.data.status==="ready" && resolved.data.rate===locality.rate,"Reviewed rule resolves a combined locality rate");
  ok((await request("/api/invoices/tax-catalogue",cookies[0],catalogue,"https://example.invalid")).status!==200,"Cross-origin tax resolution denied");
  ok((await post("/api/invoices/tax-catalogue",{...catalogue,category:"influencerSponsorship"})).data.status==="review","Unsupported service requires manual review");
  ok((await post("/api/invoices/tax-catalogue",{...catalogue,sellerState:"NY"})).data.status==="review","Cross-state transaction does not inherit rate");
  const unknownCoverage=await (await request("/api/invoices/tax-catalogue?state=TX&saleOn="+today,cookies[0])).json();
  ok(unknownCoverage.items.length===0 && ["pending","officialReference"].includes(unknownCoverage.coverage.coverage),"Reference-only state has no calculation-ready locality rates");
  const catalogueReview={country:"US",state:"CA",location:catalogue.location,treatment:resolved.data.treatment,rate:resolved.data.rate,included:false,source:resolved.data.source,catalogue};
  const catalogueInput={...input,description:"Synthetic photography session and physical prints",paymentId:payments[28].id,taxReview:catalogueReview,paymentBasis:{amount:payments[28].amount,taxRate:0,taxIncluded:false},taxNote:"Synthetic tax catalogue test only. No payment is due."};
  ok((await post("/api/invoices",{...catalogueInput,taxReview:{...catalogueReview,rate:0}})).status!==200,"Server rejects tampered catalogue rate");
  ok((await post("/api/invoices",{...catalogueInput,taxReview:{...catalogueReview,location:"Other location"}})).status!==200,"Server rejects mismatched catalogue address");
  ok((await post("/api/invoices",catalogueInput,cookies[1])).status!==200,"Catalogue cannot bypass invoice ownership");
  const catalogueInvoice=await post("/api/invoices",catalogueInput);
  ok(catalogueInvoice.status===200,"Catalogue-backed invoice saves locally");
  const catalogueInvoiceId=catalogueInvoice.data.id;
  const catalogueSaved=(await q`select snapshot from invoice where id=${catalogueInvoiceId}`)[0].snapshot;
  ok(catalogueSaved.taxReview.method==="catalogueReviewed" && catalogueSaved.taxReview.evidence.batchHash===resolved.data.batchHash && catalogueSaved.taxReview.evidence.ruleId===resolved.data.ruleId,"Invoice freezes rate and rule provenance");
  ok(Number((await q`select tax_rate from payment where id=${payments[28].id}`)[0].tax_rate)===resolved.data.rate,"Catalogue result updates the original receivable");
  const electronic={...catalogue,delivery:"electronic",jurisdictionId:undefined};
  const electronicResult=await post("/api/invoices/tax-catalogue",electronic);
  ok(electronicResult.data.status==="ready" && electronicResult.data.rate===0 && electronicResult.data.treatment==="nonTaxable","Electronic-only photographs use explicit non-taxable rule");
  const digitalInvoice=await post("/api/invoices",{...catalogueInput,paymentId:payments[29].id,paymentBasis:{amount:payments[29].amount,taxRate:0,taxIncluded:false},taxReview:{...catalogueReview,rate:0,treatment:"nonTaxable",source:electronicResult.data.source,catalogue:electronic}});
  ok(digitalInvoice.status===200,"Explicit non-taxable invoice is saved with rule evidence");
  const taxBasis = {amount:payments[27].amount,taxRate:0,taxIncluded:false};
  const taxInput = {...input,taxNote:"Synthetic tax calculation for local testing only. No payment is due.",paymentId:payments[27].id,taxReview,paymentBasis:taxBasis};
  ok((await post("/api/invoices",taxInput,cookies[1])).status!==200,"Foreign owner cannot change receivable tax");
  ok((await post("/api/invoices",taxInput,cookies[2])).status!==200,"Manager cannot change artist receivable tax");
  ok((await post("/api/invoices",{...taxInput,paymentBasis:undefined})).status!==200,"Tax override requires a receivable version basis");
  ok((await post("/api/invoices",{...taxInput,taxReview:{...taxReview,state:"XX"}})).status!==200,"Unknown state rejected");
  ok((await post("/api/invoices",{...taxInput,taxReview:{...taxReview,treatment:"exempt"}})).status!==200,"Exemption cannot carry positive sales tax");
  const taxed=await post("/api/invoices",taxInput);ok(taxed.status===200,"Verified tax creates invoice");
  const taxInvoiceId=taxed.data.id;
  const taxPayment=async()=> (await q`select tax_rate,tax_included,amount from payment where id=${payments[27].id}`)[0];
  ok(Number((await taxPayment()).tax_rate)===8.875,"PostgreSQL preserves fractional tax rate");
  const taxedRow=await row(taxInvoiceId);
  ok(taxedRow.snapshot.tax===91.15 && taxedRow.snapshot.total===1118.15,"Invoice amount uses the exact combined rate");
  ok(taxedRow.snapshot.taxReview.method==="manual" && !!taxedRow.snapshot.taxReview.reviewedAt,"Manual verification stored with timestamp");
  ok((await post("/api/invoices",{...taxInput,paymentBasis:{...taxBasis,taxRate:8.875},taxReview:{...taxReview,rate:7.25}})).data.error==="duplicate","Duplicate invoice cannot mutate tax");
  ok(Number((await taxPayment()).tax_rate)===8.875,"Duplicate rollback preserves receivable");
  ok((await post("/api/invoices",{...taxInput,id:taxInvoiceId,revision:1,taxReview:{...taxReview,rate:7.25}})).data.error==="amountChanged","Stale receivable basis rejected");
  const amended=await post("/api/invoices",{...taxInput,id:taxInvoiceId,revision:1,paymentBasis:{...taxBasis,taxRate:8.875},taxReview:{...taxReview,treatment:"nonTaxable",rate:0}});
  ok(amended.status===200,"Explicit non-taxable review updates draft");
  ok(Number((await taxPayment()).tax_rate)===0 && (await row(taxInvoiceId)).snapshot.total===1027,"Receivable and draft agree after zero-tax review");
  ok((await post("/api/invoices",{...taxInput,id:taxInvoiceId,revision:1})).data.error==="changed","Stale draft revision rejected");
  ok(Number((await taxPayment()).tax_rate)===0,"Stale invoice cannot mutate payment");
  ok((await post("/api/invoices",{...taxInput,id:taxInvoiceId,revision:2})).status===200,"Verified tax can be restored on editable draft");
  const taxPdf=await request(`/api/invoices/${taxInvoiceId}/pdf`,cookies[0]);
  ok(taxPdf.ok,"Tax invoice PDF generated");
  await writeFile("/private/tmp/taloox-tax-invoice.pdf",Buffer.from(await taxPdf.arrayBuffer()));

  const connId=randomUUID(),subject=`synthetic-${suffix}`;
  await db.insert(s.mailConnection).values({id:connId,talentId:artist.talentId,connectedBy:artist.personId,accountEmail:artist.email,accountSubject:subject,scopes:GMAIL_SCOPE,historyMode:"new_only",...toColumns(await seal("synthetic-refresh",tokenAad(artist.talentId,subject)))});
  const made=await post("/api/invoices",input);ok(made.status===200,"Invoice saved");const id=made.data.id;
  ok((await request(`/api/invoices/payment/${payments[0].id}`)).status === 401, "Payment document lookup requires login");
  ok((await (await request(`/api/invoices/payment/${payments[0].id}`,cookies[0])).json()).id === id, "Preparing again reopens the same active document");
  ok(await (await request(`/api/invoices/payment/${payments[0].id}`,cookies[1])).json() === null, "Payment document lookup cannot reveal another workspace");
  for (let preview = 0; preview < 2; preview++) {
    const response = await request(`/api/invoices/${id}/pdf`,cookies[0]);
    ok(response.ok && (await PDFDocument.load(await response.arrayBuffer())).getPageCount() > 0, "Repeated preview returns valid PDF");
  }
  ok((await row(id)).storage_key === null, "Preview does not accumulate stored PDF files");
  ok((await q`select id from invoice where payment_id=${payments[0].id}`).length === 1, "Preview preserves a single invoice record");
  const reminded = async (id:string) => (await (await request("/api/reminders",cookies[0])).json()).items.some((item:{id:string})=>item.id.startsWith(`invoice:${id}:`));
  ok(await reminded(id),"Saved invoice remains a confirmation reminder");
  const op=(id:string,operation:string,revision=1,cookie=cookies[0])=>post(`/api/invoices/${id}`,{op:operation,confirmed:true,revision},cookie);
  ok((await op(id,"send")).status===400,"Old send operation rejected");
  ok((await op(id,"createDraft")).data.error==="gmailAuthorization","Read-only mailbox cannot create drafts");
  ok((await op(id,"createDraft",1,cookies[1])).status!==200,"Other owner cannot create draft");
  ok((await op(id,"createDraft",1,cookies[2])).status!==200,"Manager cannot create artist draft");
  ok((await request(`/api/invoices/${id}`,cookies[0],{op:"createDraft",confirmed:true,revision:1},"https://example.invalid")).status!==200,"Cross-origin create denied");
  ok((await post(`/api/invoices/${id}`,{op:"createDraft",revision:1})).status===400,"Explicit confirmation required");
  await q`update mail_connection set scopes=${`${GMAIL_SCOPE} ${GMAIL_COMPOSE_SCOPE}`} where id=${connId}`;
  const results=await Promise.all([op(id,"createDraft"),op(id,"createDraft")]);
  ok(results.filter(r=>r.status===200).length===1,"Concurrent requests reserve once");
  await status(id,"gmail_draft");let saved=await row(id);
  ok(!(await reminded(id)),"Successful Gmail draft leaves preparation reminders");
  ok(creates===1,"Only one Gmail create POST");ok(saved.sent_at===null,"Draft is not sent");
  const mock=messages.get(saved.gmail_message_id)!;
  ok(mock.raw.includes(artist.email),"From uses connected mailbox");
  ok(mock.raw.includes(input.recipient),"Recipient included");
  ok(/Content-Type: application\/pdf/i.test(mock.raw),"PDF MIME attachment included");
  ok(mock.raw.includes(`filename=${saved.number}.pdf`)||mock.raw.includes(`filename="${saved.number}.pdf"`),"Attachment filename is invoice number");
  const part=mock.raw.split(/Content-Type: application\/pdf[^\r\n]*\r?\n/i)[1];
  const encoded=part.split(/\r?\n\r?\n/)[1].split(/\r?\n--/)[0];
  const attached=Buffer.from(encoded.replace(/\s/g,""),"base64");
  const pdf=await PDFDocument.load(attached);ok(pdf.getPageCount()>0,"Attachment is a readable PDF");
  const download=await request(`/api/invoices/${id}/pdf`,cookies[0]);ok(download.ok,"Owner PDF download");
  ok(createHash("sha256").update(Buffer.from(await download.arrayBuffer())).digest("hex")===createHash("sha256").update(attached).digest("hex"),"Stored PDF exactly matches Gmail attachment");
  ok((await request(`/api/invoices/${id}/pdf`,cookies[1])).status!==200,"Foreign PDF denied");
  await q`update invoice set storage_key=null where id=${id} and talent_id=${artist.talentId}`;
  try { ok((await request(`/api/invoices/${id}/pdf`,cookies[0])).status===409, "Missing frozen PDF cannot silently regenerate a different attachment"); }
  finally { await q`update invoice set storage_key=${saved.storage_key} where id=${id} and talent_id=${artist.talentId}`; }

  ok((await op(id,"createDraft")).status!==200,"Repeated create blocked");
  ok((await post("/api/invoices",{...input,id,revision:1})).status!==200,"Exported invoice immutable");
  ok((await post("/api/invoices",{...input,id,revision:1,taxReview,paymentBasis:{amount:1000,taxRate:0,taxIncluded:false}})).status!==200,"Exported Gmail draft rejects tax changes");
  ok(Number((await q`select tax_rate from payment where id=${payments[0].id}`)[0].tax_rate)===0,"Locked invoice leaves original tax unchanged");
  ok((await op(id,"cancel")).status!==200,"Exported draft not silently cancelled");
  ok((await post(`/api/invoices/${id}`,{op:"settle",confirmed:true,revision:1,settledOn:today})).status!==200,"Draft does not imply sent or paid");
  await (await request("/finance",cookies[0])).text();
  const paymentForm={id:payments[0].id,projectId:artist.projectId,direction:"in",installment:"regular",label:payments[0].label,amount:1000,currency:"USD",taxRate:0,taxIncluded:false,status:"expected",recordedDate:today,dueDate:later,invoiceRef:saved.number,notes:"Synthetic QA",settledDate:"",settledAmount:""};
  ok((await action("savePayment",[{...paymentForm,amount:2000}]))!==null,"Gmail draft locks Finance amount");
  ok((await action("voidPayment",[payments[0].id,true]))!==null,"Gmail draft locks Finance void");
  ok((await action("savePayment",[paymentForm]))===null,"Gmail draft permits Finance notes");
  mock.messageId="<gmail-normalized-test@example.invalid>";
  const before=mock.raw;mock.raw+='\r\nUser edited this draft in Gmail.';
  await op(id,"syncDraft");await wait(async()=>(await row(id)).gmail_checked_at>saved.gmail_checked_at,"draft sync");
  ok(mock.raw===before+'\r\nUser edited this draft in Gmail.',"User edits preserved");ok(updates===0,"No draft update/delete calls");ok((await row(id)).message_id===mock.messageId,"Normalized Gmail Message-ID retained");
  saved=await row(id);drafts.delete(saved.gmail_draft_id);messages.delete(saved.gmail_message_id);
  await op(id,"syncDraft");await status(id,"draft_missing");ok((await row(id)).sent_at===null,"Deleted draft is not marked sent");
  ok(await reminded(id),"Missing Gmail draft returns for attention");
  messages.set(mock.id,{...mock,labels:["SENT"]});
  await op(id,"syncDraft");await status(id,"sent");ok(!!(await row(id)).sent_at,"Matching sent message confirms user sending");
  ok(!(await reminded(id)),"Confirmed sending does not restore preparation reminder");
  ok((await post(`/api/invoices/${id}`,{op:"settle",confirmed:true,revision:1,settledOn:"2026-02-30"})).status!==200,"Invalid receipt rejected");
  ok((await post(`/api/invoices/${id}`,{op:"settle",confirmed:true,revision:1,settledOn:today})).status===200,"Receipt recorded on original payment");
  ok(Number((await q`select count(*)::int as n from payment where talent_id=${artist.talentId}`)[0].n)===30,"No duplicate income rows");
  loseNext=true;const second=await post("/api/invoices",{...input,paymentId:payments[1].id});const sid=second.data.id;
  await op(sid,"createDraft");await status(sid,"draft_unknown");const createCount=creates;
  ok(await reminded(sid),"Ambiguous creation remains visible for attention");
  await processInvoiceGmail({talentId:artist.talentId,invoiceId:sid,revision:1,mode:"create"});
  ok(creates===createCount,"Retry after ambiguous response never creates another draft");
  await op(sid,"syncDraft");await status(sid,"gmail_draft");ok(creates===createCount,"Reconciliation recovers existing draft");
  const {dropAccessToken}=await import("../lib/mail/access");
  saved=await row(sid);dropAccessToken(connId);tokenDenied=true;
  await op(sid,"syncDraft");await wait(async()=>(await row(sid)).gmail_error==="gmailAuthorization","expired authorization");
  ok((await q`select status from mail_connection where id=${connId}`)[0].status==="reconnect_needed","Revoked refresh token requests reconnect");
  tokenDenied=false;await q`update mail_connection set status='connected' where id=${connId}`;
  await op(sid,"syncDraft");await wait(async()=>(await row(sid)).gmail_error===null,"reconnected authorization");
  ok(creates===createCount,"Reauthorization reconciles without duplicate creation");
  const scheduled=await post("/api/invoices",{...input,paymentId:payments[2].id,issueOn:later,autoGmailDraft:true});const futureId=scheduled.data.id;
  ok((await row(futureId)).status==="scheduled","Future date remains scheduled");
  ok((await row(futureId)).gmail_account_subject===subject,"Scheduled draft pins approved account");
  await q`update invoice set issue_on=${today} where id=${futureId}`;
  await prepareInvoices();await status(futureId,"gmail_draft");ok(creates===createCount+1,"Due approved draft created automatically");
  await prepareInvoices();ok(creates===createCount+1,"Scheduler rerun is idempotent");
  const missing=await post("/api/invoices",{...input,paymentId:payments[3].id,issueOn:later,autoGmailDraft:true});
  await q`update invoice set issue_on=${today} where id=${missing.data.id}`;
  await q`update mail_connection set status='reconnect_needed' where id=${connId}`;
  await prepareInvoices();ok((await row(missing.data.id)).gmail_error==="gmailAuthorization","Missing authorization blocks scheduled drafts");
  await q`update invoice set auto_gmail_draft=false where id=${missing.data.id}`;
  await q`update mail_connection set status='connected' where id=${connId}`;
  const stale=await post("/api/invoices",{...input,paymentId:payments[4].id});
  await q`update invoice set status='draft_creating',approved_by=${artist.personId},gmail_connection_id=${connId},gmail_account_subject=${subject},updated_at=now()-interval '10 minutes' where id=${stale.data.id}`;
  await prepareInvoices();ok((await row(stale.data.id)).status==="draft_unknown","Crashed creation requires reconciliation");
  const immediate=await post("/api/invoices",{...input,paymentId:payments[5].id,autoGmailDraft:true});await status(immediate.data.id,"gmail_draft");ok(immediate.status===200,"Explicit opt-in can create draft immediately");
  for(let i=6;i<27;i++)ok((await post("/api/invoices",{...input,paymentId:payments[i].id})).status===200,"Additional draft saved");
  const list=await (await request("/api/invoices",cookies[0])).json();ok(list.items.length===20 && !!list.nextCursor,"Invoice list remains paginated");
  const review=await (await request("/api/invoices?ready=1",cookies[0])).json();ok(!review.items.some((x:{id:string})=>x.id===id),"Sent paid invoice absent from review queue");
  // Taiwan requests use the same receivable and Gmail flow, never formal tax issuance.
  const twPaymentId = randomUUID();
  await db.insert(s.payment).values({id:twPaymentId,talentId:artist.talentId,projectId:artist.projectId,
    label:"Synthetic Taiwan service",direction:"in",amount:55000,currency:"TWD",taxRate:5,
    taxIncluded:true,recordedOn:today,dueOn:later,invoiceOn:today});
  const allReminderIds = async () => {
    const ids: string[] = [];let cursor="";
    for(let page=0;page<10;page++) {
      const feed=await (await request(`/api/reminders${cursor?`?after=${encodeURIComponent(cursor)}`:""}`,cookies[0])).json();
      ids.push(...feed.items.map((x:{id:string})=>x.id));
      if(!feed.hasMore)return ids;
      cursor=feed.nextCursor;
    }
    throw new Error("Unexpected reminder pagination");
  };
  ok((await allReminderIds()).some(id=>id.startsWith(`billing:${twPaymentId}:`)),"Unprepared TWD request appears in daily reminders");
  const twInput = {...input,paymentId:twPaymentId,documentKind:"tw_payment_request",documentLanguage:"zh-TW"};
  ok((await post("/api/invoices",{...twInput,documentKind:"tw_uniform_invoice"})).data.error==="invalid","Formal Taiwan issuance cannot be forged through the billing API");
  ok((await post("/api/invoices",{...twInput,documentKind:"commercial_invoice"})).data.error==="invalid","TWD is limited to payment requests in this release");
  ok((await post("/api/invoices",{...twInput,taxReview,paymentBasis:{amount:55000,taxRate:5,taxIncluded:true}})).data.error==="invalid","Taiwan request cannot apply the US tax calculator");
  ok((await post("/api/invoices",twInput,cookies[1])).status!==200,"Foreign owner cannot prepare Taiwan request");
  const twCreated = await post("/api/invoices",twInput);
  ok(twCreated.status===200,"Taiwan request saves against existing TWD receivable");
  const twId=twCreated.data.id;
  ok((await allReminderIds()).some(id=>id.startsWith(`invoice:${twId}:`)),"Saved TWD request appears for review");
  let twSaved=await row(twId);
  ok(twSaved.number.startsWith("PR-") && twSaved.snapshot.documentKind==="tw_payment_request","PostgreSQL persists document type and internal PR reference");
  ok(twSaved.snapshot.currency==="TWD" && twSaved.snapshot.total===55000 && twSaved.snapshot.tax===2619.05,"TWD inclusive amounts preserve the receivable");
  const twList=await (await request("/api/invoices",cookies[0])).json();
  ok(twList.items.some((x:{id:string;currency:string;documentKind:string})=>x.id===twId&&x.currency==="TWD"&&x.documentKind==="tw_payment_request"),"List carries document kind and currency");
  const {renderInvoicePdf}=await import("../lib/invoices/pdf");
  const detail=await (await request(`/api/invoices/${twId}`,cookies[0])).json();
  for(const language of ["en","zh-TW"] as const) {
    const bytes=await renderInvoicePdf({...detail,snapshot:{...detail.snapshot,documentLanguage:language}},false);
    await writeFile(`/private/tmp/taiwan-request-${language}.pdf`,bytes);
    ok((await PDFDocument.load(bytes)).getTitle()?.includes(language==="en"?"Taiwan payment request":"台灣請款文件"),"PDF title describes a payment request in either language");
  }
  ok((await op(twId,"createDraft")).status===200,"Taiwan request can create a fake Gmail draft");
  await status(twId,"gmail_draft");twSaved=await row(twId);
  const twMock=messages.get(twSaved.gmail_message_id)!;
  const twPart=twMock.raw.split(/Content-Type: application\/pdf[^\r\n]*\r?\n/i)[1];
  const twAttachment=Buffer.from(twPart.split(/\r?\n\r?\n/)[1].split(/\r?\n--/)[0].replace(/\s/g,""),"base64");
  const twDownload=await request(`/api/invoices/${twId}/pdf`,cookies[0]);
  ok(createHash("sha256").update(Buffer.from(await twDownload.arrayBuffer())).digest("hex")===createHash("sha256").update(twAttachment).digest("hex"),"Frozen Taiwan PDF equals the attached document");
  ok(twSaved.snapshot.documentKind==="tw_payment_request" && twSaved.sent_at===null,"Gmail draft never implies a sent or officially issued invoice");
  ok((await op(twId,"createDraft")).status!==200,"Taiwan request duplicate Gmail creation is blocked");
  drafts.delete(twSaved.gmail_draft_id);twMock.labels=["SENT"];
  await op(twId,"syncDraft");await status(twId,"sent");
  ok((await row(twId)).snapshot.documentKind==="tw_payment_request","Simulated sent message does not convert document to formal invoice");
  ok((await post(`/api/invoices/${twId}`,{op:"settle",confirmed:true,revision:1,settledOn:today})).status===200,"TWD request settles the original receivable");
  ok(!(await allReminderIds()).some(id=>id.startsWith(`invoice:${twId}:`)||id.startsWith(`billing:${twPaymentId}:`)),"Settled Taiwan request has no reminder across all pages");
  ok((await row(twId)).snapshot.documentKind==="tw_payment_request","Paid request retains its non-tax document type");
  ok(sendCalls===0,"No Gmail send calls");ok(updates===0,"No Gmail update/delete calls");
  const inbox=await (await fetch(`http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:${input.recipient}`)}`)).json();ok(!inbox.messages?.length,"No SMTP email was sent");
  await writeFile('/private/tmp/invoice-gmail-ui.json',JSON.stringify({people,cookies,invoiceId:sid,taxInvoiceId,catalogueInvoiceId,twInvoiceId:twId,twPaymentId,base}),{mode:0o600});
  console.log(JSON.stringify({checks,creates,sendCalls,updates,pdf:"Valid PDF, stored bytes match attachment",scope:"owner only",finance:"no duplicate rows",ui:process.env.INVOICE_QA_HOLD==="1"}));
  if(process.env.INVOICE_QA_HOLD==="1")await new Promise<void>(resolve=>{process.once("SIGTERM",resolve);process.once("SIGINT",resolve);});

} finally {
  console.log(JSON.stringify({finalCreates:creates,sendCalls,updates}));
  await runner?.stop();
  for(const cookie of cookies)await request("/api/auth/sign-out",cookie,{}).catch(()=>{});
  const keys=await q`select storage_key from invoice where talent_id=${artist.talentId} and storage_key is not null`;
  const {S3Client,DeleteObjectCommand}=await import("@aws-sdk/client-s3");
  const storage=new S3Client({endpoint:process.env.STORAGE_S3_ENDPOINT,region:process.env.STORAGE_S3_REGION||"local",forcePathStyle:true,credentials:{accessKeyId:process.env.STORAGE_S3_ACCESS_KEY_ID!,secretAccessKey:process.env.STORAGE_S3_SECRET_ACCESS_KEY!}});
  for(const item of keys)await storage.send(new DeleteObjectCommand({Bucket:process.env.STORAGE_BUCKET||"talent-files",Key:item.storage_key}));
  for(const p of people){
    await q`delete from graphile_worker._private_jobs where payload->>'talentId'=${p.talentId}`;
    await q`delete from invoice where talent_id=${p.talentId}`;
    await q`delete from talent where id=${p.talentId}`;
    await q`delete from person where id=${p.personId}`;
  }
  next.kill("SIGTERM");fake.close();await q.end();
}
process.exit(0);
