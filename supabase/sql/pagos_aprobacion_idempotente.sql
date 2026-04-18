-- Protecciones server-side para aprobación de pagos pendientes.
-- 1) Evita impactos sobre pagos no aprobados.
-- 2) Aprobación idempotente y con lock transaccional para evitar doble impacto.

CREATE OR REPLACE FUNCTION public.aprobar_pago_pendiente(
  p_pago_id uuid,
  p_actor_id uuid,
  p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago pagos%ROWTYPE;
  v_cuota RECORD;
  v_restante numeric(12,2);
  v_saldo_antes numeric(12,2);
  v_pagado_antes numeric(12,2);
  v_monto_aplicado numeric(12,2);
  v_saldo_despues numeric(12,2);
  v_nuevo_estado text;
  v_total_aplicado numeric(12,2) := 0;
  v_detalle jsonb := '[]'::jsonb;
  v_saldo_restante numeric(12,2) := 0;
  v_estado_prestamo text;
BEGIN
  SELECT *
  INTO v_pago
  FROM pagos
  WHERE id = p_pago_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found', 'error', 'Pago no encontrado');
  END IF;

  IF v_pago.estado = 'aprobado' AND COALESCE(v_pago.impactado, false) = true THEN
    SELECT COALESCE(SUM(COALESCE(saldo_pendiente, 0)), 0)
      INTO v_saldo_restante
    FROM cuotas
    WHERE prestamo_id = v_pago.prestamo_id
      AND cliente_id = v_pago.cliente_id
      AND estado IN ('pendiente', 'parcial');

    RETURN jsonb_build_object(
      'ok', true,
      'status', 'already_approved',
      'estado', 'aprobado',
      'pago_id', v_pago.id,
      'saldo_restante', ROUND(v_saldo_restante::numeric, 2)
    );
  END IF;

  IF v_pago.estado = 'rechazado' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'already_rejected',
      'error', 'El pago está rechazado y no puede aprobarse'
    );
  END IF;

  IF v_pago.estado <> 'pendiente_aprobacion' OR COALESCE(v_pago.impactado, false) = true THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'invalid_state',
      'error', format('Estado inválido para aprobar: %s', COALESCE(v_pago.estado, 'null'))
    );
  END IF;

  v_restante := ROUND(COALESCE(v_pago.monto, 0)::numeric, 2);
  IF v_restante <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid_amount', 'error', 'Monto del pago inválido');
  END IF;

  FOR v_cuota IN
    SELECT id, numero_cuota, monto_cuota, monto_pagado, saldo_pendiente, estado
    FROM cuotas
    WHERE prestamo_id = v_pago.prestamo_id
      AND cliente_id = v_pago.cliente_id
      AND estado IN ('pendiente', 'parcial')
      AND (
        v_pago.cuota_id IS NULL
        OR numero_cuota >= (
          SELECT c_ref.numero_cuota
          FROM cuotas c_ref
          WHERE c_ref.id = v_pago.cuota_id
          LIMIT 1
        )
      )
    ORDER BY numero_cuota ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_restante <= 0;

    v_saldo_antes := ROUND(COALESCE(v_cuota.saldo_pendiente, v_cuota.monto_cuota, 0)::numeric, 2);
    v_pagado_antes := ROUND(COALESCE(v_cuota.monto_pagado, 0)::numeric, 2);

    CONTINUE WHEN v_saldo_antes <= 0;

    v_monto_aplicado := LEAST(v_restante, v_saldo_antes);
    CONTINUE WHEN v_monto_aplicado <= 0;

    v_saldo_despues := ROUND(v_saldo_antes - v_monto_aplicado, 2);
    v_nuevo_estado := CASE WHEN ABS(v_saldo_despues) <= 0.009 THEN 'pagada' ELSE 'parcial' END;

    UPDATE cuotas
    SET
      monto_pagado = ROUND(v_pagado_antes + v_monto_aplicado, 2),
      saldo_pendiente = CASE WHEN ABS(v_saldo_despues) <= 0.009 THEN 0 ELSE v_saldo_despues END,
      estado = v_nuevo_estado,
      fecha_pago = now()
    WHERE id = v_cuota.id;

    INSERT INTO pagos_detalle (
      pago_id,
      cuota_id,
      prestamo_id,
      cliente_id,
      numero_cuota,
      monto_aplicado,
      saldo_cuota_antes,
      saldo_cuota_despues
    )
    VALUES (
      v_pago.id,
      v_cuota.id,
      v_pago.prestamo_id,
      v_pago.cliente_id,
      v_cuota.numero_cuota,
      v_monto_aplicado,
      v_saldo_antes,
      CASE WHEN ABS(v_saldo_despues) <= 0.009 THEN 0 ELSE v_saldo_despues END
    )
    ON CONFLICT (pago_id, cuota_id) DO NOTHING;

    v_detalle := v_detalle || jsonb_build_object(
      'cuota_id', v_cuota.id,
      'numero_cuota', v_cuota.numero_cuota,
      'monto_aplicado', v_monto_aplicado,
      'saldo_cuota_antes', v_saldo_antes,
      'saldo_cuota_despues', CASE WHEN ABS(v_saldo_despues) <= 0.009 THEN 0 ELSE v_saldo_despues END,
      'estado_resultante', v_nuevo_estado
    );

    v_total_aplicado := ROUND(v_total_aplicado + v_monto_aplicado, 2);
    v_restante := ROUND(v_restante - v_monto_aplicado, 2);

    IF ABS(v_saldo_despues) > 0.009 THEN
      v_restante := 0;
    END IF;
  END LOOP;

  IF v_total_aplicado <= 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'no_quota_applied',
      'error', 'No se pudo aplicar el pago a cuotas pendientes'
    );
  END IF;

  UPDATE pagos
  SET
    estado = 'aprobado',
    impactado = true,
    aprobado_por = p_actor_id,
    aprobado_at = now(),
    observacion_revision = NULLIF(BTRIM(COALESCE(p_observacion, '')), ''),
    fecha_pago = now()
  WHERE id = v_pago.id;

  SELECT COALESCE(SUM(COALESCE(saldo_pendiente, 0)), 0)
    INTO v_saldo_restante
  FROM cuotas
  WHERE prestamo_id = v_pago.prestamo_id
    AND cliente_id = v_pago.cliente_id
    AND estado IN ('pendiente', 'parcial');

  v_estado_prestamo := CASE WHEN ROUND(v_saldo_restante::numeric, 2) <= 0 THEN 'pagado' ELSE 'activo' END;

  UPDATE prestamos
  SET estado = v_estado_prestamo
  WHERE id = v_pago.prestamo_id;

  INSERT INTO pagos_logs (pago_id, accion, actor_id, detalle)
  VALUES (
    v_pago.id,
    'aprobar',
    p_actor_id,
    jsonb_build_object(
      'metodo', v_pago.metodo,
      'total_aplicado', v_total_aplicado,
      'cuotas_impactadas', (
        SELECT COALESCE(jsonb_agg((item->>'numero_cuota')::int), '[]'::jsonb)
        FROM jsonb_array_elements(v_detalle) item
      )
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'approved',
    'estado', 'aprobado',
    'pago_id', v_pago.id,
    'detalle_aplicacion', v_detalle,
    'total_aplicado', v_total_aplicado,
    'cuotas_impactadas', (
      SELECT COALESCE(jsonb_agg((item->>'numero_cuota')::int), '[]'::jsonb)
      FROM jsonb_array_elements(v_detalle) item
    ),
    'saldo_restante', ROUND(v_saldo_restante::numeric, 2),
    'prestamo_estado', v_estado_prestamo
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aprobar_pago_pendiente(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aprobar_pago_pendiente(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.validar_pagos_detalle_aprobado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_estado text;
  v_impactado boolean;
BEGIN
  SELECT estado, impactado
  INTO v_estado, v_impactado
  FROM pagos
  WHERE id = NEW.pago_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago % no existe', NEW.pago_id;
  END IF;

  IF v_estado <> 'aprobado' OR COALESCE(v_impactado, false) = false THEN
    RAISE EXCEPTION 'No se puede impactar detalle para pago % en estado % (impactado=%)', NEW.pago_id, v_estado, COALESCE(v_impactado, false);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_pagos_detalle_aprobado ON pagos_detalle;
CREATE TRIGGER trg_validar_pagos_detalle_aprobado
BEFORE INSERT ON pagos_detalle
FOR EACH ROW
EXECUTE FUNCTION public.validar_pagos_detalle_aprobado();
