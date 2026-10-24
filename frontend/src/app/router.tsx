import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Outlet } from 'react-router';
import { MainLayout, ScrollToTop } from '@/components/layout/MainLayout';
import { AccountLayout } from '@/components/layout/AccountLayout';
import { GuestOnly, RequireAuth } from '@/components/layout/guards';
import { PageLoader } from '@/components/ui/display';
import { RouteError } from '@/pages/RouteError';
import { useRealtime } from '@/hooks/useRealtime';

function page(loader: () => Promise<{ default: ComponentType }>) {
  const C = lazy(loader);
  return (
    <Suspense fallback={<PageLoader />}>
      <C />
    </Suspense>
  );
}

function Root() {
  useRealtime();
  return (
    <>
      <ScrollToTop />
      <Outlet />
    </>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      {
        element: <MainLayout />,
        children: [
          { index: true, element: page(() => import('@/pages/HomePage')) },
          { path: 'catalog', element: page(() => import('@/pages/CatalogPage')) },
          { path: 'products/:id', element: page(() => import('@/pages/ProductPage')) },
          { path: 'suppliers', element: page(() => import('@/pages/SuppliersPage')) },
          { path: 'suppliers/:id', element: page(() => import('@/pages/SupplierPage')) },
          { path: 'cart', element: page(() => import('@/pages/CartPage')) },
          { path: 'contact', element: page(() => import('@/pages/info/ContactPage')) },
          { path: 'help', element: page(() => import('@/pages/info/HelpPage')) },
          { path: 'about', element: page(() => import('@/pages/info/AboutPage')) },
          { path: 'terms', element: page(() => import('@/pages/info/TermsPage')) },
          { path: 'privacy', element: page(() => import('@/pages/info/PrivacyPage')) },
          {
            element: <RequireAuth roles={['buyer']} />,
            children: [
              { path: 'checkout', element: page(() => import('@/pages/CheckoutPage')) },
              { path: 'checkout/success', element: page(() => import('@/pages/CheckoutSuccessPage')) },
            ],
          },
          {
            element: <RequireAuth />,
            children: [
              { path: 'assistant', element: page(() => import('@/pages/AssistantPage')) },
              {
                element: <AccountLayout />,
                children: [
                  { path: 'messages', element: page(() => import('@/pages/MessagesPage')) },
                  { path: 'messages/:id', element: page(() => import('@/pages/MessagesPage')) },
                  { path: 'notifications', element: page(() => import('@/pages/NotificationsPage')) },
                  { path: 'account/profile', element: page(() => import('@/pages/account/ProfilePage')) },
                  { path: 'account/settings', element: page(() => import('@/pages/account/SettingsPage')) },
                  {
                    element: <RequireAuth roles={['buyer']} />,
                    children: [
                      { path: 'account', element: page(() => import('@/pages/account/OverviewPage')) },
                      { path: 'account/orders', element: page(() => import('@/pages/account/OrdersPage')) },
                      { path: 'account/orders/:id', element: page(() => import('@/pages/account/OrderDetailPage')) },
                      { path: 'account/rfqs', element: page(() => import('@/pages/account/RfqsPage')) },
                      { path: 'account/favorites', element: page(() => import('@/pages/account/FavoritesPage')) },
                    ],
                  },
                ],
              },
            ],
          },
          { path: '*', element: page(() => import('@/pages/NotFoundPage')) },
        ],
      },
      {
        element: <GuestOnly />,
        children: [
          { path: 'login', element: page(() => import('@/pages/auth/LoginPage')) },
          { path: 'register', element: page(() => import('@/pages/auth/RegisterPage')) },
          { path: 'forgot-password', element: page(() => import('@/pages/auth/ForgotPasswordPage')) },
          { path: 'reset-password', element: page(() => import('@/pages/auth/ResetPasswordPage')) },
        ],
      },
      {
        path: 'seller',
        element: <RequireAuth roles={['seller']} />,
        children: [
          {
            element: page(() => import('@/pages/seller/SellerLayout')),
            children: [
              { index: true, element: page(() => import('@/pages/seller/SellerOverviewPage')) },
              { path: 'products', element: page(() => import('@/pages/seller/SellerProductsPage')) },
              { path: 'products/new', element: page(() => import('@/pages/seller/ProductFormPage')) },
              { path: 'products/:id/edit', element: page(() => import('@/pages/seller/ProductFormPage')) },
              { path: 'orders', element: page(() => import('@/pages/seller/SellerOrdersPage')) },
              { path: 'orders/:id', element: page(() => import('@/pages/seller/SellerOrderDetailPage')) },
              { path: 'rfqs', element: page(() => import('@/pages/seller/SellerRfqsPage')) },
              { path: 'company', element: page(() => import('@/pages/seller/CompanyPage')) },
            ],
          },
        ],
      },
      {
        path: 'courier',
        element: <RequireAuth roles={['courier']} />,
        children: [
          {
            element: page(() => import('@/pages/courier/CourierLayout')),
            children: [
              { index: true, element: page(() => import('@/pages/courier/CourierOverviewPage')) },
              { path: 'available', element: page(() => import('@/pages/courier/AvailablePage')) },
              { path: 'deliveries', element: page(() => import('@/pages/courier/DeliveriesPage')) },
              { path: 'deliveries/:id', element: page(() => import('@/pages/courier/DeliveryDetailPage')) },
              { path: 'schedule', element: page(() => import('@/pages/courier/SchedulePage')) },
            ],
          },
        ],
      },
      {
        path: 'admin',
        element: <RequireAuth roles={['admin']} />,
        children: [
          {
            element: page(() => import('@/pages/admin/AdminLayout')),
            children: [
              { index: true, element: page(() => import('@/pages/admin/AdminOverviewPage')) },
              { path: 'users', element: page(() => import('@/pages/admin/AdminUsersPage')) },
              { path: 'companies', element: page(() => import('@/pages/admin/AdminCompaniesPage')) },
              { path: 'products', element: page(() => import('@/pages/admin/AdminProductsPage')) },
              { path: 'orders', element: page(() => import('@/pages/admin/AdminOrdersPage')) },
              { path: 'orders/:id', element: page(() => import('@/pages/admin/AdminOrderDetailPage')) },
            ],
          },
        ],
      },
    ],
  },
]);
