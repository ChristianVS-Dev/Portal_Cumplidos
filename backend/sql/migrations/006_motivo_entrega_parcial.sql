-- Motivo adicional: entrega parcial
ALTER TABLE pc_registro_cumplido
  ADD COLUMN chk_entrega_parcial TINYINT(1) NOT NULL DEFAULT 0 AFTER chk_material_no_solicitado;
