-- Motivos adicionales de novedad «no contestó» (envío futuro a SAP)
ALTER TABLE pc_registro_cumplido
  ADD COLUMN chk_cliente_ausente TINYINT(1) NOT NULL DEFAULT 0 AFTER chk_whatsapp,
  ADD COLUMN chk_cliente_rechaza TINYINT(1) NOT NULL DEFAULT 0 AFTER chk_cliente_ausente,
  ADD COLUMN chk_material_no_solicitado TINYINT(1) NOT NULL DEFAULT 0 AFTER chk_cliente_rechaza;
