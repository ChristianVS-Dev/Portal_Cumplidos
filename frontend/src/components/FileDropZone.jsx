import { useRef } from 'react';
import { useImagePreviewUrl } from '../hooks/useImagePreviewUrl.js';
import { esImagenPreview } from '../utils/imagePreview.js';

const PREVIEW_IMG_PROPS = {
  loading: 'lazy',
  decoding: 'async',
};

function PreviewCard({ file, onRemove, onPreview }) {
  const isImg = esImagenPreview(file);
  const url = useImagePreviewUrl(isImg ? file : null);

  if (isImg) {
    return (
      <div className="prev-card">
        {url ? (
          <img
            className="prev-img"
            src={url}
            alt=""
            {...PREVIEW_IMG_PROPS}
            onClick={() => onPreview({ src: url, name: file.name })}
          />
        ) : (
          <div className="prev-img prev-img-loading" aria-hidden />
        )}
        <button type="button" className="prev-remove" onClick={onRemove}>
          ×
        </button>
        <div className="prev-badge">
          {file._guardado ? '✓ ' : ''}
          {file.name.length > 14 ? `${file.name.slice(0, 12)}…` : file.name}
        </div>
      </div>
    );
  }

  return (
    <div className="prev-card">
      <div className="prev-pdf">
        <div className="prev-pdf-ico">
          <i className="bi bi-file-earmark-pdf-fill" />
        </div>
        <div className="prev-pdf-name">{file.name}</div>
        <div style={{ fontSize: '0.55rem', color: '#90a4ae' }}>{Math.round(file.size / 1024)} KB</div>
      </div>
      <button type="button" className="prev-remove" onClick={onRemove}>
        ×
      </button>
    </div>
  );
}

function filePreviewKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

export default function FileDropZone({ files, onChange, onPreview, onFileAdded, disabled }) {
  const inputRef = useRef(null);

  const addFiles = async (list) => {
    if (disabled) return;
    const next = [...files];
    for (const f of list) {
      if (next.find((x) => x.name === f.name && x.size === f.size)) continue;
      if (onFileAdded) {
        try {
          await onFileAdded(f);
          f._guardado = true;
        } catch {
          continue;
        }
      }
      next.push(f);
    }
    onChange(next);
  };

  const remove = (index) => {
    const next = [...files];
    next.splice(index, 1);
    onChange(next);
  };

  return (
    <>
      <div
        className={`drop-zone ${disabled ? 'drop-disabled' : ''}`}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          e.currentTarget.classList.add('drag-over');
        }}
        onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          e.currentTarget.classList.remove('drag-over');
          addFiles(e.dataTransfer.files);
        }}
        onKeyDown={() => {}}
        role="button"
        tabIndex={0}
      >
        <div className="drop-icon">
          <i className="bi bi-cloud-arrow-up-fill" />
        </div>
        <div className="drop-title">
          {disabled ? 'Consulte primero el número de entrega' : 'Arrastra o selecciona archivos'}
        </div>
        <div className="drop-sub">PDF, JPG, PNG · se guardan al seleccionar</div>
        {!disabled && (
          <div className="drop-btn">
            <i className="bi bi-paperclip" /> Seleccionar archivos
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          style={{ display: 'none' }}
          disabled={disabled}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      <div className="preview-grid">
        {files.map((f, i) => (
          <PreviewCard
            key={filePreviewKey(f)}
            file={f}
            onRemove={() => remove(i)}
            onPreview={onPreview}
          />
        ))}
      </div>
    </>
  );
}
