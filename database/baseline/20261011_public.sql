-- Captured application DDL only, 2026-10-11. No customer/order/staff rows or secrets.

-- CLEAN ISOLATED DATABASES ONLY. Do not apply this baseline to production.

-- Supabase owns auth/storage/extensions infrastructure; see docs/schema-replay.md.

BEGIN;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname='public') THEN RAISE EXCEPTION 'Baseline requires an empty public schema'; END IF; END $$;

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

SET LOCAL search_path=public,extensions,pg_catalog;

CREATE SEQUENCE public."products_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE TABLE public."addresses" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "label" text DEFAULT 'Home'::text NOT NULL,
  "address" text NOT NULL,
  "city" text NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "addresses_pkey" PRIMARY KEY (id)
);

CREATE TABLE public."admin_roles" (
  "user_id" uuid NOT NULL,
  "role" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "granted_by" uuid,
  "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_roles_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "admin_roles_role_check" CHECK (role = ANY (ARRAY['owner'::text, 'manager'::text, 'fulfilment'::text, 'content'::text]))
);

CREATE TABLE public."ai_usage" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public."ai_usage_id_seq") NOT NULL,
  "task" text NOT NULL,
  "user_id" text,
  "success" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ai_usage_pkey" PRIMARY KEY (id)
);

CREATE TABLE public."api_rate_limits" (
  "bucket_key" text NOT NULL,
  "tokens" double precision NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "api_rate_limits_pkey" PRIMARY KEY (bucket_key)
);

CREATE TABLE public."audit_log" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public."audit_log_id_seq") NOT NULL,
  "actor_id" uuid NOT NULL,
  "actor_role" text NOT NULL,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "before_data" jsonb,
  "after_data" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "audit_log_actor_role_check" CHECK (actor_role = ANY (ARRAY['owner'::text, 'manager'::text, 'fulfilment'::text, 'content'::text, 'system'::text])),
  CONSTRAINT "audit_log_pkey" PRIMARY KEY (id)
);

CREATE TABLE public."box_events" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public."box_events_id_seq") NOT NULL,
  "session_id" text,
  "box_id" bigint,
  "box_name" text,
  "action" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "box_events_pkey" PRIMARY KEY (id)
);

CREATE TABLE public."brands" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public."brands_id_seq") NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "logo_url" text,
  "description" text,
  "is_visible" boolean DEFAULT true NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "normalized_name" text,
  "hero_image_url" text,
  "short_description" text,
  "long_description" text,
  "seo_title" text,
  "seo_description" text,
  "og_image_url" text,
  "featured_product_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "brands_name_key" UNIQUE (name),
  CONSTRAINT "brands_pkey" PRIMARY KEY (id),
  CONSTRAINT "brands_slug_key" UNIQUE (slug)
);

CREATE TABLE public."bundle_items" (
  "bundle_product_id" bigint NOT NULL,
  "component_product_id" bigint NOT NULL,
  "quantity" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bundle_items_pkey" PRIMARY KEY (bundle_product_id, component_product_id),
  CONSTRAINT "bundle_items_quantity_check" CHECK (quantity > 0),
  CONSTRAINT "chk_bundle_not_self" CHECK (bundle_product_id <> component_product_id)
);

CREATE TABLE public."categories" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text DEFAULT ''::text,
  "image_url" text,
  "mobile_image_url" text,
  "icon" text DEFAULT ''::text,
  "seo_title" text DEFAULT ''::text,
  "seo_description" text DEFAULT ''::text,
  "box_style" text DEFAULT 'default'::text,
  "link_destination" text DEFAULT ''::text,
  "position" integer DEFAULT 0,
  "is_visible" boolean DEFAULT true,
  "show_on_homepage" boolean DEFAULT true,
  "hide_if_empty" boolean DEFAULT true,
  "product_assignment" text DEFAULT 'manual'::text,
  "assignment_rule" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "categories_box_style_check" CHECK (box_style = ANY (ARRAY['default'::text, 'card'::text, 'circle'::text, 'banner'::text])),
  CONSTRAINT "categories_pkey" PRIMARY KEY (id),
  CONSTRAINT "categories_product_assignment_check" CHECK (product_assignment = ANY (ARRAY['manual'::text, 'rule_tag'::text, 'rule_category'::text])),
  CONSTRAINT "categories_slug_key" UNIQUE (slug)
);

CREATE TABLE public."category_products" (
  "category_id" uuid NOT NULL,
  "product_id" bigint NOT NULL,
  "position" integer DEFAULT 0,
  CONSTRAINT "category_products_pkey" PRIMARY KEY (category_id, product_id)
);

CREATE TABLE public."coupons" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public."coupons_id_seq") NOT NULL,
  "code" text NOT NULL,
  "discount_type" text NOT NULL,
  "discount_value" integer NOT NULL,
  "min_order" integer DEFAULT 0,
  "max_uses" integer,
  "used_count" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "valid_from" timestamp with time zone DEFAULT now(),
  "valid_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "coupons_code_key" UNIQUE (code),
  CONSTRAINT "coupons_discount_type_check" CHECK (discount_type = ANY (ARRAY['percent'::text, 'fixed'::text])),
  CONSTRAINT "coupons_discount_value_check" CHECK (discount_value > 0),
  CONSTRAINT "coupons_pkey" PRIMARY KEY (id)
);

CREATE TABLE public."customer_notification_outbox" (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY (SEQUENCE NAME public."customer_notification_outbox_id_seq") NOT NULL,
  "order_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "event_key" text NOT NULL,
  "message" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_notification_outbox_attempts_check" CHECK (attempts >= 0),
  CONSTRAINT "customer_notification_outbox_event_key_key" UNIQUE (event_key),
  CONSTRAINT "customer_notification_outbox_event_type_check" CHECK (event_type = ANY (ARRAY['order_status'::text, 'payment_status'::text])),
  CONSTRAINT "customer_notification_outbox_message_check" CHECK (length(message) >= 1 AND length(message) <= 2000),
  CONSTRAINT "customer_notification_outbox_pkey" PRIMARY KEY (id),
  CONSTRAINT "customer_notification_outbox_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'retry'::text, 'done'::text, 'dead'::text]))
);

CREATE TABLE public."customers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "name" text,
  "phone" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customers_pkey" PRIMARY KEY (id),
  CONSTRAINT "customers_user_id_key" UNIQUE (user_id)
);

CREATE TABLE public."filter_events" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public."filter_events_id_seq") NOT NULL,
  "session_id" text,
  "filter_type" text NOT NULL,
  "filter_value" text,
  "page" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "filter_events_pkey" PRIMARY KEY (id)
);

CREATE TABLE public."funnel_events" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public."funnel_events_id_seq") NOT NULL,
  "event" text NOT NULL,
  "product_id" bigint,
  "session_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "funnel_events_event_check" CHECK (event = ANY (ARRAY['product_view'::text, 'add_to_cart'::text, 'cart_viewed'::text, 'checkout_started'::text, 'order_created'::text])),
  CONSTRAINT "funnel_events_pkey" PRIMARY KEY (id)
);

CREATE TABLE public."homepage_sections" (
  "section_key" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "heading" text,
  "subheading" text,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "draft_config" jsonb,
  "updated_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "homepage_sections_pkey" PRIMARY KEY (section_key)
);

CREATE TABLE public."media" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "object_path" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "uploaded_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "media_mime_type_check" CHECK (mime_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text, 'image/avif'::text])),
  CONSTRAINT "media_object_path_key" UNIQUE (object_path),
  CONSTRAINT "media_pkey" PRIMARY KEY (id),
  CONSTRAINT "media_size_bytes_check" CHECK (size_bytes > 0 AND size_bytes <= 5242880)
);

CREATE TABLE public."navigation_menus" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "location" text NOT NULL,
  "label" text NOT NULL,
  "url" text DEFAULT '#'::text NOT NULL,
  "parent_id" uuid,
  "position" integer DEFAULT 0,
  "is_external" boolean DEFAULT false,
  "is_enabled" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "navigation_menus_location_check" CHECK (location = ANY (ARRAY['header'::text, 'footer'::text, 'mobile'::text])),
  CONSTRAINT "navigation_menus_pkey" PRIMARY KEY (id)
);

CREATE TABLE public."notification_outbox" (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY (SEQUENCE NAME public."notification_outbox_id_seq") NOT NULL,
  "order_id" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notification_outbox_attempts_check" CHECK (attempts >= 0),
  CONSTRAINT "notification_outbox_order_id_key" UNIQUE (order_id),
  CONSTRAINT "notification_outbox_pkey" PRIMARY KEY (id),
  CONSTRAINT "notification_outbox_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'retry'::text, 'done'::text, 'dead'::text]))
);

CREATE TABLE public."notification_templates" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public."notification_templates_id_seq") NOT NULL,
  "name" text NOT NULL,
  "channel" text NOT NULL,
  "subject" text,
  "body" text NOT NULL,
  "variables" text[] DEFAULT '{}'::text[],
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notification_templates_channel_check" CHECK (channel = ANY (ARRAY['email'::text, 'whatsapp'::text])),
  CONSTRAINT "notification_templates_name_key" UNIQUE (name),
  CONSTRAINT "notification_templates_pkey" PRIMARY KEY (id)
);

CREATE TABLE public."order_items" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public."order_items_id_seq") NOT NULL,
  "order_id" uuid NOT NULL,
  "product_id" bigint,
  "product_name" text NOT NULL,
  "pack" text NOT NULL,
  "unit_price" integer NOT NULL,
  "quantity" integer NOT NULL,
  "line_total" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "order_items_line_total_check" CHECK (line_total >= 0),
  CONSTRAINT "order_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "order_items_quantity_check" CHECK (quantity > 0),
  CONSTRAINT "order_items_unit_price_check" CHECK (unit_price >= 0)
);

CREATE TABLE public."order_status_events" (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY (SEQUENCE NAME public."order_status_events_id_seq") NOT NULL,
  "order_id" text NOT NULL,
  "order_number" text,
  "event_type" text NOT NULL,
  "old_status" text,
  "new_status" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "order_status_events_event_type_check" CHECK (event_type = ANY (ARRAY['order_created'::text, 'fulfilment_status'::text, 'payment_status'::text])),
  CONSTRAINT "order_status_events_pkey" PRIMARY KEY (id)
);

CREATE TABLE public."orders" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "order_number" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "user_id" uuid,
  "customer_name" text NOT NULL,
  "customer_phone" text NOT NULL,
  "customer_address" text NOT NULL,
  "customer_city" text NOT NULL,
  "payment_method" text NOT NULL,
  "payment_status" text NOT NULL,
  "fulfilment_status" text DEFAULT 'new'::text NOT NULL,
  "subtotal" integer NOT NULL,
  "delivery_fee" integer NOT NULL,
  "total" integer NOT NULL,
  "transaction_reference" text,
  "admin_notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "customer_note" text,
  "email_sent" boolean DEFAULT false NOT NULL,
  "email_error" text,
  "email_sent_at" timestamp with time zone,
  "whatsapp_sent" boolean DEFAULT false NOT NULL,
  "whatsapp_error" text,
  "whatsapp_sent_at" timestamp with time zone,
  "customer_email" text,
  CONSTRAINT "chk_payment_initial" CHECK (payment_method = 'cod'::text AND (payment_status = ANY (ARRAY['cod_due'::text, 'refunded'::text])) OR payment_method <> 'cod'::text AND (payment_status = ANY (ARRAY['awaiting_payment'::text, 'payment_submitted'::text, 'payment_verified'::text, 'payment_rejected'::text, 'refunded'::text]))),
  CONSTRAINT "chk_prepaid_reference" CHECK (payment_method = 'cod'::text OR transaction_reference IS NOT NULL AND transaction_reference <> ''::text),
  CONSTRAINT "orders_delivery_fee_check" CHECK (delivery_fee >= 0),
  CONSTRAINT "orders_fulfilment_status_check" CHECK (fulfilment_status = ANY (ARRAY['new'::text, 'sourcing'::text, 'packed'::text, 'dispatched'::text, 'delivered'::text, 'cancelled'::text])),
  CONSTRAINT "orders_idempotency_key_key" UNIQUE (idempotency_key),
  CONSTRAINT "orders_order_number_key" UNIQUE (order_number),
  CONSTRAINT "orders_payment_method_check" CHECK (payment_method = ANY (ARRAY['cod'::text, 'jazzcash'::text, 'bank_transfer'::text])),
  CONSTRAINT "orders_payment_status_check" CHECK (payment_status = ANY (ARRAY['cod_due'::text, 'awaiting_payment'::text, 'payment_submitted'::text, 'payment_verified'::text, 'payment_rejected'::text, 'refunded'::text])),
  CONSTRAINT "orders_pkey" PRIMARY KEY (id),
  CONSTRAINT "orders_subtotal_check" CHECK (subtotal >= 0),
  CONSTRAINT "orders_total_check" CHECK (total >= 0)
);

CREATE TABLE public."products" (
  "id" bigint DEFAULT nextval('products_id_seq'::regclass) NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "brand" text,
  "category" text,
  "pack" text,
  "price" integer NOT NULL,
  "old_price" integer,
  "description" text,
  "badge" text,
  "image_url" text,
  "is_bundle" boolean DEFAULT false NOT NULL,
  "visibility" text DEFAULT 'visible'::text NOT NULL,
  "stock_state" text DEFAULT 'sourced_after_order'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid,
  "updated_by" uuid,
  "tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
  "ai_embedding" extensions.vector(1024),
  "ai_embedding_text" text,
  "ai_embedding_updated_at" timestamp with time zone,
  "brand_id" bigint,
  "seo_title" text,
  "seo_description" text,
  "og_image" text,
  "canonical_url" text,
  CONSTRAINT "products_old_price_check" CHECK (old_price IS NULL OR old_price >= 0),
  CONSTRAINT "products_pkey" PRIMARY KEY (id),
  CONSTRAINT "products_price_check" CHECK (price >= 0),
  CONSTRAINT "products_slug_key" UNIQUE (slug),
  CONSTRAINT "products_stock_state_check" CHECK (stock_state = ANY (ARRAY['available'::text, 'limited'::text, 'unavailable'::text, 'sourced_after_order'::text])),
  CONSTRAINT "products_visibility_check" CHECK (visibility = ANY (ARRAY['draft'::text, 'visible'::text, 'hidden'::text, 'archived'::text]))
);

CREATE TABLE public."profiles" (
  "id" uuid NOT NULL,
  "name" text,
  "phone" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id)
);

CREATE TABLE public."resolution_cases" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public."resolution_cases_id_seq") NOT NULL,
  "order_id" uuid,
  "order_number" text,
  "customer_name" text,
  "customer_phone" text,
  "issue_type" text NOT NULL,
  "description" text NOT NULL,
  "status" text DEFAULT 'open'::text NOT NULL,
  "resolution" text,
  "refund_amount" integer DEFAULT 0,
  "created_by" text DEFAULT 'admin'::text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  CONSTRAINT "resolution_cases_issue_type_check" CHECK (issue_type = ANY (ARRAY['refund'::text, 'replacement'::text, 'complaint'::text, 'damaged'::text, 'missing_item'::text, 'late_delivery'::text, 'other'::text])),
  CONSTRAINT "resolution_cases_pkey" PRIMARY KEY (id),
  CONSTRAINT "resolution_cases_status_check" CHECK (status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'rejected'::text]))
);

CREATE TABLE public."reviews" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public."reviews_id_seq") NOT NULL,
  "product_id" bigint NOT NULL,
  "user_id" uuid,
  "order_id" uuid,
  "rating" smallint NOT NULL,
  "review_text" text NOT NULL,
  "moderation_status" text DEFAULT 'pending'::text NOT NULL,
  "verified_purchase" boolean DEFAULT false NOT NULL,
  "admin_reply" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reviews_moderation_status_check" CHECK (moderation_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  CONSTRAINT "reviews_pkey" PRIMARY KEY (id),
  CONSTRAINT "reviews_rating_check" CHECK (rating >= 1 AND rating <= 5),
  CONSTRAINT "reviews_review_text_check" CHECK (char_length(review_text) >= 2 AND char_length(review_text) <= 2000)
);

CREATE TABLE public."search_logs" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public."search_logs_id_seq") NOT NULL,
  "query" text NOT NULL,
  "results_count" integer DEFAULT 0 NOT NULL,
  "clicked_product_id" bigint,
  "session_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "search_logs_pkey" PRIMARY KEY (id)
);

CREATE TABLE public."shipping_zones" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public."shipping_zones_id_seq") NOT NULL,
  "name" text NOT NULL,
  "cities" text[] DEFAULT '{}'::text[],
  "fee" integer DEFAULT 300 NOT NULL,
  "free_above" integer,
  "is_active" boolean DEFAULT true NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "shipping_zones_pkey" PRIMARY KEY (id)
);

CREATE TABLE public."site_settings" (
  "key" text NOT NULL,
  "value" jsonb NOT NULL,
  "updated_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "site_settings_pkey" PRIMARY KEY (key)
);

CREATE TABLE public."store_settings" (
  "key" text NOT NULL,
  "value" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now(),
  "updated_by" uuid,
  CONSTRAINT "store_settings_pkey" PRIMARY KEY (key)
);

CREATE TABLE public."theme_settings" (
  "key" text NOT NULL,
  "value" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "theme_settings_pkey" PRIMARY KEY (key)
);

CREATE TABLE public."wishlist_events" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public."wishlist_events_id_seq") NOT NULL,
  "session_id" text,
  "product_id" bigint,
  "action" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "wishlist_events_pkey" PRIMARY KEY (id)
);

CREATE TABLE public."wishlists" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "product_id" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "wishlists_pkey" PRIMARY KEY (id),
  CONSTRAINT "wishlists_user_id_product_id_key" UNIQUE (user_id, product_id)
);

ALTER TABLE public."addresses" ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."admin_roles" ADD CONSTRAINT "admin_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."bundle_items" ADD CONSTRAINT "bundle_items_bundle_product_id_fkey" FOREIGN KEY (bundle_product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE public."bundle_items" ADD CONSTRAINT "bundle_items_component_product_id_fkey" FOREIGN KEY (component_product_id) REFERENCES products(id) ON DELETE RESTRICT;

ALTER TABLE public."category_products" ADD CONSTRAINT "category_products_category_id_fkey" FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE;

ALTER TABLE public."customer_notification_outbox" ADD CONSTRAINT "customer_notification_outbox_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

ALTER TABLE public."customers" ADD CONSTRAINT "customers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public."navigation_menus" ADD CONSTRAINT "navigation_menus_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES navigation_menus(id) ON DELETE CASCADE;

ALTER TABLE public."order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

ALTER TABLE public."order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

ALTER TABLE public."orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public."products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL;

ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."resolution_cases" ADD CONSTRAINT "resolution_cases_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

ALTER TABLE public."reviews" ADD CONSTRAINT "reviews_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

ALTER TABLE public."reviews" ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE public."reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public."wishlists" ADD CONSTRAINT "wishlists_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE public."wishlists" ADD CONSTRAINT "wishlists_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER SEQUENCE public."products_id_seq" OWNED BY public."products"."id";

CREATE INDEX idx_addresses_user ON public.addresses USING btree (user_id);

CREATE INDEX idx_ai_usage_date ON public.ai_usage USING btree (created_at DESC);

CREATE INDEX idx_audit_action ON public.audit_log USING btree (action);

CREATE INDEX idx_audit_actor ON public.audit_log USING btree (actor_id);

CREATE INDEX idx_audit_created ON public.audit_log USING btree (created_at DESC);

CREATE INDEX idx_audit_entity ON public.audit_log USING btree (entity_type, entity_id);

CREATE INDEX idx_boxevent_action ON public.box_events USING btree (action);

CREATE INDEX idx_boxevent_box ON public.box_events USING btree (box_id);

CREATE INDEX idx_boxevent_created ON public.box_events USING btree (created_at);

CREATE INDEX idx_brands_position ON public.brands USING btree ("position");

CREATE INDEX idx_brands_slug_visible ON public.brands USING btree (slug) WHERE (is_visible = true);

CREATE INDEX idx_brands_sort ON public.brands USING btree (sort_order, "position");

CREATE INDEX idx_brands_visible ON public.brands USING btree (is_visible);

CREATE INDEX idx_bundle_items_component ON public.bundle_items USING btree (component_product_id);

CREATE INDEX customer_notification_outbox_ready_idx ON public.customer_notification_outbox USING btree (status, next_attempt_at, created_at);

CREATE INDEX idx_customers_phone ON public.customers USING btree (phone);

CREATE INDEX idx_customers_user_id ON public.customers USING btree (user_id);

CREATE INDEX idx_filter_created ON public.filter_events USING btree (created_at);

CREATE INDEX idx_filter_session ON public.filter_events USING btree (session_id);

CREATE INDEX idx_filter_type ON public.filter_events USING btree (filter_type);

CREATE INDEX idx_funnel_created ON public.funnel_events USING btree (created_at);

CREATE INDEX idx_funnel_event ON public.funnel_events USING btree (event);

CREATE INDEX idx_funnel_session ON public.funnel_events USING btree (session_id);

CREATE INDEX notification_outbox_ready_idx ON public.notification_outbox USING btree (status, next_attempt_at, created_at);

CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);

CREATE INDEX idx_order_items_product ON public.order_items USING btree (product_id);

CREATE INDEX order_status_events_order_id_created_idx ON public.order_status_events USING btree (order_id, created_at);

CREATE INDEX idx_orders_created ON public.orders USING btree (created_at DESC);

CREATE INDEX idx_orders_email ON public.orders USING btree (customer_email);

CREATE INDEX idx_orders_ful_status ON public.orders USING btree (fulfilment_status);

CREATE INDEX idx_orders_idem ON public.orders USING btree (idempotency_key);

CREATE INDEX idx_orders_number ON public.orders USING btree (order_number);

CREATE INDEX idx_orders_pay_status ON public.orders USING btree (payment_status);

CREATE INDEX idx_orders_phone ON public.orders USING btree (customer_phone);

CREATE INDEX idx_orders_user_id ON public.orders USING btree (user_id);

CREATE INDEX idx_products_ai_embedding_hnsw ON public.products USING hnsw (ai_embedding vector_cosine_ops) WHERE (ai_embedding IS NOT NULL);

CREATE INDEX idx_products_bundle ON public.products USING btree (is_bundle) WHERE (is_bundle = true);

CREATE INDEX idx_products_category ON public.products USING btree (category);

CREATE INDEX idx_products_slug ON public.products USING btree (slug);

CREATE INDEX idx_products_visibility ON public.products USING btree (visibility);

CREATE INDEX idx_resolution_order ON public.resolution_cases USING btree (order_id);

CREATE INDEX idx_resolution_status ON public.resolution_cases USING btree (status);

CREATE INDEX idx_reviews_created ON public.reviews USING btree (created_at DESC);

CREATE INDEX idx_reviews_moderation ON public.reviews USING btree (moderation_status);

CREATE INDEX idx_reviews_product ON public.reviews USING btree (product_id);

CREATE INDEX idx_search_logs_created ON public.search_logs USING btree (created_at);

CREATE INDEX idx_search_logs_noresult ON public.search_logs USING btree (results_count) WHERE (results_count = 0);

CREATE INDEX idx_search_logs_query ON public.search_logs USING btree (query);

CREATE INDEX idx_searchlogs_clicked ON public.search_logs USING btree (clicked_product_id) WHERE (clicked_product_id IS NOT NULL);

CREATE INDEX idx_wishlist_created ON public.wishlist_events USING btree (created_at);

CREATE INDEX idx_wishlist_product ON public.wishlist_events USING btree (product_id);

CREATE INDEX idx_wishlists_user ON public.wishlists USING btree (user_id);

CREATE VIEW public."public_site_settings" WITH (security_invoker=true) AS
 SELECT key,
    value
   FROM site_settings
  WHERE key = ANY (ARRAY['cod_enabled'::text, 'cod_delivery_fee_pkr'::text, 'jazzcash_enabled'::text, 'bank_transfer_enabled'::text, 'bank_transfer_details'::text, 'prepaid_free_delivery_threshold_pkr'::text, 'prepaid_delivery_fee_pkr'::text, 'delivery_estimate'::text, 'support_whatsapp'::text, 'support_email'::text, 'store_address'::text, 'jazzcash_till_id'::text, 'jazzcash_qr_url'::text, 'promo_text'::text, 'ai_customer_assistant_enabled'::text, 'ai_semantic_search_enabled'::text]);

CREATE VIEW public."public_products" WITH (security_invoker=true) AS
 SELECT id,
    slug,
    name,
    brand,
    category,
    pack,
    price,
    old_price,
    description,
    badge,
    image_url,
    is_bundle
   FROM products
  WHERE visibility = 'visible'::text;

CREATE VIEW public."public_homepage_sections" WITH (security_invoker=true) AS
 SELECT section_key,
    enabled,
    "position",
    heading,
    subheading,
    config
   FROM homepage_sections
  WHERE enabled = true
  ORDER BY "position";

CREATE VIEW public."public_reviews" WITH (security_invoker=true) AS
 SELECT id,
    product_id,
    rating,
    review_text,
    verified_purchase,
    admin_reply,
    created_at
   FROM reviews
  WHERE moderation_status = 'approved'::text;

CREATE OR REPLACE FUNCTION public.staff_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT ar.role
  FROM public.admin_roles ar
  WHERE ar.user_id = auth.uid() AND ar.active = TRUE
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT public.staff_role() IS NOT NULL; $function$
;

CREATE OR REPLACE FUNCTION public.is_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT public.staff_role() = 'owner'; $function$
;

CREATE OR REPLACE FUNCTION public.admin_order_mutate(p_actor uuid, p_order uuid, p_action text, p_value text DEFAULT ''::text, p_note text DEFAULT ''::text, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE o public.orders%ROWTYPE; v_role text; v_action text; v_note text; v_before jsonb;
BEGIN
 SELECT role INTO v_role FROM public.admin_roles WHERE user_id=p_actor AND active FOR SHARE;
 IF v_role IS NULL OR v_role NOT IN ('owner','manager','fulfilment') THEN
  RETURN jsonb_build_object('error','Active order staff required','code','FORBIDDEN_ROLE','status',403);
 END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','Order not found','code','NOT_FOUND','status',404); END IF;
 IF p_expected_updated_at IS NOT NULL AND o.updated_at IS DISTINCT FROM p_expected_updated_at THEN
  RETURN jsonb_build_object('error','Order changed. Reload before trying again.','code','STALE_ORDER','status',409);
 END IF;
 v_before=to_jsonb(o); v_note=btrim(coalesce(p_note,''));
 IF p_action='status' THEN
  IF p_value IS NULL OR NOT ((o.fulfilment_status='new' AND p_value='sourcing') OR
    (o.fulfilment_status='sourcing' AND p_value='packed') OR
    (o.fulfilment_status='packed' AND p_value='dispatched') OR
    (o.fulfilment_status='dispatched' AND p_value='delivered') OR
    (o.fulfilment_status NOT IN ('delivered','cancelled') AND p_value='cancelled')) THEN
   RETURN jsonb_build_object('error','Status transition is not allowed','code','INVALID_TRANSITION','status',409);
  END IF;
  IF p_value='cancelled' AND (length(v_note)<3 OR length(v_note)>500) THEN
   RETURN jsonb_build_object('error','Cancellation reason must be 3..500 characters','code','CANCEL_REASON_REQUIRED','status',400);
  END IF;
  IF p_value IN ('packed','dispatched','delivered') AND NOT
    ((o.payment_method='cod' AND o.payment_status='cod_due') OR
     (o.payment_method IN ('jazzcash','bank_transfer') AND o.payment_status='payment_verified')) THEN
   RETURN jsonb_build_object('error','Payment is not cleared','code','PAYMENT_NOT_CLEARED','status',422);
  END IF;
  UPDATE public.orders SET fulfilment_status=p_value, updated_at=now(), admin_notes=CASE WHEN p_value='cancelled'
   THEN concat_ws(E'\n',nullif(admin_notes,''),'['||now()::text||'] cancelled by '||v_role||': '||v_note) ELSE admin_notes END
   WHERE id=p_order RETURNING * INTO o;
  v_action=CASE WHEN p_value='cancelled' THEN 'order.cancelled' ELSE 'order.status_changed' END;
 ELSIF p_action='payment' THEN
  IF p_value IS NULL OR p_value NOT IN ('verified','rejected') OR o.payment_method='cod' THEN
   RETURN jsonb_build_object('error','Valid prepaid decision required','code','NOT_PREPAID','status',422);
  END IF;
  IF o.fulfilment_status IN ('cancelled','delivered') OR o.payment_status NOT IN ('payment_submitted','awaiting_payment') THEN
   RETURN jsonb_build_object('error','Payment is already decided or order is terminal','code','ALREADY_DECIDED','status',409);
  END IF;
  IF p_value='verified' AND nullif(btrim(o.transaction_reference),'') IS NULL THEN
   RETURN jsonb_build_object('error','Payment reference required','code','MISSING_REFERENCE','status',422);
  END IF;
  IF length(v_note)>500 THEN RETURN jsonb_build_object('error','Payment note is too long','code','INVALID_NOTE','status',400); END IF;
  UPDATE public.orders SET payment_status='payment_'||p_value, updated_at=now(), admin_notes=CASE WHEN v_note<>'' THEN
   concat_ws(E'\n',nullif(admin_notes,''),'['||now()::text||'] payment '||p_value||' by '||v_role||': '||v_note) ELSE admin_notes END
   WHERE id=p_order RETURNING * INTO o;
  v_action='payment.'||p_value;
 ELSIF p_action='note' THEN
  IF length(v_note)<1 OR length(v_note)>2000 OR length(coalesce(o.admin_notes,''))+length(v_note)+100>8000 THEN
   RETURN jsonb_build_object('error','Note is empty, too long or history is full','code','INVALID_NOTE','status',400);
  END IF;
  UPDATE public.orders SET admin_notes=concat_ws(E'\n',nullif(admin_notes,''),'['||now()::text||'] '||v_role||': '||v_note),updated_at=now()
   WHERE id=p_order RETURNING * INTO o;
  v_action='order.note_added';
 ELSE RETURN jsonb_build_object('error','Invalid operation','code','INVALID_ACTION','status',400);
 END IF;
 INSERT INTO public.audit_log(actor_id,actor_role,action,entity_type,entity_id,before_data,after_data)
 VALUES(p_actor,v_role,v_action,'order',p_order::text,
   jsonb_build_object('fulfilment_status',v_before->'fulfilment_status','payment_status',v_before->'payment_status'),
   jsonb_build_object('fulfilment_status',o.fulfilment_status,'payment_status',o.payment_status,'note',nullif(v_note,'')));
 RETURN jsonb_build_object('order',to_jsonb(o),'from',v_before->'fulfilment_status');
END $function$
;

CREATE OR REPLACE FUNCTION public.admin_staff_update(p_actor uuid, p_target uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_before public.admin_roles%ROWTYPE; v_after public.admin_roles%ROWTYPE; v_role text; v_active boolean;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(20261011,3);
 IF NOT EXISTS(SELECT 1 FROM public.admin_roles WHERE user_id=p_actor AND role='owner' AND active) THEN
  RETURN jsonb_build_object('error','Active owner required','code','FORBIDDEN_ROLE','status',403);
 END IF;
 SELECT * INTO v_before FROM public.admin_roles WHERE user_id=p_target FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','Staff member not found','code','NOT_FOUND','status',404); END IF;
 v_role=coalesce(p_patch->>'role',v_before.role);
 IF v_role NOT IN ('owner','manager','fulfilment','content') OR
   (p_patch ? 'active' AND jsonb_typeof(p_patch->'active')<>'boolean') THEN
  RETURN jsonb_build_object('error','Invalid role or active flag','code','INVALID_STAFF','status',400);
 END IF;
 v_active=coalesce((p_patch->>'active')::boolean,v_before.active);
 IF p_target=p_actor AND NOT v_active THEN RETURN jsonb_build_object('error','Cannot deactivate current account','code','SELF_LOCKOUT','status',409); END IF;
 IF v_before.role='owner' AND v_before.active AND (v_role<>'owner' OR NOT v_active) AND
   (SELECT count(*) FROM public.admin_roles WHERE role='owner' AND active)<=1 THEN
  RETURN jsonb_build_object('error','At least one active owner must remain','code','LAST_OWNER','status',409);
 END IF;
 UPDATE public.admin_roles SET role=v_role,active=v_active WHERE user_id=p_target RETURNING * INTO v_after;
 INSERT INTO public.audit_log(actor_id,actor_role,action,entity_type,entity_id,before_data,after_data)
 VALUES(p_actor,'owner','role.updated','role',p_target::text,to_jsonb(v_before),to_jsonb(v_after));
 RETURN jsonb_build_object('staff',to_jsonb(v_after));
END $function$
;

CREATE OR REPLACE FUNCTION public.analytics_attention()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_items jsonb;
BEGIN
  WITH items AS (
    -- 1. Notification failures in last 7 days.
    SELECT 'notification_failures'::text AS type, 'high'::text AS severity,
           'Notification failures (7d)'::text AS title,
           (cnt::text || ' order(s) in the last 7 days failed email/WhatsApp notification.')::text AS detail,
           cnt, '/admin#notifications'::text AS link
    FROM (SELECT COUNT(*)::bigint AS cnt FROM orders
          WHERE created_at >= now() - interval '7 days'
            AND ((NOT email_sent AND email_error IS NOT NULL)
              OR (NOT whatsapp_sent AND whatsapp_error IS NOT NULL))) t
    WHERE cnt > 0
    UNION ALL
    -- 2. Products missing images (visible catalogue).
    SELECT 'missing_images', 'medium',
           'Products missing images',
           (cnt::text || ' visible product(s) have no image. Examples: ' ||
            COALESCE(sample_names, '—')),
           cnt, '/admin#products'
    FROM (SELECT COUNT(*)::bigint AS cnt,
                 string_agg(name, ', ' ORDER BY name) AS sample_names
          FROM (SELECT name FROM products
                WHERE visibility = 'visible'
                  AND (image_url IS NULL OR btrim(image_url) = '')
                ORDER BY name LIMIT 3) s) t
    WHERE cnt > 0
    UNION ALL
    -- 3. Orders stuck > 5 days in a non-delivered state.
    SELECT 'stuck_orders', 'high',
           'Orders stuck over 5 days',
           (cnt::text || ' order(s) stuck in fulfilment for 5+ days. Oldest: ' ||
            COALESCE(oldest_numbers, '—')),
           cnt, '/admin#orders'
    FROM (SELECT COUNT(*)::bigint AS cnt,
                 string_agg(order_number, ', ' ORDER BY created_at) AS oldest_numbers
          FROM (SELECT order_number, created_at FROM orders
                WHERE fulfilment_status IN ('new', 'sourcing', 'packed', 'dispatched')
                  AND created_at < now() - interval '5 days'
                ORDER BY created_at LIMIT 5) s) t
    WHERE cnt > 0
    UNION ALL
    -- 4. Broken Chaska Boxes (bundle product with zero components).
    SELECT 'broken_boxes', 'medium',
           'Chaska Boxes with no items',
           (cnt::text || ' box(es) have no products: ' || COALESCE(sample_names, '—')),
           cnt, '/admin#boxes'
    FROM (SELECT COUNT(*)::bigint AS cnt,
                 string_agg(name, ', ' ORDER BY name) AS sample_names
          FROM (SELECT p.name FROM products p
                WHERE p.is_bundle AND p.visibility <> 'archived'
                  AND NOT EXISTS (SELECT 1 FROM bundle_items bi
                                  WHERE bi.bundle_product_id = p.id)
                ORDER BY p.name LIMIT 5) s) t
    WHERE cnt > 0
    UNION ALL
    -- 5. Visible products with zero sales in last 30 days.
    SELECT 'low_sellers_30d', 'low',
           'No sales in 30 days',
           (cnt::text || ' visible product(s) sold 0 units in the last 30 days.'),
           cnt, '/admin#products'
    FROM (SELECT COUNT(*)::bigint AS cnt FROM products p
          WHERE p.visibility = 'visible' AND NOT p.is_bundle
            AND NOT EXISTS (SELECT 1 FROM order_items oi
                            JOIN orders o ON o.id = oi.order_id
                            WHERE oi.product_id = p.id
                              AND o.created_at >= now() - interval '30 days'
                              AND o.fulfilment_status <> 'cancelled')) t
    WHERE cnt > 0
    UNION ALL
    -- 6. Dead notification outbox entries.
    SELECT 'dead_notifications', 'medium',
           'Dead notification queue entries',
           (cnt::text || ' notification(s) exhausted retries (dead).'),
           cnt, '/admin#notifications'
    FROM (SELECT (SELECT COUNT(*) FROM notification_outbox WHERE status = 'dead') +
                 (SELECT COUNT(*) FROM customer_notification_outbox WHERE status = 'dead') AS cnt) t
    WHERE cnt > 0
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object('type', type, 'severity', severity, 'title', title,
                              'detail', detail, 'count', cnt, 'link', link)
           ORDER BY CASE severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                    cnt DESC),
         '[]'::jsonb)
  INTO v_items
  FROM items;

  RETURN jsonb_build_object('generated_at', now(), 'items', v_items);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_boxes(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'box_id', box_id, 'box_name', box_name,
      'orders', orders, 'units', units, 'revenue', revenue
    ) ORDER BY revenue DESC), '[]'::jsonb) INTO v_result
    FROM (
      SELECT b.id AS box_id, b.name AS box_name,
        COUNT(DISTINCT o.id)::bigint AS orders,
        COALESCE(SUM(oi.quantity),0)::bigint AS units,
        COALESCE(SUM(oi.quantity * oi.unit_price),0)::bigint AS revenue
      FROM boxes b
      LEFT JOIN order_items oi ON oi.product_id IN (SELECT product_id FROM box_items WHERE box_id = b.id)
      LEFT JOIN orders o ON o.id = oi.order_id AND o.created_at >= p_from AND o.created_at < p_to AND o.fulfilment_status <> 'cancelled'
      WHERE b.is_visible IS NOT FALSE
      GROUP BY 1, 2
    ) t;
  EXCEPTION WHEN OTHERS THEN v_result := '[]'::jsonb; END;
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_boxevents(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  BEGIN
    SELECT jsonb_build_object(
      'total_views', (SELECT COUNT(*)::bigint FROM box_events WHERE action='view' AND created_at>=p_from AND created_at<p_to),
      'total_adds', (SELECT COUNT(*)::bigint FROM box_events WHERE action='add_to_cart' AND created_at>=p_from AND created_at<p_to),
      'by_box', COALESCE((SELECT jsonb_agg(jsonb_build_object('box_name',box_name,'views',views,'adds',adds) ORDER BY views DESC)
        FROM (SELECT box_name, COUNT(*) FILTER (WHERE action='view')::bigint AS views, COUNT(*) FILTER (WHERE action='add_to_cart')::bigint AS adds
              FROM box_events WHERE created_at>=p_from AND created_at<p_to GROUP BY 1) t), '[]'::jsonb)
    ) INTO v_result;
  EXCEPTION WHEN OTHERS THEN
    v_result := jsonb_build_object('total_views',0,'total_adds',0,'by_box','[]'::jsonb);
  END;
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_brands(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH ps AS (
    SELECT COALESCE(NULLIF(btrim(p.brand), ''), 'Unbranded') AS brand,
           oi.product_id,
           MAX(oi.product_name) AS product_name,
           SUM(oi.quantity)::bigint AS units,
           SUM(oi.line_total)::bigint AS revenue,
           SUM(oi.line_total) FILTER (
             WHERE (o.payment_method IN ('jazzcash', 'bank_transfer')
                    AND o.payment_status = 'payment_verified'
                    AND o.fulfilment_status <> 'cancelled')
                OR (o.payment_method = 'cod' AND o.fulfilment_status = 'delivered')
           )::bigint AS recognized_revenue,
           COUNT(DISTINCT o.id)::bigint AS orders,
           SUM(oi.quantity) FILTER (
             WHERE o.created_at >= GREATEST(p_from, p_to - interval '7 days'))::bigint AS units_last7
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE o.created_at >= p_from AND o.created_at < p_to
      AND o.fulfilment_status <> 'cancelled'
    GROUP BY 1, 2
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'brand', b.brand,
             'brand_id', b.brand_id,
             'logo_url', b.logo_url,
             'slug', b.slug,
             'orders', b.orders,
             'units', b.units,
             'gross_value', b.revenue,
             'recognized_revenue', COALESCE(b.recognized_revenue, 0),
             'aov', CASE WHEN b.orders > 0 THEN ROUND(b.revenue::numeric / b.orders) ELSE 0 END,
             'units_last7', b.units_last7,
             'top_products', b.top_products
           ) ORDER BY b.revenue DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT ps.brand,
           MAX(br.id) AS brand_id,
           MAX(br.logo_url) AS logo_url,
           MAX(br.slug) AS slug,
           SUM(ps.orders)::bigint AS orders,
           SUM(ps.units)::bigint AS units,
           SUM(ps.revenue)::bigint AS revenue,
           SUM(COALESCE(ps.recognized_revenue, 0))::bigint AS recognized_revenue,
           SUM(COALESCE(ps.units_last7, 0))::bigint AS units_last7,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', t.product_name, 'units', t.units)
                                      ORDER BY t.units DESC), '[]'::jsonb)
            FROM (SELECT ps2.product_name, ps2.units
                  FROM ps ps2 WHERE ps2.brand = ps.brand
                  ORDER BY ps2.units DESC LIMIT 3) t) AS top_products
    FROM ps
    LEFT JOIN brands br ON br.name = ps.brand
    GROUP BY ps.brand
  ) b;

  RETURN jsonb_build_object('brands', v_result, 'currency', 'PKR');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_categories(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH ps AS (
    SELECT COALESCE(NULLIF(btrim(p.category), ''), 'Uncategorized') AS category,
           oi.product_id,
           MAX(oi.product_name) AS product_name,
           SUM(oi.quantity)::bigint AS units,
           SUM(oi.line_total)::bigint AS revenue,
           COUNT(DISTINCT o.id)::bigint AS orders,
           SUM(oi.quantity) FILTER (
             WHERE o.created_at >= GREATEST(p_from, p_to - interval '7 days'))::bigint AS units_last7
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE o.created_at >= p_from AND o.created_at < p_to
      AND o.fulfilment_status <> 'cancelled'
    GROUP BY 1, 2
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'category', c.category,
             'orders', c.orders,
             'units', c.units,
             'revenue', c.revenue,
             'aov', CASE WHEN c.orders > 0 THEN ROUND(c.revenue::numeric / c.orders) ELSE 0 END,
             'units_last7', c.units_last7,
             'top_products', c.top_products
           ) ORDER BY c.revenue DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT category,
           SUM(orders)::bigint AS orders,
           SUM(units)::bigint AS units,
           SUM(revenue)::bigint AS revenue,
           SUM(COALESCE(units_last7, 0))::bigint AS units_last7,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', t.product_name, 'units', t.units)
                                      ORDER BY t.units DESC), '[]'::jsonb)
            FROM (SELECT ps2.product_name, ps2.units
                  FROM ps ps2 WHERE ps2.category = ps.category
                  ORDER BY ps2.units DESC LIMIT 3) t) AS top_products
    FROM ps
    GROUP BY category
  ) c;

  RETURN jsonb_build_object('categories', v_result, 'currency', 'PKR');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_coupons(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN jsonb_build_object(
    'available', false,
    'reason', 'Coupon usage is not tracked on orders yet.',
    'coupons', '[]'::jsonb
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_customers(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_summary jsonb;
  v_top     jsonb;
BEGIN
  WITH valid AS (
    SELECT * FROM orders
    WHERE created_at >= p_from AND created_at < p_to
      AND fulfilment_status <> 'cancelled'
      AND customer_phone IS NOT NULL AND btrim(customer_phone) <> ''
  ),
  first_ever AS (
    SELECT customer_phone AS phone, MIN(created_at) AS first_at
    FROM orders
    WHERE customer_phone IS NOT NULL AND btrim(customer_phone) <> ''
    GROUP BY 1
  ),
  phones AS (
    SELECT DISTINCT customer_phone AS phone FROM valid
  )
  SELECT jsonb_build_object(
           'new_customers',    (SELECT COUNT(*) FROM phones r
                                JOIN first_ever f USING (phone) WHERE f.first_at >= p_from),
           'repeat_customers', (SELECT COUNT(*) FROM phones r
                                JOIN first_ever f USING (phone) WHERE f.first_at < p_from),
           'repeat_rate_pct',  (SELECT CASE WHEN COUNT(*) > 0 THEN
                                  ROUND(100.0 * COUNT(*) FILTER (WHERE f.first_at < p_from) / COUNT(*), 1)
                                ELSE 0 END
                                FROM phones r JOIN first_ever f USING (phone)),
           'orders_per_customer', (SELECT CASE WHEN COUNT(DISTINCT customer_phone) > 0
                                    THEN ROUND(COUNT(*)::numeric / COUNT(DISTINCT customer_phone), 2)
                                    ELSE 0 END FROM valid),
           'distinct_customers', (SELECT COUNT(*) FROM phones)
         )
  INTO v_summary;

  -- Top customers by recognized spend, PII masked server-side.
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'name', t.display_name,
             'phone', t.phone_masked,
             'orders', t.orders,
             'recognized_spend', t.recognized_spend,
             'gross_spend', t.gross_spend,
             'last_purchase', t.last_purchase
           ) ORDER BY t.recognized_spend DESC NULLS LAST), '[]'::jsonb)
  INTO v_top
  FROM (
    SELECT
      CASE
        WHEN btrim(o.customer_name) = '' OR o.customer_name IS NULL THEN 'Customer'
        ELSE split_part(btrim(o.customer_name), ' ', 1) ||
             CASE WHEN position(' ' IN btrim(o.customer_name)) > 0
                  THEN ' ' || left(split_part(btrim(o.customer_name), ' ', 2), 1) || '.'
                  ELSE '' END
      END AS display_name,
      ('* * ' || right(regexp_replace(o.customer_phone, '\D', '', 'g'), 4)) AS phone_masked,
      COUNT(*)::bigint AS orders,
      SUM(o.total) FILTER (
        WHERE (o.payment_method IN ('jazzcash', 'bank_transfer')
               AND o.payment_status = 'payment_verified')
           OR (o.payment_method = 'cod' AND o.fulfilment_status = 'delivered')
      )::bigint AS recognized_spend,
      SUM(o.total)::bigint AS gross_spend,
      MAX(o.created_at) AS last_purchase
    FROM orders o
    WHERE o.created_at >= p_from AND o.created_at < p_to
      AND o.fulfilment_status <> 'cancelled'
    GROUP BY 1, 2
    ORDER BY recognized_spend DESC NULLS LAST
    LIMIT 20
  ) t;

  RETURN jsonb_build_object(
    'summary', v_summary,
    'top_customers', v_top,
    'currency', 'PKR',
    'privacy_note', 'Names are shortened (first name + last initial) and phones show only the last 4 digits.'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_filters(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  BEGIN
    SELECT jsonb_build_object(
      'by_type', COALESCE((SELECT jsonb_agg(jsonb_build_object('type',filter_type,'uses',uses) ORDER BY uses DESC)
        FROM (SELECT filter_type, COUNT(*)::bigint AS uses FROM filter_events
              WHERE created_at>=p_from AND created_at<p_to GROUP BY 1) t), '[]'::jsonb),
      'by_value', COALESCE((SELECT jsonb_agg(jsonb_build_object('type',filter_type,'value',filter_value,'uses',uses) ORDER BY uses DESC)
        FROM (SELECT filter_type, filter_value, COUNT(*)::bigint AS uses FROM filter_events
              WHERE created_at>=p_from AND created_at<p_to GROUP BY 1,2 ORDER BY uses DESC LIMIT 20) t), '[]'::jsonb),
      'total_uses', (SELECT COUNT(*)::bigint FROM filter_events WHERE created_at>=p_from AND created_at<p_to)
    ) INTO v_result;
  EXCEPTION WHEN OTHERS THEN
    v_result := jsonb_build_object('by_type','[]'::jsonb,'by_value','[]'::jsonb,'total_uses',0);
  END;
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_geography(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'city', city,
      'orders', orders,
      'revenue', revenue,
      'cancelled', cancelled,
      'cancellation_rate', CASE WHEN (orders+cancelled)>0 THEN ROUND(100.0*cancelled/(orders+cancelled),1) ELSE 0 END
    ) ORDER BY revenue DESC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT customer_city AS city,
        COUNT(*) FILTER (WHERE fulfilment_status <> 'cancelled')::bigint AS orders,
        COALESCE(SUM(total) FILTER (WHERE fulfilment_status <> 'cancelled'),0)::bigint AS revenue,
        COUNT(*) FILTER (WHERE fulfilment_status = 'cancelled')::bigint AS cancelled
      FROM orders
      WHERE created_at >= p_from AND created_at < p_to
        AND customer_city IS NOT NULL AND btrim(customer_city) <> ''
      GROUP BY 1
    ) t;
  EXCEPTION WHEN OTHERS THEN
    v_result := '[]'::jsonb;
  END;
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_issues(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
           'by_status', (SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb)
                         FROM (SELECT status, COUNT(*)::bigint AS cnt
                               FROM resolution_cases
                               WHERE created_at >= p_from AND created_at < p_to
                               GROUP BY 1) t),
           'by_issue_type', (SELECT COALESCE(jsonb_object_agg(issue_type, cnt), '{}'::jsonb)
                             FROM (SELECT issue_type, COUNT(*)::bigint AS cnt
                                   FROM resolution_cases
                                   WHERE created_at >= p_from AND created_at < p_to
                                   GROUP BY 1) t),
           'total_cases', (SELECT COUNT(*) FROM resolution_cases
                            WHERE created_at >= p_from AND created_at < p_to),
           'open_cases',  (SELECT COUNT(*) FROM resolution_cases
                            WHERE status IN ('open', 'in_progress')),
           'avg_resolution_hours', (SELECT ROUND(
                                      AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)::numeric, 1)
                                    FROM resolution_cases
                                    WHERE created_at >= p_from AND created_at < p_to
                                      AND resolved_at IS NOT NULL),
           'total_refund_amount', (SELECT COALESCE(SUM(refund_amount), 0) FROM resolution_cases
                                   WHERE created_at >= p_from AND created_at < p_to),
           'issue_rate_per_100_orders', (
              SELECT CASE WHEN (SELECT COUNT(*) FROM orders
                                WHERE created_at >= p_from AND created_at < p_to
                                  AND fulfilment_status <> 'cancelled') > 0
                     THEN ROUND(100.0 *
                          (SELECT COUNT(*) FROM resolution_cases
                           WHERE created_at >= p_from AND created_at < p_to) /
                          (SELECT COUNT(*) FROM orders
                           WHERE created_at >= p_from AND created_at < p_to
                             AND fulfilment_status <> 'cancelled'), 2)
                     ELSE 0 END),
           'currency', 'PKR'
         )
  INTO v_result;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_notifications()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
           'owner_outbox', (SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb)
                            FROM (SELECT status, COUNT(*)::bigint AS cnt
                                  FROM notification_outbox GROUP BY 1) t),
           'owner_outbox_retrying', (SELECT COUNT(*) FROM notification_outbox
                                     WHERE status IN ('pending', 'processing', 'retry')),
           'owner_outbox_dead',     (SELECT COUNT(*) FROM notification_outbox
                                     WHERE status = 'dead'),
           'customer_outbox', (SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb)
                               FROM (SELECT status, COUNT(*)::bigint AS cnt
                                     FROM customer_notification_outbox GROUP BY 1) t),
           'customer_outbox_dead', (SELECT COUNT(*) FROM customer_notification_outbox
                                    WHERE status = 'dead'),
           'last_30d_orders', (SELECT jsonb_build_object(
                                  'total', COUNT(*),
                                  'email_sent', COUNT(*) FILTER (WHERE email_sent),
                                  'email_failed', COUNT(*) FILTER (WHERE NOT email_sent AND email_error IS NOT NULL),
                                  'whatsapp_sent', COUNT(*) FILTER (WHERE whatsapp_sent),
                                  'whatsapp_failed', COUNT(*) FILTER (WHERE NOT whatsapp_sent AND whatsapp_error IS NOT NULL)
                                )
                                FROM orders
                                WHERE created_at >= now() - interval '30 days'),
           'note', 'Separate counters for owner alerts (notification_outbox) and customer updates (customer_notification_outbox).'
         )
  INTO v_result;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_overview(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rev jsonb;
  v_cards jsonb;
  v_daily jsonb := '[]'::jsonb;
  v_pay jsonb := '[]'::jsonb;
  v_funnel jsonb := '[]'::jsonb;
  v_ord int := 0;
  v_gov2 bigint := 0;
  v_aov numeric := 0;
  v_can int := 0;
  v_new int := 0;
  v_repeat int := 0;
BEGIN
  SELECT public.analytics_revenue(p_from, p_to) INTO v_rev;

  SELECT COUNT(*), COALESCE(SUM(total),0), CASE WHEN COUNT(*)>0 THEN ROUND(AVG(total)) ELSE 0 END
  INTO v_ord, v_gov2, v_aov FROM orders WHERE created_at>=p_from AND created_at<p_to AND fulfilment_status<>'cancelled';
  SELECT COUNT(*) INTO v_can FROM orders WHERE created_at>=p_from AND created_at<p_to AND fulfilment_status='cancelled';

  -- New/repeat: simpler approach with NOT EXISTS
  BEGIN
    SELECT COUNT(*) INTO v_new FROM (
      SELECT DISTINCT customer_phone FROM orders
      WHERE created_at>=p_from AND created_at<p_to
      AND customer_phone IS NOT NULL AND btrim(customer_phone)<>''
      AND NOT EXISTS (
        SELECT 1 FROM orders o2
        WHERE o2.customer_phone = orders.customer_phone
        AND o2.created_at < p_from
      )
    ) t;
    SELECT COUNT(*) INTO v_repeat FROM (
      SELECT DISTINCT customer_phone FROM orders
      WHERE created_at>=p_from AND created_at<p_to
      AND customer_phone IS NOT NULL AND btrim(customer_phone)<>''
      AND EXISTS (
        SELECT 1 FROM orders o2
        WHERE o2.customer_phone = orders.customer_phone
        AND o2.created_at < p_from
      )
    ) t;
  EXCEPTION WHEN OTHERS THEN
    v_new := 0; v_repeat := 0;
  END;

  v_cards := jsonb_build_object(
    'orders', v_ord,
    'gross_order_value', COALESCE((v_rev->>'gross_order_value')::bigint, v_gov2),
    'recognized_revenue', COALESCE((v_rev->>'recognized_revenue')::bigint, 0),
    'pending_cod', COALESCE((v_rev->>'pending_cod')::bigint, 0),
    'confirmed_prepaid', COALESCE((v_rev->>'confirmed_prepaid')::bigint, 0),
    'delivered_cod', COALESCE((v_rev->>'delivered_cod')::bigint, 0),
    'average_order_value', v_aov,
    'new_customers', v_new,
    'repeat_customers', v_repeat,
    'cancelled_orders', v_can,
    'cancellation_rate', CASE WHEN (v_ord+v_can)>0 THEN ROUND(100.0*v_can/(v_ord+v_can),1) ELSE 0 END,
    'currency', 'PKR'
  );

  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('date',to_char(d.day,'YYYY-MM-DD'),'revenue',COALESCE(s.revenue,0),'orders',COALESCE(s.orders,0)) ORDER BY d.day),'[]'::jsonb)
    INTO v_daily FROM (SELECT generate_series(date_trunc('day',p_from),date_trunc('day',p_to)-interval '1 day',interval '1 day') AS day) d
    LEFT JOIN (SELECT date_trunc('day',created_at) AS day, SUM(total)::bigint AS revenue, COUNT(*)::bigint AS orders FROM orders WHERE created_at>=p_from AND created_at<p_to AND fulfilment_status<>'cancelled' GROUP BY 1) s ON s.day=d.day;
  EXCEPTION WHEN OTHERS THEN v_daily := '[]'::jsonb; END;

  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('method',payment_method,'orders',orders,'gross_value',gross_value) ORDER BY gross_value DESC),'[]'::jsonb)
    INTO v_pay FROM (SELECT payment_method, COUNT(*)::bigint AS orders, SUM(total)::bigint AS gross_value FROM orders WHERE created_at>=p_from AND created_at<p_to AND fulfilment_status<>'cancelled' GROUP BY 1) t;
  EXCEPTION WHEN OTHERS THEN v_pay := '[]'::jsonb; END;

  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('status',fulfilment_status,'orders',orders) ORDER BY CASE fulfilment_status WHEN 'new' THEN 1 WHEN 'sourcing' THEN 2 WHEN 'packed' THEN 3 WHEN 'dispatched' THEN 4 WHEN 'delivered' THEN 5 WHEN 'cancelled' THEN 6 ELSE 7 END),'[]'::jsonb)
    INTO v_funnel FROM (SELECT fulfilment_status, COUNT(*)::bigint AS orders FROM orders WHERE created_at>=p_from AND created_at<p_to GROUP BY 1) t;
  EXCEPTION WHEN OTHERS THEN v_funnel := '[]'::jsonb; END;

  RETURN jsonb_build_object('cards',v_cards,'daily',v_daily,'payment_split',v_pay,'funnel',v_funnel);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_products(p_from timestamp with time zone, p_to timestamp with time zone, p_sort text, p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rows  jsonb;
  v_never jsonb;
  v_noimg jsonb;
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_sort  text := CASE lower(COALESCE(p_sort, 'units'))
                    WHEN 'revenue'    THEN 'revenue DESC'
                    WHEN 'recognized' THEN 'recognized_revenue DESC'
                    WHEN 'orders'     THEN 'orders DESC'
                    WHEN 'name'       THEN 'product_name ASC'
                    ELSE 'units DESC'
                  END;
BEGIN
  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(sub.payload), ''[]''::jsonb) FROM (' ||
    'SELECT jsonb_build_object(' ||
    '''product_id'', s.product_id, ''name'', s.product_name, ''units'', s.units, ' ||
    '''gross_value'', s.revenue, ''recognized_revenue'', COALESCE(s.recognized_revenue, 0), ' ||
    '''orders'', s.orders, ''units_last7'', COALESCE(s.units_last7, 0), ''units_prev7'', COALESCE(s.units_prev7, 0)' ||
    ') AS payload FROM (' ||
    'SELECT oi.product_id, MAX(oi.product_name) AS product_name, ' ||
    'SUM(oi.quantity)::bigint AS units, SUM(oi.line_total)::bigint AS revenue, ' ||
    'SUM(oi.line_total) FILTER (WHERE (o.payment_method IN (''jazzcash'',''bank_transfer'') ' ||
    'AND o.payment_status = ''payment_verified'' AND o.fulfilment_status <> ''cancelled'') ' ||
    'OR (o.payment_method = ''cod'' AND o.fulfilment_status = ''delivered''))::bigint AS recognized_revenue, ' ||
    'COUNT(DISTINCT o.id)::bigint AS orders, ' ||
    'SUM(oi.quantity) FILTER (WHERE o.created_at >= GREATEST($1, $2 - interval ''7 days''))::bigint AS units_last7, ' ||
    'SUM(oi.quantity) FILTER (WHERE o.created_at >= GREATEST($1, $2 - interval ''14 days'') ' ||
    'AND o.created_at < GREATEST($1, $2 - interval ''7 days''))::bigint AS units_prev7 ' ||
    'FROM order_items oi JOIN orders o ON o.id = oi.order_id ' ||
    'WHERE o.created_at >= $1 AND o.created_at < $2 AND o.fulfilment_status <> ''cancelled'' ' ||
    'GROUP BY oi.product_id) s ORDER BY %s LIMIT $3) sub',
    v_sort)
  USING p_from, p_to, v_limit
  INTO v_rows;

  -- Products never sold (any visibility except archived).
  SELECT jsonb_build_object(
           'count', (SELECT COUNT(*) FROM products p
                    WHERE p.visibility <> 'archived'
                      AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.id)),
           'sample', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                         'product_id', p.id, 'name', p.name, 'price', p.price)
                       ORDER BY p.name)
                     FROM (SELECT id, name, price FROM products p
                           WHERE p.visibility <> 'archived'
                             AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.id)
                           ORDER BY p.name LIMIT 20) p), '[]'::jsonb)
         )
  INTO v_never;

  -- Products missing images (visible catalogue only).
  SELECT jsonb_build_object(
           'count', (SELECT COUNT(*) FROM products p
                    WHERE p.visibility = 'visible'
                      AND (p.image_url IS NULL OR btrim(p.image_url) = '')),
           'sample', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                         'product_id', p.id, 'name', p.name)
                       ORDER BY p.name)
                     FROM (SELECT id, name FROM products p
                           WHERE p.visibility = 'visible'
                             AND (p.image_url IS NULL OR btrim(p.image_url) = '')
                           ORDER BY p.name LIMIT 20) p), '[]'::jsonb)
         )
  INTO v_noimg;

  RETURN jsonb_build_object(
    'products', v_rows,
    'never_sold', v_never,
    'missing_images', v_noimg,
    'currency', 'PKR'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_refunds(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  BEGIN
    SELECT jsonb_build_object(
      'total_cases', COUNT(*)::bigint,
      'open_cases', COUNT(*) FILTER (WHERE status IN ('open','pending'))::bigint,
      'resolved_cases', COUNT(*) FILTER (WHERE status IN ('resolved','closed'))::bigint,
      'total_refund', COALESCE(SUM(refund_amount),0)::bigint,
      'avg_resolution_hours', COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) FILTER (WHERE resolved_at IS NOT NULL),0)::numeric,
      'by_reason', COALESCE((SELECT jsonb_agg(jsonb_build_object('reason',reason,'count',cnt) ORDER BY cnt DESC) FROM (SELECT reason, COUNT(*)::bigint AS cnt FROM resolution_cases WHERE created_at>=p_from AND created_at<p_to GROUP BY 1) r), '[]'::jsonb)
    ) INTO v_result FROM resolution_cases WHERE created_at>=p_from AND created_at<p_to;
  EXCEPTION WHEN OTHERS THEN
    v_result := jsonb_build_object('available', false, 'reason', 'Resolution cases not available.');
  END;
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_revenue(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_gov           bigint := 0;
  v_prepaid       bigint := 0;
  v_delivered_cod bigint := 0;
  v_pending_cod   bigint := 0;
BEGIN
  SELECT COALESCE(SUM(total), 0) INTO v_gov
  FROM orders
  WHERE created_at >= p_from AND created_at < p_to
    AND fulfilment_status <> 'cancelled';

  SELECT COALESCE(SUM(total), 0) INTO v_prepaid
  FROM orders
  WHERE created_at >= p_from AND created_at < p_to
    AND fulfilment_status <> 'cancelled'
    AND payment_method IN ('jazzcash', 'bank_transfer')
    AND payment_status = 'payment_verified';

  SELECT COALESCE(SUM(total), 0) INTO v_delivered_cod
  FROM orders
  WHERE created_at >= p_from AND created_at < p_to
    AND payment_method = 'cod'
    AND fulfilment_status = 'delivered';

  SELECT COALESCE(SUM(total), 0) INTO v_pending_cod
  FROM orders
  WHERE created_at >= p_from AND created_at < p_to
    AND payment_method = 'cod'
    AND fulfilment_status NOT IN ('delivered', 'cancelled');

  RETURN jsonb_build_object(
    'gross_order_value',  v_gov,
    'confirmed_prepaid',  v_prepaid,
    'delivered_cod',      v_delivered_cod,
    'recognized_revenue', v_prepaid + v_delivered_cod,
    'pending_cod',        v_pending_cod,
    'currency', 'PKR',
    'definitions', jsonb_build_object(
      'gross_order_value',  'Value of all valid placed orders in the period. Cancelled orders are excluded.',
      'confirmed_prepaid',  'JazzCash / Bank Transfer orders whose payment was verified by staff (payment_status = payment_verified). Cancelled orders excluded.',
      'delivered_cod',      'Cash-on-delivery orders marked delivered. This cash has been collected.',
      'recognized_revenue', 'Money the store can count: confirmed_prepaid + delivered_cod.',
      'pending_cod',        'COD orders placed but not yet delivered (and not cancelled). Cash not yet collected.'
    )
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_shipping(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH stage AS (
    SELECT order_id,
      MIN(created_at) FILTER (WHERE event_type = 'fulfilment_status' AND new_status = 'packed')     AS packed_at,
      MIN(created_at) FILTER (WHERE event_type = 'fulfilment_status' AND new_status = 'dispatched') AS dispatched_at,
      MIN(created_at) FILTER (WHERE event_type = 'fulfilment_status' AND new_status = 'delivered')   AS delivered_at
    FROM order_status_events
    GROUP BY order_id
  ),
  joined AS (
    SELECT o.id, o.created_at, s.packed_at, s.dispatched_at, s.delivered_at
    FROM orders o
    JOIN stage s ON s.order_id = o.id::text
    WHERE o.created_at >= p_from AND o.created_at < p_to
      AND o.fulfilment_status <> 'cancelled'
  )
  SELECT jsonb_build_object(
           'avg_hours_order_to_packed',     ROUND(AVG(EXTRACT(EPOCH FROM (packed_at - created_at)) / 3600)::numeric, 1),
           'avg_hours_packed_to_dispatched',ROUND(AVG(EXTRACT(EPOCH FROM (dispatched_at - packed_at)) / 3600)::numeric, 1),
           'avg_hours_dispatched_to_delivered', ROUND(AVG(EXTRACT(EPOCH FROM (delivered_at - dispatched_at)) / 3600)::numeric, 1),
           'avg_hours_total_fulfillment',   ROUND(AVG(EXTRACT(EPOCH FROM (delivered_at - created_at)) / 3600)::numeric, 1),
           'orders_reaching_packed',     COUNT(packed_at),
           'orders_reaching_dispatched', COUNT(dispatched_at),
           'orders_reaching_delivered',  COUNT(delivered_at),
           'orders_in_range',            COUNT(*),
           'note', 'Averages use only orders that actually reached each stage. Hours.'
         )
  INTO v_result
  FROM joined;

  RETURN COALESCE(v_result,
    jsonb_build_object('note', 'No fulfillment stage data in this range.'));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_wishlist(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  BEGIN
    SELECT jsonb_build_object(
      'total_adds', (SELECT COUNT(*)::bigint FROM wishlist_events WHERE action='add' AND created_at>=p_from AND created_at<p_to),
      'total_removes', (SELECT COUNT(*)::bigint FROM wishlist_events WHERE action='remove' AND created_at>=p_from AND created_at<p_to),
      'to_cart', (SELECT COUNT(*)::bigint FROM wishlist_events WHERE action='to_cart' AND created_at>=p_from AND created_at<p_to),
      'top_products', COALESCE((SELECT jsonb_agg(jsonb_build_object('product_id',product_id,'adds',adds) ORDER BY adds DESC)
        FROM (SELECT product_id, COUNT(*)::bigint AS adds FROM wishlist_events
              WHERE action='add' AND created_at>=p_from AND created_at<p_to GROUP BY 1 ORDER BY adds DESC LIMIT 20) t), '[]'::jsonb)
    ) INTO v_result;
  EXCEPTION WHEN OTHERS THEN
    v_result := jsonb_build_object('total_adds',0,'total_removes',0,'to_cart',0,'top_products','[]'::jsonb);
  END;
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.assert_bundle_flag()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM products WHERE id = NEW.bundle_product_id AND is_bundle = TRUE) THEN
    RAISE EXCEPTION 'bundle_product_id % is not flagged is_bundle', NEW.bundle_product_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.chaskabox_enqueue_order_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  begin
    insert into public.notification_outbox(order_id)
    values (new.id::text)
    on conflict (order_id) do nothing;
  exception when others then
    -- Critical contract: notification failure must not abort/rollback checkout.
    raise warning 'chaskabox notification outbox enqueue failed: %', sqlerrm;
  end;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.chaskabox_record_order_status_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  begin
    if tg_op = 'INSERT' then
      insert into public.order_status_events(order_id, order_number, event_type, new_status, created_at)
      values (new.id::text, new.order_number, 'order_created', coalesce(new.fulfilment_status, 'new'), coalesce(new.created_at, now()));

      if new.payment_status is not null then
        insert into public.order_status_events(order_id, order_number, event_type, new_status, created_at)
        values (new.id::text, new.order_number, 'payment_status', new.payment_status, coalesce(new.created_at, now()));
      end if;
    elsif tg_op = 'UPDATE' then
      if new.fulfilment_status is distinct from old.fulfilment_status then
        insert into public.order_status_events(order_id, order_number, event_type, old_status, new_status)
        values (new.id::text, new.order_number, 'fulfilment_status', old.fulfilment_status, new.fulfilment_status);
      end if;
      if new.payment_status is distinct from old.payment_status then
        insert into public.order_status_events(order_id, order_number, event_type, old_status, new_status)
        values (new.id::text, new.order_number, 'payment_status', old.payment_status, new.payment_status);
      end if;
    end if;
  exception when others then
    -- Timeline logging must never make order creation/status updates fail.
    raise warning 'chaskabox order status event write failed: %', sqlerrm;
  end;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_order_atomic(p_order jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing orders%ROWTYPE;
  v_order orders%ROWTYPE;
  v_item jsonb;
  v_product products%ROWTYPE;
  v_subtotal integer := 0;
  v_delivery integer := 0;
  v_total integer := 0;
  v_cod_fee integer := 300;
  v_prepaid_fee integer := 300;
  v_free_threshold integer := 5000;
  v_payment text;
  v_user uuid := NULL;
  v_qty integer;
  v_method text;
  v_cod_enabled boolean := true;
  v_jazz_enabled boolean := true;
  v_bank_enabled boolean := true;
BEGIN
  IF p_order IS NULL THEN RAISE EXCEPTION 'order payload required'; END IF;
  SELECT * INTO v_existing FROM orders WHERE idempotency_key=(p_order->>'idempotency_key') LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('replay',true,'order',to_jsonb(v_existing)); END IF;
  BEGIN v_user := NULLIF(p_order->>'user_id','')::uuid; EXCEPTION WHEN others THEN v_user := NULL; END;
  IF v_user IS NOT NULL AND auth.uid() IS DISTINCT FROM v_user THEN
    -- service role may call this with a verified user id; reject direct mismatches for normal JWT calls
    IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'user mismatch'; END IF;
  END IF;
  IF jsonb_typeof(p_order->'items') <> 'array' OR jsonb_array_length(p_order->'items')=0 THEN RAISE EXCEPTION 'items required'; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_order->'items') LOOP
    v_qty := COALESCE((v_item->>'qty')::integer,0);
    IF v_qty < 1 OR v_qty > 99 THEN RAISE EXCEPTION 'invalid quantity'; END IF;
    SELECT * INTO v_product FROM products WHERE id=(v_item->>'product_id')::bigint AND visibility='visible' AND stock_state <> 'unavailable' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'product unavailable'; END IF;
    v_subtotal := v_subtotal + (v_product.price * v_qty);
  END LOOP;
  v_method := p_order->>'payment_method';
  IF v_method NOT IN ('cod','jazzcash','bank_transfer') THEN RAISE EXCEPTION 'invalid payment method'; END IF;
  SELECT COALESCE((SELECT (value#>>'{}')::boolean FROM site_settings WHERE key='cod_enabled'), true) INTO v_cod_enabled;
  SELECT COALESCE((SELECT (value#>>'{}')::boolean FROM site_settings WHERE key='jazzcash_enabled'), true) INTO v_jazz_enabled;
  SELECT COALESCE((SELECT (value#>>'{}')::boolean FROM site_settings WHERE key='bank_transfer_enabled'), true) INTO v_bank_enabled;
  IF (v_method='cod' AND NOT v_cod_enabled) OR (v_method='jazzcash' AND NOT v_jazz_enabled) OR (v_method='bank_transfer' AND NOT v_bank_enabled) THEN
    RAISE EXCEPTION 'payment method disabled';
  END IF;
  SELECT COALESCE((SELECT (value#>>'{}')::integer FROM site_settings WHERE key='cod_delivery_fee_pkr'), 300) INTO v_cod_fee;
  SELECT COALESCE((SELECT (value#>>'{}')::integer FROM site_settings WHERE key='prepaid_delivery_fee_pkr'), 300) INTO v_prepaid_fee;
  SELECT COALESCE((SELECT (value#>>'{}')::integer FROM site_settings WHERE key='prepaid_free_delivery_threshold_pkr'), 5000) INTO v_free_threshold;
  v_payment := CASE WHEN v_method='cod' THEN 'cod_due' ELSE 'payment_submitted' END;
  v_delivery := CASE WHEN v_method='cod' THEN v_cod_fee WHEN v_subtotal >= v_free_threshold THEN 0 ELSE v_prepaid_fee END;
  v_total := v_subtotal + v_delivery;
  INSERT INTO orders(order_number,idempotency_key,user_id,customer_name,customer_phone,customer_email,customer_address,customer_city,payment_method,payment_status,fulfilment_status,subtotal,delivery_fee,total,transaction_reference,customer_note)
  VALUES(p_order->>'order_number',p_order->>'idempotency_key',v_user,p_order#>>'{customer,name}',p_order#>>'{customer,phone}',NULLIF(p_order#>>'{customer,email}',''),p_order#>>'{customer,address}',p_order#>>'{customer,city}',v_method,v_payment,'new',v_subtotal,v_delivery,v_total,NULLIF(p_order->>'transaction_reference',''),NULLIF(p_order->>'customer_note','')) RETURNING * INTO v_order;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_order->'items') LOOP
    v_qty := (v_item->>'qty')::integer;
    SELECT * INTO v_product FROM products WHERE id=(v_item->>'product_id')::bigint;
    INSERT INTO order_items(order_id,product_id,product_name,pack,unit_price,quantity,line_total)
    VALUES(v_order.id,v_product.id,v_product.name,v_product.pack,v_product.price,v_qty,v_product.price*v_qty);
  END LOOP;
  RETURN jsonb_build_object('replay',false,'order',to_jsonb(v_order));
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_existing FROM orders WHERE idempotency_key=(p_order->>'idempotency_key') LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('replay',true,'order',to_jsonb(v_existing)); END IF;
  RAISE;
END $function$
;

CREATE OR REPLACE FUNCTION public.guard_order_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r TEXT := public.staff_role();
BEGIN
  IF r = 'fulfilment' THEN
    -- Contract §1.6: fulfilment = fulfilment_status + payment verify/reject + notes.
    IF NEW.subtotal            IS DISTINCT FROM OLD.subtotal
    OR NEW.delivery_fee        IS DISTINCT FROM OLD.delivery_fee
    OR NEW.total               IS DISTINCT FROM OLD.total
    OR NEW.payment_method      IS DISTINCT FROM OLD.payment_method
    OR NEW.user_id             IS DISTINCT FROM OLD.user_id
    OR NEW.customer_name       IS DISTINCT FROM OLD.customer_name
    OR NEW.customer_phone      IS DISTINCT FROM OLD.customer_phone
    OR NEW.customer_address    IS DISTINCT FROM OLD.customer_address
    OR NEW.customer_city       IS DISTINCT FROM OLD.customer_city
    OR NEW.transaction_reference IS DISTINCT FROM OLD.transaction_reference
    OR NEW.order_number        IS DISTINCT FROM OLD.order_number
    OR NEW.idempotency_key     IS DISTINCT FROM OLD.idempotency_key THEN
      RAISE EXCEPTION 'fulfilment role may only update fulfilment_status, payment_status and admin_notes';
    END IF;
  ELSIF r NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'not authorized to update orders';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_review_verified()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r TEXT := public.staff_role();
BEGIN
  IF NEW.verified_purchase IS DISTINCT FROM OLD.verified_purchase
     AND r NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'verified_purchase is server-derived; not settable by this role';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end
$function$
;



CREATE OR REPLACE FUNCTION public.link_guest_orders()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_linked integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(u.email)) INTO v_email
  FROM auth.users u
  WHERE u.id = v_user_id AND u.email_confirmed_at IS NOT NULL
    AND coalesce(u.is_anonymous, false) = false;
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Confirm your account email before linking past orders'
      USING ERRCODE = '42501';
  END IF;
  UPDATE public.orders o
  SET user_id = v_user_id
  WHERE o.user_id IS NULL
    AND lower(btrim(o.customer_email)) = v_email;
  GET DIAGNOSTICS v_linked = ROW_COUNT;
  RETURN jsonb_build_object('linked', v_linked, 'ownership', 'confirmed_email');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_product_ai_embedding_stale()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF ROW(NEW.name, NEW.brand, NEW.category, NEW.pack, NEW.description, NEW.tags, NEW.visibility)
     IS DISTINCT FROM
     ROW(OLD.name, OLD.brand, OLD.category, OLD.pack, OLD.description, OLD.tags, OLD.visibility) THEN
    NEW.ai_embedding := NULL;
    NEW.ai_embedding_text := NULL;
    NEW.ai_embedding_updated_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.match_public_products(p_query_embedding text, p_match_count integer DEFAULT 8, p_match_threshold real DEFAULT 0.20)
 RETURNS TABLE(id bigint, slug text, name text, brand text, category text, pack text, price integer, old_price integer, description text, badge text, image_url text, is_bundle boolean, similarity real)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.slug, p.name, p.brand, p.category, p.pack,
    p.price, p.old_price, p.description, p.badge, p.image_url, p.is_bundle,
    (1 - (p.ai_embedding <=> p_query_embedding::extensions.vector))::REAL AS similarity
  FROM products p
  WHERE p.visibility = 'visible'
    AND p.ai_embedding IS NOT NULL
    AND (1 - (p.ai_embedding <=> p_query_embedding::extensions.vector)) >= GREATEST(0.0, LEAST(1.0, p_match_threshold))
  ORDER BY p.ai_embedding <=> p_query_embedding::extensions.vector
  LIMIT GREATEST(1, LEAST(20, p_match_count));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_product_ai_embeddings(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  item JSONB;
  changed INTEGER := 0;
BEGIN
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be an array';
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    UPDATE products
       SET ai_embedding = (item->>'embedding')::extensions.vector,
           ai_embedding_text = LEFT(COALESCE(item->>'text',''), 6000),
           ai_embedding_updated_at = now()
     WHERE id = (item->>'id')::BIGINT;
    changed := changed + CASE WHEN FOUND THEN 1 ELSE 0 END;
  END LOOP;
  RETURN changed;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;


CREATE OR REPLACE FUNCTION public.take_rate_limit_token(p_key text, p_capacity integer, p_per_minute integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_now timestamptz:=clock_timestamp(); v_tokens double precision; v_updated timestamptz; v_refill double precision; v_retry integer;
BEGIN
 IF p_key IS NULL OR length(p_key)<16 OR p_capacity<1 OR p_per_minute<1 THEN RAISE EXCEPTION 'invalid limiter input'; END IF;
 v_refill:=p_per_minute/60.0;
 INSERT INTO api_rate_limits(bucket_key,tokens,updated_at) VALUES(p_key,p_capacity-1,v_now)
 ON CONFLICT DO NOTHING;
 IF FOUND THEN RETURN jsonb_build_object('allowed',true,'retry_after_sec',0); END IF;
 SELECT tokens,updated_at INTO v_tokens,v_updated FROM api_rate_limits WHERE bucket_key=p_key FOR UPDATE;
 v_tokens:=LEAST(p_capacity, v_tokens + EXTRACT(EPOCH FROM (v_now-v_updated))*v_refill);
 IF v_tokens>=1 THEN
   UPDATE api_rate_limits SET tokens=v_tokens-1,updated_at=v_now WHERE bucket_key=p_key;
   RETURN jsonb_build_object('allowed',true,'retry_after_sec',0);
 END IF;
 v_retry:=GREATEST(1,CEIL((1-v_tokens)/v_refill)::integer);
 UPDATE api_rate_limits SET tokens=v_tokens,updated_at=v_now WHERE bucket_key=p_key;
 RETURN jsonb_build_object('allowed',false,'retry_after_sec',v_retry);
END $function$
;

CREATE OR REPLACE FUNCTION public.validate_site_setting()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  n numeric;
  s text;
BEGIN
  IF NEW.key IN ('cod_enabled','jazzcash_enabled','bank_transfer_enabled','ai_customer_assistant_enabled','ai_semantic_search_enabled') THEN
    IF jsonb_typeof(NEW.value) <> 'boolean' THEN RAISE EXCEPTION '% must be boolean', NEW.key; END IF;
  ELSIF NEW.key IN ('cod_delivery_fee_pkr','prepaid_delivery_fee_pkr','prepaid_free_delivery_threshold_pkr') THEN
    IF jsonb_typeof(NEW.value) <> 'number' THEN RAISE EXCEPTION '% must be a number', NEW.key; END IF;
    n := (NEW.value #>> '{}')::numeric;
    IF NEW.key = 'prepaid_free_delivery_threshold_pkr' THEN
      IF n < 0 OR n > 1000000 OR n <> trunc(n) THEN RAISE EXCEPTION '% out of range', NEW.key; END IF;
    ELSE
      IF n < 0 OR n > 100000 OR n <> trunc(n) THEN RAISE EXCEPTION '% out of range', NEW.key; END IF;
    END IF;
  ELSIF NEW.key = 'delivery_estimate' THEN
    IF jsonb_typeof(NEW.value) <> 'string' THEN RAISE EXCEPTION 'delivery_estimate must be text'; END IF;
    s := NEW.value #>> '{}'; IF length(btrim(s)) < 2 OR length(s) > 80 THEN RAISE EXCEPTION 'delivery_estimate invalid'; END IF;
  ELSIF NEW.key = 'support_email' THEN
    IF jsonb_typeof(NEW.value) <> 'string' THEN RAISE EXCEPTION 'support_email must be text'; END IF;
    s := NEW.value #>> '{}'; IF length(s) > 254 OR s !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'support_email invalid'; END IF;
  ELSIF NEW.key = 'support_whatsapp' THEN
    IF jsonb_typeof(NEW.value) <> 'string' THEN RAISE EXCEPTION 'support_whatsapp must be text'; END IF;
    s := NEW.value #>> '{}'; IF length(s) > 25 OR s !~ '^[+0-9 ()-]{7,25}$' THEN RAISE EXCEPTION 'support_whatsapp invalid'; END IF;
  ELSIF NEW.key = 'store_address' THEN
    IF jsonb_typeof(NEW.value) <> 'string' THEN RAISE EXCEPTION 'store_address must be text'; END IF;
    s := NEW.value #>> '{}'; IF length(btrim(s)) < 3 OR length(s) > 300 THEN RAISE EXCEPTION 'store_address invalid'; END IF;
  ELSIF NEW.key = 'jazzcash_till_id' THEN
    IF jsonb_typeof(NEW.value) <> 'string' THEN RAISE EXCEPTION 'jazzcash_till_id must be text'; END IF;
    s := NEW.value #>> '{}'; IF length(s) > 40 OR s !~ '^[A-Za-z0-9 -]{3,40}$' THEN RAISE EXCEPTION 'jazzcash_till_id invalid'; END IF;
  ELSIF NEW.key = 'jazzcash_qr_url' THEN
    IF jsonb_typeof(NEW.value) <> 'string' THEN RAISE EXCEPTION 'jazzcash_qr_url must be text'; END IF;
    s := NEW.value #>> '{}'; IF length(s) > 500 OR s !~ '^(https://|/)[^[:space:]]+$' THEN RAISE EXCEPTION 'jazzcash_qr_url invalid'; END IF;
  ELSIF NEW.key = 'promo_text' THEN
    IF jsonb_typeof(NEW.value) <> 'string' THEN RAISE EXCEPTION 'promo_text must be text'; END IF;
    s := NEW.value #>> '{}'; IF length(btrim(s)) < 1 OR length(s) > 180 THEN RAISE EXCEPTION 'promo_text invalid'; END IF;
  ELSIF NEW.key = 'bank_transfer_details' THEN
    IF jsonb_typeof(NEW.value) <> 'object' OR pg_column_size(NEW.value) > 4096 THEN RAISE EXCEPTION 'bank_transfer_details invalid'; END IF;
    IF length(btrim(COALESCE(NEW.value->>'bank',''))) < 2 OR length(COALESCE(NEW.value->>'bank','')) > 100 THEN RAISE EXCEPTION 'bank name invalid'; END IF;
    IF length(btrim(COALESCE(NEW.value->>'account_title',''))) < 2 OR length(COALESCE(NEW.value->>'account_title','')) > 120 THEN RAISE EXCEPTION 'account title invalid'; END IF;
    IF length(btrim(COALESCE(NEW.value->>'account_number',''))) < 4 OR length(COALESCE(NEW.value->>'account_number','')) > 80 THEN RAISE EXCEPTION 'account number invalid'; END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

ALTER TABLE public."addresses" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."admin_roles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."ai_usage" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."api_rate_limits" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."audit_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."box_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."brands" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."bundle_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."categories" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."category_products" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."coupons" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."customer_notification_outbox" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."customers" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."filter_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."funnel_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."homepage_sections" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."media" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."navigation_menus" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."notification_outbox" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."notification_templates" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."order_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."order_status_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."orders" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."products" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."resolution_cases" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."reviews" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."search_logs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."shipping_zones" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."site_settings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."store_settings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."theme_settings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."wishlist_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."wishlists" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "addresses_own_all" ON public."addresses" AS PERMISSIVE FOR ALL TO "authenticated" USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "admin_roles_own_read" ON public."admin_roles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));

CREATE POLICY "admin_roles_owner_read" ON public."admin_roles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_owner());

CREATE POLICY "admin_roles_owner_write" ON public."admin_roles" AS PERMISSIVE FOR ALL TO "service_role" USING (is_owner()) WITH CHECK (is_owner());

CREATE POLICY "ai_usage_service_all" ON public."ai_usage" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "audit_log_insert" ON public."audit_log" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (is_staff());

CREATE POLICY "audit_log_read" ON public."audit_log" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_owner());

CREATE POLICY "box_events_insert" ON public."box_events" AS PERMISSIVE FOR INSERT TO "anon","authenticated" WITH CHECK (true);

CREATE POLICY "box_events_service" ON public."box_events" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "brands_service_all" ON public."brands" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "bundle_items_staff_read" ON public."bundle_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_staff());

CREATE POLICY "bundle_items_write" ON public."bundle_items" AS PERMISSIVE FOR ALL TO "authenticated" USING ((staff_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'content'::text]))) WITH CHECK ((staff_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'content'::text])));

CREATE POLICY "categories_admin_all" ON public."categories" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "categories_public_read" ON public."categories" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_visible = true));

CREATE POLICY "category_products_admin_all" ON public."category_products" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "category_products_public_read" ON public."category_products" AS PERMISSIVE FOR SELECT TO "anon","authenticated" USING (((EXISTS ( SELECT 1
   FROM categories c
  WHERE ((c.id = category_products.category_id) AND (c.is_visible = true)))) AND (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = category_products.product_id) AND (p.visibility = 'visible'::text))))));

CREATE POLICY "coupons_service_all" ON public."coupons" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "customers_own_read" ON public."customers" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));

CREATE POLICY "customers_staff_read" ON public."customers" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((staff_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'fulfilment'::text])));

CREATE POLICY "customers_staff_update" ON public."customers" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((staff_role() = ANY (ARRAY['owner'::text, 'manager'::text]))) WITH CHECK ((staff_role() = ANY (ARRAY['owner'::text, 'manager'::text])));

CREATE POLICY "filter_events_insert" ON public."filter_events" AS PERMISSIVE FOR INSERT TO "anon","authenticated" WITH CHECK (true);

CREATE POLICY "filter_events_service" ON public."filter_events" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "funnel_anon_insert" ON public."funnel_events" AS PERMISSIVE FOR INSERT TO "anon" WITH CHECK (true);

CREATE POLICY "funnel_service_all" ON public."funnel_events" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "homepage_public_read" ON public."homepage_sections" AS PERMISSIVE FOR SELECT TO "anon","authenticated" USING ((enabled = true));

CREATE POLICY "homepage_staff_read" ON public."homepage_sections" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_staff());

CREATE POLICY "homepage_write" ON public."homepage_sections" AS PERMISSIVE FOR ALL TO "authenticated" USING ((staff_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'content'::text]))) WITH CHECK ((staff_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'content'::text])));

CREATE POLICY "media_public_read" ON public."media" AS PERMISSIVE FOR SELECT TO "anon","authenticated" USING (true);

CREATE POLICY "media_write" ON public."media" AS PERMISSIVE FOR ALL TO "authenticated" USING ((staff_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'content'::text]))) WITH CHECK (((staff_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'content'::text])) AND ((uploaded_by = auth.uid()) OR (uploaded_by IS NULL))));

CREATE POLICY "navigation_admin_all" ON public."navigation_menus" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "navigation_public_read" ON public."navigation_menus" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_enabled = true));

CREATE POLICY "notif_tpl_service_all" ON public."notification_templates" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "order_items_customer_read" ON public."order_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((order_id IN ( SELECT o.id
   FROM orders o
  WHERE (o.user_id = auth.uid()))));

CREATE POLICY "order_items_staff_read" ON public."order_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((staff_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'fulfilment'::text])));

CREATE POLICY "orders_customer_read" ON public."orders" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));

CREATE POLICY "orders_staff_read" ON public."orders" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((staff_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'fulfilment'::text])));

CREATE POLICY "orders_staff_update" ON public."orders" AS PERMISSIVE FOR UPDATE TO "service_role" USING ((staff_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'fulfilment'::text]))) WITH CHECK ((staff_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'fulfilment'::text])));

CREATE POLICY "products_public_read" ON public."products" AS PERMISSIVE FOR SELECT TO "anon","authenticated" USING ((visibility = 'visible'::text));

CREATE POLICY "products_staff_read" ON public."products" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_staff());

CREATE POLICY "products_write" ON public."products" AS PERMISSIVE FOR ALL TO "authenticated" USING ((staff_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'content'::text]))) WITH CHECK ((staff_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'content'::text])));

CREATE POLICY "profiles_own_insert" ON public."profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((id = auth.uid()));

CREATE POLICY "profiles_own_select" ON public."profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((id = auth.uid()));

CREATE POLICY "profiles_own_update" ON public."profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

CREATE POLICY "resolution_service_all" ON public."resolution_cases" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "reviews_insert" ON public."reviews" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (((moderation_status = 'pending'::text) AND (verified_purchase = false)));

CREATE POLICY "reviews_moderate" ON public."reviews" AS PERMISSIVE FOR UPDATE TO "service_role" USING ((staff_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'content'::text]))) WITH CHECK ((staff_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'content'::text])));

CREATE POLICY "reviews_own_read" ON public."reviews" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));

CREATE POLICY "reviews_owner_delete" ON public."reviews" AS PERMISSIVE FOR DELETE TO "service_role" USING (is_owner());

CREATE POLICY "reviews_public_read" ON public."reviews" AS PERMISSIVE FOR SELECT TO "anon","authenticated" USING ((moderation_status = 'approved'::text));

CREATE POLICY "searchlog_anon_insert" ON public."search_logs" AS PERMISSIVE FOR INSERT TO "anon" WITH CHECK (true);

CREATE POLICY "searchlog_service_all" ON public."search_logs" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "shipzone_service_all" ON public."shipping_zones" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "settings_owner_write" ON public."site_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_owner()) WITH CHECK (is_owner());

CREATE POLICY "settings_public_read" ON public."site_settings" AS PERMISSIVE FOR SELECT TO "anon","authenticated" USING (true);

CREATE POLICY "store_settings_admin_all" ON public."store_settings" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "theme_service_all" ON public."theme_settings" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "wishlist_events_insert" ON public."wishlist_events" AS PERMISSIVE FOR INSERT TO "anon","authenticated" WITH CHECK (true);

CREATE POLICY "wishlist_events_service" ON public."wishlist_events" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "wishlists_own_all" ON public."wishlists" AS PERMISSIVE FOR ALL TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_bundle_items_flag BEFORE INSERT OR UPDATE ON public.bundle_items FOR EACH ROW EXECUTE FUNCTION public.assert_bundle_flag();

CREATE TRIGGER trg_homepage_updated_at BEFORE UPDATE ON public.homepage_sections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_settings_updated_at BEFORE UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_guard_order_update BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_order_update();

CREATE TRIGGER trg_guard_review_verified BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.guard_review_verified();

CREATE TRIGGER chaskabox_order_status_event_insert_trigger AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.chaskabox_record_order_status_event();

CREATE TRIGGER chaskabox_order_status_event_update_trigger AFTER UPDATE OF fulfilment_status, payment_status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.chaskabox_record_order_status_event();

CREATE TRIGGER chaskabox_notification_outbox_trigger AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.chaskabox_enqueue_order_notification();

CREATE TRIGGER trg_products_ai_embedding_stale BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.mark_product_ai_embedding_stale();

CREATE TRIGGER trg_validate_site_setting BEFORE INSERT OR UPDATE OF key, value ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.validate_site_setting();

CREATE TRIGGER trg_brands_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON TABLE public."addresses" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."addresses" TO "anon";

GRANT SELECT ON TABLE public."addresses" TO "anon";

GRANT UPDATE ON TABLE public."addresses" TO "anon";

GRANT DELETE ON TABLE public."addresses" TO "anon";

GRANT TRUNCATE ON TABLE public."addresses" TO "anon";

GRANT REFERENCES ON TABLE public."addresses" TO "anon";

GRANT TRIGGER ON TABLE public."addresses" TO "anon";

GRANT MAINTAIN ON TABLE public."addresses" TO "anon";

GRANT INSERT ON TABLE public."addresses" TO "authenticated";

GRANT SELECT ON TABLE public."addresses" TO "authenticated";

GRANT UPDATE ON TABLE public."addresses" TO "authenticated";

GRANT DELETE ON TABLE public."addresses" TO "authenticated";

GRANT TRUNCATE ON TABLE public."addresses" TO "authenticated";

GRANT REFERENCES ON TABLE public."addresses" TO "authenticated";

GRANT TRIGGER ON TABLE public."addresses" TO "authenticated";

GRANT MAINTAIN ON TABLE public."addresses" TO "authenticated";

GRANT INSERT ON TABLE public."addresses" TO "service_role";

GRANT SELECT ON TABLE public."addresses" TO "service_role";

GRANT UPDATE ON TABLE public."addresses" TO "service_role";

GRANT DELETE ON TABLE public."addresses" TO "service_role";

GRANT TRUNCATE ON TABLE public."addresses" TO "service_role";

GRANT REFERENCES ON TABLE public."addresses" TO "service_role";

GRANT TRIGGER ON TABLE public."addresses" TO "service_role";

GRANT MAINTAIN ON TABLE public."addresses" TO "service_role";

REVOKE ALL ON TABLE public."admin_roles" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON TABLE public."admin_roles" TO "anon";

GRANT MAINTAIN ON TABLE public."admin_roles" TO "anon";

GRANT SELECT ON TABLE public."admin_roles" TO "authenticated";

GRANT MAINTAIN ON TABLE public."admin_roles" TO "authenticated";

GRANT INSERT ON TABLE public."admin_roles" TO "service_role";

GRANT SELECT ON TABLE public."admin_roles" TO "service_role";

GRANT UPDATE ON TABLE public."admin_roles" TO "service_role";

GRANT DELETE ON TABLE public."admin_roles" TO "service_role";

GRANT TRUNCATE ON TABLE public."admin_roles" TO "service_role";

GRANT REFERENCES ON TABLE public."admin_roles" TO "service_role";

GRANT TRIGGER ON TABLE public."admin_roles" TO "service_role";

GRANT MAINTAIN ON TABLE public."admin_roles" TO "service_role";

REVOKE ALL ON TABLE public."ai_usage" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."ai_usage" TO "anon";

GRANT SELECT ON TABLE public."ai_usage" TO "anon";

GRANT UPDATE ON TABLE public."ai_usage" TO "anon";

GRANT DELETE ON TABLE public."ai_usage" TO "anon";

GRANT TRUNCATE ON TABLE public."ai_usage" TO "anon";

GRANT REFERENCES ON TABLE public."ai_usage" TO "anon";

GRANT TRIGGER ON TABLE public."ai_usage" TO "anon";

GRANT MAINTAIN ON TABLE public."ai_usage" TO "anon";

GRANT INSERT ON TABLE public."ai_usage" TO "authenticated";

GRANT SELECT ON TABLE public."ai_usage" TO "authenticated";

GRANT UPDATE ON TABLE public."ai_usage" TO "authenticated";

GRANT DELETE ON TABLE public."ai_usage" TO "authenticated";

GRANT TRUNCATE ON TABLE public."ai_usage" TO "authenticated";

GRANT REFERENCES ON TABLE public."ai_usage" TO "authenticated";

GRANT TRIGGER ON TABLE public."ai_usage" TO "authenticated";

GRANT MAINTAIN ON TABLE public."ai_usage" TO "authenticated";

GRANT INSERT ON TABLE public."ai_usage" TO "service_role";

GRANT SELECT ON TABLE public."ai_usage" TO "service_role";

GRANT UPDATE ON TABLE public."ai_usage" TO "service_role";

GRANT DELETE ON TABLE public."ai_usage" TO "service_role";

GRANT TRUNCATE ON TABLE public."ai_usage" TO "service_role";

GRANT REFERENCES ON TABLE public."ai_usage" TO "service_role";

GRANT TRIGGER ON TABLE public."ai_usage" TO "service_role";

GRANT MAINTAIN ON TABLE public."ai_usage" TO "service_role";

REVOKE ALL ON TABLE public."api_rate_limits" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."api_rate_limits" TO "service_role";

GRANT SELECT ON TABLE public."api_rate_limits" TO "service_role";

GRANT UPDATE ON TABLE public."api_rate_limits" TO "service_role";

GRANT DELETE ON TABLE public."api_rate_limits" TO "service_role";

GRANT TRUNCATE ON TABLE public."api_rate_limits" TO "service_role";

GRANT REFERENCES ON TABLE public."api_rate_limits" TO "service_role";

GRANT TRIGGER ON TABLE public."api_rate_limits" TO "service_role";

GRANT MAINTAIN ON TABLE public."api_rate_limits" TO "service_role";

REVOKE ALL ON TABLE public."audit_log" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON TABLE public."audit_log" TO "anon";

GRANT MAINTAIN ON TABLE public."audit_log" TO "anon";

GRANT SELECT ON TABLE public."audit_log" TO "authenticated";

GRANT MAINTAIN ON TABLE public."audit_log" TO "authenticated";

GRANT INSERT ON TABLE public."audit_log" TO "service_role";

GRANT SELECT ON TABLE public."audit_log" TO "service_role";

GRANT UPDATE ON TABLE public."audit_log" TO "service_role";

GRANT DELETE ON TABLE public."audit_log" TO "service_role";

GRANT TRUNCATE ON TABLE public."audit_log" TO "service_role";

GRANT REFERENCES ON TABLE public."audit_log" TO "service_role";

GRANT TRIGGER ON TABLE public."audit_log" TO "service_role";

GRANT MAINTAIN ON TABLE public."audit_log" TO "service_role";

REVOKE ALL ON TABLE public."box_events" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."box_events" TO "anon";

GRANT SELECT ON TABLE public."box_events" TO "anon";

GRANT UPDATE ON TABLE public."box_events" TO "anon";

GRANT DELETE ON TABLE public."box_events" TO "anon";

GRANT TRUNCATE ON TABLE public."box_events" TO "anon";

GRANT REFERENCES ON TABLE public."box_events" TO "anon";

GRANT TRIGGER ON TABLE public."box_events" TO "anon";

GRANT MAINTAIN ON TABLE public."box_events" TO "anon";

GRANT INSERT ON TABLE public."box_events" TO "authenticated";

GRANT SELECT ON TABLE public."box_events" TO "authenticated";

GRANT UPDATE ON TABLE public."box_events" TO "authenticated";

GRANT DELETE ON TABLE public."box_events" TO "authenticated";

GRANT TRUNCATE ON TABLE public."box_events" TO "authenticated";

GRANT REFERENCES ON TABLE public."box_events" TO "authenticated";

GRANT TRIGGER ON TABLE public."box_events" TO "authenticated";

GRANT MAINTAIN ON TABLE public."box_events" TO "authenticated";

GRANT INSERT ON TABLE public."box_events" TO "service_role";

GRANT SELECT ON TABLE public."box_events" TO "service_role";

GRANT UPDATE ON TABLE public."box_events" TO "service_role";

GRANT DELETE ON TABLE public."box_events" TO "service_role";

GRANT TRUNCATE ON TABLE public."box_events" TO "service_role";

GRANT REFERENCES ON TABLE public."box_events" TO "service_role";

GRANT TRIGGER ON TABLE public."box_events" TO "service_role";

GRANT MAINTAIN ON TABLE public."box_events" TO "service_role";

REVOKE ALL ON TABLE public."brands" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."brands" TO "anon";

GRANT SELECT ON TABLE public."brands" TO "anon";

GRANT UPDATE ON TABLE public."brands" TO "anon";

GRANT DELETE ON TABLE public."brands" TO "anon";

GRANT TRUNCATE ON TABLE public."brands" TO "anon";

GRANT REFERENCES ON TABLE public."brands" TO "anon";

GRANT TRIGGER ON TABLE public."brands" TO "anon";

GRANT MAINTAIN ON TABLE public."brands" TO "anon";

GRANT INSERT ON TABLE public."brands" TO "authenticated";

GRANT SELECT ON TABLE public."brands" TO "authenticated";

GRANT UPDATE ON TABLE public."brands" TO "authenticated";

GRANT DELETE ON TABLE public."brands" TO "authenticated";

GRANT TRUNCATE ON TABLE public."brands" TO "authenticated";

GRANT REFERENCES ON TABLE public."brands" TO "authenticated";

GRANT TRIGGER ON TABLE public."brands" TO "authenticated";

GRANT MAINTAIN ON TABLE public."brands" TO "authenticated";

GRANT INSERT ON TABLE public."brands" TO "service_role";

GRANT SELECT ON TABLE public."brands" TO "service_role";

GRANT UPDATE ON TABLE public."brands" TO "service_role";

GRANT DELETE ON TABLE public."brands" TO "service_role";

GRANT TRUNCATE ON TABLE public."brands" TO "service_role";

GRANT REFERENCES ON TABLE public."brands" TO "service_role";

GRANT TRIGGER ON TABLE public."brands" TO "service_role";

GRANT MAINTAIN ON TABLE public."brands" TO "service_role";

REVOKE ALL ON TABLE public."bundle_items" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."bundle_items" TO "anon";

GRANT SELECT ON TABLE public."bundle_items" TO "anon";

GRANT UPDATE ON TABLE public."bundle_items" TO "anon";

GRANT DELETE ON TABLE public."bundle_items" TO "anon";

GRANT TRUNCATE ON TABLE public."bundle_items" TO "anon";

GRANT REFERENCES ON TABLE public."bundle_items" TO "anon";

GRANT TRIGGER ON TABLE public."bundle_items" TO "anon";

GRANT MAINTAIN ON TABLE public."bundle_items" TO "anon";

GRANT INSERT ON TABLE public."bundle_items" TO "authenticated";

GRANT SELECT ON TABLE public."bundle_items" TO "authenticated";

GRANT UPDATE ON TABLE public."bundle_items" TO "authenticated";

GRANT DELETE ON TABLE public."bundle_items" TO "authenticated";

GRANT TRUNCATE ON TABLE public."bundle_items" TO "authenticated";

GRANT REFERENCES ON TABLE public."bundle_items" TO "authenticated";

GRANT TRIGGER ON TABLE public."bundle_items" TO "authenticated";

GRANT MAINTAIN ON TABLE public."bundle_items" TO "authenticated";

GRANT INSERT ON TABLE public."bundle_items" TO "service_role";

GRANT SELECT ON TABLE public."bundle_items" TO "service_role";

GRANT UPDATE ON TABLE public."bundle_items" TO "service_role";

GRANT DELETE ON TABLE public."bundle_items" TO "service_role";

GRANT TRUNCATE ON TABLE public."bundle_items" TO "service_role";

GRANT REFERENCES ON TABLE public."bundle_items" TO "service_role";

GRANT TRIGGER ON TABLE public."bundle_items" TO "service_role";

GRANT MAINTAIN ON TABLE public."bundle_items" TO "service_role";

REVOKE ALL ON TABLE public."categories" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."categories" TO "service_role";

GRANT SELECT ON TABLE public."categories" TO "service_role";

GRANT UPDATE ON TABLE public."categories" TO "service_role";

GRANT DELETE ON TABLE public."categories" TO "service_role";

GRANT TRUNCATE ON TABLE public."categories" TO "service_role";

GRANT REFERENCES ON TABLE public."categories" TO "service_role";

GRANT TRIGGER ON TABLE public."categories" TO "service_role";

GRANT MAINTAIN ON TABLE public."categories" TO "service_role";

GRANT SELECT ON TABLE public."categories" TO "anon";

GRANT SELECT ON TABLE public."categories" TO "authenticated";

REVOKE ALL ON TABLE public."category_products" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."category_products" TO "service_role";

GRANT SELECT ON TABLE public."category_products" TO "service_role";

GRANT UPDATE ON TABLE public."category_products" TO "service_role";

GRANT DELETE ON TABLE public."category_products" TO "service_role";

GRANT TRUNCATE ON TABLE public."category_products" TO "service_role";

GRANT REFERENCES ON TABLE public."category_products" TO "service_role";

GRANT TRIGGER ON TABLE public."category_products" TO "service_role";

GRANT MAINTAIN ON TABLE public."category_products" TO "service_role";

GRANT SELECT ON TABLE public."category_products" TO "anon";

GRANT SELECT ON TABLE public."category_products" TO "authenticated";

REVOKE ALL ON TABLE public."coupons" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."coupons" TO "anon";

GRANT SELECT ON TABLE public."coupons" TO "anon";

GRANT UPDATE ON TABLE public."coupons" TO "anon";

GRANT DELETE ON TABLE public."coupons" TO "anon";

GRANT TRUNCATE ON TABLE public."coupons" TO "anon";

GRANT REFERENCES ON TABLE public."coupons" TO "anon";

GRANT TRIGGER ON TABLE public."coupons" TO "anon";

GRANT MAINTAIN ON TABLE public."coupons" TO "anon";

GRANT INSERT ON TABLE public."coupons" TO "authenticated";

GRANT SELECT ON TABLE public."coupons" TO "authenticated";

GRANT UPDATE ON TABLE public."coupons" TO "authenticated";

GRANT DELETE ON TABLE public."coupons" TO "authenticated";

GRANT TRUNCATE ON TABLE public."coupons" TO "authenticated";

GRANT REFERENCES ON TABLE public."coupons" TO "authenticated";

GRANT TRIGGER ON TABLE public."coupons" TO "authenticated";

GRANT MAINTAIN ON TABLE public."coupons" TO "authenticated";

GRANT INSERT ON TABLE public."coupons" TO "service_role";

GRANT SELECT ON TABLE public."coupons" TO "service_role";

GRANT UPDATE ON TABLE public."coupons" TO "service_role";

GRANT DELETE ON TABLE public."coupons" TO "service_role";

GRANT TRUNCATE ON TABLE public."coupons" TO "service_role";

GRANT REFERENCES ON TABLE public."coupons" TO "service_role";

GRANT TRIGGER ON TABLE public."coupons" TO "service_role";

GRANT MAINTAIN ON TABLE public."coupons" TO "service_role";

REVOKE ALL ON TABLE public."customer_notification_outbox" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."customer_notification_outbox" TO "anon";

GRANT SELECT ON TABLE public."customer_notification_outbox" TO "anon";

GRANT UPDATE ON TABLE public."customer_notification_outbox" TO "anon";

GRANT DELETE ON TABLE public."customer_notification_outbox" TO "anon";

GRANT TRUNCATE ON TABLE public."customer_notification_outbox" TO "anon";

GRANT REFERENCES ON TABLE public."customer_notification_outbox" TO "anon";

GRANT TRIGGER ON TABLE public."customer_notification_outbox" TO "anon";

GRANT MAINTAIN ON TABLE public."customer_notification_outbox" TO "anon";

GRANT INSERT ON TABLE public."customer_notification_outbox" TO "authenticated";

GRANT SELECT ON TABLE public."customer_notification_outbox" TO "authenticated";

GRANT UPDATE ON TABLE public."customer_notification_outbox" TO "authenticated";

GRANT DELETE ON TABLE public."customer_notification_outbox" TO "authenticated";

GRANT TRUNCATE ON TABLE public."customer_notification_outbox" TO "authenticated";

GRANT REFERENCES ON TABLE public."customer_notification_outbox" TO "authenticated";

GRANT TRIGGER ON TABLE public."customer_notification_outbox" TO "authenticated";

GRANT MAINTAIN ON TABLE public."customer_notification_outbox" TO "authenticated";

GRANT INSERT ON TABLE public."customer_notification_outbox" TO "service_role";

GRANT SELECT ON TABLE public."customer_notification_outbox" TO "service_role";

GRANT UPDATE ON TABLE public."customer_notification_outbox" TO "service_role";

GRANT DELETE ON TABLE public."customer_notification_outbox" TO "service_role";

GRANT TRUNCATE ON TABLE public."customer_notification_outbox" TO "service_role";

GRANT REFERENCES ON TABLE public."customer_notification_outbox" TO "service_role";

GRANT TRIGGER ON TABLE public."customer_notification_outbox" TO "service_role";

GRANT MAINTAIN ON TABLE public."customer_notification_outbox" TO "service_role";

REVOKE ALL ON TABLE public."customers" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."customers" TO "anon";

GRANT SELECT ON TABLE public."customers" TO "anon";

GRANT UPDATE ON TABLE public."customers" TO "anon";

GRANT DELETE ON TABLE public."customers" TO "anon";

GRANT TRUNCATE ON TABLE public."customers" TO "anon";

GRANT REFERENCES ON TABLE public."customers" TO "anon";

GRANT TRIGGER ON TABLE public."customers" TO "anon";

GRANT MAINTAIN ON TABLE public."customers" TO "anon";

GRANT INSERT ON TABLE public."customers" TO "authenticated";

GRANT SELECT ON TABLE public."customers" TO "authenticated";

GRANT UPDATE ON TABLE public."customers" TO "authenticated";

GRANT DELETE ON TABLE public."customers" TO "authenticated";

GRANT TRUNCATE ON TABLE public."customers" TO "authenticated";

GRANT REFERENCES ON TABLE public."customers" TO "authenticated";

GRANT TRIGGER ON TABLE public."customers" TO "authenticated";

GRANT MAINTAIN ON TABLE public."customers" TO "authenticated";

GRANT INSERT ON TABLE public."customers" TO "service_role";

GRANT SELECT ON TABLE public."customers" TO "service_role";

GRANT UPDATE ON TABLE public."customers" TO "service_role";

GRANT DELETE ON TABLE public."customers" TO "service_role";

GRANT TRUNCATE ON TABLE public."customers" TO "service_role";

GRANT REFERENCES ON TABLE public."customers" TO "service_role";

GRANT TRIGGER ON TABLE public."customers" TO "service_role";

GRANT MAINTAIN ON TABLE public."customers" TO "service_role";

REVOKE ALL ON TABLE public."filter_events" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."filter_events" TO "anon";

GRANT SELECT ON TABLE public."filter_events" TO "anon";

GRANT UPDATE ON TABLE public."filter_events" TO "anon";

GRANT DELETE ON TABLE public."filter_events" TO "anon";

GRANT TRUNCATE ON TABLE public."filter_events" TO "anon";

GRANT REFERENCES ON TABLE public."filter_events" TO "anon";

GRANT TRIGGER ON TABLE public."filter_events" TO "anon";

GRANT MAINTAIN ON TABLE public."filter_events" TO "anon";

GRANT INSERT ON TABLE public."filter_events" TO "authenticated";

GRANT SELECT ON TABLE public."filter_events" TO "authenticated";

GRANT UPDATE ON TABLE public."filter_events" TO "authenticated";

GRANT DELETE ON TABLE public."filter_events" TO "authenticated";

GRANT TRUNCATE ON TABLE public."filter_events" TO "authenticated";

GRANT REFERENCES ON TABLE public."filter_events" TO "authenticated";

GRANT TRIGGER ON TABLE public."filter_events" TO "authenticated";

GRANT MAINTAIN ON TABLE public."filter_events" TO "authenticated";

GRANT INSERT ON TABLE public."filter_events" TO "service_role";

GRANT SELECT ON TABLE public."filter_events" TO "service_role";

GRANT UPDATE ON TABLE public."filter_events" TO "service_role";

GRANT DELETE ON TABLE public."filter_events" TO "service_role";

GRANT TRUNCATE ON TABLE public."filter_events" TO "service_role";

GRANT REFERENCES ON TABLE public."filter_events" TO "service_role";

GRANT TRIGGER ON TABLE public."filter_events" TO "service_role";

GRANT MAINTAIN ON TABLE public."filter_events" TO "service_role";

REVOKE ALL ON TABLE public."funnel_events" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."funnel_events" TO "anon";

GRANT SELECT ON TABLE public."funnel_events" TO "anon";

GRANT UPDATE ON TABLE public."funnel_events" TO "anon";

GRANT DELETE ON TABLE public."funnel_events" TO "anon";

GRANT TRUNCATE ON TABLE public."funnel_events" TO "anon";

GRANT REFERENCES ON TABLE public."funnel_events" TO "anon";

GRANT TRIGGER ON TABLE public."funnel_events" TO "anon";

GRANT MAINTAIN ON TABLE public."funnel_events" TO "anon";

GRANT INSERT ON TABLE public."funnel_events" TO "authenticated";

GRANT SELECT ON TABLE public."funnel_events" TO "authenticated";

GRANT UPDATE ON TABLE public."funnel_events" TO "authenticated";

GRANT DELETE ON TABLE public."funnel_events" TO "authenticated";

GRANT TRUNCATE ON TABLE public."funnel_events" TO "authenticated";

GRANT REFERENCES ON TABLE public."funnel_events" TO "authenticated";

GRANT TRIGGER ON TABLE public."funnel_events" TO "authenticated";

GRANT MAINTAIN ON TABLE public."funnel_events" TO "authenticated";

GRANT INSERT ON TABLE public."funnel_events" TO "service_role";

GRANT SELECT ON TABLE public."funnel_events" TO "service_role";

GRANT UPDATE ON TABLE public."funnel_events" TO "service_role";

GRANT DELETE ON TABLE public."funnel_events" TO "service_role";

GRANT TRUNCATE ON TABLE public."funnel_events" TO "service_role";

GRANT REFERENCES ON TABLE public."funnel_events" TO "service_role";

GRANT TRIGGER ON TABLE public."funnel_events" TO "service_role";

GRANT MAINTAIN ON TABLE public."funnel_events" TO "service_role";

REVOKE ALL ON TABLE public."homepage_sections" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."homepage_sections" TO "anon";

GRANT SELECT ON TABLE public."homepage_sections" TO "anon";

GRANT UPDATE ON TABLE public."homepage_sections" TO "anon";

GRANT DELETE ON TABLE public."homepage_sections" TO "anon";

GRANT TRUNCATE ON TABLE public."homepage_sections" TO "anon";

GRANT REFERENCES ON TABLE public."homepage_sections" TO "anon";

GRANT TRIGGER ON TABLE public."homepage_sections" TO "anon";

GRANT MAINTAIN ON TABLE public."homepage_sections" TO "anon";

GRANT INSERT ON TABLE public."homepage_sections" TO "authenticated";

GRANT SELECT ON TABLE public."homepage_sections" TO "authenticated";

GRANT UPDATE ON TABLE public."homepage_sections" TO "authenticated";

GRANT DELETE ON TABLE public."homepage_sections" TO "authenticated";

GRANT TRUNCATE ON TABLE public."homepage_sections" TO "authenticated";

GRANT REFERENCES ON TABLE public."homepage_sections" TO "authenticated";

GRANT TRIGGER ON TABLE public."homepage_sections" TO "authenticated";

GRANT MAINTAIN ON TABLE public."homepage_sections" TO "authenticated";

GRANT INSERT ON TABLE public."homepage_sections" TO "service_role";

GRANT SELECT ON TABLE public."homepage_sections" TO "service_role";

GRANT UPDATE ON TABLE public."homepage_sections" TO "service_role";

GRANT DELETE ON TABLE public."homepage_sections" TO "service_role";

GRANT TRUNCATE ON TABLE public."homepage_sections" TO "service_role";

GRANT REFERENCES ON TABLE public."homepage_sections" TO "service_role";

GRANT TRIGGER ON TABLE public."homepage_sections" TO "service_role";

GRANT MAINTAIN ON TABLE public."homepage_sections" TO "service_role";

REVOKE ALL ON TABLE public."media" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."media" TO "anon";

GRANT SELECT ON TABLE public."media" TO "anon";

GRANT UPDATE ON TABLE public."media" TO "anon";

GRANT DELETE ON TABLE public."media" TO "anon";

GRANT TRUNCATE ON TABLE public."media" TO "anon";

GRANT REFERENCES ON TABLE public."media" TO "anon";

GRANT TRIGGER ON TABLE public."media" TO "anon";

GRANT MAINTAIN ON TABLE public."media" TO "anon";

GRANT INSERT ON TABLE public."media" TO "authenticated";

GRANT SELECT ON TABLE public."media" TO "authenticated";

GRANT UPDATE ON TABLE public."media" TO "authenticated";

GRANT DELETE ON TABLE public."media" TO "authenticated";

GRANT TRUNCATE ON TABLE public."media" TO "authenticated";

GRANT REFERENCES ON TABLE public."media" TO "authenticated";

GRANT TRIGGER ON TABLE public."media" TO "authenticated";

GRANT MAINTAIN ON TABLE public."media" TO "authenticated";

GRANT INSERT ON TABLE public."media" TO "service_role";

GRANT SELECT ON TABLE public."media" TO "service_role";

GRANT UPDATE ON TABLE public."media" TO "service_role";

GRANT DELETE ON TABLE public."media" TO "service_role";

GRANT TRUNCATE ON TABLE public."media" TO "service_role";

GRANT REFERENCES ON TABLE public."media" TO "service_role";

GRANT TRIGGER ON TABLE public."media" TO "service_role";

GRANT MAINTAIN ON TABLE public."media" TO "service_role";

REVOKE ALL ON TABLE public."navigation_menus" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."navigation_menus" TO "service_role";

GRANT SELECT ON TABLE public."navigation_menus" TO "service_role";

GRANT UPDATE ON TABLE public."navigation_menus" TO "service_role";

GRANT DELETE ON TABLE public."navigation_menus" TO "service_role";

GRANT TRUNCATE ON TABLE public."navigation_menus" TO "service_role";

GRANT REFERENCES ON TABLE public."navigation_menus" TO "service_role";

GRANT TRIGGER ON TABLE public."navigation_menus" TO "service_role";

GRANT MAINTAIN ON TABLE public."navigation_menus" TO "service_role";

GRANT SELECT ON TABLE public."navigation_menus" TO "anon";

GRANT SELECT ON TABLE public."navigation_menus" TO "authenticated";

REVOKE ALL ON TABLE public."notification_outbox" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."notification_outbox" TO "anon";

GRANT SELECT ON TABLE public."notification_outbox" TO "anon";

GRANT UPDATE ON TABLE public."notification_outbox" TO "anon";

GRANT DELETE ON TABLE public."notification_outbox" TO "anon";

GRANT TRUNCATE ON TABLE public."notification_outbox" TO "anon";

GRANT REFERENCES ON TABLE public."notification_outbox" TO "anon";

GRANT TRIGGER ON TABLE public."notification_outbox" TO "anon";

GRANT MAINTAIN ON TABLE public."notification_outbox" TO "anon";

GRANT INSERT ON TABLE public."notification_outbox" TO "authenticated";

GRANT SELECT ON TABLE public."notification_outbox" TO "authenticated";

GRANT UPDATE ON TABLE public."notification_outbox" TO "authenticated";

GRANT DELETE ON TABLE public."notification_outbox" TO "authenticated";

GRANT TRUNCATE ON TABLE public."notification_outbox" TO "authenticated";

GRANT REFERENCES ON TABLE public."notification_outbox" TO "authenticated";

GRANT TRIGGER ON TABLE public."notification_outbox" TO "authenticated";

GRANT MAINTAIN ON TABLE public."notification_outbox" TO "authenticated";

GRANT INSERT ON TABLE public."notification_outbox" TO "service_role";

GRANT SELECT ON TABLE public."notification_outbox" TO "service_role";

GRANT UPDATE ON TABLE public."notification_outbox" TO "service_role";

GRANT DELETE ON TABLE public."notification_outbox" TO "service_role";

GRANT TRUNCATE ON TABLE public."notification_outbox" TO "service_role";

GRANT REFERENCES ON TABLE public."notification_outbox" TO "service_role";

GRANT TRIGGER ON TABLE public."notification_outbox" TO "service_role";

GRANT MAINTAIN ON TABLE public."notification_outbox" TO "service_role";

REVOKE ALL ON TABLE public."notification_templates" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."notification_templates" TO "anon";

GRANT SELECT ON TABLE public."notification_templates" TO "anon";

GRANT UPDATE ON TABLE public."notification_templates" TO "anon";

GRANT DELETE ON TABLE public."notification_templates" TO "anon";

GRANT TRUNCATE ON TABLE public."notification_templates" TO "anon";

GRANT REFERENCES ON TABLE public."notification_templates" TO "anon";

GRANT TRIGGER ON TABLE public."notification_templates" TO "anon";

GRANT MAINTAIN ON TABLE public."notification_templates" TO "anon";

GRANT INSERT ON TABLE public."notification_templates" TO "authenticated";

GRANT SELECT ON TABLE public."notification_templates" TO "authenticated";

GRANT UPDATE ON TABLE public."notification_templates" TO "authenticated";

GRANT DELETE ON TABLE public."notification_templates" TO "authenticated";

GRANT TRUNCATE ON TABLE public."notification_templates" TO "authenticated";

GRANT REFERENCES ON TABLE public."notification_templates" TO "authenticated";

GRANT TRIGGER ON TABLE public."notification_templates" TO "authenticated";

GRANT MAINTAIN ON TABLE public."notification_templates" TO "authenticated";

GRANT INSERT ON TABLE public."notification_templates" TO "service_role";

GRANT SELECT ON TABLE public."notification_templates" TO "service_role";

GRANT UPDATE ON TABLE public."notification_templates" TO "service_role";

GRANT DELETE ON TABLE public."notification_templates" TO "service_role";

GRANT TRUNCATE ON TABLE public."notification_templates" TO "service_role";

GRANT REFERENCES ON TABLE public."notification_templates" TO "service_role";

GRANT TRIGGER ON TABLE public."notification_templates" TO "service_role";

GRANT MAINTAIN ON TABLE public."notification_templates" TO "service_role";

REVOKE ALL ON TABLE public."order_items" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."order_items" TO "anon";

GRANT SELECT ON TABLE public."order_items" TO "anon";

GRANT UPDATE ON TABLE public."order_items" TO "anon";

GRANT DELETE ON TABLE public."order_items" TO "anon";

GRANT TRUNCATE ON TABLE public."order_items" TO "anon";

GRANT REFERENCES ON TABLE public."order_items" TO "anon";

GRANT TRIGGER ON TABLE public."order_items" TO "anon";

GRANT MAINTAIN ON TABLE public."order_items" TO "anon";

GRANT INSERT ON TABLE public."order_items" TO "authenticated";

GRANT SELECT ON TABLE public."order_items" TO "authenticated";

GRANT UPDATE ON TABLE public."order_items" TO "authenticated";

GRANT DELETE ON TABLE public."order_items" TO "authenticated";

GRANT TRUNCATE ON TABLE public."order_items" TO "authenticated";

GRANT REFERENCES ON TABLE public."order_items" TO "authenticated";

GRANT TRIGGER ON TABLE public."order_items" TO "authenticated";

GRANT MAINTAIN ON TABLE public."order_items" TO "authenticated";

GRANT INSERT ON TABLE public."order_items" TO "service_role";

GRANT SELECT ON TABLE public."order_items" TO "service_role";

GRANT UPDATE ON TABLE public."order_items" TO "service_role";

GRANT DELETE ON TABLE public."order_items" TO "service_role";

GRANT TRUNCATE ON TABLE public."order_items" TO "service_role";

GRANT REFERENCES ON TABLE public."order_items" TO "service_role";

GRANT TRIGGER ON TABLE public."order_items" TO "service_role";

GRANT MAINTAIN ON TABLE public."order_items" TO "service_role";

REVOKE ALL ON TABLE public."order_status_events" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."order_status_events" TO "anon";

GRANT SELECT ON TABLE public."order_status_events" TO "anon";

GRANT UPDATE ON TABLE public."order_status_events" TO "anon";

GRANT DELETE ON TABLE public."order_status_events" TO "anon";

GRANT TRUNCATE ON TABLE public."order_status_events" TO "anon";

GRANT REFERENCES ON TABLE public."order_status_events" TO "anon";

GRANT TRIGGER ON TABLE public."order_status_events" TO "anon";

GRANT MAINTAIN ON TABLE public."order_status_events" TO "anon";

GRANT INSERT ON TABLE public."order_status_events" TO "authenticated";

GRANT SELECT ON TABLE public."order_status_events" TO "authenticated";

GRANT UPDATE ON TABLE public."order_status_events" TO "authenticated";

GRANT DELETE ON TABLE public."order_status_events" TO "authenticated";

GRANT TRUNCATE ON TABLE public."order_status_events" TO "authenticated";

GRANT REFERENCES ON TABLE public."order_status_events" TO "authenticated";

GRANT TRIGGER ON TABLE public."order_status_events" TO "authenticated";

GRANT MAINTAIN ON TABLE public."order_status_events" TO "authenticated";

GRANT INSERT ON TABLE public."order_status_events" TO "service_role";

GRANT SELECT ON TABLE public."order_status_events" TO "service_role";

GRANT UPDATE ON TABLE public."order_status_events" TO "service_role";

GRANT DELETE ON TABLE public."order_status_events" TO "service_role";

GRANT TRUNCATE ON TABLE public."order_status_events" TO "service_role";

GRANT REFERENCES ON TABLE public."order_status_events" TO "service_role";

GRANT TRIGGER ON TABLE public."order_status_events" TO "service_role";

GRANT MAINTAIN ON TABLE public."order_status_events" TO "service_role";

REVOKE ALL ON TABLE public."orders" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON TABLE public."orders" TO "anon";

GRANT MAINTAIN ON TABLE public."orders" TO "anon";

GRANT SELECT ON TABLE public."orders" TO "authenticated";

GRANT MAINTAIN ON TABLE public."orders" TO "authenticated";

GRANT INSERT ON TABLE public."orders" TO "service_role";

GRANT SELECT ON TABLE public."orders" TO "service_role";

GRANT UPDATE ON TABLE public."orders" TO "service_role";

GRANT DELETE ON TABLE public."orders" TO "service_role";

GRANT TRUNCATE ON TABLE public."orders" TO "service_role";

GRANT REFERENCES ON TABLE public."orders" TO "service_role";

GRANT TRIGGER ON TABLE public."orders" TO "service_role";

GRANT MAINTAIN ON TABLE public."orders" TO "service_role";

REVOKE ALL ON TABLE public."products" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."products" TO "anon";

GRANT SELECT ON TABLE public."products" TO "anon";

GRANT UPDATE ON TABLE public."products" TO "anon";

GRANT DELETE ON TABLE public."products" TO "anon";

GRANT TRUNCATE ON TABLE public."products" TO "anon";

GRANT REFERENCES ON TABLE public."products" TO "anon";

GRANT TRIGGER ON TABLE public."products" TO "anon";

GRANT MAINTAIN ON TABLE public."products" TO "anon";

GRANT INSERT ON TABLE public."products" TO "authenticated";

GRANT SELECT ON TABLE public."products" TO "authenticated";

GRANT UPDATE ON TABLE public."products" TO "authenticated";

GRANT DELETE ON TABLE public."products" TO "authenticated";

GRANT TRUNCATE ON TABLE public."products" TO "authenticated";

GRANT REFERENCES ON TABLE public."products" TO "authenticated";

GRANT TRIGGER ON TABLE public."products" TO "authenticated";

GRANT MAINTAIN ON TABLE public."products" TO "authenticated";

GRANT INSERT ON TABLE public."products" TO "service_role";

GRANT SELECT ON TABLE public."products" TO "service_role";

GRANT UPDATE ON TABLE public."products" TO "service_role";

GRANT DELETE ON TABLE public."products" TO "service_role";

GRANT TRUNCATE ON TABLE public."products" TO "service_role";

GRANT REFERENCES ON TABLE public."products" TO "service_role";

GRANT TRIGGER ON TABLE public."products" TO "service_role";

GRANT MAINTAIN ON TABLE public."products" TO "service_role";

REVOKE ALL ON TABLE public."profiles" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."profiles" TO "anon";

GRANT SELECT ON TABLE public."profiles" TO "anon";

GRANT UPDATE ON TABLE public."profiles" TO "anon";

GRANT DELETE ON TABLE public."profiles" TO "anon";

GRANT TRUNCATE ON TABLE public."profiles" TO "anon";

GRANT REFERENCES ON TABLE public."profiles" TO "anon";

GRANT TRIGGER ON TABLE public."profiles" TO "anon";

GRANT MAINTAIN ON TABLE public."profiles" TO "anon";

GRANT INSERT ON TABLE public."profiles" TO "authenticated";

GRANT SELECT ON TABLE public."profiles" TO "authenticated";

GRANT UPDATE ON TABLE public."profiles" TO "authenticated";

GRANT DELETE ON TABLE public."profiles" TO "authenticated";

GRANT TRUNCATE ON TABLE public."profiles" TO "authenticated";

GRANT REFERENCES ON TABLE public."profiles" TO "authenticated";

GRANT TRIGGER ON TABLE public."profiles" TO "authenticated";

GRANT MAINTAIN ON TABLE public."profiles" TO "authenticated";

GRANT INSERT ON TABLE public."profiles" TO "service_role";

GRANT SELECT ON TABLE public."profiles" TO "service_role";

GRANT UPDATE ON TABLE public."profiles" TO "service_role";

GRANT DELETE ON TABLE public."profiles" TO "service_role";

GRANT TRUNCATE ON TABLE public."profiles" TO "service_role";

GRANT REFERENCES ON TABLE public."profiles" TO "service_role";

GRANT TRIGGER ON TABLE public."profiles" TO "service_role";

GRANT MAINTAIN ON TABLE public."profiles" TO "service_role";

REVOKE ALL ON TABLE public."resolution_cases" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."resolution_cases" TO "anon";

GRANT SELECT ON TABLE public."resolution_cases" TO "anon";

GRANT UPDATE ON TABLE public."resolution_cases" TO "anon";

GRANT DELETE ON TABLE public."resolution_cases" TO "anon";

GRANT TRUNCATE ON TABLE public."resolution_cases" TO "anon";

GRANT REFERENCES ON TABLE public."resolution_cases" TO "anon";

GRANT TRIGGER ON TABLE public."resolution_cases" TO "anon";

GRANT MAINTAIN ON TABLE public."resolution_cases" TO "anon";

GRANT INSERT ON TABLE public."resolution_cases" TO "authenticated";

GRANT SELECT ON TABLE public."resolution_cases" TO "authenticated";

GRANT UPDATE ON TABLE public."resolution_cases" TO "authenticated";

GRANT DELETE ON TABLE public."resolution_cases" TO "authenticated";

GRANT TRUNCATE ON TABLE public."resolution_cases" TO "authenticated";

GRANT REFERENCES ON TABLE public."resolution_cases" TO "authenticated";

GRANT TRIGGER ON TABLE public."resolution_cases" TO "authenticated";

GRANT MAINTAIN ON TABLE public."resolution_cases" TO "authenticated";

GRANT INSERT ON TABLE public."resolution_cases" TO "service_role";

GRANT SELECT ON TABLE public."resolution_cases" TO "service_role";

GRANT UPDATE ON TABLE public."resolution_cases" TO "service_role";

GRANT DELETE ON TABLE public."resolution_cases" TO "service_role";

GRANT TRUNCATE ON TABLE public."resolution_cases" TO "service_role";

GRANT REFERENCES ON TABLE public."resolution_cases" TO "service_role";

GRANT TRIGGER ON TABLE public."resolution_cases" TO "service_role";

GRANT MAINTAIN ON TABLE public."resolution_cases" TO "service_role";

REVOKE ALL ON TABLE public."reviews" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON TABLE public."reviews" TO "anon";

GRANT MAINTAIN ON TABLE public."reviews" TO "anon";

GRANT SELECT ON TABLE public."reviews" TO "authenticated";

GRANT MAINTAIN ON TABLE public."reviews" TO "authenticated";

GRANT INSERT ON TABLE public."reviews" TO "service_role";

GRANT SELECT ON TABLE public."reviews" TO "service_role";

GRANT UPDATE ON TABLE public."reviews" TO "service_role";

GRANT DELETE ON TABLE public."reviews" TO "service_role";

GRANT TRUNCATE ON TABLE public."reviews" TO "service_role";

GRANT REFERENCES ON TABLE public."reviews" TO "service_role";

GRANT TRIGGER ON TABLE public."reviews" TO "service_role";

GRANT MAINTAIN ON TABLE public."reviews" TO "service_role";

REVOKE ALL ON TABLE public."search_logs" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."search_logs" TO "anon";

GRANT SELECT ON TABLE public."search_logs" TO "anon";

GRANT UPDATE ON TABLE public."search_logs" TO "anon";

GRANT DELETE ON TABLE public."search_logs" TO "anon";

GRANT TRUNCATE ON TABLE public."search_logs" TO "anon";

GRANT REFERENCES ON TABLE public."search_logs" TO "anon";

GRANT TRIGGER ON TABLE public."search_logs" TO "anon";

GRANT MAINTAIN ON TABLE public."search_logs" TO "anon";

GRANT INSERT ON TABLE public."search_logs" TO "authenticated";

GRANT SELECT ON TABLE public."search_logs" TO "authenticated";

GRANT UPDATE ON TABLE public."search_logs" TO "authenticated";

GRANT DELETE ON TABLE public."search_logs" TO "authenticated";

GRANT TRUNCATE ON TABLE public."search_logs" TO "authenticated";

GRANT REFERENCES ON TABLE public."search_logs" TO "authenticated";

GRANT TRIGGER ON TABLE public."search_logs" TO "authenticated";

GRANT MAINTAIN ON TABLE public."search_logs" TO "authenticated";

GRANT INSERT ON TABLE public."search_logs" TO "service_role";

GRANT SELECT ON TABLE public."search_logs" TO "service_role";

GRANT UPDATE ON TABLE public."search_logs" TO "service_role";

GRANT DELETE ON TABLE public."search_logs" TO "service_role";

GRANT TRUNCATE ON TABLE public."search_logs" TO "service_role";

GRANT REFERENCES ON TABLE public."search_logs" TO "service_role";

GRANT TRIGGER ON TABLE public."search_logs" TO "service_role";

GRANT MAINTAIN ON TABLE public."search_logs" TO "service_role";

REVOKE ALL ON TABLE public."shipping_zones" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."shipping_zones" TO "anon";

GRANT SELECT ON TABLE public."shipping_zones" TO "anon";

GRANT UPDATE ON TABLE public."shipping_zones" TO "anon";

GRANT DELETE ON TABLE public."shipping_zones" TO "anon";

GRANT TRUNCATE ON TABLE public."shipping_zones" TO "anon";

GRANT REFERENCES ON TABLE public."shipping_zones" TO "anon";

GRANT TRIGGER ON TABLE public."shipping_zones" TO "anon";

GRANT MAINTAIN ON TABLE public."shipping_zones" TO "anon";

GRANT INSERT ON TABLE public."shipping_zones" TO "authenticated";

GRANT SELECT ON TABLE public."shipping_zones" TO "authenticated";

GRANT UPDATE ON TABLE public."shipping_zones" TO "authenticated";

GRANT DELETE ON TABLE public."shipping_zones" TO "authenticated";

GRANT TRUNCATE ON TABLE public."shipping_zones" TO "authenticated";

GRANT REFERENCES ON TABLE public."shipping_zones" TO "authenticated";

GRANT TRIGGER ON TABLE public."shipping_zones" TO "authenticated";

GRANT MAINTAIN ON TABLE public."shipping_zones" TO "authenticated";

GRANT INSERT ON TABLE public."shipping_zones" TO "service_role";

GRANT SELECT ON TABLE public."shipping_zones" TO "service_role";

GRANT UPDATE ON TABLE public."shipping_zones" TO "service_role";

GRANT DELETE ON TABLE public."shipping_zones" TO "service_role";

GRANT TRUNCATE ON TABLE public."shipping_zones" TO "service_role";

GRANT REFERENCES ON TABLE public."shipping_zones" TO "service_role";

GRANT TRIGGER ON TABLE public."shipping_zones" TO "service_role";

GRANT MAINTAIN ON TABLE public."shipping_zones" TO "service_role";

REVOKE ALL ON TABLE public."site_settings" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."site_settings" TO "anon";

GRANT SELECT ON TABLE public."site_settings" TO "anon";

GRANT UPDATE ON TABLE public."site_settings" TO "anon";

GRANT DELETE ON TABLE public."site_settings" TO "anon";

GRANT TRUNCATE ON TABLE public."site_settings" TO "anon";

GRANT REFERENCES ON TABLE public."site_settings" TO "anon";

GRANT TRIGGER ON TABLE public."site_settings" TO "anon";

GRANT MAINTAIN ON TABLE public."site_settings" TO "anon";

GRANT INSERT ON TABLE public."site_settings" TO "authenticated";

GRANT SELECT ON TABLE public."site_settings" TO "authenticated";

GRANT UPDATE ON TABLE public."site_settings" TO "authenticated";

GRANT DELETE ON TABLE public."site_settings" TO "authenticated";

GRANT TRUNCATE ON TABLE public."site_settings" TO "authenticated";

GRANT REFERENCES ON TABLE public."site_settings" TO "authenticated";

GRANT TRIGGER ON TABLE public."site_settings" TO "authenticated";

GRANT MAINTAIN ON TABLE public."site_settings" TO "authenticated";

GRANT INSERT ON TABLE public."site_settings" TO "service_role";

GRANT SELECT ON TABLE public."site_settings" TO "service_role";

GRANT UPDATE ON TABLE public."site_settings" TO "service_role";

GRANT DELETE ON TABLE public."site_settings" TO "service_role";

GRANT TRUNCATE ON TABLE public."site_settings" TO "service_role";

GRANT REFERENCES ON TABLE public."site_settings" TO "service_role";

GRANT TRIGGER ON TABLE public."site_settings" TO "service_role";

GRANT MAINTAIN ON TABLE public."site_settings" TO "service_role";

REVOKE ALL ON TABLE public."store_settings" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."store_settings" TO "service_role";

GRANT SELECT ON TABLE public."store_settings" TO "service_role";

GRANT UPDATE ON TABLE public."store_settings" TO "service_role";

GRANT DELETE ON TABLE public."store_settings" TO "service_role";

GRANT TRUNCATE ON TABLE public."store_settings" TO "service_role";

GRANT REFERENCES ON TABLE public."store_settings" TO "service_role";

GRANT TRIGGER ON TABLE public."store_settings" TO "service_role";

GRANT MAINTAIN ON TABLE public."store_settings" TO "service_role";

REVOKE ALL ON TABLE public."theme_settings" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."theme_settings" TO "anon";

GRANT SELECT ON TABLE public."theme_settings" TO "anon";

GRANT UPDATE ON TABLE public."theme_settings" TO "anon";

GRANT DELETE ON TABLE public."theme_settings" TO "anon";

GRANT TRUNCATE ON TABLE public."theme_settings" TO "anon";

GRANT REFERENCES ON TABLE public."theme_settings" TO "anon";

GRANT TRIGGER ON TABLE public."theme_settings" TO "anon";

GRANT MAINTAIN ON TABLE public."theme_settings" TO "anon";

GRANT INSERT ON TABLE public."theme_settings" TO "authenticated";

GRANT SELECT ON TABLE public."theme_settings" TO "authenticated";

GRANT UPDATE ON TABLE public."theme_settings" TO "authenticated";

GRANT DELETE ON TABLE public."theme_settings" TO "authenticated";

GRANT TRUNCATE ON TABLE public."theme_settings" TO "authenticated";

GRANT REFERENCES ON TABLE public."theme_settings" TO "authenticated";

GRANT TRIGGER ON TABLE public."theme_settings" TO "authenticated";

GRANT MAINTAIN ON TABLE public."theme_settings" TO "authenticated";

GRANT INSERT ON TABLE public."theme_settings" TO "service_role";

GRANT SELECT ON TABLE public."theme_settings" TO "service_role";

GRANT UPDATE ON TABLE public."theme_settings" TO "service_role";

GRANT DELETE ON TABLE public."theme_settings" TO "service_role";

GRANT TRUNCATE ON TABLE public."theme_settings" TO "service_role";

GRANT REFERENCES ON TABLE public."theme_settings" TO "service_role";

GRANT TRIGGER ON TABLE public."theme_settings" TO "service_role";

GRANT MAINTAIN ON TABLE public."theme_settings" TO "service_role";

REVOKE ALL ON TABLE public."wishlist_events" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."wishlist_events" TO "anon";

GRANT SELECT ON TABLE public."wishlist_events" TO "anon";

GRANT UPDATE ON TABLE public."wishlist_events" TO "anon";

GRANT DELETE ON TABLE public."wishlist_events" TO "anon";

GRANT TRUNCATE ON TABLE public."wishlist_events" TO "anon";

GRANT REFERENCES ON TABLE public."wishlist_events" TO "anon";

GRANT TRIGGER ON TABLE public."wishlist_events" TO "anon";

GRANT MAINTAIN ON TABLE public."wishlist_events" TO "anon";

GRANT INSERT ON TABLE public."wishlist_events" TO "authenticated";

GRANT SELECT ON TABLE public."wishlist_events" TO "authenticated";

GRANT UPDATE ON TABLE public."wishlist_events" TO "authenticated";

GRANT DELETE ON TABLE public."wishlist_events" TO "authenticated";

GRANT TRUNCATE ON TABLE public."wishlist_events" TO "authenticated";

GRANT REFERENCES ON TABLE public."wishlist_events" TO "authenticated";

GRANT TRIGGER ON TABLE public."wishlist_events" TO "authenticated";

GRANT MAINTAIN ON TABLE public."wishlist_events" TO "authenticated";

GRANT INSERT ON TABLE public."wishlist_events" TO "service_role";

GRANT SELECT ON TABLE public."wishlist_events" TO "service_role";

GRANT UPDATE ON TABLE public."wishlist_events" TO "service_role";

GRANT DELETE ON TABLE public."wishlist_events" TO "service_role";

GRANT TRUNCATE ON TABLE public."wishlist_events" TO "service_role";

GRANT REFERENCES ON TABLE public."wishlist_events" TO "service_role";

GRANT TRIGGER ON TABLE public."wishlist_events" TO "service_role";

GRANT MAINTAIN ON TABLE public."wishlist_events" TO "service_role";

REVOKE ALL ON TABLE public."wishlists" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."wishlists" TO "anon";

GRANT SELECT ON TABLE public."wishlists" TO "anon";

GRANT UPDATE ON TABLE public."wishlists" TO "anon";

GRANT DELETE ON TABLE public."wishlists" TO "anon";

GRANT TRUNCATE ON TABLE public."wishlists" TO "anon";

GRANT REFERENCES ON TABLE public."wishlists" TO "anon";

GRANT TRIGGER ON TABLE public."wishlists" TO "anon";

GRANT MAINTAIN ON TABLE public."wishlists" TO "anon";

GRANT INSERT ON TABLE public."wishlists" TO "authenticated";

GRANT SELECT ON TABLE public."wishlists" TO "authenticated";

GRANT UPDATE ON TABLE public."wishlists" TO "authenticated";

GRANT DELETE ON TABLE public."wishlists" TO "authenticated";

GRANT TRUNCATE ON TABLE public."wishlists" TO "authenticated";

GRANT REFERENCES ON TABLE public."wishlists" TO "authenticated";

GRANT TRIGGER ON TABLE public."wishlists" TO "authenticated";

GRANT MAINTAIN ON TABLE public."wishlists" TO "authenticated";

GRANT INSERT ON TABLE public."wishlists" TO "service_role";

GRANT SELECT ON TABLE public."wishlists" TO "service_role";

GRANT UPDATE ON TABLE public."wishlists" TO "service_role";

GRANT DELETE ON TABLE public."wishlists" TO "service_role";

GRANT TRUNCATE ON TABLE public."wishlists" TO "service_role";

GRANT REFERENCES ON TABLE public."wishlists" TO "service_role";

GRANT TRIGGER ON TABLE public."wishlists" TO "service_role";

GRANT MAINTAIN ON TABLE public."wishlists" TO "service_role";

REVOKE ALL ON TABLE public."public_site_settings" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."public_site_settings" TO "anon";

GRANT SELECT ON TABLE public."public_site_settings" TO "anon";

GRANT UPDATE ON TABLE public."public_site_settings" TO "anon";

GRANT DELETE ON TABLE public."public_site_settings" TO "anon";

GRANT TRUNCATE ON TABLE public."public_site_settings" TO "anon";

GRANT REFERENCES ON TABLE public."public_site_settings" TO "anon";

GRANT TRIGGER ON TABLE public."public_site_settings" TO "anon";

GRANT MAINTAIN ON TABLE public."public_site_settings" TO "anon";

GRANT INSERT ON TABLE public."public_site_settings" TO "authenticated";

GRANT SELECT ON TABLE public."public_site_settings" TO "authenticated";

GRANT UPDATE ON TABLE public."public_site_settings" TO "authenticated";

GRANT DELETE ON TABLE public."public_site_settings" TO "authenticated";

GRANT TRUNCATE ON TABLE public."public_site_settings" TO "authenticated";

GRANT REFERENCES ON TABLE public."public_site_settings" TO "authenticated";

GRANT TRIGGER ON TABLE public."public_site_settings" TO "authenticated";

GRANT MAINTAIN ON TABLE public."public_site_settings" TO "authenticated";

GRANT INSERT ON TABLE public."public_site_settings" TO "service_role";

GRANT SELECT ON TABLE public."public_site_settings" TO "service_role";

GRANT UPDATE ON TABLE public."public_site_settings" TO "service_role";

GRANT DELETE ON TABLE public."public_site_settings" TO "service_role";

GRANT TRUNCATE ON TABLE public."public_site_settings" TO "service_role";

GRANT REFERENCES ON TABLE public."public_site_settings" TO "service_role";

GRANT TRIGGER ON TABLE public."public_site_settings" TO "service_role";

GRANT MAINTAIN ON TABLE public."public_site_settings" TO "service_role";

REVOKE ALL ON TABLE public."public_products" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."public_products" TO "anon";

GRANT SELECT ON TABLE public."public_products" TO "anon";

GRANT UPDATE ON TABLE public."public_products" TO "anon";

GRANT DELETE ON TABLE public."public_products" TO "anon";

GRANT TRUNCATE ON TABLE public."public_products" TO "anon";

GRANT REFERENCES ON TABLE public."public_products" TO "anon";

GRANT TRIGGER ON TABLE public."public_products" TO "anon";

GRANT MAINTAIN ON TABLE public."public_products" TO "anon";

GRANT INSERT ON TABLE public."public_products" TO "authenticated";

GRANT SELECT ON TABLE public."public_products" TO "authenticated";

GRANT UPDATE ON TABLE public."public_products" TO "authenticated";

GRANT DELETE ON TABLE public."public_products" TO "authenticated";

GRANT TRUNCATE ON TABLE public."public_products" TO "authenticated";

GRANT REFERENCES ON TABLE public."public_products" TO "authenticated";

GRANT TRIGGER ON TABLE public."public_products" TO "authenticated";

GRANT MAINTAIN ON TABLE public."public_products" TO "authenticated";

GRANT INSERT ON TABLE public."public_products" TO "service_role";

GRANT SELECT ON TABLE public."public_products" TO "service_role";

GRANT UPDATE ON TABLE public."public_products" TO "service_role";

GRANT DELETE ON TABLE public."public_products" TO "service_role";

GRANT TRUNCATE ON TABLE public."public_products" TO "service_role";

GRANT REFERENCES ON TABLE public."public_products" TO "service_role";

GRANT TRIGGER ON TABLE public."public_products" TO "service_role";

GRANT MAINTAIN ON TABLE public."public_products" TO "service_role";

REVOKE ALL ON TABLE public."public_homepage_sections" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."public_homepage_sections" TO "anon";

GRANT SELECT ON TABLE public."public_homepage_sections" TO "anon";

GRANT UPDATE ON TABLE public."public_homepage_sections" TO "anon";

GRANT DELETE ON TABLE public."public_homepage_sections" TO "anon";

GRANT TRUNCATE ON TABLE public."public_homepage_sections" TO "anon";

GRANT REFERENCES ON TABLE public."public_homepage_sections" TO "anon";

GRANT TRIGGER ON TABLE public."public_homepage_sections" TO "anon";

GRANT MAINTAIN ON TABLE public."public_homepage_sections" TO "anon";

GRANT INSERT ON TABLE public."public_homepage_sections" TO "authenticated";

GRANT SELECT ON TABLE public."public_homepage_sections" TO "authenticated";

GRANT UPDATE ON TABLE public."public_homepage_sections" TO "authenticated";

GRANT DELETE ON TABLE public."public_homepage_sections" TO "authenticated";

GRANT TRUNCATE ON TABLE public."public_homepage_sections" TO "authenticated";

GRANT REFERENCES ON TABLE public."public_homepage_sections" TO "authenticated";

GRANT TRIGGER ON TABLE public."public_homepage_sections" TO "authenticated";

GRANT MAINTAIN ON TABLE public."public_homepage_sections" TO "authenticated";

GRANT INSERT ON TABLE public."public_homepage_sections" TO "service_role";

GRANT SELECT ON TABLE public."public_homepage_sections" TO "service_role";

GRANT UPDATE ON TABLE public."public_homepage_sections" TO "service_role";

GRANT DELETE ON TABLE public."public_homepage_sections" TO "service_role";

GRANT TRUNCATE ON TABLE public."public_homepage_sections" TO "service_role";

GRANT REFERENCES ON TABLE public."public_homepage_sections" TO "service_role";

GRANT TRIGGER ON TABLE public."public_homepage_sections" TO "service_role";

GRANT MAINTAIN ON TABLE public."public_homepage_sections" TO "service_role";

REVOKE ALL ON TABLE public."public_reviews" FROM PUBLIC,anon,authenticated,service_role;

GRANT INSERT ON TABLE public."public_reviews" TO "anon";

GRANT SELECT ON TABLE public."public_reviews" TO "anon";

GRANT UPDATE ON TABLE public."public_reviews" TO "anon";

GRANT DELETE ON TABLE public."public_reviews" TO "anon";

GRANT TRUNCATE ON TABLE public."public_reviews" TO "anon";

GRANT REFERENCES ON TABLE public."public_reviews" TO "anon";

GRANT TRIGGER ON TABLE public."public_reviews" TO "anon";

GRANT MAINTAIN ON TABLE public."public_reviews" TO "anon";

GRANT INSERT ON TABLE public."public_reviews" TO "authenticated";

GRANT SELECT ON TABLE public."public_reviews" TO "authenticated";

GRANT UPDATE ON TABLE public."public_reviews" TO "authenticated";

GRANT DELETE ON TABLE public."public_reviews" TO "authenticated";

GRANT TRUNCATE ON TABLE public."public_reviews" TO "authenticated";

GRANT REFERENCES ON TABLE public."public_reviews" TO "authenticated";

GRANT TRIGGER ON TABLE public."public_reviews" TO "authenticated";

GRANT MAINTAIN ON TABLE public."public_reviews" TO "authenticated";

GRANT INSERT ON TABLE public."public_reviews" TO "service_role";

GRANT SELECT ON TABLE public."public_reviews" TO "service_role";

GRANT UPDATE ON TABLE public."public_reviews" TO "service_role";

GRANT DELETE ON TABLE public."public_reviews" TO "service_role";

GRANT TRUNCATE ON TABLE public."public_reviews" TO "service_role";

GRANT REFERENCES ON TABLE public."public_reviews" TO "service_role";

GRANT TRIGGER ON TABLE public."public_reviews" TO "service_role";

GRANT MAINTAIN ON TABLE public."public_reviews" TO "service_role";

REVOKE ALL ON SEQUENCE public."ai_usage_id_seq" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON SEQUENCE public."ai_usage_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE public."ai_usage_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE public."ai_usage_id_seq" TO "anon";

GRANT SELECT ON SEQUENCE public."ai_usage_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE public."ai_usage_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE public."ai_usage_id_seq" TO "authenticated";

GRANT SELECT ON SEQUENCE public."ai_usage_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE public."ai_usage_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE public."ai_usage_id_seq" TO "service_role";

REVOKE ALL ON SEQUENCE public."audit_log_id_seq" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON SEQUENCE public."audit_log_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE public."audit_log_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE public."audit_log_id_seq" TO "anon";

GRANT SELECT ON SEQUENCE public."audit_log_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE public."audit_log_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE public."audit_log_id_seq" TO "authenticated";

GRANT SELECT ON SEQUENCE public."audit_log_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE public."audit_log_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE public."audit_log_id_seq" TO "service_role";

REVOKE ALL ON SEQUENCE public."box_events_id_seq" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON SEQUENCE public."box_events_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE public."box_events_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE public."box_events_id_seq" TO "anon";

GRANT SELECT ON SEQUENCE public."box_events_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE public."box_events_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE public."box_events_id_seq" TO "authenticated";

GRANT SELECT ON SEQUENCE public."box_events_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE public."box_events_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE public."box_events_id_seq" TO "service_role";

REVOKE ALL ON SEQUENCE public."brands_id_seq" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON SEQUENCE public."brands_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE public."brands_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE public."brands_id_seq" TO "anon";

GRANT SELECT ON SEQUENCE public."brands_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE public."brands_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE public."brands_id_seq" TO "authenticated";

GRANT SELECT ON SEQUENCE public."brands_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE public."brands_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE public."brands_id_seq" TO "service_role";

REVOKE ALL ON SEQUENCE public."coupons_id_seq" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON SEQUENCE public."coupons_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE public."coupons_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE public."coupons_id_seq" TO "anon";

GRANT SELECT ON SEQUENCE public."coupons_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE public."coupons_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE public."coupons_id_seq" TO "authenticated";

GRANT SELECT ON SEQUENCE public."coupons_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE public."coupons_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE public."coupons_id_seq" TO "service_role";

REVOKE ALL ON SEQUENCE public."customer_notification_outbox_id_seq" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON SEQUENCE public."customer_notification_outbox_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE public."customer_notification_outbox_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE public."customer_notification_outbox_id_seq" TO "anon";

GRANT SELECT ON SEQUENCE public."customer_notification_outbox_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE public."customer_notification_outbox_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE public."customer_notification_outbox_id_seq" TO "authenticated";

GRANT SELECT ON SEQUENCE public."customer_notification_outbox_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE public."customer_notification_outbox_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE public."customer_notification_outbox_id_seq" TO "service_role";

REVOKE ALL ON SEQUENCE public."filter_events_id_seq" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON SEQUENCE public."filter_events_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE public."filter_events_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE public."filter_events_id_seq" TO "anon";

GRANT SELECT ON SEQUENCE public."filter_events_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE public."filter_events_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE public."filter_events_id_seq" TO "authenticated";

GRANT SELECT ON SEQUENCE public."filter_events_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE public."filter_events_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE public."filter_events_id_seq" TO "service_role";

REVOKE ALL ON SEQUENCE public."funnel_events_id_seq" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON SEQUENCE public."funnel_events_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE public."funnel_events_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE public."funnel_events_id_seq" TO "anon";

GRANT SELECT ON SEQUENCE public."funnel_events_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE public."funnel_events_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE public."funnel_events_id_seq" TO "authenticated";

GRANT SELECT ON SEQUENCE public."funnel_events_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE public."funnel_events_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE public."funnel_events_id_seq" TO "service_role";

REVOKE ALL ON SEQUENCE public."notification_outbox_id_seq" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON SEQUENCE public."notification_outbox_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE public."notification_outbox_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE public."notification_outbox_id_seq" TO "anon";

GRANT SELECT ON SEQUENCE public."notification_outbox_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE public."notification_outbox_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE public."notification_outbox_id_seq" TO "authenticated";

GRANT SELECT ON SEQUENCE public."notification_outbox_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE public."notification_outbox_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE public."notification_outbox_id_seq" TO "service_role";

REVOKE ALL ON SEQUENCE public."notification_templates_id_seq" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON SEQUENCE public."notification_templates_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE public."notification_templates_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE public."notification_templates_id_seq" TO "anon";

GRANT SELECT ON SEQUENCE public."notification_templates_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE public."notification_templates_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE public."notification_templates_id_seq" TO "authenticated";

GRANT SELECT ON SEQUENCE public."notification_templates_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE public."notification_templates_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE public."notification_templates_id_seq" TO "service_role";

REVOKE ALL ON SEQUENCE public."order_items_id_seq" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON SEQUENCE public."order_items_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE public."order_items_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE public."order_items_id_seq" TO "anon";

GRANT SELECT ON SEQUENCE public."order_items_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE public."order_items_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE public."order_items_id_seq" TO "authenticated";

GRANT SELECT ON SEQUENCE public."order_items_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE public."order_items_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE public."order_items_id_seq" TO "service_role";

REVOKE ALL ON SEQUENCE public."order_status_events_id_seq" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON SEQUENCE public."order_status_events_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE public."order_status_events_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE public."order_status_events_id_seq" TO "anon";

GRANT SELECT ON SEQUENCE public."order_status_events_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE public."order_status_events_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE public."order_status_events_id_seq" TO "authenticated";

GRANT SELECT ON SEQUENCE public."order_status_events_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE public."order_status_events_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE public."order_status_events_id_seq" TO "service_role";

REVOKE ALL ON SEQUENCE public."products_id_seq" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON SEQUENCE public."products_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE public."products_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE public."products_id_seq" TO "authenticated";

GRANT SELECT ON SEQUENCE public."products_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE public."products_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE public."products_id_seq" TO "service_role";

REVOKE ALL ON SEQUENCE public."resolution_cases_id_seq" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON SEQUENCE public."resolution_cases_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE public."resolution_cases_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE public."resolution_cases_id_seq" TO "anon";

GRANT SELECT ON SEQUENCE public."resolution_cases_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE public."resolution_cases_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE public."resolution_cases_id_seq" TO "authenticated";

GRANT SELECT ON SEQUENCE public."resolution_cases_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE public."resolution_cases_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE public."resolution_cases_id_seq" TO "service_role";

REVOKE ALL ON SEQUENCE public."reviews_id_seq" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON SEQUENCE public."reviews_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE public."reviews_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE public."reviews_id_seq" TO "anon";

GRANT SELECT ON SEQUENCE public."reviews_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE public."reviews_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE public."reviews_id_seq" TO "authenticated";

GRANT SELECT ON SEQUENCE public."reviews_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE public."reviews_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE public."reviews_id_seq" TO "service_role";

REVOKE ALL ON SEQUENCE public."search_logs_id_seq" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON SEQUENCE public."search_logs_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE public."search_logs_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE public."search_logs_id_seq" TO "anon";

GRANT SELECT ON SEQUENCE public."search_logs_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE public."search_logs_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE public."search_logs_id_seq" TO "authenticated";

GRANT SELECT ON SEQUENCE public."search_logs_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE public."search_logs_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE public."search_logs_id_seq" TO "service_role";

REVOKE ALL ON SEQUENCE public."shipping_zones_id_seq" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON SEQUENCE public."shipping_zones_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE public."shipping_zones_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE public."shipping_zones_id_seq" TO "anon";

GRANT SELECT ON SEQUENCE public."shipping_zones_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE public."shipping_zones_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE public."shipping_zones_id_seq" TO "authenticated";

GRANT SELECT ON SEQUENCE public."shipping_zones_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE public."shipping_zones_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE public."shipping_zones_id_seq" TO "service_role";

REVOKE ALL ON SEQUENCE public."wishlist_events_id_seq" FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT ON SEQUENCE public."wishlist_events_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE public."wishlist_events_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE public."wishlist_events_id_seq" TO "anon";

GRANT SELECT ON SEQUENCE public."wishlist_events_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE public."wishlist_events_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE public."wishlist_events_id_seq" TO "authenticated";

GRANT SELECT ON SEQUENCE public."wishlist_events_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE public."wishlist_events_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE public."wishlist_events_id_seq" TO "service_role";

REVOKE ALL ON FUNCTION public.admin_order_mutate(uuid,uuid,text,text,text,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.admin_order_mutate(uuid,uuid,text,text,text,timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION public.admin_staff_update(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.admin_staff_update(uuid,uuid,jsonb) TO "service_role";

REVOKE ALL ON FUNCTION public.analytics_attention() FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.analytics_attention() TO "service_role";

REVOKE ALL ON FUNCTION public.analytics_boxes(timestamp with time zone,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.analytics_boxes(timestamp with time zone,timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION public.analytics_boxevents(timestamp with time zone,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.analytics_boxevents(timestamp with time zone,timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION public.analytics_brands(timestamp with time zone,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.analytics_brands(timestamp with time zone,timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION public.analytics_categories(timestamp with time zone,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.analytics_categories(timestamp with time zone,timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION public.analytics_coupons(timestamp with time zone,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.analytics_coupons(timestamp with time zone,timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION public.analytics_customers(timestamp with time zone,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.analytics_customers(timestamp with time zone,timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION public.analytics_filters(timestamp with time zone,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.analytics_filters(timestamp with time zone,timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION public.analytics_geography(timestamp with time zone,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.analytics_geography(timestamp with time zone,timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION public.analytics_issues(timestamp with time zone,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.analytics_issues(timestamp with time zone,timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION public.analytics_notifications() FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.analytics_notifications() TO "service_role";

REVOKE ALL ON FUNCTION public.analytics_overview(timestamp with time zone,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.analytics_overview(timestamp with time zone,timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION public.analytics_products(timestamp with time zone,timestamp with time zone,text,integer) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.analytics_products(timestamp with time zone,timestamp with time zone,text,integer) TO "service_role";

REVOKE ALL ON FUNCTION public.analytics_refunds(timestamp with time zone,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.analytics_refunds(timestamp with time zone,timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION public.analytics_revenue(timestamp with time zone,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.analytics_revenue(timestamp with time zone,timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION public.analytics_shipping(timestamp with time zone,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.analytics_shipping(timestamp with time zone,timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION public.analytics_wishlist(timestamp with time zone,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.analytics_wishlist(timestamp with time zone,timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION public.assert_bundle_flag() FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.assert_bundle_flag() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.assert_bundle_flag() TO "anon";

GRANT EXECUTE ON FUNCTION public.assert_bundle_flag() TO "authenticated";

GRANT EXECUTE ON FUNCTION public.assert_bundle_flag() TO "service_role";

REVOKE ALL ON FUNCTION public.chaskabox_enqueue_order_notification() FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.chaskabox_enqueue_order_notification() TO "anon";

GRANT EXECUTE ON FUNCTION public.chaskabox_enqueue_order_notification() TO "authenticated";

GRANT EXECUTE ON FUNCTION public.chaskabox_enqueue_order_notification() TO "service_role";

REVOKE ALL ON FUNCTION public.chaskabox_record_order_status_event() FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.chaskabox_record_order_status_event() TO "anon";

GRANT EXECUTE ON FUNCTION public.chaskabox_record_order_status_event() TO "authenticated";

GRANT EXECUTE ON FUNCTION public.chaskabox_record_order_status_event() TO "service_role";

REVOKE ALL ON FUNCTION public.create_order_atomic(jsonb) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.create_order_atomic(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION public.guard_order_update() FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.guard_order_update() TO "service_role";

REVOKE ALL ON FUNCTION public.guard_review_verified() FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.guard_review_verified() TO "service_role";

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO "anon";

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO "authenticated";

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO "service_role";

REVOKE ALL ON FUNCTION public.is_owner() FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.is_owner() TO "authenticated";

GRANT EXECUTE ON FUNCTION public.is_owner() TO "service_role";

REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.is_staff() TO "authenticated";

GRANT EXECUTE ON FUNCTION public.is_staff() TO "service_role";

REVOKE ALL ON FUNCTION public.link_guest_orders() FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.link_guest_orders() TO "authenticated";

GRANT EXECUTE ON FUNCTION public.link_guest_orders() TO "service_role";

REVOKE ALL ON FUNCTION public.mark_product_ai_embedding_stale() FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.mark_product_ai_embedding_stale() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.mark_product_ai_embedding_stale() TO "anon";

GRANT EXECUTE ON FUNCTION public.mark_product_ai_embedding_stale() TO "authenticated";

GRANT EXECUTE ON FUNCTION public.mark_product_ai_embedding_stale() TO "service_role";

REVOKE ALL ON FUNCTION public.match_public_products(text,integer,real) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.match_public_products(text,integer,real) TO "service_role";

REVOKE ALL ON FUNCTION public.set_product_ai_embeddings(jsonb) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.set_product_ai_embeddings(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.set_updated_at() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_updated_at() TO "anon";

GRANT EXECUTE ON FUNCTION public.set_updated_at() TO "authenticated";

GRANT EXECUTE ON FUNCTION public.set_updated_at() TO "service_role";

REVOKE ALL ON FUNCTION public.staff_role() FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.staff_role() TO "authenticated";

GRANT EXECUTE ON FUNCTION public.staff_role() TO "service_role";

REVOKE ALL ON FUNCTION public.take_rate_limit_token(text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.take_rate_limit_token(text,integer,integer) TO "service_role";

REVOKE ALL ON FUNCTION public.validate_site_setting() FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.validate_site_setting() TO "service_role";

GRANT USAGE ON SCHEMA public,extensions TO anon,authenticated,service_role;

REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated;

COMMIT;


