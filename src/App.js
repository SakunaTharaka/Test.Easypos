import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import UserDetails from "./pages/UserDetails";
import Dashboard from "./pages/Dashboard";
import StockOutView from "./pages/tabs/StockOutView";
import InvoiceViewer from './pages/InvoiceViewer';
import MasterAdmin from './pages/MasterAdmin';
import BillingPage from './pages/BillingPage';
import MaintenancePage from './pages/MaintenancePage';
import VerifyEmail from "./pages/VerifyEmail"; 

// Import the Terms and Conditions page
import TermsAndConditions from "./pages/TermsAndConditions";

// ✅ UPDATED: Import POSPortal from the 'components' folder
import POSPortal from "./components/POSPortal";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        
        {/* New Route for Verification */}
        <Route path="/verify-email" element={<VerifyEmail />} />
        
        <Route path="/user-details" element={<UserDetails />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/stockout-view/:id" element={<StockOutView />} />
        <Route path="/invoice/view/:invoiceId" element={<InvoiceViewer />} />
        <Route path="/master-admin" element={<MasterAdmin />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/terms" element={<TermsAndConditions />} />

        {/* ✅ NEW: Route for the separate POS Screen */}
        <Route path="/pos" element={<POSPortal />} />
      </Routes>
    </Router>
  );
}

export default App;