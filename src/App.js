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

// Import the Terms and Conditions page
import TermsAndConditions from "./pages/TermsAndConditions";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/user-details" element={<UserDetails />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/stockout-view/:id" element={<StockOutView />} />
        <Route path="/invoice/view/:invoiceId" element={<InvoiceViewer />} />
        <Route path="/master-admin" element={<MasterAdmin />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        
        {/* Add the new route for the Terms page */}
        <Route path="/terms" element={<TermsAndConditions />} />
      </Routes>
    </Router>
  );
}

export default App;

