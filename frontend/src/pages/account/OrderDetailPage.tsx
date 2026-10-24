import { useParams } from 'react-router';
import { OrderDetailView } from '@/components/OrderDetailView';

export default function OrderDetailPage() {
  const { id = '' } = useParams();
  return <OrderDetailView id={id} backTo="/account/orders" />;
}
