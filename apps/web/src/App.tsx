import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute, AdminRoute } from './routes/ProtectedRoutes';
import LandingPage from './pages/landing/LandingPage';
import LoginPage from './pages/LoginPage';
import AppShell from './components/layout/AppShell';
import HomePage from './pages/HomePage';
import ProjectLayout from './components/project/ProjectLayout';
import ProjectEntriesPage from './pages/project/ProjectEntriesPage';
import ProjectDocumentsPage from './pages/project/ProjectDocumentsPage';
import ProjectAnalysisPage from './pages/project/ProjectAnalysisPage';
import ProjectBankPage from './pages/project/ProjectBankPage';
import ProjectBankAccountPage from './pages/project/ProjectBankAccountPage';
import ProjectEarningsPage from './pages/project/ProjectEarningsPage';
import ProjectEmiPage from './pages/project/ProjectEmiPage';
import ProjectInvoicesPage from './pages/project/ProjectInvoicesPage';
import ProjectInvoiceDetailPage from './pages/project/ProjectInvoiceDetailPage';
import ProjectGstPage from './pages/project/ProjectGstPage';
import PartnerAnalyticsPage from './pages/PartnerAnalyticsPage';
import AdminPage from './pages/admin/AdminPage';

/**
 * Root application router.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="project/:id" element={<ProjectLayout />}>
            <Route index element={<Navigate to="entries" replace />} />
            <Route path="entries" element={<ProjectEntriesPage />} />
            <Route path="documents" element={<ProjectDocumentsPage />} />
            <Route path="analysis" element={<ProjectAnalysisPage />} />
            <Route path="bank" element={<ProjectBankPage />} />
            <Route path="bank/:accountId" element={<ProjectBankAccountPage />} />
            <Route path="earnings" element={<ProjectEarningsPage />} />
            <Route path="emi" element={<ProjectEmiPage />} />
            <Route path="invoices" element={<ProjectInvoicesPage />} />
            <Route path="invoices/:invoiceId" element={<ProjectInvoiceDetailPage />} />
            <Route path="gst" element={<ProjectGstPage />} />
            <Route path="partner/:partnerId" element={<PartnerAnalyticsPage />} />
          </Route>
          <Route element={<AdminRoute />}>
            <Route path="admin" element={<Navigate to="/app/admin/users" replace />} />
            <Route path="admin/:tab" element={<AdminPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
