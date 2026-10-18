import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getSession} from "@/lib/auth";
import {getManagerProject} from "@/lib/data/manager-projects";
import {managerLocalEnabled} from "@/lib/manager/config";
import {ManagerScopeError} from "@/lib/manager/scope";
export async function GET(request:NextRequest,context:RouteContext<"/api/manager/projects/[id]">){
  const response=(body:object,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
  const session=await getSession();if(!session)return response({error:"unauthorized"},401);if(!managerLocalEnabled())return response({error:"not_found"},404);
  const {id}=await context.params,artist=request.nextUrl.searchParams.get("artist");if(!z.uuid().safeParse(id).success||!z.uuid().safeParse(artist).success)return response({error:"not_found"},404);
  try{const data=await getManagerProject(session.personId,artist!,id);return data?response(data):response({error:"not_found"},404);}
  catch(error){if(error instanceof ManagerScopeError)return response({error:error.code},error.code==="limit"||error.code==="invalid"?400:403);throw error;}
}
