import {NextRequest,NextResponse} from "next/server";
import {InvalidCursor} from "@/lib/data/page-cursor";
import {z} from "zod";
import {getSession} from "@/lib/auth";
import {getManagerProjectPage} from "@/lib/data/manager-projects";
import {managerLocalEnabled} from "@/lib/manager/config";
import {ManagerScopeError} from "@/lib/manager/scope";
import {listSorts,listViews,PAGE_MAX,PAGE_SIZE} from "@/lib/domain/project-list";
const params=z.object({view:z.enum(listViews).catch("execution"),type:z.string().max(40).catch("all"),contact:z.union([z.uuid(),z.literal("")]).catch(""),q:z.string().max(200).catch(""),sort:z.enum(listSorts).catch("due"),cursor:z.string().max(4000).default(""),limit:z.coerce.number().int().min(1).max(PAGE_MAX).catch(PAGE_SIZE)});
export async function GET(request:NextRequest){
  const response=(body:object,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
  const session=await getSession();if(!session)return response({error:"unauthorized"},401);if(!managerLocalEnabled())return response({error:"not_found"},404);
  const search=request.nextUrl.searchParams,selected=search.has("artist")?(search.get("artist")==="none"?[]:search.getAll("artist")):undefined;
  try{return response(await getManagerProjectPage(session.personId,selected,params.parse({type:"all",contact:"",q:"",cursor:"",...Object.fromEntries(search)})));}
  catch(error){if(error instanceof InvalidCursor || error instanceof z.ZodError)return response({error:"invalid_cursor"},400);if(error instanceof ManagerScopeError)return response({error:error.code},error.code==="limit"||error.code==="invalid"?400:403);throw error;}
}
