CREATE TABLE IF NOT EXISTS admin_settings (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  connected boolean NOT NULL DEFAULT false,
  mp_access_token text,
  mp_refresh_token text,
  mp_user_id text,
  public_key text,
  alias_cuenta text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_settings'
      AND policyname = 'admin_settings_select_own'
  ) THEN
    CREATE POLICY admin_settings_select_own
      ON admin_settings
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_settings'
      AND policyname = 'admin_settings_insert_own'
  ) THEN
    CREATE POLICY admin_settings_insert_own
      ON admin_settings
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_settings'
      AND policyname = 'admin_settings_update_own'
  ) THEN
    CREATE POLICY admin_settings_update_own
      ON admin_settings
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;
