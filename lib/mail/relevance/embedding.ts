export interface SemanticClassifier { classify(text:string):Promise<{workScore:number;modelVersion:string}>; }
export interface EmbeddingProvider {
  model:string;
  dimensions:number;
  embed(text:string,options:{signal:AbortSignal}):Promise<number[]>;
}
export type EmbeddingExample={label:"work"|"noise";vector:number[]};
function validVector(v:readonly number[],dimensions:number){return v.length===dimensions&&v.every(Number.isFinite)&&v.some(x=>x!==0);}
export function cosine(a:readonly number[],b:readonly number[]){
  if(!validVector(a,b.length)||!validVector(b,a.length))throw new Error("invalid_vector");
  // Normalize first to avoid overflow from large provider outputs.
  const am=Math.max(...a.map(Math.abs)),bm=Math.max(...b.map(Math.abs));
  const av=a.map(x=>x/am),bv=b.map(x=>x/bm);
  return av.reduce((n,x,i)=>n+x*bv[i],0)/Math.hypot(...av)/Math.hypot(...bv);
}
/** Plug in a paid provider only after its labeled examples and thresholds are evaluated. */
export function embeddingClassifier(provider:EmbeddingProvider,index:{model:string;version:string;dimensions:number;examples:EmbeddingExample[]}):SemanticClassifier {
  if(!index.version||provider.model!==index.model||provider.dimensions!==index.dimensions||index.dimensions<1||index.dimensions>8192||index.examples.length>200||!index.examples.some(e=>e.label==="work")||!index.examples.some(e=>e.label==="noise")||index.examples.some(e=>!validVector(e.vector,index.dimensions)))throw new Error("embedding_index_mismatch");
  return {async classify(text){
    const signal=AbortSignal.timeout(5000);
    const vector=await Promise.race([provider.embed(text.slice(0,512),{signal}),new Promise<never>((_,reject)=>signal.addEventListener("abort",()=>reject(new Error("embedding_timeout")),{once:true}))]);
    if(!validVector(vector,index.dimensions))throw new Error("invalid_vector");
    const best=(label:EmbeddingExample["label"])=>Math.max(...index.examples.filter(e=>e.label===label).map(e=>cosine(vector,e.vector)));
    const work=best("work"),noise=best("noise");
    // This is a ranking signal, not a calibrated probability of work relevance.
    const workScore=Math.max(0,Math.min(1,(work-noise+2)/4));
    return {workScore,modelVersion:`${index.model}:${index.version}`};
  }};
}
