import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import UserDetails from "./pages/UserDetails";
import Dashboard from "./pages/Dashboard";
import StockOutView from "./pages/tabs/StockOutView";
import InvoiceViewer from './pages/InvoiceViewer';

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
      </Routes>
    </Router>
  );
}

export default App;