import { useRef, useState } from 'react';

export default function EvidenciaSlot({ slot, file, onFile, onPreview, disabled }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const done = !!file;

  const handleChange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setLoading(true);
    try {
      await onFile(f);
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target.result);
      reader.readAsDataURL(f);
    } catch {
      setPreview(null);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const clear = (e) => {
    e.stopPropagation();
    onFile(null);
    setPreview(null);
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
