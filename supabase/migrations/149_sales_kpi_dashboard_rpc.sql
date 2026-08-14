-- SES Navigator
-- Migration: 149_sales_kpi_dashboard_rpc
-- Purpose: Return access-scoped sales funnel KPIs, monthly trends, and contract expiry alerts.

begin;

create or replace function public.get_sales_kpi_dashboard(
  p_from_date date,
  p_to_date date,
  p_contract_expiry_days integer default 60
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  result jsonb;
begin
  if auth.uid() is null or tenant is null
     or not app.has_permission('proposal.read')
     or p_from_date is null or p_to_date is null
     or p_from_date > p_to_date
     or p_to_date > p_from_date + 730
     or p_contract_expiry_days is null
     or p_contract_expiry_days not between 1 and 365
  then
    raise exception 'invalid sales KPI dashboard request' using errcode = '22023';
  end if;

  with accessible_proposals as (
    select p.*
    from app.proposals p
    where p.tenant_id = tenant
      and p.deleted_at is null
      and app.can_access_proposal(p.id, 'proposal.read', 'view')
  ), period_proposals as (
    select p.*,
      exists (
        select 1 from app.interviews i
        where i.tenant_id = tenant and i.proposal_id = p.id
          and app.can_access_interview(i.id, 'interview.read', 'view')
      ) interviewed,
      (
        select count(*)::integer from app.interviews i
        where i.tenant_id = tenant and i.proposal_id = p.id
          and app.can_access_interview(i.id, 'interview.read', 'view')
      ) interview_count
    from accessible_proposals p
    where p.created_at::date between p_from_date and p_to_date
  ), months as (
    select generate_series(
      date_trunc('month', p_from_date)::date,
      date_trunc('month', p_to_date)::date,
      interval '1 month'
    )::date period_month
  ), monthly as (
    select m.period_month,
      count(p.id)::integer proposal_count,
      count(p.id) filter (where p.interviewed)::integer interview_proposal_count,
      count(p.id) filter (where p.status = 'won')::integer won_count,
      case when count(p.id) = 0 then null else
        round(count(p.id) filter (where p.interviewed)::numeric / count(p.id) * 100, 2)
      end interview_rate,
      case when count(p.id) = 0 then null else
        round(count(p.id) filter (where p.status = 'won')::numeric / count(p.id) * 100, 2)
      end win_rate
    from months m
    left join period_proposals p
      on date_trunc('month', p.created_at)::date = m.period_month
    group by m.period_month
  ), totals as (
    select count(*)::integer proposal_count,
      count(*) filter (where interviewed)::integer interview_proposal_count,
      count(*) filter (where status = 'won')::integer won_count,
      case when count(*) = 0 then null else
        round(count(*) filter (where interviewed)::numeric / count(*) * 100, 2)
      end interview_rate,
      case when count(*) = 0 then null else
        round(count(*) filter (where status = 'won')::numeric / count(*) * 100, 2)
      end win_rate,
      round(avg(interview_count)::numeric, 2) average_interview_count,
      round(avg(extract(epoch from (updated_at - created_at)) / 86400)
        filter (where status = 'won')::numeric, 1) average_proposal_days
    from period_proposals
  ), current_pipeline as (
    select
      count(*) filter (where status in ('sent','interview_requested','interviewing','offered'))::integer active_proposal_count,
      count(*) filter (where status = 'pending_approval')::integer pending_approval_count
    from accessible_proposals
  ), scheduled as (
    select count(*)::integer scheduled_interview_count
    from app.interviews i
    join accessible_proposals p on p.id = i.proposal_id
    where i.tenant_id = tenant
      and i.status in ('tentative','scheduled')
      and i.scheduled_start_at::date between p_from_date and p_to_date
      and app.can_access_interview(i.id, 'interview.read', 'view')
  ), expiring as (
    select c.id, c.contract_no, c.title, c.end_date, c.status,
      (c.end_date - current_date)::integer days_remaining
    from app.contracts c
    where c.tenant_id = tenant and c.deleted_at is null
      and c.status in ('active','suspended')
      and c.end_date between current_date and current_date + p_contract_expiry_days
      and app.can_access_contract(c.id, 'contract.read', 'view')
    order by c.end_date, c.contract_no
  )
  select jsonb_build_object(
    'from_date', p_from_date, 'to_date', p_to_date,
    'contract_expiry_days', p_contract_expiry_days,
    'proposal_count', t.proposal_count,
    'interview_proposal_count', t.interview_proposal_count,
    'interview_rate', t.interview_rate,
    'won_count', t.won_count, 'win_rate', t.win_rate,
    'average_proposal_days', t.average_proposal_days,
    'average_interview_count', t.average_interview_count,
    'active_proposal_count', cp.active_proposal_count,
    'pending_approval_count', cp.pending_approval_count,
    'scheduled_interview_count', s.scheduled_interview_count,
    'expiring_contract_count', (select count(*) from expiring),
    'monthly', (select coalesce(jsonb_agg(jsonb_build_object(
      'period_month', m.period_month, 'proposal_count', m.proposal_count,
      'interview_proposal_count', m.interview_proposal_count,
      'interview_rate', m.interview_rate, 'won_count', m.won_count,
      'win_rate', m.win_rate
    ) order by m.period_month), '[]'::jsonb) from monthly m),
    'expiring_contracts', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'contract_no', e.contract_no, 'title', e.title,
      'end_date', e.end_date, 'days_remaining', e.days_remaining,
      'status', e.status
    ) order by e.end_date, e.contract_no), '[]'::jsonb) from (select * from expiring limit 20) e)
  ) into result
  from totals t cross join current_pipeline cp cross join scheduled s;

  return result;
end
$$;

revoke all on function public.get_sales_kpi_dashboard(date, date, integer)
  from public, anon, authenticated;
grant execute on function public.get_sales_kpi_dashboard(date, date, integer)
  to authenticated;

comment on function public.get_sales_kpi_dashboard(date, date, integer) is
  'Returns access-scoped sales funnel KPIs, monthly trends, and upcoming contract expirations.';

commit;
