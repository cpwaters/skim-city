import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { RequireAdmin } from './components/app/RequireAdmin';
import { AppLayout } from './components/app/AppLayout';
import { LoginPage } from './pages/app/LoginPage';
import { Spinner } from './components/ui/States';
import { NotFoundPage } from './pages/public/NotFoundPage';

/**
 * CRM entry point, mounted at /app/* behind a lazy boundary in App.tsx.
 *
 * AuthProvider lives here rather than at the app root so that Firebase Auth is
 * never loaded for a customer who only visits the marketing site.
 */

const DashboardPage = lazy(() => import('./pages/app/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const DiaryPage = lazy(() => import('./pages/app/DiaryPage').then((m) => ({ default: m.DiaryPage })));
const JobsPage = lazy(() => import('./pages/app/JobsPage').then((m) => ({ default: m.JobsPage })));
const JobDetailPage = lazy(() => import('./pages/app/JobDetailPage').then((m) => ({ default: m.JobDetailPage })));
const CustomersPage = lazy(() => import('./pages/app/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const CustomerDetailPage = lazy(() =>
  import('./pages/app/CustomerDetailPage').then((m) => ({ default: m.CustomerDetailPage })),
);
const QuotesPage = lazy(() => import('./pages/app/QuotesPage').then((m) => ({ default: m.QuotesPage })));
const InvoicesPage = lazy(() => import('./pages/app/InvoicesPage').then((m) => ({ default: m.InvoicesPage })));
const PaymentsPage = lazy(() => import('./pages/app/PaymentsPage').then((m) => ({ default: m.PaymentsPage })));
const ReviewsManagerPage = lazy(() =>
  import('./pages/app/ReviewsManagerPage').then((m) => ({ default: m.ReviewsManagerPage })),
);
const GalleryManagerPage = lazy(() =>
  import('./pages/app/GalleryManagerPage').then((m) => ({ default: m.GalleryManagerPage })),
);
const SettingsPage = lazy(() => import('./pages/app/SettingsPage').then((m) => ({ default: m.SettingsPage })));

export function AdminApp() {
  return (
    <AuthProvider>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="login" element={<LoginPage />} />

          <Route
            element={
              <RequireAdmin>
                <AppLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="diary" element={<DiaryPage />} />
            <Route path="jobs" element={<JobsPage />} />
            <Route path="jobs/:jobId" element={<JobDetailPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="customers/:customerId" element={<CustomerDetailPage />} />
            <Route path="quotes" element={<QuotesPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="gallery" element={<GalleryManagerPage />} />
            <Route path="reviews" element={<ReviewsManagerPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
