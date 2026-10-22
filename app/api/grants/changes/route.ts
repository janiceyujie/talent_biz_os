import {z} from "zod";
import type {NextRequest} from "next/server";
import {getSession,getCurrentTalent} from "@/lib/auth";
import {grantsLocalEnabled} from "@/lib/grants/config";
import {listOpportunityChanges} from "@/lib/data/grant-changes";
import {InvalidCursor} from "@/lib/data/page-cursor";
export async function GET(req:NextRequest){
 const session=await getSession();if(!session)return new Response("Unauthorized",{status:401});
 const current=await getCurrentTalent(session.personId);if(!current||!grantsLocalEnabled())return new Response("Not found",{status:404});
 const parsed=z.object({opportunity:z.uuid(),cursor:z.string().max(3000).default("")}).safeParse(Object.fromEntries(req.nextUrl.searchParams));
 if(!parsed.success)return new Response("Invalid filters",{status:400});
 try{return Response.json(await listOpportunityChanges(current.id,session.personId,parsed.data.opportunity,parsed.data.cursor),{headers:{"Cache-Control":"private, no-store"}});}catch(e){if(e instanceof InvalidCursor)return new Response("Invalid cursor",{status:400});throw e;}
}
