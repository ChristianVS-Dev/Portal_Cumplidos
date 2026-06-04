import fs from 'fs';
const html = fs.readFileSync('../Portal_Cumplidos.html', 'utf8');
const m = html.match(/<style>([\s\S]*?)<\/style>/);
const extra = `
.alert-nov.show { display: flex; }
.err-bar.show, .ok-bar.show { display: block; }
.sap-info { background: #e3f2fd; border: 1px solid #90caf9; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; font-size: 0.72rem; }
.sap-info dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; }
.sap-info dt { font-weight: 600; color: #1565c0; }
.sap-info dd { color: #37474f; margin: 0; }
.search-loading { color: #546e7a; font-size: 0.7rem; margin-top: 6px; }
.api-offline .sdot { background: #ef5350; animation: none; }
`;
fs.writeFileSync('../frontend/src/styles/portal.css', m[1] + extra);
