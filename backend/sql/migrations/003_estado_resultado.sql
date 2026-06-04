-- Estado funcional del resultado (solo dos pestañas de negocio)
ALTER TABLE pc_registro_cumplido
  ADD COLUMN estado_resultado ENUM('entrega_exitosa', 'no_contesto') NULL AFTER modo;

ALTER TABLE pc_registro_cumplido
  ADD INDEX idx_pc_registro_resultado (estado_resultado);
