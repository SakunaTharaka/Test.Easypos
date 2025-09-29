// src/pages/tabs/Items.js
import React, { useEffect, useState } from "react";
import { db, auth } from "../../firebase";
import {
  collection,
  addDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
} from "firebase/firestore";
import {
  AiOutlinePlus,
  AiOutlineDelete,
  AiOutlineEdit,
  AiOutlineSearch,
} from "react-icons/ai";

const Items = ({ internalUser }) => {
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({
    name: "",
    brand: "",
    sku: "",
    type: "",
    category: "",
  });
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const getCurrentInternal = () => {
    if (internalUser && Object.keys(internalUser).length) return internalUser;
    try {
      const stored = localStorage.getItem("internalLoggedInUser");
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return null;
  };

  const isAdmin = (() => {
    const cur = getCurrentInternal();
    return cur?.isAdmin === true || cur?.isAdmin === "1";
  })();

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setLoading(false);
      return;
    }
    const uid = currentUser.uid;

    const fetchData = async () => {
      setLoading(true);
      try {
        const settingsRef = doc(db, uid, "settings");
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          setCategories(settingsSnap.data().itemCategories || []);
        }

        const itemsColRef = collection(db, uid, "items", "item_list");
        const itemsSnap = await getDocs(query(itemsColRef));
        const data = itemsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setItems(data);
        setFilteredItems(data);
      } catch (error) {
        alert("Error fetching items: " + error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // 💡 This function now clears the brand when "ourProduct" is selected.
  const handleTypeSelect = (selectedType) => {
    if (selectedType === "ourProduct") {
      setForm((prev) => ({ ...prev, type: selectedType, brand: "" }));
    } else {
      setForm((prev) => ({ ...prev, type: selectedType }));
    }
  };
  
  const getNextPID = async (uid) => {
    const counterRef = doc(db, uid, "counters");
    try {
      const newPID = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        const currentPID = counterDoc.exists() ? counterDoc.data().lastItemID || 0 : 0;
        const nextPID = currentPID + 1;
        transaction.set(counterRef, { lastItemID: nextPID }, { merge: true });
        return nextPID;
      });
      return String(newPID).padStart(6, "0");
    } catch (err) {
      console.error("Error generating PID:", err.message);
      alert("Could not generate a new Product ID. Please try again.");
      return null;
    }
  };

  // 💡 The save logic now handles cases where "brand" is not needed.
  const handleSave = async () => {
    if ((form.type !== "ourProduct" && !form.brand?.trim()) || !form.name?.trim() || !form.type) {
      return alert("Item Name, Type, and Brand (if not 'ourProduct') are required.");
    }
    
    const currentUser = auth.currentUser;
    if (!currentUser) return alert("You must be logged in to save items.");
    const uid = currentUser.uid;

    try {
      const username = getCurrentInternal()?.username || "Admin";
      // Construct the final name based on the item type
      const finalName = form.type === "ourProduct"
        ? form.name.trim()
        : `${form.brand.trim()} ${form.name.trim()}`;

      const itemsColRef = collection(db, uid, "items", "item_list");

      if (editingItem) {
        const itemDocRef = doc(itemsColRef, editingItem.id);
        const updates = {
          name: finalName,
          brand: form.brand.trim(),
          sku: form.sku || "",
          type: form.type,
          category: form.category || "",
          lastEditedBy: username,
          lastEditedAt: serverTimestamp(),
        };
        await updateDoc(itemDocRef, updates);
        setItems((prev) => prev.map((i) => (i.id === editingItem.id ? { ...i, ...updates, name: finalName } : i)));

      } else {
        const pid = await getNextPID(uid);
        if (pid === null) return;

        const newDoc = {
          name: finalName,
          brand: form.brand.trim(),
          sku: form.sku || "",
          type: form.type,
          category: form.category || "",
          addedBy: username,
          createdAt: serverTimestamp(),
          pid,
        };
        const docRef = await addDoc(itemsColRef, newDoc);
        const newItem = { ...newDoc, id: docRef.id, createdAt: new Date() };
        setItems((prev) => [newItem, ...prev]);
      }

      setForm({ name: "", brand: "", sku: "", type: "", category: "" });
      setEditingItem(null);
      setShowModal(false);
    } catch (error) {
      alert("Error saving item: " + error.message);
    }
  };

  const handleDelete = async (id) => {
    if (!isAdmin) return alert("Only admins can delete items.");
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    
    const uid = auth.currentUser.uid;
    const itemDocRef = doc(db, uid, "items", "item_list", id);
    
    try {
      await deleteDoc(itemDocRef);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (error) {
      alert("Error deleting item: " + error.message);
    }
  };

  useEffect(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      setFilteredItems(items);
      return;
    }
    const filtered = items.filter((i) =>
      Object.values(i).some(val => String(val).toLowerCase().includes(term))
    );
    setFilteredItems(filtered);
    setCurrentPage(1);
  }, [search, items]);

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const currentItems = filteredItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (loading) return <p>Loading items...</p>;

  return (
    <div style={{ padding: "24px", fontFamily: "'Segoe UI', sans-serif" }}>
      <h2 style={{ fontSize: "24px", fontWeight: "600", color: "#333" }}>Items Management</h2>

      <div style={{ margin: "20px 0", display: "flex", gap: "12px", alignItems: "center" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <AiOutlineSearch style={{ position: "absolute", top: "10px", left: "10px", color: "#888" }} />
          <input
            type="text"
            placeholder="Search by any field..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, width: "100%", padding: "8px 8px 8px 34px", border: "1px solid #ddd", borderRadius: "6px" }}
          />
        </div>
        <button
          onClick={() => {
            setForm({ name: "", brand: "", sku: "", type: "", category: "" });
            setEditingItem(null);
            setShowModal(true);
          }}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "#3498db", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: '14px' }}
        >
          <AiOutlinePlus /> Add Item
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: '800px' }}>
            <thead>
                <tr style={{ background: "#f5f5f5", textAlign: "left" }}>
                    <th style={{ padding: "12px" }}>PID</th>
                    <th style={{ padding: "12px" }}>Item</th>
                    <th style={{ padding: "12px" }}>SKU</th>
                    <th style={{ padding: "12px" }}>Type</th>
                    <th style={{ padding: "12px" }}>Category</th>
                    <th style={{ padding: "12px" }}>Added By</th>
                    <th style={{ padding: "12px" }}>Actions</th>
                </tr>
            </thead>
            <tbody>
                {currentItems.map((item) => (
                    <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
                        <td style={{ padding: "12px" }}>{item.pid}</td>
                        <td style={{ padding: "12px", fontWeight: 500 }}>{item.name}</td>
                        <td style={{ padding: "12px" }}>{item.sku || "-"}</td>
                        <td style={{ padding: "12px" }}>{item.type}</td>
                        <td style={{ padding: "12px" }}>{item.category || "-"}</td>
                        <td style={{ padding: "12px" }}>{item.addedBy || "-"}</td>
                        <td style={{ padding: "12px", display: "flex", gap: "8px" }}>
                            <button onClick={() => { setEditingItem(item); setForm({ name: item.type === 'ourProduct' ? item.name : item.name.replace(`${item.brand} `, ""), brand: item.brand, sku: item.sku || "", type: item.type, category: item.category || "", }); setShowModal(true); }} style={{ background: "#f39c12", color: "white", border: "none", borderRadius: "4px", padding: "8px", cursor: "pointer", display: 'flex', alignItems: 'center' }} title="Edit">
                                <AiOutlineEdit />
                            </button>
                            {isAdmin && (
                                <button onClick={() => handleDelete(item.id)} style={{ background: "#e74c3c", color: "white", border: "none", borderRadius: "4px", padding: "8px", cursor: "pointer", display: 'flex', alignItems: 'center' }} title="Delete">
                                    <AiOutlineDelete />
                                </button>
                            )}
                        </td>
                    </tr>
                ))}
                {currentItems.length === 0 && (
                    <tr><td colSpan="7" style={{ textAlign: "center", padding: "20px", color: "#777" }}>No items found.</td></tr>
                )}
            </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ marginTop: "20px", display: "flex", justifyContent: 'center', gap: "8px" }}>
          {Array.from({ length: totalPages }, (_, i) => (
            <button key={i} onClick={() => setCurrentPage(i + 1)} style={{ padding: "6px 12px", border: "1px solid #ddd", background: currentPage === i + 1 ? "#3498db" : "white", color: currentPage === i + 1 ? "white" : "black", borderRadius: "4px", cursor: "pointer" }}>{i + 1}</button>
          ))}
        </div>
      )}

      {showModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", padding: "24px", borderRadius: "8px", width: "100%", maxWidth: "450px" }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>{editingItem ? "Edit Item" : "Add New Item"}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                
                {/* 💡 Item Type moved to the top */}
                <div style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '10px' }}>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: '10px' }}>Item Type *</label>
                    <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                        {["storesItem", "ourProduct", "buySell"].map((t) => (
                            <label key={t} style={{ cursor: 'pointer' }}><input type="radio" name="type" checked={form.type === t} onChange={() => handleTypeSelect(t)} style={{ marginRight: "6px" }}/>{t}</label>
                        ))}
                    </div>
                </div>

                {/* 💡 Brand field is now conditional */}
                {form.type !== "ourProduct" && (
                  <input type="text" name="brand" placeholder="Brand (e.g., Coca-Cola)" value={form.brand} onChange={handleChange} style={{ width: "100%", padding: "10px", boxSizing: 'border-box' }}/>
                )}
                
                <input type="text" name="name" placeholder="Item Name (e.g., Classic Coke)" value={form.name} onChange={handleChange} style={{ width: "100%", padding: "10px", boxSizing: 'border-box' }}/>
                <input type="text" name="sku" placeholder="SKU / Barcode (optional)" value={form.sku} onChange={handleChange} style={{ width: "100%", padding: "10px", boxSizing: 'border-box' }}/>

                <div>
                    <label style={{ display: "block", marginBottom: "6px" }}>Category</label>
                    <select name="category" value={form.category} onChange={handleChange} style={{ width: "100%", padding: "10px" }}>
                        <option value="">Select category</option>
                        {categories.map((c, idx) => (<option key={idx} value={c}>{c}</option>))}
                    </select>
                </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: '24px' }}>
              <button onClick={() => { setShowModal(false); setEditingItem(null); }} style={{ padding: "10px 16px", background: '#eee' }}>Cancel</button>
              <button onClick={handleSave} style={{ background: "#2ecc71", color: "white", border: "none", padding: "10px 20px", borderRadius: "4px" }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Items;