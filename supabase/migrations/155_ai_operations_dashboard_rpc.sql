-- SES Navigator
-- Migration: 155_ai_operations_dashboard_rpc
-- Purpose: Return tenant-scoped AI quality, cost, usage, and failure metrics.

begin;

create or replace function public.get_ai_operations_dashboard(
  p_from_date date,
  p_to_date date
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
     or not app.has_permission('ai.read')
     or p_from_date is null or p_to_date is null
     or p_from_date > p_to_date
     or p_to_date > p_from_date + 366
  then
    raise exception 'invalid AI operations dashboard request' using errcode = '22023';
  end if;

  with period_executions as materialized (
    select execution.*
    from app.ai_executions execution
    where execution.tenant_id = tenant
      and execution.requested_at >= p_from_date::timestamptz
      and execution.requested_at < (p_to_date + 1)::timestamptz
  ), latest_reviews as materialized (
    select distinct on (review.ai_execution_id)
      review.ai_execution_id,
      review.review_status,
      review.reviewed_at
    from app.ai_execution_reviews review
    join period_executions execution on execution.id = review.ai_execution_id
    where review.tenant_id = tenant
    order by review.ai_execution_id, review.created_at desc, review.id desc
  ), execution_totals as (
    select
      count(*)::integer execution_count,
      count(*) filter (where status = 'succeeded')::integer succeeded_count,
      count(*) filter (where status = 'failed')::integer failed_count,
      count(*) filter (where status in ('queued', 'running'))::integer active_count,
      count(*) filter (where status = 'review_required')::integer review_required_count,
      case when count(*) = 0 then null else round(
        count(*) filter (where status = 'succeeded')::numeric / count(*) * 100,
        2
      ) end success_rate,
      coalesce(sum(input_tokens), 0)::bigint input_tokens,
      coalesce(sum(output_tokens), 0)::bigint output_tokens,
      coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0)::bigint total_tokens,
      count(*) filter (where input_tokens is not null and output_tokens is not null)::integer token_recorded_count,
      count(*) filter (where estimated_cost is not null)::integer cost_recorded_count,
      case when count(*) = 0 then null else round(
        count(*) filter (where estimated_cost is not null)::numeric / count(*) * 100,
        2
      ) end cost_coverage_rate,
      round(avg(extract(epoch from (completed_at - started_at)) * 1000)
        filter (where started_at is not null and completed_at is not null))::bigint average_latency_ms,
      round(percentile_cont(0.95) within group (
        order by extract(epoch from (completed_at - started_at)) * 1000
      ) filter (where started_at is not null and completed_at is not null))::bigint p95_latency_ms
    from period_executions
  ), review_totals as (
    select
      count(*) filter (where review_status = 'pending')::integer pending_count,
      count(*) filter (where review_status <> 'pending')::integer reviewed_count,
      count(*) filter (where review_status = 'approved')::integer approved_count,
      count(*) filter (where review_status = 'partially_approved')::integer partially_approved_count,
      count(*) filter (where review_status = 'rejected')::integer rejected_count,
      count(*) filter (where review_status = 'changes_requested')::integer changes_requested_count,
      case when count(*) filter (where review_status <> 'pending') = 0 then null else round(
        count(*) filter (where review_status in ('approved', 'partially_approved'))::numeric
          / count(*) filter (where review_status <> 'pending') * 100,
        2
      ) end approval_rate
    from latest_reviews
  ), feedback_totals as (
    select
      count(feedback.id)::integer feedback_count,
      round(avg(feedback.rating)::numeric, 2) average_rating,
      count(feedback.id) filter (
        where feedback.feedback_type in ('incorrect', 'incomplete', 'unsafe', 'format_issue')
      )::integer issue_feedback_count,
      count(feedback.id) filter (where feedback.feedback_type = 'unsafe')::integer unsafe_feedback_count
    from period_executions execution
    left join app.ai_execution_feedback feedback
      on feedback.tenant_id = tenant and feedback.ai_execution_id = execution.id
  ), days as (
    select generate_series(p_from_date, p_to_date, interval '1 day')::date usage_date
  ), daily as (
    select day.usage_date,
      count(execution.id)::integer execution_count,
      count(execution.id) filter (where execution.status = 'succeeded')::integer succeeded_count,
      count(execution.id) filter (where execution.status = 'failed')::integer failed_count,
      coalesce(sum(coalesce(execution.input_tokens, 0) + coalesce(execution.output_tokens, 0)), 0)::bigint total_tokens,
      coalesce(sum(execution.estimated_cost) filter (where execution.currency = 'USD'), 0)::numeric(14,6) estimated_cost_usd
    from days day
    left join period_executions execution
      on execution.requested_at::date = day.usage_date
    group by day.usage_date
  ), type_usage as (
    select execution_type,
      count(*)::integer execution_count,
      count(*) filter (where status = 'succeeded')::integer succeeded_count,
      count(*) filter (where status = 'failed')::integer failed_count,
      case when count(*) = 0 then null else round(
        count(*) filter (where status = 'succeeded')::numeric / count(*) * 100,
        2
      ) end success_rate,
      coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0)::bigint total_tokens
    from period_executions
    group by execution_type
  ), model_usage as (
    select provider, model_name, currency,
      count(*)::integer execution_count,
      count(*) filter (where status = 'failed')::integer failed_count,
      coalesce(sum(input_tokens), 0)::bigint input_tokens,
      coalesce(sum(output_tokens), 0)::bigint output_tokens,
      coalesce(sum(estimated_cost), 0)::numeric(14,6) estimated_cost,
      count(*) filter (where estimated_cost is not null)::integer cost_recorded_count
    from period_executions
    group by provider, model_name, currency
  ), cost_usage as (
    select currency,
      coalesce(sum(estimated_cost), 0)::numeric(14,6) estimated_cost,
      count(*) filter (where estimated_cost is not null)::integer recorded_count
    from period_executions
    group by currency
  ), recent_failures as (
    select id, execution_type, provider, model_name, error_code, requested_at, completed_at
    from period_executions
    where status = 'failed'
    order by requested_at desc, id desc
    limit 20
  )
  select jsonb_build_object(
    'from_date', p_from_date,
    'to_date', p_to_date,
    'execution_count', execution.execution_count,
    'succeeded_count', execution.succeeded_count,
    'failed_count', execution.failed_count,
    'active_count', execution.active_count,
    'review_required_count', execution.review_required_count,
    'success_rate', execution.success_rate,
    'input_tokens', execution.input_tokens,
    'output_tokens', execution.output_tokens,
    'total_tokens', execution.total_tokens,
    'token_recorded_count', execution.token_recorded_count,
    'cost_recorded_count', execution.cost_recorded_count,
    'cost_coverage_rate', execution.cost_coverage_rate,
    'average_latency_ms', execution.average_latency_ms,
    'p95_latency_ms', execution.p95_latency_ms,
    'pending_review_count', review.pending_count,
    'reviewed_count', review.reviewed_count,
    'approved_count', review.approved_count,
    'partially_approved_count', review.partially_approved_count,
    'rejected_count', review.rejected_count,
    'changes_requested_count', review.changes_requested_count,
    'approval_rate', review.approval_rate,
    'feedback_count', feedback.feedback_count,
    'average_rating', feedback.average_rating,
    'issue_feedback_count', feedback.issue_feedback_count,
    'unsafe_feedback_count', feedback.unsafe_feedback_count,
    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
      'usage_date', item.usage_date,
      'execution_count', item.execution_count,
      'succeeded_count', item.succeeded_count,
      'failed_count', item.failed_count,
      'total_tokens', item.total_tokens,
      'estimated_cost_usd', item.estimated_cost_usd
    ) order by item.usage_date), '[]'::jsonb) from daily item),
    'type_usage', (select coalesce(jsonb_agg(jsonb_build_object(
      'execution_type', item.execution_type,
      'execution_count', item.execution_count,
      'succeeded_count', item.succeeded_count,
      'failed_count', item.failed_count,
      'success_rate', item.success_rate,
      'total_tokens', item.total_tokens
    ) order by item.execution_count desc, item.execution_type), '[]'::jsonb) from type_usage item),
    'model_usage', (select coalesce(jsonb_agg(jsonb_build_object(
      'provider', item.provider,
      'model_name', item.model_name,
      'currency', item.currency,
      'execution_count', item.execution_count,
      'failed_count', item.failed_count,
      'input_tokens', item.input_tokens,
      'output_tokens', item.output_tokens,
      'estimated_cost', item.estimated_cost,
      'cost_recorded_count', item.cost_recorded_count
    ) order by item.execution_count desc, item.provider, item.model_name, item.currency), '[]'::jsonb)
      from model_usage item),
    'cost_by_currency', (select coalesce(jsonb_agg(jsonb_build_object(
      'currency', item.currency,
      'estimated_cost', item.estimated_cost,
      'recorded_count', item.recorded_count
    ) order by item.currency), '[]'::jsonb) from cost_usage item),
    'recent_failures', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', item.id,
      'execution_type', item.execution_type,
      'provider', item.provider,
      'model_name', item.model_name,
      'error_code', item.error_code,
      'requested_at', item.requested_at,
      'completed_at', item.completed_at
    ) order by item.requested_at desc, item.id desc), '[]'::jsonb) from recent_failures item)
  ) into result
  from execution_totals execution
  cross join review_totals review
  cross join feedback_totals feedback;

  return result;
end
$$;

revoke all on function public.get_ai_operations_dashboard(date, date)
  from public, anon, authenticated;
grant execute on function public.get_ai_operations_dashboard(date, date)
  to authenticated;

comment on function public.get_ai_operations_dashboard(date, date) is
  'Returns tenant-scoped AI usage, quality, cost coverage, latency, and redacted failure metrics.';

commit;
