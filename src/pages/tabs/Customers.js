import React, { useEffect, useState } from "react";
import { db, auth } from "../../firebase";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { AiOutlinePlus, AiOutlineDelete, AiOutlineEdit } from "react-icons/ai";
import { FaUserTag } from "react-icons/fa";

// ✅ **1. Receive the new 'maintainCreditCustomers' prop**
const Customers = ({ internalUser, maintainCreditCustomers }) => {
  const [customers, setCustomers] = useState([]);
  const [priceCategories, setPriceCategories] = useState([]);
  const [showCustomerPopup, setShowCustomerPopup] = useState(false);
  
  const [form, setForm] = useState({
    name: "",
    priceCategoryId: "",
    priceCategoryName: "",
    isCreditCustomer: false,
    overdueDays: 30,
  });
  
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // ✅ Defined Constant for Limit
  const MAX_CUSTOMERS = 100;

  const getCurrentInternal = () => {
    if (internalUser && Object.keys(internalUser).length) return internalUser;
    try {
      const stored = localStorage.getItem("internalLoggedInUser");
      if (stored) return JSON.parse(stored);
    } catch {}
    return null;
  };

  const currentUser = getCurrentInternal();
  const isAdmin = currentUser?.isAdmin === true || currentUser?.isAdmin === "1";
  const username = currentUser?.username || "Admin";

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid;

    const fetchCustomers = async () => {
      try {
        const customersColRef = collection(db, uid, "customers", "customer_list");
        const snap = await getDocs(query(customersColRef));
        setCustomers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error fetching customers:", err.message);
      }
    };

    const fetchPriceCategories = async () => {
      try {
        const catColRef = collection(db, uid, "price_categories", "categories");
        const snap = await getDocs(query(catColRef));
        setPriceCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error fetching price categories:", err.message);
      }
    };

    fetchCustomers();
    fetchPriceCategories();
  }, []);

  const resetForm = () => {
    setForm({
      name: "",
      priceCategoryId: "",
      priceCategoryName: "",
      isCreditCustomer: false,
      overdueDays: 30,
    });
    setEditingCustomer(null);
  };
  
  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
        setForm(prev => ({ ...prev, [name]: checked }));
    } else if (name === 'overdueDays') {
        const numericValue = value.replace(/[^0-9]/g, '');
        setForm(prev => ({ ...prev, [name]: numericValue }));
    } else {
        setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleCategoryChange = (e) => {
    const selectedCat = priceCategories.find((p) => p.id === e.target.value);
    setForm(prev => ({
        ...prev,
        priceCategoryId: selectedCat ? selectedCat.id : "",
        priceCategoryName: selectedCat ? selectedCat.name : "",
    }));
  };

  const handleSaveCustomer = async () => {
    if (!form.name.trim() || !form.priceCategoryId) {
      return alert("Customer Name and Price Category are required.");
    }

    // ✅ **LIMIT CHECK**: Allow max 50 customers
    if (!editingCustomer && customers.length >= MAX_CUSTOMERS) {
        return alert(`Customer Limit Reached (Max ${MAX_CUSTOMERS}).\nYou cannot create more customers. Please delete old customers to add new ones.`);
    }
    
    setIsSaving(true);
    const uid = auth.currentUser.uid;

    try {
      const dataToSave = {
        name: form.name.trim(),
        priceCategoryId: form.priceCategoryId,
        priceCategoryName: form.priceCategoryName,
        isCreditCustomer: form.isCreditCustomer,
        overdueDays: form.isCreditCustomer ? Number(form.overdueDays) || 0 : 0,
        editedBy: username,
        editedAt: serverTimestamp(),
      };

      if (editingCustomer) {
        const customerDocRef = doc(db, uid, "customers", "customer_list", editingCustomer.id);
        await updateDoc(customerDocRef, dataToSave);
        setCustomers((prev) => prev.map((c) => c.id === editingCustomer.id ? { ...c, ...dataToSave } : c));
      } else {
        const customersColRef = collection(db, uid, "customers", "customer_list");
        const docRef = await addDoc(customersColRef, {
          ...dataToSave,
          createdBy: username,
          createdAt: serverTimestamp(),
        });
        setCustomers((prev) => [...prev, { id: docRef.id, ...dataToSave, createdBy: username, createdAt: new Date() }]);
      }

      setShowCustomerPopup(false);
      resetForm();
    } catch (err) {
      alert("Error saving customer: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCustomer = async (id) => {
    if (!window.confirm("Are you sure you want to delete this customer?")) return;
    const uid = auth.currentUser.uid;
    const customerDocRef = doc(db, uid, "customers", "customer_list", id);
    
    try {
      await deleteDoc(customerDocRef);
      setCustomers((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      alert("Error deleting customer: " + err.message);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      {/* HEADER ROW: Title (Left) + Limit Badge (Right) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", color: "#333", margin: 0 }}>Customers Management</h2>
        
        {/* ✅ VISUAL COUNTER (Exact Match to Items.js) */}
        <div style={{ 
            backgroundColor: customers.length >= MAX_CUSTOMERS ? '#fadbd8' : '#e8f6f3',
            color: customers.length >= MAX_CUSTOMERS ? '#c0392b' : '#27ae60',
            padding: '8px 16px',
            borderRadius: '20px',
            fontWeight: '600',
            fontSize: '14px',
            border: customers.length >= MAX_CUSTOMERS ? '1px solid #e74c3c' : '1px solid #2ecc71'
        }}>
            Total Customers: {customers.length} / {MAX_CUSTOMERS}
        </div>
      </div>

      {/* ACTION ROW: Button (Right Aligned) */}
      {isAdmin && (
        <div style={{ marginBottom: "20px", display: "flex", justifyContent: 'flex-end', alignItems: "center" }}>
          <button
            onClick={() => {
              if (customers.length >= MAX_CUSTOMERS) {
                  return alert(`Customer Limit Reached (Max ${MAX_CUSTOMERS}).\nPlease delete old customers to add new ones.`);
              }
              resetForm();
              setShowCustomerPopup(true);
            }}
            style={{ 
                padding: "8px 16px", 
                background: customers.length >= MAX_CUSTOMERS ? "#95a5a6" : "#3498db", 
                color: "#fff", 
                border: "none", 
                borderRadius: 4, 
                cursor: customers.length >= MAX_CUSTOMERS ? "not-allowed" : "pointer", 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px' 
            }}
          >
            <AiOutlinePlus /> Add Customer
          </button>
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            <th style={{ padding: 12, textAlign: 'left' }}>Customer Name</th>
            <th style={{ padding: 12, textAlign: 'left' }}>Assigned Price Category</th>
            <th style={{ padding: 12, textAlign: 'left' }}>Overdue Limit</th>
            <th style={{ padding: 12, textAlign: 'left' }}>Last Edited By</th>
            <th style={{ padding: 12, textAlign: 'left' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                {c.name}
                {c.isCreditCustomer && <FaUserTag color="#e67e22" title={`Credit Customer (Overdue in ${c.overdueDays} days)`} />}
              </td>
              <td style={{ padding: 12 }}>{c.priceCategoryName}</td>
              <td style={{ padding: 12 }}>
                {c.isCreditCustomer ? `${c.overdueDays} days` : 'N/A'}
              </td>
              <td style={{ padding: 12 }}>{c.editedBy}</td>
              <td style={{ padding: 12 }}>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <AiOutlineEdit
                      style={{ cursor: "pointer", fontSize: '18px' }}
                      title="Edit Customer"
                      onClick={() => {
                        setEditingCustomer(c);
                        setForm({
                            name: c.name,
                            priceCategoryId: c.priceCategoryId,
                            priceCategoryName: c.priceCategoryName,
                            isCreditCustomer: c.isCreditCustomer || false,
                            overdueDays: c.overdueDays || 30,
                        });
                        setShowCustomerPopup(true);
                      }}
                    />
                    <AiOutlineDelete
                      style={{ cursor: "pointer", fontSize: '18px', color: '#e74c3c' }}
                      title="Delete Customer"
                      onClick={() => handleDeleteCustomer(c.id)}
                    />
                  </div>
                )}
              </td>
            </tr>
          ))}
          {customers.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", padding: 20, color: "#777" }}>
                No customers have been added yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {showCustomerPopup && (
        <div style={popupStyle}>
          <div style={popupInnerStyle}>
            <h3>{editingCustomer ? "Edit Customer" : "Add New Customer"}</h3>

            <input
              type="text"
              name="name"
              placeholder="Customer Full Name"
              value={form.name}
              onChange={handleFormChange}
              style={{ width: "100%", padding: 10, marginBottom: 12, boxSizing: 'border-box' }}
            />

            <select
              name="priceCategoryId"
              value={form.priceCategoryId}
              onChange={handleCategoryChange}
              style={{ width: "100%", padding: 10, marginBottom: 12, boxSizing: 'border-box' }}
            >
              <option value="">Select Price Category</option>
              {priceCategories.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            
            {/* ✅ **2. Conditionally render the credit customer section based on the setting** */}
            {maintainCreditCustomers && !editingCustomer && (
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px', gap: '10px' }}>
                  <input 
                      type="checkbox"
                      id="isCreditCustomer"
                      name="isCreditCustomer"
                      checked={form.isCreditCustomer}
                      onChange={handleFormChange}
                      style={{width: '18px', height: '18px'}}
                  />
                  <label htmlFor="isCreditCustomer" style={{fontWeight: 500}}>Credit Customer</label>
              </div>
            )}
            
            {form.isCreditCustomer && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', padding: '10px', background: '#f9f9f9', borderRadius: '4px' }}>
                    <label htmlFor="overdueDays">Overdue in</label>
                    <input
                        type="text"
                        id="overdueDays"
                        name="overdueDays"
                        value={form.overdueDays}
                        onChange={handleFormChange}
                        style={{ width: '60px', padding: '8px', textAlign: 'center' }}
                    />
                    <label htmlFor="overdueDays">days</label>
                </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => { setShowCustomerPopup(false); resetForm(); }}
                style={popupBtnStyle}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCustomer}
                disabled={isSaving}
                style={{ 
                    ...popupBtnStyle, 
                    background: "#2ecc71", 
                    color: "#fff",
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    opacity: isSaving ? 0.7 : 1,
                }}
              >
                {isSaving ? 'Saving...' : 'Save Customer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const popupStyle = {
  position: "fixed",
  zIndex: 1001,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const popupInnerStyle = { background: "#fff", padding: 24, borderRadius: 8, width: 400, boxShadow: '0 5px 15px rgba(0,0,0,0.3)' };
const popupBtnStyle = { padding: "10px 16px", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 500 };

export default Customers;