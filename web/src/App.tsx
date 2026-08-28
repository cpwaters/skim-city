import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { PublicLayout } from './components/public/PublicLayout';
import { ScrollToTop } from './components/ScrollToTop';
import { Spinner } from './components/ui/States';

// Public pages load eagerly — they are the first thing a customer hits, and
// they are small.
import { HomePage } from './pages/public/HomePage';
import { ServicesPage } from './pages/public/ServicesPage';
import { GalleryPage } from './pages/public/GalleryPage';
import { ReviewsPage } from './pages/public/ReviewsPage';
import { ReviewPage } from './pages/public/ReviewPage';
import { BookPage } from './pages/public/BookPage';
import { ContactPage } from './pages/public/ContactPage';
import { QuotePage } from './pages/public/QuotePage';
import { PaymentResultPage } from './pages/public/PaymentResultPage';
import { PrivacyPage } from './pages/public/PrivacyPage';
import { TermsPage } from './pages/public/TermsPage';
import { NotFoundPage } from './pages/public/NotFoundPage';

/**
 * The whole CRM — auth provider, Firestore, every admin screen — sits behind
 * this one lazy boundary. Nothing under /app is downloaded by a customer
 * browsing the marketing site.
 */
const AdminApp = lazy(() => import('./AdminApp').then((module) => ({ default: module.AdminApp })));

export function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="gallery" element={<GalleryPage />} />
          <Route path="reviews" element={<ReviewsPage />} />
          <Route path="book" element={<BookPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="terms" element={<TermsPage />} />
        </Route>

        {/* Standalone: no site chrome, so the customer's attention stays on the
            quote or the payment result. */}
        <Route path="/quote/:token" element={<QuotePage />} />
        <Route path="/review/:token" element={<ReviewPage />} />
        <Route path="/pay/:result" element={<PaymentResultPage />} />

        <Route
          path="/app/*"
          element={
            <Suspense
              fallback={
                <div className="min-h-dvh grid place-items-center bg-noir-900">
                  <Spinner label="Loading" />
                </div>
              }
            >
              <AdminApp />
            </Suspense>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
