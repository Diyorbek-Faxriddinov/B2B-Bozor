import { useParams } from 'react-router';
import { OrderDetailView } from '@/components/OrderDetailView';

export default function AdminOrderDetailPage() {
  const { id = '' } = useParams();
  return <OrderDetailView id={id} backTo="/admin/orders" />;
}
