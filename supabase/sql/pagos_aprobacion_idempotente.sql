-- Protecciones server-side para aprobación de pagos pendientes.
-- 1) Evita impactos sobre pagos no aprobados.
-- 2) Aprobación idempotente y con lock transaccional para evitar doble impacto.

CREATE OR REPLACE FUNCTION public.aprobar_pago_pendiente(
  p_pago_id uuid,
  p_actor_id uuid,
  p_observacion text DEFAULT NULL,
  p_preview_esperado jsonb DEFAULT NULL
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
  v_detalle_simulado jsonb := '[]'::jsonb;
  v_cuotas_impactadas jsonb := '[]'::jsonb;
  v_saldo_restante numeric(12,2) := 0;
  v_estado_prestamo text;
  v_cuota_base_numero integer := 1;
  v_preview_total numeric(12,2);
  v_preview_saldo_restante numeric(12,2);
  v_preview_cuotas jsonb;
  v_tiene_preview boolean := false;
  v_cuotas_abiertas integer := 0;
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

  IF v_pago.cuota_id IS NOT NULL THEN
    SELECT numero_cuota
      INTO v_cuota_base_numero
    FROM cuotas
    WHERE id = v_pago.cuota_id
      AND prestamo_id = v_pago.prestamo_id
      AND cliente_id = v_pago.cliente_id
    LIMIT 1;

    IF v_cuota_base_numero IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'status', 'invalid_quota_reference',
        'error', 'La cuota de referencia del pago no existe o no corresponde al préstamo.'
      );
    END IF;
  END IF;

  v_restante := ROUND(COALESCE(v_pago.monto, 0)::numeric, 2);
  IF v_restante <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid_amount', 'error', 'Monto del pago inválido');
  END IF;

  IF p_preview_esperado IS NOT NULL THEN
    v_tiene_preview := true;
    v_preview_total := ROUND(COALESCE((p_preview_esperado->>'total_aplicado')::numeric, 0), 2);
    v_preview_saldo_restante := ROUND(COALESCE((p_preview_esperado->>'saldo_restante')::numeric, 0), 2);
    v_preview_cuotas := COALESCE(p_preview_esperado->'cuotas_impactadas', '[]'::jsonb);
  END IF;

  FOR v_cuota IN
    SELECT id, numero_cuota, monto_cuota, monto_pagado, saldo_pendiente, estado
    FROM cuotas
    WHERE prestamo_id = v_pago.prestamo_id
      AND cliente_id = v_pago.cliente_id
      AND estado IN ('pendiente', 'parcial')
      AND numero_cuota >= v_cuota_base_numero
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

    IF v_monto_aplicado > v_saldo_antes OR v_saldo_despues < -0.009 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'status', 'invalid_debt_impact',
        'error', 'El impacto calculado excede la deuda pendiente de una cuota.'
      );
    END IF;

    v_detalle_simulado := v_detalle_simulado || jsonb_build_object(
      'cuota_id', v_cuota.id,
      'numero_cuota', v_cuota.numero_cuota,
      'monto_pagado_antes', v_pagado_antes,
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

  v_cuotas_impactadas := (
    SELECT COALESCE(jsonb_agg((item->>'numero_cuota')::int), '[]'::jsonb)
    FROM jsonb_array_elements(v_detalle_simulado) item
  );

  SELECT COALESCE(SUM(
      CASE
        WHEN c.numero_cuota < v_cuota_base_numero THEN COALESCE(c.saldo_pendiente, 0)
        WHEN d.item IS NOT NULL THEN COALESCE((d.item->>'saldo_cuota_despues')::numeric, COALESCE(c.saldo_pendiente, 0))
        ELSE COALESCE(c.saldo_pendiente, 0)
      END
    ), 0)
    INTO v_saldo_restante
  FROM cuotas c
  LEFT JOIN LATERAL (
    SELECT item
    FROM jsonb_array_elements(v_detalle_simulado) item
    WHERE (item->>'cuota_id')::uuid = c.id
    LIMIT 1
  ) d ON true
  WHERE c.prestamo_id = v_pago.prestamo_id
    AND c.cliente_id = v_pago.cliente_id
    AND c.estado IN ('pendiente', 'parcial');

  IF v_tiene_preview AND (
    ABS(v_total_aplicado - v_preview_total) > 0.01
    OR ABS(ROUND(v_saldo_restante, 2) - v_preview_saldo_restante) > 0.01
    OR v_cuotas_impactadas <> v_preview_cuotas
  ) THEN
    INSERT INTO pagos_logs (pago_id, accion, actor_id, detalle)
    VALUES (
      v_pago.id,
      'aprobar_fallida_desfase',
      p_actor_id,
      jsonb_build_object(
        'motivo', 'deuda_modificada_desde_preview',
        'preview_esperado', p_preview_esperado,
        'impacto_real_calculado', jsonb_build_object(
          'total_aplicado', v_total_aplicado,
          'saldo_restante', ROUND(v_saldo_restante, 2),
          'cuotas_impactadas', v_cuotas_impactadas,
          'detalle_aplicacion', v_detalle_simulado
        )
      )
    );

    RETURN jsonb_build_object(
      'ok', false,
      'status', 'preview_mismatch',
      'error', 'La deuda cambió desde la previsualización. Revisa nuevamente antes de aprobar.',
      'preview_esperado', p_preview_esperado,
      'impacto_real_calculado', jsonb_build_object(
        'total_aplicado', v_total_aplicado,
        'saldo_restante', ROUND(v_saldo_restante, 2),
        'cuotas_impactadas', v_cuotas_impactadas,
        'detalle_aplicacion', v_detalle_simulado
      )
    );
  END IF;

  FOR v_cuota IN
    SELECT item
    FROM jsonb_array_elements(v_detalle_simulado) item
  LOOP
    UPDATE cuotas
    SET
      monto_pagado = ROUND(COALESCE((v_cuota.item->>'monto_pagado_antes')::numeric, 0) + COALESCE((v_cuota.item->>'monto_aplicado')::numeric, 0), 2),
      saldo_pendiente = ROUND(COALESCE((v_cuota.item->>'saldo_cuota_despues')::numeric, 0), 2),
      estado = COALESCE(v_cuota.item->>'estado_resultante', estado),
      fecha_pago = now()
    WHERE id = (v_cuota.item->>'cuota_id')::uuid;

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
      (v_cuota.item->>'cuota_id')::uuid,
      v_pago.prestamo_id,
      v_pago.cliente_id,
      (v_cuota.item->>'numero_cuota')::integer,
      ROUND(COALESCE((v_cuota.item->>'monto_aplicado')::numeric, 0), 2),
      ROUND(COALESCE((v_cuota.item->>'saldo_cuota_antes')::numeric, 0), 2),
      ROUND(COALESCE((v_cuota.item->>'saldo_cuota_despues')::numeric, 0), 2)
    )
    ON CONFLICT (pago_id, cuota_id) DO NOTHING;
  END LOOP;

  v_detalle := v_detalle_simulado;

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

  SELECT COUNT(*)
    INTO v_cuotas_abiertas
  FROM cuotas
  WHERE prestamo_id = v_pago.prestamo_id
    AND cliente_id = v_pago.cliente_id
    AND estado IN ('pendiente', 'parcial')
    AND COALESCE(saldo_pendiente, 0) > 0.009;

  IF v_estado_prestamo = 'pagado' AND v_cuotas_abiertas > 0 THEN
    RAISE EXCEPTION 'Estado de préstamo incoherente: quedan cuotas abiertas (%).', v_cuotas_abiertas;
  END IF;

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
      'preview_esperado', COALESCE(p_preview_esperado, 'null'::jsonb),
      'impacto_real_final', jsonb_build_object(
        'total_aplicado', v_total_aplicado,
        'saldo_restante', ROUND(v_saldo_restante::numeric, 2),
        'cuotas_impactadas', v_cuotas_impactadas,
        'detalle_aplicacion', v_detalle
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
    'cuotas_impactadas', v_cuotas_impactadas,
    'saldo_restante', ROUND(v_saldo_restante::numeric, 2),
    'prestamo_estado', v_estado_prestamo
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aprobar_pago_pendiente(uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aprobar_pago_pendiente(uuid, uuid, text, jsonb) TO service_role;

DROP FUNCTION IF EXISTS public.aprobar_pago_pendiente(uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.aprobar_pago_pendiente(
  p_pago_id uuid,
  p_actor_id uuid,
  p_observacion text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.aprobar_pago_pendiente(p_pago_id, p_actor_id, p_observacion, NULL::jsonb);
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
