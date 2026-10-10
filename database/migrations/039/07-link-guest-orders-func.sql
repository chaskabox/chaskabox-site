CREATE OR REPLACE FUNCTION public.link_guest_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id UUID;
  v_phone TEXT;
  v_linked INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT phone INTO v_phone FROM public.profiles WHERE id = v_user_id;
  IF v_phone IS NULL OR length(trim(v_phone)) < 7 THEN
    RAISE EXCEPTION 'Add your phone number to your profile first';
  END IF;
  UPDATE orders
  SET user_id = v_user_id
  WHERE user_id IS NULL
    AND regexp_replace(customer_phone, '[^0-9]', '', 'g') = regexp_replace(v_phone, '[^0-9]', '', 'g');
  GET DIAGNOSTICS v_linked = ROW_COUNT;
  RETURN jsonb_build_object('linked', v_linked);
END;
$func$;
