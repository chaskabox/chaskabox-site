-- Private, typed readiness snapshot. No message bodies, addresses or credentials.
BEGIN;
CREATE TABLE public.notification_provider_health (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  checked_at timestamptz NOT NULL DEFAULT now(),
  email_status text NOT NULL CHECK (email_status IN ('ready','unavailable','unknown','disabled')),
  email_http_status integer CHECK (email_http_status BETWEEN 100 AND 599),
  whatsapp_status text NOT NULL CHECK (whatsapp_status IN ('ready','unavailable','unknown','disabled')),
  whatsapp_http_status integer CHECK (whatsapp_http_status BETWEEN 100 AND 599),
  whatsapp_session_status text NOT NULL CHECK (whatsapp_session_status IN ('WORKING','STARTING','SCAN_QR_CODE','FAILED','STOPPED','unknown')),
  whatsapp_receipts_configured boolean NOT NULL
);
ALTER TABLE public.notification_provider_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_provider_health FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_provider_health TO service_role;

CREATE FUNCTION public.notification_provider_health_record(
  p_email_status text, p_email_http_status integer,
  p_whatsapp_status text, p_whatsapp_http_status integer,
  p_whatsapp_session_status text, p_whatsapp_receipts_configured boolean
) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$
  INSERT INTO public.notification_provider_health (
    id, checked_at, email_status, email_http_status,
    whatsapp_status, whatsapp_http_status, whatsapp_session_status, whatsapp_receipts_configured
  ) VALUES (
    true, clock_timestamp(), p_email_status, p_email_http_status,
    p_whatsapp_status, p_whatsapp_http_status, p_whatsapp_session_status, p_whatsapp_receipts_configured
  ) ON CONFLICT (id) DO UPDATE SET
    checked_at=EXCLUDED.checked_at, email_status=EXCLUDED.email_status,
    email_http_status=EXCLUDED.email_http_status,
    whatsapp_status=EXCLUDED.whatsapp_status, whatsapp_http_status=EXCLUDED.whatsapp_http_status,
    whatsapp_session_status=EXCLUDED.whatsapp_session_status,
    whatsapp_receipts_configured=EXCLUDED.whatsapp_receipts_configured;
$$;
REVOKE ALL ON FUNCTION public.notification_provider_health_record(text,integer,text,integer,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_provider_health_record(text,integer,text,integer,text,boolean) TO service_role;
COMMIT;
