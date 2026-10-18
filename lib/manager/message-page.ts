import {ManagerScopeError} from "./scope";
export function managerMessageCursor(value:string|undefined) {
  if(!value)return undefined;
  const [at,id,...extra]=value.split("|");
  if(extra.length||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/.test(at)||!Number.isFinite(Date.parse(at))||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new ManagerScopeError("invalid");
  return {at,id};
}
