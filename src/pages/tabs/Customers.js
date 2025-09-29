// src/pages/tabs/Customers.js
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

// 💡 REMOVED `currentBusinessId` prop
const Customers = ({ internalUser }) => {
  const [customers, setCustomers] = useState([]);
  const [priceCategories, setPriceCategories] = useState([]);
  const [showCustomerPopup, setShowCustomerPopup] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [editingCustomer, setEditingCustomer] = useState(null);

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

  // 💡 This effect now fetches data from within the user's UID collection.
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid;

    // --- Fetch customers from the new location ---
    const fetchCustomers = async () => {
      try {
        const customersColRef = collection(db, uid, "customers", "customer_list");
        const snap = await getDocs(query(customersColRef));
        setCustomers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error fetching customers:", err.message);
      }
    };

    // --- Fetch price categories from the new location ---
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

  // --- Save customer ---
  const handleSaveCustomer = async () => {
    if (!newCustomerName.trim() || !selectedCategory) return alert("Customer Name and Price Category are required.");
    const uid = auth.currentUser.uid;

    try {
      // Logic for editing an existing customer
      if (editingCustomer) {
        const customerDocRef = doc(db, uid, "customers", "customer_list", editingCustomer.id);
        await updateDoc(customerDocRef, {
          name: newCustomerName.trim(),
          priceCategoryId: selectedCategory.id,
          priceCategoryName: selectedCategory.name,
          editedBy: username,
          editedAt: serverTimestamp(),
        });

        setCustomers((prev) =>
          prev.map((c) =>
            c.id === editingCustomer.id
              ? { ...c, name: newCustomerName.trim(), priceCategoryId: selectedCategory.id, priceCategoryName: selectedCategory.name }
              : c
          )
        );
      } else {
        // Logic for adding a new customer
        const customersColRef = collection(db, uid, "customers", "customer_list");
        const docRef = await addDoc(customersColRef, {
          name: newCustomerName.trim(),
          priceCategoryId: selectedCategory.id,
          priceCategoryName: selectedCategory.name,
          createdBy: username,
          editedBy: username,
          createdAt: serverTimestamp(),
        });
        setCustomers((prev) => [
          ...prev,
          { id: docRef.id, name: newCustomerName.trim(), priceCategoryId: selectedCategory.id, priceCategoryName: selectedCategory.name, createdBy: username },
        ]);
      }

      // Reset form state
      setShowCustomerPopup(false);
      setNewCustomerName("");
      setSelectedCategory("");
      setEditingCustomer(null);
    } catch (err) {
      alert("Error saving customer: " + err.message);
    }
  };

  // --- Delete customer ---
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Customers Management</h2>
        {isAdmin && (
          <button
            onClick={() => {
              setEditingCustomer(null);
              setNewCustomerName('');
              setSelectedCategory('');
              setShowCustomerPopup(true);
            }}
            style={{ padding: "8px 16px", background: "#3498db", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <AiOutlinePlus /> Add Customer
          </button>
        )}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            <th style={{ padding: 12, textAlign: 'left' }}>Customer Name</th>
            <th style={{ padding: 12, textAlign: 'left' }}>Assigned Price Category</th>
            <th style={{ padding: 12, textAlign: 'left' }}>Last Edited By</th>
            <th style={{ padding: 12, textAlign: 'left' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 12, fontWeight: 500 }}>{c.name}</td>
              <td style={{ padding: 12 }}>{c.priceCategoryName}</td>
              <td style={{ padding: 12 }}>{c.editedBy}</td>
              <td style={{ padding: 12 }}>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <AiOutlineEdit
                      style={{ cursor: "pointer", fontSize: '18px' }}
                      title="Edit Customer"
                      onClick={() => {
                        setEditingCustomer(c);
                        setNewCustomerName(c.name);
                        const selectedCat = priceCategories.find((p) => p.id === c.priceCategoryId);
                        setSelectedCategory(selectedCat || "");
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
              <td colSpan={4} style={{ textAlign: "center", padding: 20, color: "#777" }}>
                No customers have been added yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Customer Popup */}
      {showCustomerPopup && (
        <div style={popupStyle}>
          <div style={popupInnerStyle}>
            <h3>{editingCustomer ? "Edit Customer" : "Add New Customer"}</h3>

            <input
              type="text"
              placeholder="Customer Full Name"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
              style={{ width: "100%", padding: 10, marginBottom: 12, boxSizing: 'border-box' }}
            />

            <select
              value={selectedCategory?.id || ""}
              onChange={(e) =>
                setSelectedCategory(priceCategories.find((p) => p.id === e.target.value))
              }
              style={{ width: "100%", padding: 10, marginBottom: 20, boxSizing: 'border-box' }}
            >
              <option value="">Select Price Category</option>
              {priceCategories.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => { setShowCustomerPopup(false); setEditingCustomer(null); }}
                style={popupBtnStyle}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCustomer}
                style={{ ...popupBtnStyle, background: "#2ecc71", color: "#fff" }}
              >
                Save Customer
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