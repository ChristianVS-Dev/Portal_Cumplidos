-- Migración incremental (una sentencia por cambio para re-ejecución segura)

ALTER TABLE pc_entrega_sap ADD COLUMN tknum VARCHAR(20) NULL AFTER fuente_sap;
ALTER TABLE pc_entrega_sap ADD COLUMN tipo_entrega VARCHAR(20) NULL AFTER tknum;
ALTER TABLE pc_entrega_sap ADD COLUMN codigo_cliente VARCHAR(30) NULL AFTER tipo_entrega;
ALTER TABLE pc_entrega_sap ADD COLUMN region VARCHAR(10) NULL AFTER ciudad;
ALTER TABLE pc_entrega_sap ADD COLUMN ruta VARCHAR(120) NULL AFTER region;
ALTER TABLE pc_entrega_sap ADD COLUMN tipo_transporte VARCHAR(80) NULL AFTER ruta;
ALTER TABLE pc_entrega_sap ADD COLUMN clase_medio_transporte VARCHAR(80) NULL AFTER tipo_transporte;
ALTER TABLE pc_entrega_sap ADD COLUMN procesamiento_especial VARCHAR(80) NULL AFTER clase_medio_transporte;
ALTER TABLE pc_entrega_sap ADD COLUMN nombre_transporte VARCHAR(255) NULL AFTER procesamiento_especial;
ALTER TABLE pc_entrega_sap ADD COLUMN conductor_nombre VARCHAR(150) NULL AFTER nombre_transporte;
ALTER TABLE pc_entrega_sap ADD COLUMN conductor_documento VARCHAR(30) NULL AFTER conductor_nombre;
ALTER TABLE pc_entrega_sap ADD COLUMN conductor_telefono VARCHAR(30) NULL AFTER conductor_documento;
ALTER TABLE pc_entrega_sap ADD COLUMN empresa_transportista VARCHAR(150) NULL AFTER conductor_telefono;
ALTER TABLE pc_entrega_sap ADD COLUMN empresa_transportista_codigo VARCHAR(30) NULL AFTER empresa_transportista;
ALTER TABLE pc_entrega_sap ADD COLUMN placa_sap VARCHAR(20) NULL AFTER empresa_transportista_codigo;
ALTER TABLE pc_entrega_sap ADD COLUMN fecha_documento DATE NULL AFTER placa_sap;
ALTER TABLE pc_entrega_sap ADD COLUMN items_count INT NOT NULL DEFAULT 0 AFTER fecha_documento;
ALTER TABLE pc_entrega_sap ADD COLUMN api_consultada_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER items_count;
ALTER TABLE pc_entrega_sap ADD INDEX idx_pc_entrega_tknum (tknum);
ALTER TABLE pc_entrega_sap ADD INDEX idx_pc_entrega_cliente (codigo_cliente);

ALTER TABLE pc_registro_cumplido ADD COLUMN tknum VARCHAR(20) NULL AFTER numero_entrega;
ALTER TABLE pc_registro_cumplido ADD COLUMN terminos_aceptados TINYINT(1) NOT NULL DEFAULT 0 AFTER descripcion_novedad;
ALTER TABLE pc_registro_cumplido ADD COLUMN completado_at TIMESTAMP NULL DEFAULT NULL AFTER terminos_aceptados;
ALTER TABLE pc_registro_cumplido ADD INDEX idx_pc_registro_tknum (tknum);
ALTER TABLE pc_registro_cumplido ADD INDEX idx_pc_registro_completado (completado_at);
