-- Item 3: one durable channel ledger. No historical rows are copied or replayed.
-- Apply with the final Pages/Worker release; dispatch starts DISABLED.
begin;

create table public.notification_dispatch_state (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  activated_after timestamptz,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_error text,
  configured_targets text[] not null default '{}',
  last_run_counts jsonb not null default '{}'
);
insert into public.notification_dispatch_state(id) values(true);

create table public.notification_deliveries (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  event_key text not null unique,
  target text not null check(target in ('owner_email','owner_whatsapp','customer_whatsapp')),
  event_type text not null check(event_type in ('order_created','fulfilment_status','payment_status')),
  event_data jsonb not null default '{}',
  status text not null default 'pending' check(status in ('pending','processing','retry','accepted','blocked','uncertain','dead')),
  attempts integer not null default 0 check(attempts between 0 and 6),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  sending_started_at timestamptz,
  first_attempt_at timestamptz,
  request_payload jsonb,
  provider_id text,
  accepted_at timestamptz,
  delivery_status text not null default 'unknown' check(delivery_status in ('unknown','delivered','failed','complained')),
  receipt_at timestamptz,
  delivered_at timestamptz,
  delivery_failed_at timestamptz,
  complained_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notification_deliveries_ready_idx on public.notification_deliveries(target,next_attempt_at,created_at)
  where status in ('pending','retry');
create index notification_deliveries_lease_idx on public.notification_deliveries(lease_expires_at) where status='processing';
create unique index notification_deliveries_provider_idx on public.notification_deliveries((case when target='owner_email' then 'email' else 'whatsapp' end),provider_id) where provider_id is not null;
create index notification_deliveries_order_idx on public.notification_deliveries(order_id);
create index notification_deliveries_customer_order_idx on public.notification_deliveries(order_id,created_at,id)
  where target='customer_whatsapp' and status in ('pending','retry','processing','blocked','uncertain');

-- Keep verified receipts even if a webhook arrives before the send result is saved.
create table public.notification_receipts (
  channel text not null check(channel in ('email','whatsapp')),
  event_key text not null check(length(event_key) between 1 and 240),
  provider_id text not null check(length(provider_id) between 1 and 240),
  delivery_status text not null check(delivery_status in ('delivered','failed','complained')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  primary key(channel,event_key)
);
create index notification_receipts_provider_idx on public.notification_receipts(channel,provider_id,occurred_at desc);

alter table public.notification_dispatch_state enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_receipts enable row level security;
revoke all on public.notification_dispatch_state,public.notification_deliveries,public.notification_receipts from public,anon,authenticated;
grant select,insert,update,delete on public.notification_dispatch_state,public.notification_deliveries,public.notification_receipts to service_role;
grant usage,select on sequence public.notification_deliveries_id_seq to service_role;
grant select,insert on public.order_status_events to service_role;
grant usage,select on sequence public.order_status_events_id_seq to service_role;
grant select on public.notification_templates to service_role;
grant select on public.notification_outbox,public.customer_notification_outbox to service_role;
create policy notification_dispatch_service on public.notification_dispatch_state for all to service_role using(true) with check(true);
create policy notification_deliveries_service on public.notification_deliveries for all to service_role using(true) with check(true);
create policy notification_receipts_service on public.notification_receipts for all to service_role using(true) with check(true);

-- Existing order trigger now writes the sole ledger inside the order transaction.
create or replace function public.chaskabox_enqueue_order_notification()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  insert into public.notification_deliveries(order_id,event_key,target,event_type,event_data,created_at)
  select new.id,new.id::text||':created:'||t,t,'order_created',
    jsonb_build_object('payment_status',new.payment_status,'fulfilment_status',new.fulfilment_status),now()
  from unnest(array['owner_email','owner_whatsapp','customer_whatsapp']) t
  on conflict(event_key) do nothing;
  return new;
end;
$$;

-- Timeline + notifications must commit or roll back together. No silent loss.
create or replace function public.chaskabox_record_order_status_event()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    insert into public.order_status_events(order_id,order_number,event_type,new_status,created_at)
    values(new.id::text,new.order_number,'order_created',coalesce(new.fulfilment_status,'new'),coalesce(new.created_at,now()));
    if new.payment_status is not null then
      insert into public.order_status_events(order_id,order_number,event_type,new_status,created_at)
      values(new.id::text,new.order_number,'payment_status',new.payment_status,coalesce(new.created_at,now()));
    end if;
  else
    if new.fulfilment_status is distinct from old.fulfilment_status then
      insert into public.order_status_events(order_id,order_number,event_type,old_status,new_status)
      values(new.id::text,new.order_number,'fulfilment_status',old.fulfilment_status,new.fulfilment_status);
    end if;
    if new.payment_status is distinct from old.payment_status then
      insert into public.order_status_events(order_id,order_number,event_type,old_status,new_status)
      values(new.id::text,new.order_number,'payment_status',old.payment_status,new.payment_status);
    end if;
  end if;
  return new;
end;
$$;
create function public.notification_enqueue_status_event()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  -- Initial payment state is part of order acknowledgement, not a second update.
  if new.old_status is not null and new.event_type in ('fulfilment_status','payment_status') then
    insert into public.notification_deliveries(order_id,event_key,target,event_type,event_data)
    values(new.order_id::uuid,'status-event:'||new.id::text||':customer_whatsapp',
      'customer_whatsapp',new.event_type,jsonb_build_object('new_status',new.new_status,'old_status',new.old_status))
    on conflict(event_key) do nothing;
  end if;
  return new;
end;
$$;
create trigger notification_status_event_trigger after insert on public.order_status_events
for each row execute function public.notification_enqueue_status_event();

-- Correct only the original seeded acknowledgement; preserve custom owner copy.
update public.notification_templates set body=replace(body,'is confirmed!','has been received.'),updated_at=now()
where name='order_thankyou_customer' and body='🍬 *ChaskaBox* — Shukriya {{customer_name}}!\n\nYour order *{{order_number}}* (Rs. {{total}}) is confirmed!\n\nWe''ll source your snacks fresh and deliver in 4-7 days.\nTrack: {{tracking_url}}';

create function public.notification_claim(p_after timestamptz,p_targets text[])
returns setof public.notification_deliveries language plpgsql security invoker set search_path='' as $$
declare v_id bigint;
begin
  if not exists(select 1 from public.notification_dispatch_state where id and enabled and activated_after=p_after) then return; end if;
  -- A crash after beginning a WAHA request is ambiguous. Never auto-send it again.
  update public.notification_deliveries set
    status=case when sending_started_at is null then 'retry'
      when target='owner_email' and first_attempt_at>now()-interval '23 hours' and attempts<6 then 'retry'
      else 'uncertain' end,
    last_error=case when sending_started_at is null then 'lease_expired_before_send' else 'lease_expired_after_send' end,
    lease_token=null,lease_expires_at=null,next_attempt_at=now(),updated_at=now()
  where status='processing' and lease_expires_at<now();
  update public.notification_deliveries set status='blocked',last_error='event_expired_review_required',updated_at=now()
  where status in ('pending','retry') and created_at>=p_after and created_at<now()-interval '24 hours';
  select d.id into v_id from public.notification_deliveries d
  where d.status in ('pending','retry') and d.created_at>=p_after and d.created_at>=now()-interval '24 hours'
    and d.next_attempt_at<=now() and d.target=any(p_targets) and d.attempts<6
    and (d.target<>'customer_whatsapp' or not exists(select 1 from public.notification_deliveries previous
      where previous.order_id=d.order_id and previous.target='customer_whatsapp'
      and (previous.created_at,previous.id)<(d.created_at,d.id)
      and previous.created_at>=p_after
      and previous.status in ('pending','retry','processing','blocked','uncertain')))
  order by d.created_at,d.id for update of d skip locked limit 1;
  if v_id is null then return; end if;
  return query update public.notification_deliveries set status='processing',lease_token=gen_random_uuid(),
    lease_expires_at=now()+interval '2 minutes',sending_started_at=null,updated_at=now()
  where id=v_id returning *;
end;
$$;

create function public.notification_prepare(p_id bigint,p_token uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_payload jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>32000 then
    raise exception 'Invalid notification payload';
  end if;
  update public.notification_deliveries set request_payload=coalesce(request_payload,p_payload),updated_at=now()
  where id=p_id and lease_token=p_token and status='processing' and lease_expires_at>now()
  returning request_payload into v_payload;
  return v_payload;
end;
$$;

create function public.notification_begin(p_id bigint,p_token uuid,p_after timestamptz)
returns setof public.notification_deliveries language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.notification_dispatch_state where id and enabled and activated_after=p_after) then return; end if;
  -- Mark before I/O, renew the lease, freeze the provider request, and count attempts.
  return query update public.notification_deliveries set attempts=attempts+1,
    first_attempt_at=coalesce(first_attempt_at,now()),sending_started_at=now(),
    lease_expires_at=now()+interval '2 minutes',updated_at=now()
  where id=p_id and lease_token=p_token and status='processing' and lease_expires_at>now()
    and created_at>=p_after and created_at>now()-interval '24 hours' and attempts<6
    and sending_started_at is null
    and request_payload is not null and (first_attempt_at is null or first_attempt_at>now()-interval '23 hours')
  returning *;
end;
$$;

create function public.notification_finish(p_id bigint,p_token uuid,p_status text,p_provider_id text default null,p_error text default null,p_retry_seconds integer default 0)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v public.notification_deliveries; v_receipt public.notification_receipts;
begin
  if p_status not in ('accepted','retry','blocked','uncertain','dead') then raise exception 'Invalid notification result'; end if;
  if p_status='accepted' and (p_provider_id is null or length(p_provider_id) not between 1 and 240) then raise exception 'Acceptance requires provider ID'; end if;
  select * into v from public.notification_deliveries where id=p_id and lease_token=p_token and status='processing'
    and lease_expires_at>now() for update;
  if not found then return false; end if;
  if p_status='retry' and (v.attempts>=6 or v.first_attempt_at<now()-interval '23 hours') then
    p_status=case when v.target='owner_email' then 'uncertain' else 'dead' end;
  end if;
  update public.notification_deliveries set status=p_status,provider_id=p_provider_id,
    accepted_at=case when p_status='accepted' then now() else accepted_at end,
    last_error=left(p_error,200),lease_token=null,lease_expires_at=null,updated_at=now(),
    sending_started_at=case when p_status='blocked' then null else sending_started_at end,
    next_attempt_at=now()+make_interval(secs=>greatest(60*power(2,least(v.attempts,6))::integer,least(greatest(p_retry_seconds,0),86400)))
  where id=p_id;
  if p_status='accepted' then
    -- Compatibility flags mean provider ACCEPTED, never recipient delivery.
    if v.target='owner_email' then
      update public.orders set email_sent=true,email_error=null,email_sent_at=coalesce(email_sent_at,now()) where id=v.order_id;
    elsif v.target='owner_whatsapp' then
      update public.orders set whatsapp_sent=true,whatsapp_error=null,whatsapp_sent_at=coalesce(whatsapp_sent_at,now()) where id=v.order_id;
    end if;
    select * into v_receipt from public.notification_receipts
    where channel=case when v.target='owner_email' then 'email' else 'whatsapp' end and provider_id=p_provider_id
    order by occurred_at desc,case when delivery_status='failed' then 1 else 0 end desc limit 1;
    if found then update public.notification_deliveries set delivery_status=v_receipt.delivery_status,receipt_at=v_receipt.occurred_at,
      delivered_at=(select min(occurred_at) from public.notification_receipts where provider_id=p_provider_id and channel=v_receipt.channel and delivery_status='delivered'),
      delivery_failed_at=(select min(occurred_at) from public.notification_receipts where provider_id=p_provider_id and channel=v_receipt.channel and delivery_status='failed'),
      complained_at=(select min(occurred_at) from public.notification_receipts where provider_id=p_provider_id and channel=v_receipt.channel and delivery_status='complained')
      where id=p_id; end if;
  end if;
  return true;
end;
$$;

create function public.notification_record_receipt(p_channel text,p_event_key text,p_provider_id text,p_status text,p_occurred_at timestamptz)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if p_occurred_at is null or p_occurred_at>now()+interval '5 minutes' then raise exception 'Invalid receipt timestamp'; end if;
  insert into public.notification_receipts(channel,event_key,provider_id,delivery_status,occurred_at)
  values(p_channel,p_event_key,p_provider_id,p_status,p_occurred_at) on conflict do nothing;
  -- Apply already-accepted results; periodic reconciliation also covers send/save races.
  update public.notification_deliveries set delivery_status=p_status,receipt_at=p_occurred_at,updated_at=now()
  where status='accepted' and provider_id=p_provider_id
    and (target='owner_email')=(p_channel='email')
    and (receipt_at is null or receipt_at<p_occurred_at or (receipt_at=p_occurred_at and p_status='failed'))
    and not(p_channel='whatsapp' and delivery_status='delivered' and p_status='failed');
  perform public.notification_reconcile_receipts();
  return true;
end;
$$;

create function public.notification_reconcile_receipts()
returns void language sql security invoker set search_path='' as $$
  update public.notification_deliveries d set delivery_status=r.delivery_status,receipt_at=r.occurred_at,updated_at=now(),
    delivered_at=coalesce(d.delivered_at,proof.delivered_at),
    delivery_failed_at=coalesce(d.delivery_failed_at,proof.failed_at),
    complained_at=coalesce(d.complained_at,proof.complained_at)
  from (select distinct on(channel,provider_id) channel,provider_id,delivery_status,occurred_at
    from public.notification_receipts
    order by channel,provider_id,case when channel='whatsapp' and delivery_status='delivered' then 1 else 0 end desc,
      occurred_at desc,case when delivery_status='failed' then 1 else 0 end desc) r
  join (select channel,provider_id,min(occurred_at) filter(where delivery_status='delivered') delivered_at,
    min(occurred_at) filter(where delivery_status='failed') failed_at,min(occurred_at) filter(where delivery_status='complained') complained_at
    from public.notification_receipts group by channel,provider_id) proof using(channel,provider_id)
  where d.status='accepted' and d.provider_id=r.provider_id and (d.target='owner_email')=(r.channel='email')
    and (d.receipt_at is null or (r.channel='whatsapp' and r.delivery_status='delivered' and d.delivery_status<>'delivered')
      or (r.occurred_at>=d.receipt_at and d.delivery_status<>r.delivery_status)
      or (d.delivered_at is null and proof.delivered_at is not null)
      or (d.delivery_failed_at is null and proof.failed_at is not null)
      or (d.complained_at is null and proof.complained_at is not null))
    and not(r.channel='whatsapp' and d.delivery_status='delivered' and r.delivery_status='failed');
$$;

create function public.notification_record_run(p_targets text[],p_counts jsonb,p_error text default null,p_started boolean default false)
returns void language sql security invoker set search_path='' as $$
  update public.notification_dispatch_state set configured_targets=p_targets,
    last_started_at=case when p_started then now() else last_started_at end,
    last_completed_at=case when not p_started and p_error is null then now() else last_completed_at end,
    last_error=left(p_error,200),last_run_counts=coalesce(p_counts,'{}') where id;
$$;

create function public.notification_retry_order(p_order_id uuid,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_role text; v_n integer; v_skip bigint;
begin
  select role into v_role from public.admin_roles where user_id=p_actor and active;
  if v_role is null or v_role not in ('owner','manager','fulfilment') then raise exception 'Forbidden notification retry'; end if;
  update public.notification_deliveries set status='retry',next_attempt_at=now(),last_error=null,updated_at=now()
  where order_id=p_order_id and status in ('retry','blocked') and sending_started_at is null and attempts<6
    and created_at>now()-interval '24 hours'
    and created_at>=(select activated_after from public.notification_dispatch_state where id);
  get diagnostics v_n=row_count;
  select count(*) into v_skip from public.notification_deliveries where order_id=p_order_id and status in ('uncertain','dead','processing','blocked');
  insert into public.audit_log(actor_id,actor_role,action,entity_type,entity_id,before_data,after_data)
  values(p_actor,v_role,'notification.retry_requested','order',p_order_id::text,null,jsonb_build_object('queued',v_n,'review_required',v_skip));
  return jsonb_build_object('queued',v_n,'review_required',v_skip,'historical_replay',false);
end;
$$;

create function public.notification_summary()
returns jsonb language sql security invoker set search_path='' as $$
  select jsonb_build_object(
    'dispatch',(select to_jsonb(s) from public.notification_dispatch_state s where id),
    'owner_outbox',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from public.notification_deliveries where target like 'owner_%' group by status) q),
    'customer_outbox',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from public.notification_deliveries where target='customer_whatsapp' group by status) q),
    'provider_results',(select jsonb_build_object('accepted',count(*) filter(where status='accepted'),'delivered',count(*) filter(where delivered_at is not null),'delivery_failed',count(*) filter(where delivery_failed_at is not null),'complaints',count(*) filter(where complained_at is not null),'unconfirmed',count(*) filter(where status='accepted' and delivered_at is null and delivery_failed_at is null and complained_at is null)) from public.notification_deliveries),
    'eligible_due',(select count(*) from public.notification_deliveries d,public.notification_dispatch_state s where s.id and s.enabled and d.status in ('pending','retry') and d.created_at>=s.activated_after and d.target=any(s.configured_targets) and d.next_attempt_at<=now()),
    'review_required',(select count(*) from public.notification_deliveries where status in ('blocked','uncertain','dead') or delivery_status in ('failed','complained')),
    'overdue',(select count(*) from public.notification_deliveries d,public.notification_dispatch_state s where s.id and s.enabled and d.status in ('pending','retry','processing') and d.created_at>=s.activated_after and d.target=any(s.configured_targets) and d.next_attempt_at<now()-interval '5 minutes'),
    'excluded_before_cutoff',(select count(*) from public.notification_deliveries d,public.notification_dispatch_state s where s.id and (s.activated_after is null or d.created_at<s.activated_after) and d.status in ('pending','retry')),
    'inactive_channel_pending',(select count(*) from public.notification_deliveries d,public.notification_dispatch_state s where s.id and d.status in ('pending','retry') and not d.target=any(s.configured_targets)),
    'legacy_owner',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from public.notification_outbox group by status) q),
    'legacy_customer',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from public.customer_notification_outbox group by status) q),
    'note','Accepted means provider acknowledgement. Delivery and complaint counters require verified receipts and can overlap. Legacy queues are retained for review and never consumed.'
  );
$$;
create or replace function public.analytics_notifications()
returns jsonb language sql security invoker set search_path='' as $$ select public.notification_summary(); $$;

-- All RPCs are private server capabilities; never default PUBLIC execution.
do $$ declare r record; begin
  for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace
    and proname in ('notification_claim','notification_prepare','notification_begin','notification_finish','notification_record_receipt','notification_reconcile_receipts',
      'notification_record_run','notification_retry_order','notification_summary','analytics_notifications',
      'chaskabox_enqueue_order_notification','chaskabox_record_order_status_event','notification_enqueue_status_event')
  loop
    execute format('revoke all on function %s from public,anon,authenticated',r.signature);
    execute format('grant execute on function %s to service_role',r.signature);
  end loop;
end $$;
commit;
