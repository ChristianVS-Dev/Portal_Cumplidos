import { useRef, useState } from 'react';
import { useImagePreviewUrl } from '../hooks/useImagePreviewUrl.js';

export default function EvidenciaSlot({ slot, file, onFile, onPreview, disabled }) {
  const inputRef = useRef(null);
  const preview = useImagePreviewUrl(file);
  const [loading, setLoading] = useState(false);
  const done = !!file;

  const handleChange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setLoading(true);
    try {
      await onFile(f);
    } catch {
      /* el padre puede rechazar el archivo */
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const clear = (e) => {
    e.stopPropagation();
    onFile(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div
      className={`ev ${done ? 'done' : ''} ${disabled ? 'ev-disabled' : ''}`}
      onClick={() => !disabled && !loading && inputRef.current?.click()}
      onKeyDown={() => {}}
      role="button"
      tabIndex={0}
    >
      {preview && (
        <img
          className="ev-preview"
          src={preview}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ display: 'block' }}
          onClick={(e) => {
            e.stopPropagation();
            onPreview({ src: preview, name: slot.label });
          }}
        />
      )}
      <button type="button" className="ev-remove" onClick={clear}>
        ×
      </button>
      <div className="ev-ico">
        <i className={`bi ${slot.icon}`} />
      </div>
      <div className="ev-lbl">{slot.label}</div>
      <div className="ev-btn">
        {loading ? 'Cargando...' : done ? '✓ Listo' : slot.btn || 'Subir foto'}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png"
        style={{ display: 'none' }}
        disabled={disabled || loading}
        onChange={handleChange}
      />
    </div>
  );
}
