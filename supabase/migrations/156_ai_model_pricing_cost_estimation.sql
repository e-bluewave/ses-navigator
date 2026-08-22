-- SES Navigator
-- Migration: 156_ai_model_pricing_cost_estimation
-- Purpose: Version AI model prices and estimate execution costs from recorded token usage.

begin;

create table app.ai_model_prices (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model_name text not null,
  service_tier text not null default 'standard',
  context_band text not null default 'short',
  currency char(3) not null default 'USD',
  input_price_per_million numeric(14,6) not null,
  cached_input_price_per_million numeric(14,6),
  cache_write_price_per_million numeric(14,6),
  output_price_per_million numeric(14,6) not null,
  effective_from date not null,
  effective_to date,
  source_url text not null,
  source_checked_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1,
  unique (provider, model_name, service_tier, context_band, currency, effective_from),
  check (provider = lower(provider) and provider <> ''),
  check (model_name <> '' and service_tier <> '' and context_band <> ''),
  check (currency = upper(currency)),
  check (input_price_per_million >= 0 and output_price_per_million >= 0),
  check (cached_input_price_per_million is null or cached_input_price_per_million >= 0),
  check (cache_write_price_per_million is null or cache_write_price_per_million >= 0),
  check (effective_to is null or effective_to >= effective_from),
  check (source_url ~ '^https://developers\.openai\.com/')
);

create index ai_model_prices_lookup_idx
  on app.ai_model_prices(
    provider, model_name, service_tier, context_band, currency,
    effective_from desc
  );

alter table app.ai_model_prices enable row level security;

select app.attach_updated_at_trigger('app.ai_model_prices'::regclass);

revoke all on table app.ai_model_prices from public, anon, authenticated;

insert into app.ai_model_prices(
  provider, model_name, service_tier, context_band, currency,
  input_price_per_million, cached_input_price_per_million,
  cache_write_price_per_million, output_price_per_million,
  effective_from, source_url, source_checked_at
) values
  ('openai', 'gpt-5.6-sol', 'standard', 'short', 'USD',
    4.000000, 0.400000, 5.000000, 20.000000,
    date '2026-08-22', 'https://developers.openai.com/api/docs/pricing',
    timestamptz '2026-08-22 15:30:00+09'),
  ('openai', 'gpt-5.6-terra', 'standard', 'short', 'USD',
    2.000000, 0.200000, 2.500000, 12.000000,
    date '2026-08-22', 'https://developers.openai.com/api/docs/pricing',
    timestamptz '2026-08-22 15:30:00+09'),
  ('openai', 'gpt-5.6-luna', 'standard', 'short', 'USD',
    0.200000, 0.020000, 0.250000, 1.200000,
    date '2026-08-22', 'https://developers.openai.com/api/docs/pricing',
    timestamptz '2026-08-22 15:30:00+09');

create or replace function private.apply_ai_execution_estimated_cost()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  price app.ai_model_prices%rowtype;
  usage_at timestamptz := coalesce(new.completed_at, new.started_at, new.requested_at, now());
  selected_service_tier text := coalesce(nullif(new.metadata->>'service_tier', ''), 'standard');
  selected_context_band text := coalesce(nullif(new.metadata->>'context_band', ''), 'short');
begin
  if new.estimated_cost is not null
     or (new.input_tokens is null and new.output_tokens is null)
  then
    return new;
  end if;

  select model_price.* into price
  from app.ai_model_prices model_price
  where model_price.provider = lower(new.provider)
    and model_price.model_name = new.model_name
    and model_price.service_tier = selected_service_tier
    and model_price.context_band = selected_context_band
    and model_price.currency = new.currency
    and model_price.effective_from <= usage_at::date
    and (model_price.effective_to is null or model_price.effective_to >= usage_at::date)
  order by model_price.effective_from desc
  limit 1;

  if not found then
    return new;
  end if;

  new.estimated_cost := round((
    coalesce(new.input_tokens, 0)::numeric * price.input_price_per_million
    + coalesce(new.output_tokens, 0)::numeric * price.output_price_per_million
  ) / 1000000, 6);
  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
    'cost_estimate', jsonb_build_object(
      'price_id', price.id,
      'service_tier', selected_service_tier,
      'context_band', selected_context_band,
      'input_price_per_million', price.input_price_per_million,
      'output_price_per_million', price.output_price_per_million,
      'currency', price.currency,
      'calculation', 'all_input_tokens_uncached',
      'source_url', price.source_url,
      'source_checked_at', price.source_checked_at
    )
  );
  return new;
end
$$;

create trigger ai_executions_estimated_cost_before_write
before insert or update of
  provider, model_name, input_tokens, output_tokens, estimated_cost,
  currency, completed_at, metadata
on app.ai_executions
for each row execute function private.apply_ai_execution_estimated_cost();

comment on table app.ai_model_prices is
  'Versioned provider price snapshots. Missing model or pricing dimensions intentionally leave execution cost unrecorded.';
comment on function private.apply_ai_execution_estimated_cost() is
  'Estimates cost only when an exact active price exists; recorded input is conservatively treated as uncached.';

commit;
