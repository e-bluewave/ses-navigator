-- SES Navigator
-- Migration: 157_ai_budget_control
-- Purpose: Configure tenant AI budgets and stop new executions at enabled limits.

begin;

create table app.ai_budget_policies (
  tenant_id uuid primary key references app.tenants(id) on delete cascade,
  enabled boolean not null default false,
  currency char(3) not null default 'USD',
  daily_warning_amount numeric(14,6),
  daily_stop_amount numeric(14,6),
  monthly_warning_amount numeric(14,6),
  monthly_stop_amount numeric(14,6),
  daily_warning_executions integer,
  daily_stop_executions integer,
  monthly_warning_executions integer,
  monthly_stop_executions integer,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1,
  check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  check (daily_warning_amount is null or daily_warning_amount >= 0),
  check (daily_stop_amount is null or daily_stop_amount >= 0),
  check (monthly_warning_amount is null or monthly_warning_amount >= 0),
  check (monthly_stop_amount is null or monthly_stop_amount >= 0),
  check (daily_warning_amount is null or daily_stop_amount is null
    or daily_warning_amount <= daily_stop_amount),
  check (monthly_warning_amount is null or monthly_stop_amount is null
    or monthly_warning_amount <= monthly_stop_amount),
  check (daily_warning_executions is null or daily_warning_executions >= 1),
  check (daily_stop_executions is null or daily_stop_executions >= 1),
  check (monthly_warning_executions is null or monthly_warning_executions >= 1),
  check (monthly_stop_executions is null or monthly_stop_executions >= 1),
  check (daily_warning_executions is null or daily_stop_executions is null
    or daily_warning_executions <= daily_stop_executions),
  check (monthly_warning_executions is null or monthly_stop_executions is null
    or monthly_warning_executions <= monthly_stop_executions),
  check (not enabled or daily_stop_amount is not null
    or monthly_stop_amount is not null
    or daily_stop_executions is not null
    or monthly_stop_executions is not null)
);

alter table app.ai_budget_policies enable row level security;
select app.attach_updated_at_trigger('app.ai_budget_policies'::regclass);
select app.attach_row_version_trigger('app.ai_budget_policies'::regclass);
revoke all on table app.ai_budget_policies from public, anon, authenticated;

create or replace function private.ai_budget_status(
  p_tenant_id uuid,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  policy app.ai_budget_policies%rowtype;
  day_start timestamptz := date_trunc('day', p_at, 'UTC');
  month_start timestamptz := date_trunc('month', p_at, 'UTC');
  daily_executions integer;
  monthly_executions integer;
  daily_cost numeric(14,6);
  monthly_cost numeric(14,6);
  daily_cost_recorded integer;
  monthly_cost_recorded integer;
  policy_currency char(3);
  configured boolean;
  warning_reached boolean;
  stop_reached boolean;
  stop_reasons text[] := '{}'::text[];
begin
  select budget.* into policy
  from app.ai_budget_policies budget
  where budget.tenant_id = p_tenant_id;
  configured := found;

  policy_currency := coalesce(policy.currency, 'USD');

  select
    count(*) filter (where execution.requested_at >= day_start)::integer,
    count(*)::integer,
    coalesce(sum(execution.estimated_cost) filter (
      where execution.requested_at >= day_start
        and execution.currency = policy_currency
    ), 0)::numeric(14,6),
    coalesce(sum(execution.estimated_cost) filter (
      where execution.currency = policy_currency
    ), 0)::numeric(14,6),
    count(*) filter (
      where execution.requested_at >= day_start
        and execution.currency = policy_currency
        and execution.estimated_cost is not null
    )::integer,
    count(*) filter (
      where execution.currency = policy_currency
        and execution.estimated_cost is not null
    )::integer
  into daily_executions, monthly_executions, daily_cost, monthly_cost,
    daily_cost_recorded, monthly_cost_recorded
  from app.ai_executions execution
  where execution.tenant_id = p_tenant_id
    and execution.requested_at >= month_start
    and execution.requested_at < p_at + interval '1 microsecond';

  warning_reached := coalesce(policy.enabled, false) and (
    (policy.daily_warning_amount is not null and daily_cost >= policy.daily_warning_amount)
    or (policy.monthly_warning_amount is not null and monthly_cost >= policy.monthly_warning_amount)
    or (policy.daily_warning_executions is not null
      and daily_executions >= policy.daily_warning_executions)
    or (policy.monthly_warning_executions is not null
      and monthly_executions >= policy.monthly_warning_executions)
  );
  stop_reached := coalesce(policy.enabled, false) and (
    (policy.daily_stop_amount is not null and daily_cost >= policy.daily_stop_amount)
    or (policy.monthly_stop_amount is not null and monthly_cost >= policy.monthly_stop_amount)
    or (policy.daily_stop_executions is not null
      and daily_executions >= policy.daily_stop_executions)
    or (policy.monthly_stop_executions is not null
      and monthly_executions >= policy.monthly_stop_executions)
  );

  if policy.daily_stop_amount is not null and daily_cost >= policy.daily_stop_amount then
    stop_reasons := array_append(stop_reasons, 'daily_cost');
  end if;
  if policy.monthly_stop_amount is not null and monthly_cost >= policy.monthly_stop_amount then
    stop_reasons := array_append(stop_reasons, 'monthly_cost');
  end if;
  if policy.daily_stop_executions is not null
     and daily_executions >= policy.daily_stop_executions
  then
    stop_reasons := array_append(stop_reasons, 'daily_executions');
  end if;
  if policy.monthly_stop_executions is not null
     and monthly_executions >= policy.monthly_stop_executions
  then
    stop_reasons := array_append(stop_reasons, 'monthly_executions');
  end if;

  return jsonb_build_object(
    'configured', configured,
    'enabled', coalesce(policy.enabled, false),
    'currency', policy_currency,
    'daily_warning_amount', policy.daily_warning_amount,
    'daily_stop_amount', policy.daily_stop_amount,
    'monthly_warning_amount', policy.monthly_warning_amount,
    'monthly_stop_amount', policy.monthly_stop_amount,
    'daily_warning_executions', policy.daily_warning_executions,
    'daily_stop_executions', policy.daily_stop_executions,
    'monthly_warning_executions', policy.monthly_warning_executions,
    'monthly_stop_executions', policy.monthly_stop_executions,
    'daily_execution_count', daily_executions,
    'monthly_execution_count', monthly_executions,
    'daily_estimated_cost', daily_cost,
    'monthly_estimated_cost', monthly_cost,
    'daily_cost_recorded_count', daily_cost_recorded,
    'monthly_cost_recorded_count', monthly_cost_recorded,
    'warning_reached', warning_reached,
    'stop_reached', stop_reached,
    'stop_reasons', to_jsonb(stop_reasons),
    'row_version', coalesce(policy.row_version, 0),
    'updated_at', policy.updated_at
  );
end
$$;

create or replace function public.get_ai_budget_policy()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare tenant uuid := app.current_tenant_id();
begin
  if auth.uid() is null or tenant is null
     or not (app.has_permission('ai.read') or app.has_permission('tenant.manage'))
  then
    raise exception 'AI budget is not readable' using errcode = '42501';
  end if;
  return private.ai_budget_status(tenant, now());
end
$$;

create or replace function public.save_ai_budget_policy(
  p_row_version bigint,
  p_enabled boolean,
  p_currency text,
  p_daily_warning_amount numeric,
  p_daily_stop_amount numeric,
  p_monthly_warning_amount numeric,
  p_monthly_stop_amount numeric,
  p_daily_warning_executions integer,
  p_daily_stop_executions integer,
  p_monthly_warning_executions integer,
  p_monthly_stop_executions integer,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  current_policy app.ai_budget_policies%rowtype;
  saved app.ai_budget_policies%rowtype;
  currency_code text := upper(btrim(coalesce(p_currency, '')));
begin
  if auth.uid() is null or tenant is null
     or not app.has_permission('tenant.manage')
     or p_row_version is null or p_row_version < 0
     or p_enabled is null or currency_code !~ '^[A-Z]{3}$'
     or p_daily_warning_amount < 0 or p_daily_stop_amount < 0
     or p_monthly_warning_amount < 0 or p_monthly_stop_amount < 0
     or p_daily_warning_executions < 1 or p_daily_stop_executions < 1
     or p_monthly_warning_executions < 1 or p_monthly_stop_executions < 1
     or (p_daily_warning_amount is not null and p_daily_stop_amount is not null
       and p_daily_warning_amount > p_daily_stop_amount)
     or (p_monthly_warning_amount is not null and p_monthly_stop_amount is not null
       and p_monthly_warning_amount > p_monthly_stop_amount)
     or (p_daily_warning_executions is not null and p_daily_stop_executions is not null
       and p_daily_warning_executions > p_daily_stop_executions)
     or (p_monthly_warning_executions is not null and p_monthly_stop_executions is not null
       and p_monthly_warning_executions > p_monthly_stop_executions)
     or (p_enabled and p_daily_stop_amount is null and p_monthly_stop_amount is null
       and p_daily_stop_executions is null and p_monthly_stop_executions is null)
  then
    raise exception 'AI budget policy is invalid' using errcode = '22023';
  end if;

  select policy.* into current_policy
  from app.ai_budget_policies policy
  where policy.tenant_id = tenant
  for update;

  if found then
    if p_row_version = 0 or current_policy.row_version <> p_row_version then
      return null;
    end if;
    update app.ai_budget_policies set
      enabled = p_enabled,
      currency = currency_code,
      daily_warning_amount = p_daily_warning_amount,
      daily_stop_amount = p_daily_stop_amount,
      monthly_warning_amount = p_monthly_warning_amount,
      monthly_stop_amount = p_monthly_stop_amount,
      daily_warning_executions = p_daily_warning_executions,
      daily_stop_executions = p_daily_stop_executions,
      monthly_warning_executions = p_monthly_warning_executions,
      monthly_stop_executions = p_monthly_stop_executions,
      updated_by = auth.uid()
    where tenant_id = tenant
    returning * into saved;
  else
    if p_row_version <> 0 then return null; end if;
    insert into app.ai_budget_policies(
      tenant_id, enabled, currency,
      daily_warning_amount, daily_stop_amount,
      monthly_warning_amount, monthly_stop_amount,
      daily_warning_executions, daily_stop_executions,
      monthly_warning_executions, monthly_stop_executions,
      created_by, updated_by
    ) values (
      tenant, p_enabled, currency_code,
      p_daily_warning_amount, p_daily_stop_amount,
      p_monthly_warning_amount, p_monthly_stop_amount,
      p_daily_warning_executions, p_daily_stop_executions,
      p_monthly_warning_executions, p_monthly_stop_executions,
      auth.uid(), auth.uid()
    ) returning * into saved;
  end if;

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type,
    resource_id, request_id, before_data, after_data
  ) values (
    tenant, auth.uid(), 'user', 'ai.budget_policy_saved', 'tenant', tenant,
    nullif(p_request_id, ''),
    case when current_policy.tenant_id is null then null else to_jsonb(current_policy) end,
    to_jsonb(saved)
  );

  return private.ai_budget_status(tenant, now());
end
$$;

create or replace function private.enforce_ai_budget_before_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare status jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text, 157));
  status := private.ai_budget_status(new.tenant_id, coalesce(new.requested_at, now()));
  if coalesce((status->>'stop_reached')::boolean, false) then
    raise exception 'AI budget stop threshold reached'
      using errcode = 'P0001', detail = (status->'stop_reasons')::text;
  end if;
  if coalesce((status->>'configured')::boolean, false) then
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'budget_check', jsonb_build_object(
        'checked_at', now(),
        'warning_reached', (status->>'warning_reached')::boolean,
        'daily_execution_count', (status->>'daily_execution_count')::integer,
        'monthly_execution_count', (status->>'monthly_execution_count')::integer,
        'daily_estimated_cost', (status->>'daily_estimated_cost')::numeric,
        'monthly_estimated_cost', (status->>'monthly_estimated_cost')::numeric,
        'currency', status->>'currency'
      )
    );
  end if;
  return new;
end
$$;

create trigger ai_executions_budget_before_insert
before insert on app.ai_executions
for each row execute function private.enforce_ai_budget_before_insert();

revoke all on function private.ai_budget_status(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function private.enforce_ai_budget_before_insert()
  from public, anon, authenticated;
revoke all on function public.get_ai_budget_policy() from public, anon;
revoke all on function public.save_ai_budget_policy(
  bigint, boolean, text, numeric, numeric, numeric, numeric,
  integer, integer, integer, integer, text
) from public, anon;
grant execute on function public.get_ai_budget_policy() to authenticated;
grant execute on function public.save_ai_budget_policy(
  bigint, boolean, text, numeric, numeric, numeric, numeric,
  integer, integer, integer, integer, text
) to authenticated;

comment on table app.ai_budget_policies is
  'Tenant AI warning and stop limits. Policies are disabled until explicitly configured and enabled.';
comment on function public.get_ai_budget_policy() is
  'Returns the tenant AI budget policy and current UTC day/month usage without AI content.';
comment on function public.save_ai_budget_policy(
  bigint, boolean, text, numeric, numeric, numeric, numeric,
  integer, integer, integer, integer, text
) is 'Creates or updates the tenant AI budget policy with optimistic locking and audit history.';

commit;
