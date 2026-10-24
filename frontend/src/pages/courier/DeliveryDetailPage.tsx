import { useParams } from 'react-router';
import { OrderDetailView } from '@/components/OrderDetailView';

export default function DeliveryDetailPage() {
  const { id = '' } = useParams();
  return <OrderDetailView id={id} backTo="/courier/deliveries" />;
}
