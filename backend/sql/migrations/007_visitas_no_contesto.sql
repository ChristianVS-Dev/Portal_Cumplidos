-- Trazabilidad de hasta 3 visitas (fecha + hora) en entrega fallida
ALTER TABLE pc_registro_cumplido
  ADD COLUMN visita_1_fecha DATE NULL AFTER n_intentos,
  ADD COLUMN visita_1_hora TIME NULL AFTER visita_1_fecha,
  ADD COLUMN visita_2_fecha DATE NULL AFTER visita_1_hora,
  ADD COLUMN visita_2_hora TIME NULL AFTER visita_2_fecha,
  ADD COLUMN visita_3_fecha DATE NULL AFTER visita_2_hora,
  ADD COLUMN visita_3_hora TIME NULL AFTER visita_3_fecha;
