-- Amplía region para evitar "Data too long" en respuestas API
ALTER TABLE pc_entrega_sap
  MODIFY COLUMN region VARCHAR(120) NULL;
