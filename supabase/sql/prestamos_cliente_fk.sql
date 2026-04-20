-- Garantiza la relación requerida por el dashboard admin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'prestamos_cliente_id_fkey'
  ) THEN
    ALTER TABLE prestamos
    ADD CONSTRAINT prestamos_cliente_id_fkey
    FOREIGN KEY (cliente_id) REFERENCES clientes(id);
  END IF;
END $$;
