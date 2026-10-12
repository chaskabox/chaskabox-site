create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.orders (
 id uuid primary key default gen_random_uuid(),order_number text unique not null,
 customer_name text default 'Synthetic Fixture',customer_phone text default '+923000000000',
 total integer default 500,payment_method text default 'cod',payment_status text default 'cod_due',fulfilment_status text default 'new',
 email_sent boolean default false,email_error text,email_sent_at timestamptz,
 whatsapp_sent boolean default false,whatsapp_error text,whatsapp_sent_at timestamptz,
 created_at timestamptz default now(),updated_at timestamptz default now()
);
create table public.order_items(order_id uuid references orders(id),product_name text,pack text,quantity integer,unit_price integer);
create table public.admin_roles(user_id uuid primary key,role text,active boolean);
insert into admin_roles values('00000000-0000-4000-8000-000000000001','owner',true);
create table public.audit_log(id bigint generated always as identity,actor_id uuid,actor_role text,action text,entity_type text,entity_id text,before_data jsonb,after_data jsonb);
grant usage on schema public to anon,authenticated,service_role;
grant select,insert,update,delete on public.orders,public.order_items,public.admin_roles,public.audit_log to service_role;
grant usage,select on sequence public.audit_log_id_seq to service_role;
