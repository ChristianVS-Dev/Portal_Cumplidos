import { useState } from 'react';

/** Logo en frontend/public/images/logo_gd.png */
const DEFAULT_LOGO = '/images/logo_gd.png';

export default function BrandLogo({ className = 'logo-box' }) {
  const src = import.meta.env.VITE_BRAND_LOGO || DEFAULT_LOGO;
  const [useFallback, setUseFallback] = useState(false);

  if (useFallback) {
    return (
      <div className={className} aria-hidden="true">
        GD
      </div>
    );
  }

  return (
    <div className={`${className} logo-box--img`}>
      <img
        src={src}
        alt="Grupo Decor"
        onError={() => setUseFallback(true)}
      />
    </div>
  );
}
