-- SES Navigator
-- Migration: 165_proposal_message_delivery_rpc
-- Purpose: Queue, retry, record, and read proposal message delivery without exposing provider credentials.

begin;

alter table app.outbound_messages
  drop constraint outbound_messages_approval_state_check;

alter table app.outbound_messages
  add constraint outbound_messages_approval_state_check check (
    ai_execution_id is null
    or (
      status in ('approved','queued','sent','failed')
      and approved_version_id is not null
      and approved_at is not null
    )
    or (
      status not in ('approved','queued','sent','failed')
      and approved_version_id is null
      and approved_at is null
    )
  );

alter table app.message_delivery_attempts
  add column delivery_batch_id uuid,
  add column requested_by uuid references auth.users(id) on delete set null,
  add column request_id text;

create index message_delivery_attempts_batch_idx
  on app.message_delivery_attempts(tenant_id, outbound_message_id, delivery_batch_id)
  where delivery_batch_id is not null;

create or replace function private.proposal_message_delivery_json(
  p_message_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'message_id', m.id,
    'proposal_id', m.proposal_id,
    'status', m.status,
    'sent_at', m.sent_at,
    'approved_version_id', m.approved_version_id,
    'row_version', m.row_version,
    'recipients', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'type', r.recipient_type,
          'name', r.recipient_name,
          'address', r.recipient_address,
          'delivery_status', r.delivery_status,
          'attempts', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', a.id,
                'attempt_no', a.attempt_no,
                'status', a.status,
                'provider', a.provider,
                'provider_message_id', a.provider_message_id,
                'attempted_at', a.attempted_at,
                'response_code', a.response_code,
                'error_message', a.error_message
              )
              order by a.attempt_no desc, a.attempted_at desc, a.id desc
            )
            from app.message_delivery_attempts a
            where a.tenant_id = r.tenant_id
              and a.outbound_message_id = r.outbound_message_id
              and a.recipient_id = r.id
          ), '[]'::jsonb)
        )
        order by r.recipient_type, r.recipient_address, r.id
      )
      from app.outbound_message_recipients r
      where r.tenant_id = m.tenant_id
        and r.outbound_message_id = m.id
    ), '[]'::jsonb)
  )
  from app.outbound_messages m
  where m.id = p_message_id;
$$;

revoke all on function private.proposal_message_delivery_json(uuid)
  from public, anon, authenticated;

create or replace function public.prepare_proposal_message_delivery(
  p_proposal_id uuid,
  p_message_id uuid,
  p_idempotency_key text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  actor uuid := auth.uid();
  proposal app.proposals%rowtype;
  message app.outbound_messages%rowtype;
  approved_version app.outbound_message_versions%rowtype;
  batch_id uuid := gen_random_uuid();
  request_hash text;
  idempotency app.idempotency_records%rowtype;
  result jsonb;
begin
  if actor is null
     or tenant is null
     or p_proposal_id is null
     or p_message_id is null
     or p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{1,200}$'
     or length(coalesce(p_request_id, '')) > 200
     or not app.has_permission('message.send')
     or not app.has_permission('proposal.send')
  then
    raise exception 'invalid proposal message send request' using errcode = '22023';
  end if;

  select p.* into proposal
  from app.proposals p
  where p.id = p_proposal_id
    and p.tenant_id = tenant
    and p.deleted_at is null
    and p.status = 'approved'
    and app.can_access_proposal(p.id, 'proposal.send', 'edit')
  for update;

  if not found then return null; end if;

  select m.* into message
  from app.outbound_messages m
  where m.id = p_message_id
    and m.tenant_id = tenant
    and m.proposal_id = proposal.id
    and m.channel = 'email'
    and m.status = 'approved'
    and m.approved_version_id is not null
    and m.approved_at is not null
    and app.can_access_outbound_message(m.id, 'message.send', 'edit')
  for update;

  if not found then return null; end if;

  select v.* into approved_version
  from app.outbound_message_versions v
  where v.id = message.approved_version_id
    and v.tenant_id = tenant
    and v.outbound_message_id = message.id;

  if not found
     or nullif(btrim(approved_version.subject), '') is null
     or nullif(btrim(approved_version.body_text), '') is null
     or not exists (
       select 1
       from app.outbound_message_recipients r
       where r.tenant_id = tenant
         and r.outbound_message_id = message.id
     )
     or exists (
       select 1
       from app.outbound_message_recipients r
       where r.tenant_id = tenant
         and r.outbound_message_id = message.id
         and r.delivery_status <> 'pending'
     )
  then
    return null;
  end if;

  request_hash := encode(
    public.digest(
      convert_to(
        concat_ws(':', p_proposal_id::text, p_message_id::text, message.approved_version_id::text),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into app.idempotency_records(
    tenant_id, actor_type, actor_id, operation_name, idempotency_key,
    request_hash, locked_until, expires_at
  ) values (
    tenant, 'user', actor::text, 'proposal_message.send', p_idempotency_key,
    request_hash, now() + interval '5 minutes', now() + interval '1 day'
  )
  on conflict (tenant_id, actor_type, actor_id, operation_name, idempotency_key)
  do nothing;

  select i.* into idempotency
  from app.idempotency_records i
  where i.tenant_id = tenant
    and i.actor_type = 'user'
    and i.actor_id = actor::text
    and i.operation_name = 'proposal_message.send'
    and i.idempotency_key = p_idempotency_key
  for update;

  if idempotency.request_hash is distinct from request_hash then
    raise exception 'idempotency key was reused with a different request'
      using errcode = '22023';
  end if;

  if idempotency.completed_at is not null and idempotency.response_body is not null then
    return idempotency.response_body;
  end if;

  insert into app.message_delivery_attempts(
    tenant_id, outbound_message_id, recipient_id, attempt_no, status,
    delivery_batch_id, requested_by, request_id
  )
  select
    tenant,
    message.id,
    r.id,
    coalesce((
      select max(existing.attempt_no)
      from app.message_delivery_attempts existing
      where existing.tenant_id = tenant
        and existing.outbound_message_id = message.id
        and existing.recipient_id = r.id
    ), 0) + 1,
    'queued',
    batch_id,
    actor,
    nullif(p_request_id, '')
  from app.outbound_message_recipients r
  where r.tenant_id = tenant
    and r.outbound_message_id = message.id;

  update app.outbound_messages
  set status = 'queued',
      scheduled_at = coalesce(scheduled_at, now()),
      updated_by = actor
  where id = message.id;

  insert into app.outbox_events(
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    deduplication_key
  ) values (
    tenant,
    'outbound_message',
    message.id,
    'proposal_message.delivery_requested',
    jsonb_build_object(
      'proposal_id', proposal.id,
      'message_id', message.id,
      'delivery_batch_id', batch_id,
      'approved_version_id', message.approved_version_id,
      'requested_by', actor
    ),
    concat('proposal-message-send:', message.id::text, ':', p_idempotency_key)
  );

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data, metadata
  ) values (
    tenant, actor, 'user', 'proposal_message.delivery_queued',
    'outbound_message', message.id, nullif(p_request_id, ''),
    jsonb_build_object('status', message.status, 'row_version', message.row_version),
    jsonb_build_object('status', 'queued', 'approved_version_id', message.approved_version_id),
    jsonb_build_object('proposal_id', proposal.id, 'delivery_batch_id', batch_id)
  );

  select jsonb_build_object(
    'batch_id', batch_id,
    'message_id', message.id,
    'proposal_id', proposal.id,
    'subject', approved_version.subject,
    'body_text', approved_version.body_text,
    'attempts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'attempt_id', a.id,
          'recipient_id', r.id,
          'recipient_type', r.recipient_type,
          'recipient_name', r.recipient_name,
          'recipient_address', r.recipient_address,
          'attempt_no', a.attempt_no
        )
        order by r.recipient_type, r.recipient_address, r.id
      )
      from app.message_delivery_attempts a
      join app.outbound_message_recipients r
        on r.tenant_id = a.tenant_id
       and r.outbound_message_id = a.outbound_message_id
       and r.id = a.recipient_id
      where a.tenant_id = tenant
        and a.outbound_message_id = message.id
        and a.delivery_batch_id = batch_id
        and a.status = 'queued'
    ), '[]'::jsonb)
  ) into result;

  update app.idempotency_records
  set response_status = 200,
      response_body = result,
      completed_at = now(),
      locked_until = null
  where id = idempotency.id;

  return result;
end;
$$;

create or replace function public.prepare_proposal_message_retry(
  p_proposal_id uuid,
  p_message_id uuid,
  p_idempotency_key text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  actor uuid := auth.uid();
  proposal app.proposals%rowtype;
  message app.outbound_messages%rowtype;
  approved_version app.outbound_message_versions%rowtype;
  batch_id uuid := gen_random_uuid();
  request_hash text;
  idempotency app.idempotency_records%rowtype;
  result jsonb;
begin
  if actor is null
     or tenant is null
     or p_proposal_id is null
     or p_message_id is null
     or p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{1,200}$'
     or length(coalesce(p_request_id, '')) > 200
     or not app.has_permission('message.send')
     or not app.has_permission('proposal.send')
  then
    raise exception 'invalid proposal message retry request' using errcode = '22023';
  end if;

  select p.* into proposal
  from app.proposals p
  where p.id = p_proposal_id
    and p.tenant_id = tenant
    and p.deleted_at is null
    and p.status = 'approved'
    and app.can_access_proposal(p.id, 'proposal.send', 'edit')
  for update;

  if not found then return null; end if;

  select m.* into message
  from app.outbound_messages m
  where m.id = p_message_id
    and m.tenant_id = tenant
    and m.proposal_id = proposal.id
    and m.channel = 'email'
    and m.status = 'failed'
    and m.approved_version_id is not null
    and m.approved_at is not null
    and app.can_access_outbound_message(m.id, 'message.send', 'edit')
  for update;

  if not found then return null; end if;

  select v.* into approved_version
  from app.outbound_message_versions v
  where v.id = message.approved_version_id
    and v.tenant_id = tenant
    and v.outbound_message_id = message.id;

  if not found
     or not exists (
       select 1
       from app.outbound_message_recipients r
       where r.tenant_id = tenant
         and r.outbound_message_id = message.id
         and r.delivery_status = 'failed'
     )
  then
    return null;
  end if;

  request_hash := encode(
    public.digest(
      convert_to(
        concat_ws(':', p_proposal_id::text, p_message_id::text, message.approved_version_id::text, 'retry'),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into app.idempotency_records(
    tenant_id, actor_type, actor_id, operation_name, idempotency_key,
    request_hash, locked_until, expires_at
  ) values (
    tenant, 'user', actor::text, 'proposal_message.retry', p_idempotency_key,
    request_hash, now() + interval '5 minutes', now() + interval '1 day'
  )
  on conflict (tenant_id, actor_type, actor_id, operation_name, idempotency_key)
  do nothing;

  select i.* into idempotency
  from app.idempotency_records i
  where i.tenant_id = tenant
    and i.actor_type = 'user'
    and i.actor_id = actor::text
    and i.operation_name = 'proposal_message.retry'
    and i.idempotency_key = p_idempotency_key
  for update;

  if idempotency.request_hash is distinct from request_hash then
    raise exception 'idempotency key was reused with a different request'
      using errcode = '22023';
  end if;

  if idempotency.completed_at is not null and idempotency.response_body is not null then
    return idempotency.response_body;
  end if;

  insert into app.message_delivery_attempts(
    tenant_id, outbound_message_id, recipient_id, attempt_no, status,
    delivery_batch_id, requested_by, request_id
  )
  select
    tenant,
    message.id,
    r.id,
    coalesce((
      select max(existing.attempt_no)
      from app.message_delivery_attempts existing
      where existing.tenant_id = tenant
        and existing.outbound_message_id = message.id
        and existing.recipient_id = r.id
    ), 0) + 1,
    'queued',
    batch_id,
    actor,
    nullif(p_request_id, '')
  from app.outbound_message_recipients r
  where r.tenant_id = tenant
    and r.outbound_message_id = message.id
    and r.delivery_status = 'failed';

  update app.outbound_message_recipients
  set delivery_status = 'pending'
  where tenant_id = tenant
    and outbound_message_id = message.id
    and delivery_status = 'failed';

  update app.outbound_messages
  set status = 'queued',
      updated_by = actor
  where id = message.id;

  insert into app.outbox_events(
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    deduplication_key
  ) values (
    tenant,
    'outbound_message',
    message.id,
    'proposal_message.retry_requested',
    jsonb_build_object(
      'proposal_id', proposal.id,
      'message_id', message.id,
      'delivery_batch_id', batch_id,
      'approved_version_id', message.approved_version_id,
      'requested_by', actor
    ),
    concat('proposal-message-retry:', message.id::text, ':', p_idempotency_key)
  );

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data, metadata
  ) values (
    tenant, actor, 'user', 'proposal_message.retry_queued',
    'outbound_message', message.id, nullif(p_request_id, ''),
    jsonb_build_object('status', message.status, 'row_version', message.row_version),
    jsonb_build_object('status', 'queued', 'approved_version_id', message.approved_version_id),
    jsonb_build_object('proposal_id', proposal.id, 'delivery_batch_id', batch_id)
  );

  select jsonb_build_object(
    'batch_id', batch_id,
    'message_id', message.id,
    'proposal_id', proposal.id,
    'subject', approved_version.subject,
    'body_text', approved_version.body_text,
    'attempts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'attempt_id', a.id,
          'recipient_id', r.id,
          'recipient_type', r.recipient_type,
          'recipient_name', r.recipient_name,
          'recipient_address', r.recipient_address,
          'attempt_no', a.attempt_no
        )
        order by r.recipient_type, r.recipient_address, r.id
      )
      from app.message_delivery_attempts a
      join app.outbound_message_recipients r
        on r.tenant_id = a.tenant_id
       and r.outbound_message_id = a.outbound_message_id
       and r.id = a.recipient_id
      where a.tenant_id = tenant
        and a.outbound_message_id = message.id
        and a.delivery_batch_id = batch_id
        and a.status = 'queued'
    ), '[]'::jsonb)
  ) into result;

  update app.idempotency_records
  set response_status = 200,
      response_body = result,
      completed_at = now(),
      locked_until = null
  where id = idempotency.id;

  return result;
end;
$$;

create or replace function public.record_proposal_message_delivery_result(
  p_attempt_id uuid,
  p_status text,
  p_provider text,
  p_provider_message_id text default null,
  p_response_code text default null,
  p_response_payload jsonb default null,
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  attempt app.message_delivery_attempts%rowtype;
  message app.outbound_messages%rowtype;
  proposal app.proposals%rowtype;
  final_status text;
  safe_status text := lower(btrim(coalesce(p_status, '')));
  safe_provider text := nullif(btrim(p_provider), '');
begin
  if auth.role() is distinct from 'service_role'
     or p_attempt_id is null
     or safe_status not in ('accepted','delivered','bounced','failed')
     or safe_provider is null
     or length(safe_provider) > 100
     or length(coalesce(p_provider_message_id, '')) > 500
     or length(coalesce(p_response_code, '')) > 100
     or length(coalesce(p_error_message, '')) > 2000
     or (p_response_payload is not null and length(p_response_payload::text) > 10000)
  then
    raise exception 'invalid delivery result' using errcode = '22023';
  end if;

  select a.* into attempt
  from app.message_delivery_attempts a
  where a.id = p_attempt_id
  for update;

  if not found then return null; end if;

  select m.* into message
  from app.outbound_messages m
  where m.id = attempt.outbound_message_id
    and m.tenant_id = attempt.tenant_id
  for update;

  if not found then return null; end if;

  if attempt.status <> 'queued' then
    return private.proposal_message_delivery_json(message.id);
  end if;

  update app.message_delivery_attempts
  set provider = safe_provider,
      provider_message_id = nullif(btrim(p_provider_message_id), ''),
      status = safe_status,
      attempted_at = now(),
      response_code = nullif(btrim(p_response_code), ''),
      response_payload = p_response_payload,
      error_message = nullif(btrim(p_error_message), '')
  where id = attempt.id;

  update app.outbound_message_recipients
  set delivery_status = case safe_status
    when 'accepted' then 'sent'
    when 'delivered' then 'delivered'
    when 'bounced' then 'bounced'
    else 'failed'
  end
  where id = attempt.recipient_id
    and tenant_id = attempt.tenant_id
    and outbound_message_id = attempt.outbound_message_id;

  if exists (
    select 1
    from app.message_delivery_attempts a
    where a.tenant_id = attempt.tenant_id
      and a.outbound_message_id = attempt.outbound_message_id
      and a.delivery_batch_id = attempt.delivery_batch_id
      and a.status = 'queued'
  ) then
    final_status := 'queued';
  elsif exists (
    select 1
    from app.outbound_message_recipients r
    where r.tenant_id = attempt.tenant_id
      and r.outbound_message_id = attempt.outbound_message_id
      and r.delivery_status in ('pending','failed','bounced')
  ) then
    final_status := 'failed';
  else
    final_status := 'sent';
  end if;

  update app.outbound_messages
  set status = final_status,
      sent_at = case when final_status = 'sent' then coalesce(sent_at, now()) else sent_at end,
      updated_by = coalesce(attempt.requested_by, updated_by)
  where id = message.id;

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, after_data, metadata
  ) values (
    attempt.tenant_id,
    attempt.requested_by,
    'system',
    'proposal_message.delivery_attempt_recorded',
    'outbound_message',
    message.id,
    attempt.request_id,
    jsonb_build_object(
      'attempt_id', attempt.id,
      'recipient_id', attempt.recipient_id,
      'status', safe_status,
      'provider', safe_provider,
      'response_code', nullif(btrim(p_response_code), '')
    ),
    jsonb_build_object('delivery_batch_id', attempt.delivery_batch_id)
  );

  if final_status <> 'queued' then
    update app.outbox_events
    set published_at = coalesce(published_at, now()),
        attempt_count = attempt_count + 1,
        last_error = case when final_status = 'failed'
          then 'One or more recipients failed delivery'
          else null end
    where tenant_id = attempt.tenant_id
      and aggregate_type = 'outbound_message'
      and aggregate_id = message.id
      and published_at is null
      and payload->>'delivery_batch_id' = attempt.delivery_batch_id::text;
  end if;

  if final_status = 'sent' and message.proposal_id is not null then
    select p.* into proposal
    from app.proposals p
    where p.id = message.proposal_id
      and p.tenant_id = attempt.tenant_id
    for update;

    if found and proposal.status = 'approved' then
      update app.proposals
      set status = 'sent',
          updated_by = coalesce(attempt.requested_by, updated_by)
      where id = proposal.id;

      insert into app.proposal_status_histories(
        tenant_id, proposal_id, from_status, to_status, change_reason,
        changed_by, source_type, metadata
      ) values (
        attempt.tenant_id, proposal.id, 'approved', 'sent',
        'Approved proposal message delivered',
        attempt.requested_by, 'system',
        jsonb_build_object(
          'outbound_message_id', message.id,
          'delivery_batch_id', attempt.delivery_batch_id
        )
      );

      insert into app.proposal_snapshots(
        tenant_id, proposal_id, snapshot_type, snapshot_data, created_by
      )
      select
        p.tenant_id,
        p.id,
        'sent',
        to_jsonb(p) - array['tenant_id','deleted_at','deleted_by','delete_reason'],
        attempt.requested_by
      from app.proposals p
      where p.id = proposal.id;

      insert into audit.audit_logs(
        tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
        request_id, before_data, after_data, metadata
      ) values (
        attempt.tenant_id,
        attempt.requested_by,
        'system',
        'proposal.status_changed',
        'proposal',
        proposal.id,
        attempt.request_id,
        jsonb_build_object('status', proposal.status, 'row_version', proposal.row_version),
        jsonb_build_object('status', 'sent'),
        jsonb_build_object(
          'outbound_message_id', message.id,
          'delivery_batch_id', attempt.delivery_batch_id
        )
      );
    end if;
  end if;

  if final_status in ('sent','failed') then
    insert into audit.audit_logs(
      tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
      request_id, after_data, metadata
    ) values (
      attempt.tenant_id,
      attempt.requested_by,
      'system',
      case final_status
        when 'sent' then 'proposal_message.sent'
        else 'proposal_message.delivery_failed'
      end,
      'outbound_message',
      message.id,
      attempt.request_id,
      jsonb_build_object('status', final_status),
      jsonb_build_object('delivery_batch_id', attempt.delivery_batch_id)
    );
  end if;

  return private.proposal_message_delivery_json(message.id);
end;
$$;

create or replace function public.get_proposal_message_delivery(
  p_proposal_id uuid,
  p_message_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  message_id uuid;
begin
  if auth.uid() is null
     or tenant is null
     or p_proposal_id is null
     or p_message_id is null
     or not app.has_permission('message.read')
     or not app.has_permission('proposal.read')
     or not app.can_access_proposal(p_proposal_id, 'proposal.read', 'view')
  then
    raise exception 'proposal message delivery read is not permitted'
      using errcode = '42501';
  end if;

  select m.id into message_id
  from app.outbound_messages m
  where m.id = p_message_id
    and m.tenant_id = tenant
    and m.proposal_id = p_proposal_id
    and app.can_access_outbound_message(m.id, 'message.read', 'view');

  return case when message_id is null then null
    else private.proposal_message_delivery_json(message_id) end;
end;
$$;

revoke all on function public.prepare_proposal_message_delivery(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.prepare_proposal_message_retry(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.record_proposal_message_delivery_result(uuid, text, text, text, text, jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_proposal_message_delivery(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.prepare_proposal_message_delivery(uuid, uuid, text, text)
  to authenticated;
grant execute on function public.prepare_proposal_message_retry(uuid, uuid, text, text)
  to authenticated;
grant execute on function public.record_proposal_message_delivery_result(uuid, text, text, text, text, jsonb, text)
  to service_role;
grant execute on function public.get_proposal_message_delivery(uuid, uuid)
  to authenticated;

comment on function public.prepare_proposal_message_delivery(uuid, uuid, text, text) is
  'Queues an approved proposal message for delivery using the immutable approved version and pending recipients.';
comment on function public.prepare_proposal_message_retry(uuid, uuid, text, text) is
  'Queues only failed recipients for another delivery attempt while preserving previous attempts.';
comment on function public.record_proposal_message_delivery_result(uuid, text, text, text, text, jsonb, text) is
  'Service-role-only delivery result recorder. It updates recipient/message state, delivery audit, and the proposal sent milestone.';
comment on function public.get_proposal_message_delivery(uuid, uuid) is
  'Returns an authorized delivery summary without exposing provider response payloads.';

commit;
