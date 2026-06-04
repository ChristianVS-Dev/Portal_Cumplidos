-- Migración OPCIONAL (ejecutar manualmente si ya existían tablas sin prefijo pc_).
-- Revisar antes en su entorno. No se ejecuta automáticamente.

-- RENAME TABLE entregas_sap TO pc_entrega_sap;
-- RENAME TABLE cumplidos TO pc_registro_cumplido;
-- RENAME TABLE adjuntos TO pc_adjunto;
-- RENAME TABLE auditoria_eventos TO pc_auditoria;
-- ALTER TABLE pc_adjunto CHANGE cumplido_id registro_cumplido_id CHAR(36) NOT NULL;
