-- ChaskaBox Notification Templates
-- Editable email/WhatsApp templates. Variables: {{order_number}}, {{customer_name}}, {{total}}, {{tracking_url}}

CREATE TABLE IF NOT EXISTS notification_templates (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,  -- 'order_confirmation', 'status_shipped', etc.
  channel     TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  subject     TEXT,  -- email only
  body        TEXT NOT NULL,
  variables   TEXT[] DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: service role only
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notif_tpl_service_all ON notification_templates;
CREATE POLICY notif_tpl_service_all ON notification_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Default templates
INSERT INTO notification_templates (name, channel, subject, body, variables) VALUES
('order_received_owner', 'email', 'New Order {{order_number}} — Rs. {{total}}',
 'New order received!\n\nOrder: {{order_number}}\nCustomer: {{customer_name}} ({{customer_phone}})\nTotal: Rs. {{total}}\nPayment: {{payment_method}}\n\nView: {{admin_url}}',
 ARRAY['order_number','customer_name','customer_phone','total','payment_method','admin_url']),

('order_thankyou_customer', 'whatsapp', NULL,
 '🍬 *ChaskaBox* — Shukriya {{customer_name}}!\n\nYour order *{{order_number}}* (Rs. {{total}}) is confirmed!\n\nWe''ll source your snacks fresh and deliver in 4-7 days.\nTrack: {{tracking_url}}',
 ARRAY['customer_name','order_number','total','tracking_url']),

('status_update', 'whatsapp', NULL,
 '🍬 *ChaskaBox Update*\n\nHi {{customer_name}}! Your order *{{order_number}}* is {{status_text}}\n\nTrack: {{tracking_url}}',
 ARRAY['customer_name','order_number','status_text','tracking_url']),

('abandoned_cart', 'whatsapp', NULL,
 '🛍️ Hi {{customer_name}}! You left some tasty snacks in your ChaskaBox bag.\n\nComplete your order before they''re gone!\nShop: https://chaskabox.online/shop/',
 ARRAY['customer_name'])
ON CONFLICT (name) DO NOTHING;
