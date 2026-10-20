import {sql} from "drizzle-orm";
import {membership,payment,project} from "@/lib/db/schema";
import {SUPPORTED_MANAGED_ARTISTS} from "./limits";
/** No historical receipt bodies cross the network for the manager financial overview. */
export function managerFinanceQuery(personId:string,ids:string[],start:string,end:string) {
  return sql`with authorized as (
    select p.*, pr.stage as project_stage, case when p.currency='JPY' then 1 else 100 end::numeric as factor
    from ${payment} p join ${membership} m on m.talent_id=p.talent_id
    left join ${project} pr on pr.id=p.project_id and pr.talent_id=p.talent_id
    where m.person_id=${personId} and m.status='active' and m.role in ('manager','agency_admin')
      and p.talent_id in (${sql.join(ids.map(id=>sql`${id}::uuid`),sql`,`)})
      and p.voided_at is null and p.status<>'cancelled'
      and exists(select 1 from manager_entitlement e where e.person_id=${personId} and e.plan='manager' and e.active=true
        and e.artist_limit between 1 and ${SUPPORTED_MANAGED_ARTISTS} and (e.expires_at is null or e.expires_at>now()))
  ), amounts as (
    select p.*, round(amount*factor) + case when tax_included then 0 else round(round(amount*factor)*tax_rate/100) end as gross
    from authorized p
  ), balances as (
    select p.*, coalesce(r.cash,0) as cash,coalesce(r.withheld,0) as withheld,coalesce(r.period_cash,0) as period_cash
    from amounts p left join lateral (
      select sum(round((entry->>'cash')::numeric*p.factor)) as cash,
        sum(round(coalesce((entry->>'withheld')::numeric,0)*p.factor)) as withheld,
        sum(case when entry->>'date' between ${start} and ${end} then round((entry->>'cash')::numeric*p.factor) else 0 end) as period_cash
      from jsonb_array_elements(case when jsonb_array_length(p.receipts)>0 then p.receipts
        when p.status='settled' then jsonb_build_array(jsonb_build_object('id','legacy','cash',coalesce(p.settled_amount,p.gross/p.factor),'withheld',0,'date',coalesce(p.settled_on::text,'')))
        else '[]'::jsonb end) entry
      where coalesce((entry->>'withdrawn')::boolean,false)=false
        and not exists(select 1 from jsonb_array_elements(p.receipts) replacement where replacement->>'replaces'=entry->>'id')
    ) r on true
  ) select talent_id as "artistId",trim(currency) as currency,
    (sum(case when direction='in' then period_cash else 0 end)/max(factor))::float8 as received,
    (sum(case when direction='out' then period_cash else 0 end)/max(factor))::float8 as paid,
    (sum(case when direction='in' and (project_id is null or project_stage in ('signed','in_progress','collecting_payment','closed') or status<>'expected' or cash>0 or withheld>0) and coalesce(due_on,recorded_on) between ${start}::date and ${end}::date then greatest(0,gross-cash-withheld) else 0 end)/max(factor))::float8 as receivable,
    (sum(case when direction='out' and (project_id is null or project_stage in ('signed','in_progress','collecting_payment','closed') or status<>'expected' or cash>0 or withheld>0) and coalesce(due_on,recorded_on) between ${start}::date and ${end}::date then greatest(0,gross-cash-withheld) else 0 end)/max(factor))::float8 as payable
    from balances where coalesce(due_on,recorded_on) between ${start}::date and ${end}::date or period_cash<>0
    group by talent_id,currency order by talent_id,currency`;
}
