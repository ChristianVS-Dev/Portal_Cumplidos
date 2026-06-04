import InfoDl from './InfoDl.jsx';
import { normalizarCliente } from '../../lib/normalizarCliente.js';

export default function ClienteInfoCard({ cliente: clienteRaw }) {
  const cliente = normalizarCliente(clienteRaw);
  if (!cliente) return null;

  return (
    <InfoDl
      title="Cliente"
      icon="bi-person-badge-fill"
      className="sap-info info-cliente"
      rows={[
        { label: 'Nombre', value: cliente.nombre },
        { label: 'Código', value: cliente.codigo },
        { label: 'Dirección', value: cliente.direccion },
        { label: 'Ciudad', value: cliente.ciudad },
        { label: 'Región', value: cliente.region },
      ]}
    />
  );
}
