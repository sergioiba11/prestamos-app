-- Sistema de pagos completo: efectivo / transferencia / mercado_pago
-- Estados: pendiente / aprobado / rechazado

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'metodo_pago') THEN
    CREATE TYPE metodo_pago AS ENUM ('efectivo', 'transferencia', 'mercado_pago');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_pago') THEN
    CREATE TYPE estado_pago AS ENUM ('pendiente', 'aprobado', 'rechazado');
  END IF;
END
$$;

ALTER TABLE IF EXISTS pagos
  ADD COLUMN IF NOT EXISTS estado estado_pago NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS cuota_id uuid,
  ADD COLUMN IF NOT EXISTS numero_cuota integer,
  ADD COLUMN IF NOT EXISTS comprobante_url text,
  ADD COLUMN IF NOT EXISTS mp_preference_id text,
  ADD COLUMN IF NOT EXISTS registrado_por uuid,
  ADD COLUMN IF NOT EXISTS aprobado_por uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS fecha_pago timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE IF EXISTS pagos
  ALTER COLUMN metodo TYPE metodo_pago USING (
    CASE
      WHEN metodo::text IN ('mercadopago', 'mp', 'mercado-pago') THEN 'mercado_pago'::metodo_pago
      WHEN metodo::text IN ('efectivo', 'transferencia', 'mercado_pago') THEN metodo::text::metodo_pago
      ELSE 'efectivo'::metodo_pago
    END
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pagos_aprobado_por_fk'
  ) THEN
    ALTER TABLE pagos
      ADD CONSTRAINT pagos_aprobado_por_fk
      FOREIGN KEY (aprobado_por) REFERENCES usuarios(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pagos_registrado_por_fk'
  ) THEN
    ALTER TABLE pagos
      ADD CONSTRAINT pagos_registrado_por_fk
      FOREIGN KEY (registrado_por) REFERENCES usuarios(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pagos_cuota_id_fk'
  ) THEN
    ALTER TABLE pagos
      ADD CONSTRAINT pagos_cuota_id_fk
      FOREIGN KEY (cuota_id) REFERENCES cuotas(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS pagos_logs (
  id bigserial PRIMARY KEY,
  pago_id uuid NOT NULL,
  accion text NOT NULL,
  actor_id uuid,
  detalle jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
