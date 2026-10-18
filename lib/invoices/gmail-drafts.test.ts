import assert from "node:assert/strict";
import { test } from "node:test";
import { invoiceGmailMode } from "./gmail-config";
import { invoiceDraftApi, isMatchingSent } from "./gmail-draft-api";
import { authorizationUrl } from "../mail/oauth";
import { GMAIL_COMPOSE_SCOPE, GMAIL_SCOPE, grantsDrafts } from "../mail/scope";

test("draft writes are disabled by default and local fake endpoints require loopback token and database targets",()=>{
  assert.equal(invoiceGmailMode({}),"disabled");
  const env={APP_ENV:"development",INVOICE_GMAIL_DRAFTS_ENABLED:"1",INVOICE_GMAIL_API_URL:"http://127.0.0.1:54500/gmail/v1",GOOGLE_OAUTH_TOKEN_URL:"http://127.0.0.1:54500/token",DATABASE_URL:"postgresql://127.0.0.1/test"};
  assert.equal(invoiceGmailMode(env),"local");
  for(const key of ["INVOICE_GMAIL_API_URL","GOOGLE_OAUTH_TOKEN_URL","DATABASE_URL"]) assert.equal(invoiceGmailMode({...env,[key]:"https://external.example/test"}),"disabled");
  assert.equal(invoiceGmailMode({...env,APP_ENV:"production"}),"disabled");
  assert.equal(invoiceGmailMode({APP_ENV:"production",INVOICE_GMAIL_DRAFTS_ENABLED:"1"}),"live");
  assert.equal(invoiceGmailMode({APP_ENV:"production",INVOICE_GMAIL_DRAFTS_ENABLED:"1",GOOGLE_OAUTH_TOKEN_URL:"http://127.0.0.1/token"}),"disabled");
  assert.equal(invoiceGmailMode({APP_ENV:"development",INVOICE_GMAIL_DRAFTS_ENABLED:"1"}),"disabled");
});
test("read-only Gmail consent remains unchanged; draft access is explicit",()=>{
  const input={clientId:"c",redirectUri:"http://localhost/api/mail/callback",state:"s",challenge:"c"};
  const scopes=(drafts?:boolean)=>new URL(authorizationUrl({...input,drafts})).searchParams.get("scope")!;
  assert.ok(!scopes().includes(GMAIL_COMPOSE_SCOPE));
  assert.ok(scopes(true).includes(GMAIL_SCOPE));
  assert.ok(scopes(true).includes(GMAIL_COMPOSE_SCOPE));
  assert.equal(grantsDrafts(GMAIL_SCOPE),false);
  assert.equal(grantsDrafts(`${GMAIL_SCOPE} ${GMAIL_COMPOSE_SCOPE}`),true);
});
test("only a matching SENT message proves sending; a missing draft, changed id or DRAFT label does not",()=>{
  const message={id:"a",labelIds:["SENT"],payload:{headers:[{name:"Message-ID",value:"<invoice@example.invalid>"}]}};
  assert.ok(isMatchingSent(message,"<invoice@example.invalid>"));
  assert.equal(isMatchingSent({...message,labelIds:["DRAFT"]},"<invoice@example.invalid>"),false);
  assert.equal(isMatchingSent(message,"<another@example.invalid>"),false);
  assert.equal(isMatchingSent({id:"a",labelIds:["SENT"]},"<invoice@example.invalid>"),false);
});
test("draft POST is attempted once on failure; client exposes no send/update/delete operation",async()=>{
  const old={...process.env}, original=globalThis.fetch;let posts=0;
  Object.assign(process.env,{APP_ENV:"development",INVOICE_GMAIL_DRAFTS_ENABLED:"1",INVOICE_GMAIL_API_URL:"http://127.0.0.1:54500/gmail/v1",GOOGLE_OAUTH_TOKEN_URL:"http://127.0.0.1:54500/token",DATABASE_URL:"postgresql://127.0.0.1/test"});
  globalThis.fetch=async(input,init)=>{assert.match(String(input),/\/drafts$/);assert.equal(init?.method,"POST");posts++;throw new Error("response lost");};
  try {
    const api=invoiceDraftApi("synthetic-token");
    assert.deepEqual(Object.keys(api).sort(),["create","drafts","find","get","message"]);
    await assert.rejects(api.create("synthetic-mime"));assert.equal(posts,1);
  }finally{globalThis.fetch=original;for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];Object.assign(process.env,old);}
});
