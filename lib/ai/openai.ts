import "server-only";
import {LocalAIError,type TokenUsage} from "./local-budget";
export type Turn={role:"user"|"assistant";content:string};
type LegacyResult={text:string;usage:TokenUsage;model:string;latencyMs:number;status:string;estimatedCostUSD:number;budgetUsedUSD:number};
/** Historical evaluation callers must not bypass the shared model gateway or app-wide pause. */
export async function openAIResponse(request:{model?:string;instructions:string;input:string|Turn[];schema?:Record<string,unknown>;maxOutputTokens?:number}):Promise<LegacyResult>{
 void request;
 throw new LocalAIError("not_configured","The legacy local assistant is retired. Use lib/ai/model.ts and the database-backed assistant.");
}
