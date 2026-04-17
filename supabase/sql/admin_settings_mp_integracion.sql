ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS connected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mp_refresh_token text,
  ADD COLUMN IF NOT EXISTS public_key text,
  ADD COLUMN IF NOT EXISTS alias_cuenta text;

UPDATE admin_settings
SET connected = CASE
  WHEN COALESCE(trim(mp_access_token), '') <> '' THEN true
  ELSE false
END
WHERE connected IS DISTINCT FROM CASE
  WHEN COALESCE(trim(mp_access_token), '') <> '' THEN true
  ELSE false
END;
