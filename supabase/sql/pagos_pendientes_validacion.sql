-- Flujo de pagos pendientes por validación (idempotente)

ALTER TABLE IF EXISTS pagos
  ADD COLUMN IF NOT EXISTS comprobante text,
  ADD COLUMN IF NOT EXISTS aprobado_por uuid,
  ADD COLUMN IF NOT EXISTS aprobado_at timestamptz,
  ADD COLUMN IF NOT EXISTS rechazado_por uuid,
  ADD COLUMN IF NOT EXISTS rechazado_at timestamptz,
  ADD COLUMN IF NOT EXISTS observacion_revision text,
  ADD COLUMN IF NOT EXISTS impactado boolean NOT NULL DEFAULT false;

-- Compatibilidad con columna existente de comprobante_url.
UPDATE pagos
SET comprobante = COALESCE(NULLIF(comprobante, ''), NULLIF(comprobante_url, ''))
WHERE COALESCE(comprobante, '') = ''
  AND COALESCE(comprobante_url, '') <> '';

-- Normalización de estados a texto + check requerido.
ALTER TABLE IF EXISTS pagos
  ALTER COLUMN estado TYPE text USING estado::text;

UPDATE pagos
SET estado = 'pendiente_aprobacion'
WHERE estado = 'pendiente';

ALTER TABLE IF EXISTS pagos
  ALTER COLUMN estado SET DEFAULT 'pendiente_aprobacion';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pagos_estado_check'
      AND conrelid = 'pagos'::regclass
  ) THEN
    ALTER TABLE pagos
      ADD CONSTRAINT pagos_estado_check
      CHECK (estado IN ('pendiente_aprobacion', 'aprobado', 'rechazado'));
  END IF;
END
$$;

-- Asegura integridad para evitar doble impacto accidental.
CREATE UNIQUE INDEX IF NOT EXISTS pagos_detalle_pago_cuota_unique
  ON pagos_detalle (pago_id, cuota_id);

-- Foreign keys auxiliares.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pagos_rechazado_por_fk'
      AND conrelid = 'pagos'::regclass
  ) THEN
    ALTER TABLE pagos
      ADD CONSTRAINT pagos_rechazado_por_fk
      FOREIGN KEY (rechazado_por) REFERENCES usuarios(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pagos_aprobado_por_fk'
      AND conrelid = 'pagos'::regclass
  ) THEN
    ALTER TABLE pagos
      ADD CONSTRAINT pagos_aprobado_por_fk
      FOREIGN KEY (aprobado_por) REFERENCES usuarios(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- RLS: visibilidad por rol.
ALTER TABLE IF EXISTS pagos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pagos'
      AND policyname = 'pagos_select_admin_empleado'
  ) THEN
    CREATE POLICY pagos_select_admin_empleado
      ON pagos
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM usuarios u
          WHERE u.id = auth.uid()
            AND u.rol IN ('admin', 'empleado')
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pagos'
      AND policyname = 'pagos_select_cliente_propios'
  ) THEN
    CREATE POLICY pagos_select_cliente_propios
      ON pagos
      FOR SELECT
      USING (
        cliente_id IN (
          SELECT c.id
          FROM clientes c
          WHERE c.usuario_id = auth.uid() OR c.id = auth.uid()
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pagos'
      AND policyname = 'pagos_update_admin_empleado'
  ) THEN
    CREATE POLICY pagos_update_admin_empleado
      ON pagos
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1
          FROM usuarios u
          WHERE u.id = auth.uid()
            AND u.rol IN ('admin', 'empleado')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM usuarios u
          WHERE u.id = auth.uid()
            AND u.rol IN ('admin', 'empleado')
        )
      );
  END IF;
END
$$;
