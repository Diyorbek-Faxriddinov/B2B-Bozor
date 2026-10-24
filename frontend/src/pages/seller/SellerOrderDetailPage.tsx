import { useParams } from 'react-router';
import { OrderDetailView } from '@/components/OrderDetailView';

export default function SellerOrderDetailPage() {
  const { id = '' } = useParams();
  return <OrderDetailView id={id} backTo="/seller/orders" />;
}
