-- Blindaje final de consistencia lógica para cuotas / préstamos / pagos.

CREATE OR REPLACE FUNCTION public.normalizar_cuota_consistencia()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_monto numeric(12,2);
  v_pagado numeric(12,2);
  v_saldo numeric(12,2);
BEGIN
  v_monto := ROUND(COALESCE(NEW.monto_cuota, 0)::numeric, 2);
  v_pagado := ROUND(COALESCE(NEW.monto_pagado, 0)::numeric, 2);
  v_saldo := ROUND(COALESCE(NEW.saldo_pendiente, v_monto - v_pagado)::numeric, 2);

  v_monto := GREATEST(v_monto, 0);
  v_pagado := GREATEST(v_pagado, 0);
  v_saldo := GREATEST(v_saldo, 0);

  IF v_pagado > v_monto THEN
    v_pagado := v_monto;
  END IF;

  IF v_saldo > v_monto THEN
    v_saldo := v_monto;
  END IF;

  IF v_saldo <= 0.009 THEN
    NEW.saldo_pendiente := 0;
    NEW.monto_pagado := v_monto;
    NEW.estado := 'pagada';
  ELSIF v_pagado > 0 THEN
    NEW.saldo_pendiente := v_saldo;
    NEW.monto_pagado := v_pagado;
    NEW.estado := 'parcial';
  ELSE
    NEW.saldo_pendiente := v_saldo;
    NEW.monto_pagado := 0;
    NEW.estado := 'pendiente';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalizar_cuota_consistencia ON public.cuotas;
CREATE TRIGGER trg_normalizar_cuota_consistencia
BEFORE INSERT OR UPDATE OF monto_cuota, monto_pagado, saldo_pendiente, estado
ON public.cuotas
FOR EACH ROW
EXECUTE FUNCTION public.normalizar_cuota_consistencia();

CREATE OR REPLACE FUNCTION public.sincronizar_prestamo_desde_cuotas()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_prestamo_id uuid;
  v_saldo numeric(12,2);
  v_estado_actual text;
BEGIN
  v_prestamo_id := COALESCE(NEW.prestamo_id, OLD.prestamo_id);
  IF v_prestamo_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT ROUND(COALESCE(SUM(COALESCE(c.saldo_pendiente, 0)), 0)::numeric, 2)
  INTO v_saldo
  FROM public.cuotas c
  WHERE c.prestamo_id = v_prestamo_id;

  SELECT estado INTO v_estado_actual
  FROM public.prestamos
  WHERE id = v_prestamo_id;

  UPDATE public.prestamos
  SET
    saldo_pendiente = v_saldo,
    estado = CASE
      WHEN v_saldo <= 0.009 THEN 'pagado'
      WHEN COALESCE(v_estado_actual, 'activo') = 'pagado' THEN 'activo'
      ELSE v_estado_actual
    END
  WHERE id = v_prestamo_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_prestamo_desde_cuotas ON public.cuotas;
CREATE TRIGGER trg_sincronizar_prestamo_desde_cuotas
AFTER INSERT OR UPDATE OR DELETE
ON public.cuotas
FOR EACH ROW
EXECUTE FUNCTION public.sincronizar_prestamo_desde_cuotas();

CREATE OR REPLACE FUNCTION public.validar_transicion_pago()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.estado = 'aprobado' AND NEW.estado <> 'aprobado' THEN
      RAISE EXCEPTION 'No se puede cambiar un pago aprobado a otro estado';
    END IF;

    IF OLD.impactado = true AND COALESCE(NEW.impactado, false) = false THEN
      RAISE EXCEPTION 'No se puede desimpactar un pago ya impactado';
    END IF;

    IF OLD.estado = 'rechazado' AND NEW.estado = 'aprobado' THEN
      RAISE EXCEPTION 'No se puede aprobar un pago rechazado';
    END IF;
  END IF;

  IF COALESCE(NEW.impactado, false) = true AND NEW.estado <> 'aprobado' THEN
    RAISE EXCEPTION 'Pago impactado debe estar aprobado';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_transicion_pago ON public.pagos;
CREATE TRIGGER trg_validar_transicion_pago
BEFORE INSERT OR UPDATE OF estado, impactado
ON public.pagos
FOR EACH ROW
EXECUTE FUNCTION public.validar_transicion_pago();
