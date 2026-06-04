export default function Lightbox({ src, name, onClose }) {
  return (
    <div
      className="lb open"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={() => {}}
      role="presentation"
    >
      <div className="lb-inner">
        <button type="button" className="lb-close" onClick={onClose}>
          ×
        </button>
        <img className="lb-img" src={src} alt={name} />
        <div className="lb-name">{name}</div>
      </div>
    </div>
  );
}
