import {NextRequest,NextResponse} from "next/server";
import {getSession} from "@/lib/auth";
import {getManagerWorkspace} from "@/lib/data/manager-workspace";
import {managerLocalEnabled} from "@/lib/manager/config";
import {ManagerScopeError} from "@/lib/manager/scope";
export async function GET(request:NextRequest) {
  const response=(body:object,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
  const person=await getSession();if(!person)return response({error:"unauthorized"},401);
  if(!managerLocalEnabled())return response({error:"not_found"},404);
  const p=request.nextUrl.searchParams;
  const selected=p.has("artist")?(p.get("artist")==="none"?[]:p.getAll("artist")):undefined;
  try{return response(await getManagerWorkspace(person.personId,selected));}
  catch(error){if(error instanceof ManagerScopeError)return response({error:error.code},error.code==="forbidden"||error.code==="plan"?403:400);throw error;}
}
