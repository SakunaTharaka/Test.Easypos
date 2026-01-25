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
  orderBy,
  limit,
  startAfter,
  where,
  writeBatch,
  increment, 
} from "firebase/firestore";
import {
  AiOutlinePlus,
  AiOutlineDelete,
  AiOutlineEdit,
  AiOutlineSearch,
  AiOutlineClose
} from "react-icons/ai";

const Items = ({ internalUser }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  // ✅ UPDATED: 'sku' is now an array in local state
  const [form, setForm] = useState({ 
    name: "", 
    brand: "", 
    sku: [], // Array to hold multiple SKUs
    type: "", 
    category: "",
    warranty: { years: "", months: "", days: "" } 
  });

  // ✅ NEW: Temporary input state for SKU typing
  const [skuInput, setSkuInput] = useState("");
  
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [inventoryType, setInventoryType] = useState(null);
  
  const [enableWarranty, setEnableWarranty] = useState(false);
  
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [totalItems, setTotalItems] = useState(0);
  const MAX_ITEMS = 1000;

  const [currentPage, setCurrentPage] = useState(1);
  const [lastVisible, setLastVisible] = useState(null);
  const [pageCursors, setPageCursors] = useState({ 1: null });
  const [hasNextPage, setHasNextPage] = useState(false);
  const itemsPerPage = 100;

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
    const fetchCount = async () => {
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        try {
            const counterRef = doc(db, uid, "counters");
            const snap = await getDoc(counterRef);
            if (snap.exists()) {
                setTotalItems(snap.data().totalItems || 0);
            }
        } catch (error) {
            console.error("Error fetching item count:", error);
        }
    };
    fetchCount();
  }, []);

  const fetchItems = async () => {
      setLoading(true);
      const currentUser = auth.currentUser;
      if (!currentUser) { setLoading(false); return; }
      const uid = currentUser.uid;

      try {
        const itemsColRef = collection(db, uid, "items", "item_list");
        let q;

        const searchTerm = search.trim().toLowerCase();

        if (searchTerm) {
            q = query(itemsColRef, orderBy("createdAt", "desc"), limit(500));
            const itemsSnap = await getDocs(q);
            const allFetched = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const filteredItems = allFetched.filter(item => {
                // ✅ UPDATED Search Logic for Array SKUs
                const skuMatch = Array.isArray(item.sku) 
                    ? item.sku.some(s => s.toLowerCase().includes(searchTerm))
                    : (item.sku && item.sku.toString().toLowerCase().includes(searchTerm));

                return (
                    (item.pid && item.pid.toString().includes(searchTerm)) ||
                    (item.name && item.name.toLowerCase().includes(searchTerm)) ||
                    (item.brand && item.brand.toLowerCase().includes(searchTerm)) ||
                    skuMatch ||
                    (item.category && item.category.toLowerCase().includes(searchTerm))
                );
            });

            setItems(filteredItems);
            setHasNextPage(false); 
        } else {
            q = query(itemsColRef, orderBy("createdAt", "desc"));
            const cursor = pageCursors[currentPage];
            if (cursor) {
              q = query(q, startAfter(cursor));
            }
            q = query(q, limit(itemsPerPage));

            const itemsSnap = await getDocs(q);
            const fetchedItems = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            setItems(fetchedItems);
            
            if (!itemsSnap.empty) {
                const lastDoc = itemsSnap.docs[itemsSnap.docs.length - 1];
                setLastVisible(lastDoc);
                setHasNextPage(itemsSnap.docs.length === itemsPerPage);
            } else {
                setHasNextPage(false);
            }
        }

      } catch (error) {
        console.error("Firestore Query Error:", error); 
        alert("Error fetching items: " + error.message);
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    if(inventoryType) fetchItems();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, search, inventoryType]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const fetchSettings = async () => {
        const settingsRef = doc(db, uid, "settings");
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          const settingsData = settingsSnap.data();
          setCategories(settingsData.itemCategories || []);
          setInventoryType(settingsData.inventoryType || "Buy and Sell only");
          setEnableWarranty(settingsData.enableWarranty || false);
        } else {
          setInventoryType("Buy and Sell only");
        }
    }
    fetchSettings();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    setPageCursors({ 1: null });
    setLastVisible(null);
  }, [search]);

  const handlePageChange = (direction) => {
      if (direction === 'next' && hasNextPage) {
          setPageCursors(prev => ({ ...prev, [currentPage + 1]: lastVisible }));
          setCurrentPage(prev => prev + 1);
      } else if (direction === 'prev' && currentPage > 1) {
          setCurrentPage(prev => prev - 1);
      }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleWarrantyChange = (field, value) => {
    const numVal = Math.max(0, parseInt(value) || 0);
    setForm(prev => ({
        ...prev,
        warranty: { ...prev.warranty, [field]: numVal === 0 ? "" : numVal }
    }));
  };

  // ✅ NEW: Handle SKU Input (Enter Key)
  const handleSkuKeyDown = (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const val = skuInput.trim();
        if (!val) return;
        
        // Limit to 3 SKUs
        if (form.sku.length >= 3) {
            alert("You can only add up to 3 SKUs per item.");
            return;
        }

        // Prevent duplicates in the list
        if (form.sku.includes(val)) {
            setSkuInput("");
            return;
        }

        setForm(prev => ({ ...prev, sku: [...prev.sku, val] }));
        setSkuInput("");
    }
  };

  // ✅ NEW: Remove SKU Chip
  const handleRemoveSku = (indexToRemove) => {
    setForm(prev => ({ ...prev, sku: prev.sku.filter((_, i) => i !== indexToRemove) }));
  };

  const handleTypeSelect = (selectedType) => {
    setForm((prev) => ({ ...prev, type: selectedType, brand: selectedType === "ourProduct" ? "" : prev.brand }));
  };
  
  const getNextPID = async (uid) => {
    const counterRef = doc(db, uid, "counters");
    try {
      return await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        
        // Check current count
        const currentData = counterDoc.data() || {};
        const currentCount = currentData.totalItems || 0;

        if (currentCount >= MAX_ITEMS) {
            throw new Error("MAX_LIMIT_REACHED");
        }

        const nextPID = (currentData.lastItemID || 0) + 1;
        
        // Increment totalItems and set new PID
        transaction.set(counterRef, { 
            lastItemID: nextPID,
            totalItems: currentCount + 1 
        }, { merge: true });

        return String(nextPID).padStart(6, "0");
      });
    } catch (err) {
      if (err.message === "MAX_LIMIT_REACHED") {
          alert(`You have reached the maximum limit of ${MAX_ITEMS} items.`);
          return "LIMIT_REACHED";
      }
      console.error(err);
      alert("Could not generate a new Product ID. Please try again.");
      return null;
    }
  };

  const handleSave = async () => {
    if (!form.name?.trim() || !form.type) {
      return alert("Item Name and Type are required.");
    }
    
    setIsSaving(true);
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setIsSaving(false);
      return;
    }

    const itemsColRef = collection(db, uid, "items", "item_list");

    // ✅ UPDATED: SKU Uniqueness Check (Handles Arrays & Strings)
    // We must check if ANY of the entered SKUs exist in the DB
    const skusToCheck = form.sku; // This is an array
    if (skusToCheck.length > 0) {
      try {
        for (const sku of skusToCheck) {
            // Check 1: Does it exist as a simple string? (Legacy items)
            const qString = query(itemsColRef, where("sku", "==", sku));
            const snapString = await getDocs(qString);
            
            // Check 2: Does it exist inside an array? (New items)
            const qArray = query(itemsColRef, where("sku", "array-contains", sku));
            const snapArray = await getDocs(qArray);

            const allFound = [...snapString.docs, ...snapArray.docs];

            // Filter out self if editing
            const duplicates = allFound.filter(doc => editingItem ? doc.id !== editingItem.id : true);

            if (duplicates.length > 0) {
                alert(`The SKU "${sku}" is already in use by another item. Please remove duplicate SKUs.`);
                setIsSaving(false);
                return;
            }
        }
      } catch (error) {
        alert("Error checking SKU uniqueness: " + error.message);
        setIsSaving(false);
        return;
      }
    }

    try {
      const username = getCurrentInternal()?.username || "Admin";
      
      const finalName = (form.type !== "ourProduct" && form.brand.trim()) 
        ? `${form.brand.trim()} ${form.name.trim()}` 
        : form.name.trim();

      const dataToSave = {
          name: finalName,
          name_lowercase: finalName.toLowerCase(),
          brand: form.brand.trim(),
          sku: form.sku, // ✅ Saving as Array
          type: form.type,
          category: form.category || "",
          warranty: enableWarranty ? form.warranty : null, 
          lastEditedBy: username,
          lastEditedAt: serverTimestamp(),
      };

      if (editingItem) {
        setIsSyncing(true);
        const itemDocRef = doc(itemsColRef, editingItem.id);
        await updateDoc(itemDocRef, dataToSave);
        
        // Sync to Price Categories
        try {
            const pricedItemsRef = collection(db, uid, "price_categories", "priced_items");
            const q = query(pricedItemsRef, where("itemId", "==", editingItem.id));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const batch = writeBatch(db);
                querySnapshot.forEach((doc) => {
                    batch.update(doc.ref, {
                        itemName: finalName,
                        itemSKU: form.sku, // Update array
                        itemBrand: form.brand.trim(),
                        itemType: form.type,
                        sku: form.sku 
                    });
                });
                await batch.commit();
                console.log("Synced item updates to price categories.");
            }
        } catch (syncError) {
            console.error("Error syncing to price categories:", syncError);
        }

        setItems(prevItems => prevItems.map(item => 
          item.id === editingItem.id ? { ...item, ...dataToSave } : item
        ));

      } else {
        const pid = await getNextPID(uid);
        
        if (pid === "LIMIT_REACHED") {
            setIsSaving(false);
            setIsSyncing(false);
            return;
        }
        if (pid === null) {
          setIsSaving(false);
          setIsSyncing(false);
          return;
        }

        const newData = { ...dataToSave, addedBy: username, createdAt: serverTimestamp(), pid };
        const docRef = await addDoc(itemsColRef, newData);
        setItems(prevItems => [{ id: docRef.id, ...newData, createdAt: new Date() }, ...prevItems]);
        setTotalItems(prev => prev + 1);
      }

      setForm({ name: "", brand: "", sku: [], type: "", category: "", warranty: { years: "", months: "", days: "" } });
      setSkuInput("");
      setEditingItem(null);
      setShowModal(false);
    } catch (error) {
      alert("Error saving item: " + error.message);
    } finally {
      setIsSaving(false);
      setIsSyncing(false); 
    }
  };

  const handleDelete = async (id) => {
    if (!isAdmin || !window.confirm("Are you sure?")) return;
    const uid = auth.currentUser.uid;
    try {
      await deleteDoc(doc(db, uid, "items", "item_list", id));
      const counterRef = doc(db, uid, "counters");
      await updateDoc(counterRef, { totalItems: increment(-1) });
      setItems(prevItems => prevItems.filter(item => item.id !== id));
      setTotalItems(prev => Math.max(0, prev - 1));
    } catch (error) {
      alert("Error deleting item: " + error.message);
    }
  };

  const getItemTypeOptions = () => {
    switch (inventoryType) {
      case "Buy and Sell only":
        return [{ value: "buySell", label: "Buy/Sell Item" }];
      case "Production Selling only":
        return [
          { value: "storesItem", label: "Stores Item / Raw Material" },
          { value: "ourProduct", label: "Finished Product" },
        ];
      case "We doing both":
      default:
        return [
          { value: "buySell", label: "Buy/Sell Item" },
          { value: "storesItem", label: "Stores Item / Raw Material" },
          { value: "ourProduct", label: "Finished Product" },
        ];
    }
  };
  const itemTypeOptions = getItemTypeOptions();

  const handleAddItemClick = () => {
    if (totalItems >= MAX_ITEMS) {
        return alert(`Maximum limit of ${MAX_ITEMS} items reached. Please delete some items to add new ones.`);
    }

    let defaultType = "";
    if (inventoryType === "Buy and Sell only") {
      defaultType = "buySell";
    } else if (inventoryType === "Production Selling only") {
      defaultType = "storesItem";
    }
    
    setForm({ 
        name: "", 
        brand: "", 
        sku: [], // Reset as empty array
        type: defaultType, 
        category: "", 
        warranty: { years: "", months: "", days: "" } 
    });
    setSkuInput("");
    setEditingItem(null);
    setShowModal(true);
  };

  const handleEditClick = (item) => {
      setEditingItem(item);
      
      // ✅ Handle Backward Compatibility: 
      // If 'sku' is string (old data), convert to array [string]. 
      // If 'sku' is already array, use it.
      let skusArray = [];
      if (Array.isArray(item.sku)) {
          skusArray = item.sku;
      } else if (item.sku) {
          skusArray = [item.sku];
      }

      setForm({
          name: item.type === 'ourProduct' ? item.name : item.name.replace(`${item.brand} `, ""),
          brand: item.brand || "",
          sku: skusArray,
          type: item.type,
          category: item.category || "",
          warranty: item.warranty || { years: "", months: "", days: "" }
      });
      setSkuInput("");
      setShowModal(true);
  };

  return (
    <div style={{ padding: "24px", fontFamily: "'Segoe UI', sans-serif" }}>
      
      {isSyncing && (
        <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(255, 255, 255, 0.85)",
            zIndex: 9999,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            backdropFilter: "blur(2px)"
        }}>
            <div style={{
                border: "5px solid #f3f3f3",
                borderTop: "5px solid #3498db",
                borderRadius: "50%",
                width: "50px",
                height: "50px",
                animation: "spin 1s linear infinite"
            }}></div>
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            <h3 style={{ marginTop: "20px", color: "#333" }}>Updating Item & Syncing Data...</h3>
            <p style={{ color: "#666" }}>Please wait while we update all price categories.</p>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: "24px", fontWeight: "600", color: "#333", margin: 0 }}>Items Management</h2>
          <div style={{ 
              backgroundColor: totalItems >= MAX_ITEMS ? '#fadbd8' : '#e8f6f3',
              color: totalItems >= MAX_ITEMS ? '#c0392b' : '#27ae60',
              padding: '8px 16px',
              borderRadius: '20px',
              fontWeight: '600',
              fontSize: '14px',
              border: totalItems >= MAX_ITEMS ? '1px solid #e74c3c' : '1px solid #2ecc71'
          }}>
              Total Items: {totalItems} / {MAX_ITEMS}
          </div>
      </div>

      <div style={{ marginBottom: "20px", display: "flex", gap: "12px", alignItems: "center" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <AiOutlineSearch style={{ position: "absolute", top: "10px", left: "10px", color: "#888" }} />
          <input
            type="text"
            placeholder="Search by ID, Name, Brand, SKU or Category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ 
                flex: 1, 
                width: "100%", 
                padding: "8px 8px 8px 34px", 
                border: "1px solid #ddd", 
                borderRadius: "6px",
                boxSizing: "border-box" 
            }}
          />
        </div>
        <button
          onClick={handleAddItemClick}
          disabled={totalItems >= MAX_ITEMS}
          style={{ 
              display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", 
              background: totalItems >= MAX_ITEMS ? "#95a5a6" : "#3498db", 
              color: "white", border: "none", borderRadius: "6px", 
              cursor: totalItems >= MAX_ITEMS ? "not-allowed" : "pointer", 
              fontSize: '14px', whiteSpace: 'nowrap', flexShrink: 0
            }}
            title={totalItems >= MAX_ITEMS ? "Item limit reached" : "Add New Item"}
        >
          <AiOutlinePlus /> Add Item
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: '800px' }}>
            <thead>
                <tr style={{ background: "#f5f5f5", textAlign: "left" }}>
                    <th style={{ padding: "12px" }}>PID</th><th style={{ padding: "12px" }}>Item</th>
                    <th style={{ padding: "12px" }}>SKU</th><th style={{ padding: "12px" }}>Type</th>
                    <th style={{ padding: "12px" }}>Category</th><th style={{ padding: "12px" }}>Added By</th>
                    <th style={{ padding: "12px" }}>Actions</th>
                </tr>
            </thead>
            <tbody>
                {loading ? (
                    <tr><td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>Loading...</td></tr>
                ) : items.length > 0 ? (
                    items.map((item) => (
                        <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
                            <td style={{ padding: "12px" }}>{item.pid}</td>
                            <td style={{ padding: "12px", fontWeight: 500 }}>{item.name}</td>
                            <td style={{ padding: "12px" }}>
                                {Array.isArray(item.sku) 
                                    ? item.sku.join(", ") 
                                    : (item.sku || "-")
                                }
                            </td>
                            <td style={{ padding: "12px" }}>{item.type}</td>
                            <td style={{ padding: "12px" }}>{item.category || "-"}</td>
                            <td style={{ padding: "12px" }}>{item.addedBy || "-"}</td>
                            <td style={{ padding: "12px", display: "flex", gap: "8px" }}>
                                <button onClick={() => handleEditClick(item)} style={{ background: "#f39c12", color: "white", border: "none", borderRadius: "4px", padding: "8px", cursor: "pointer", display: 'flex', alignItems: 'center' }} title="Edit">
                                    <AiOutlineEdit />
                                </button>
                                {isAdmin && (
                                    <button onClick={() => handleDelete(item.id)} style={{ background: "#e74c3c", color: "white", border: "none", borderRadius: "4px", padding: "8px", cursor: "pointer", display: 'flex', alignItems: 'center' }} title="Delete">
                                        <AiOutlineDelete />
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))
                ) : (
                    <tr><td colSpan="7" style={{ textAlign: "center", padding: "20px", color: "#777" }}>No items found.</td></tr>
                )}
            </tbody>
        </table>
      </div>

      {!search && (
          <div style={{ marginTop: "20px", display: "flex", justifyContent: 'center', gap: "8px", alignItems: 'center' }}>
              <button onClick={() => handlePageChange('prev')} disabled={currentPage === 1 || loading} style={{ padding: "8px 12px", cursor: 'pointer' }}>Previous</button>
              <span>Page {currentPage}</span>
              <button onClick={() => handlePageChange('next')} disabled={!hasNextPage || loading} style={{ padding: "8px 12px", cursor: 'pointer' }}>Next</button>
          </div>
      )}

      {showModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "white", padding: "24px", borderRadius: "8px", width: "100%", maxWidth: "450px", maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>{editingItem ? "Edit Item" : "Add New Item"}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {itemTypeOptions.length > 1 && (
                    <div style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '10px' }}>
                        <label style={{ fontWeight: 600, display: 'block', marginBottom: '10px' }}>Item Type *</label>
                        <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: '10px' }}>
                            {itemTypeOptions.map((opt) => (
                                <label key={opt.value} style={{ cursor: 'pointer' }}>
                                    <input type="radio" name="type" checked={form.type === opt.value} onChange={() => handleTypeSelect(opt.value)} style={{ marginRight: "6px" }}/>
                                    {opt.label}
                                </label>
                            ))}
                        </div>
                    </div>
                )}
                {form.type !== "ourProduct" && (
                  <input type="text" name="brand" placeholder="Brand (optional, e.g., Coca-Cola)" value={form.brand} onChange={handleChange} style={{ width: "100%", padding: "10px", boxSizing: 'border-box' }}/>
                )}
                <input type="text" name="name" placeholder="Item Name (e.g., Classic Coke) *" value={form.name} onChange={handleChange} style={{ width: "100%", padding: "10px", boxSizing: 'border-box' }}/>
                
                {/* ✅ NEW: Multiple SKU Input Section */}
                <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '10px', backgroundColor: '#f9f9f9' }}>
                    <label style={{ display: "block", marginBottom: "6px", fontSize: '14px', fontWeight: '500' }}>SKUs / Barcodes (Max 3)</label>
                    <input 
                        type="text" 
                        placeholder={form.sku.length >= 3 ? "Max SKUs reached" : "Type SKU & Press Enter"} 
                        value={skuInput} 
                        onChange={(e) => setSkuInput(e.target.value)} 
                        onKeyDown={handleSkuKeyDown}
                        disabled={form.sku.length >= 3}
                        style={{ width: "100%", padding: "8px", boxSizing: 'border-box', marginBottom: '8px' }}
                    />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {form.sku.map((s, index) => (
                            <div key={index} style={{ 
                                display: 'flex', alignItems: 'center', gap: '6px', 
                                background: '#3498db', color: 'white', 
                                padding: '4px 8px', borderRadius: '12px', fontSize: '12px' 
                            }}>
                                <span>{s}</span>
                                <AiOutlineClose 
                                    size={12} 
                                    style={{ cursor: 'pointer' }} 
                                    onClick={() => handleRemoveSku(index)}
                                />
                            </div>
                        ))}
                    </div>
                    {form.sku.length === 0 && <span style={{ fontSize: '12px', color: '#999' }}>No SKUs added yet.</span>}
                </div>

                <div>
                    <label style={{ display: "block", marginBottom: "6px" }}>Category</label>
                    <select name="category" value={form.category} onChange={handleChange} style={{ width: "100%", padding: "10px" }}>
                        <option value="">Select category</option>
                        {categories.map((c, idx) => (<option key={idx} value={c}>{c}</option>))}
                    </select>
                </div>

                {enableWarranty && (
                    <div style={{ border: '1px solid #b3e5fc', borderRadius: '6px', padding: '12px', backgroundColor: '#e1f5fe' }}>
                        <label style={{ fontWeight: 600, display: 'block', marginBottom: '8px', color: '#0277bd' }}>Warranty Period</label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div style={{ flex: 1 }}>
                                <input 
                                    type="number" 
                                    placeholder="Years" 
                                    min="0"
                                    value={form.warranty.years} 
                                    onChange={(e) => handleWarrantyChange('years', e.target.value)} 
                                    style={{ width: "100%", padding: "8px", boxSizing: 'border-box' }}
                                />
                                <span style={{ fontSize: '11px', color: '#555' }}>Years</span>
                            </div>
                            <div style={{ flex: 1 }}>
                                <input 
                                    type="number" 
                                    placeholder="Months" 
                                    min="0"
                                    value={form.warranty.months} 
                                    onChange={(e) => handleWarrantyChange('months', e.target.value)} 
                                    style={{ width: "100%", padding: "8px", boxSizing: 'border-box' }}
                                />
                                <span style={{ fontSize: '11px', color: '#555' }}>Months</span>
                            </div>
                            <div style={{ flex: 1 }}>
                                <input 
                                    type="number" 
                                    placeholder="Days" 
                                    min="0"
                                    value={form.warranty.days} 
                                    onChange={(e) => handleWarrantyChange('days', e.target.value)} 
                                    style={{ width: "100%", padding: "8px", boxSizing: 'border-box' }}
                                />
                                <span style={{ fontSize: '11px', color: '#555' }}>Days</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: '24px' }}>
              <button onClick={() => { setShowModal(false); setEditingItem(null); setSkuInput(""); }} style={{ padding: "10px 16px", background: '#eee', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
              <button 
                onClick={handleSave} 
                disabled={isSaving}
                style={{ 
                    background: "#2ecc71", 
                    color: "white", 
                    border: "none", 
                    padding: "10px 20px", 
                    borderRadius: "4px",
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    opacity: isSaving ? 0.7 : 1
                }}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Items;