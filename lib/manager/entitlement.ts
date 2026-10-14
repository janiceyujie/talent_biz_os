export type ManagerCapability={enabled:boolean;artistLimit:number};
export type ManagerPlan={plan:string;artistLimit:number;active:boolean;expiresAt:Date|null};
/** A display toggle and a creative/account role cannot create a paid capability. */
export function managerCapability(row:ManagerPlan|undefined,now=new Date()):ManagerCapability {
  const enabled=!!row&&row.plan==="manager"&&row.active&&Number.isInteger(row.artistLimit)&&row.artistLimit>0&&row.artistLimit<=100&&(!row.expiresAt||row.expiresAt.getTime()>now.getTime());
  return {enabled,artistLimit:enabled?row!.artistLimit:0};
}
