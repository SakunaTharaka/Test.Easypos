import React, { useEffect, useState, useRef, useCallback } from "react";
import { db, auth } from "../../firebase";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { AiOutlinePlus, AiOutlineDelete, AiOutlineSearch, AiOutlineEdit } from "react-icons/ai";

const PriceCat = ({ internalUser }) => {
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [items, setItems] = useState([]);
  const [pricedItems, setPricedItems] = useState([]);
  const [showItemPopup, setShowItemPopup] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [price, setPrice] = useState("");
  const [search, setSearch] = useState("");
  const [editingCategory, setEditingCategory] = useState(null);

  const [dropdownSearch, setDropdownSearch] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  
  const dropdownRef = useRef(null);
  const activeItemRef = useRef(null);
  const priceInputRef = useRef(null);
  const saveButtonRef = useRef(null);

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

  const fetchCategories = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const catColRef = collection(db, user.uid, "price_categories", "categories");
      const snap = await getDocs(query(catColRef));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCategories(data);
    } catch (err) {
      console.error("Error fetching categories:", err.message);
    }
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid;

    const fetchItems = async () => {
      try {
        const itemsColRef = collection(db, uid, "items", "item_list");
        const snap = await getDocs(query(itemsColRef, where("type", "in", ["ourProduct", "buySell"])));
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setItems(data);
      } catch (err) {
        console.error("Error fetching items:", err.message);
      }
    };

    const fetchPricedItems = async () => {
      try {
        const pricedItemsColRef = collection(db, uid, "price_categories", "priced_items");
        const snap = await getDocs(query(pricedItemsColRef));
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPricedItems(data);
      } catch (err) {
        console.error("Error fetching priced items:", err.message);
      }
    };

    fetchCategories();
    fetchItems();
    fetchPricedItems();
  }, [fetchCategories]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  useEffect(() => {
    if (activeItemRef.current) {
        activeItemRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
        });
    }
  }, [activeIndex]);

  const handleSaveCategory = async () => {
    if (!newCategoryName.trim()) return alert("Enter category name");
    const uid = auth.currentUser.uid;
    const catColRef = collection(db, uid, "price_categories", "categories");
    const username = currentUser?.username || "Admin";

    try {
      if (editingCategory) {
        await updateDoc(doc(catColRef, editingCategory.id), {
          name: newCategoryName.trim(),
          lastEditedBy: username,
          lastEditedAt: serverTimestamp(),
        });
      } else {
        await addDoc(catColRef, {
          name: newCategoryName.trim(),
          createdBy: username,
          lastEditedBy: username,
          createdAt: serverTimestamp(),
        });
      }
      await fetchCategories();
      setNewCategoryName("");
      setEditingCategory(null);
    } catch (err) {
      alert("Error saving category: " + err.message);
    }
  };

  const handleDeleteCategory = async (catId) => {
    if (!window.confirm("Delete this category and all its items? This cannot be undone.")) return;
    const uid = auth.currentUser.uid;
    
    try {
      const batch = writeBatch(db);
      const catDocRef = doc(db, uid, "price_categories", "categories", catId);
      batch.delete(catDocRef);

      const pricedItemsColRef = collection(db, uid, "price_categories", "priced_items");
      const q = query(pricedItemsColRef, where("categoryId", "==", catId));
      const itemsToDeleteSnap = await getDocs(q);
      itemsToDeleteSnap.forEach(doc => batch.delete(doc.ref));

      await batch.commit();

      await fetchCategories();
      setPricedItems((prev) => prev.filter((i) => i.categoryId !== catId));
      if (selectedCategory?.id === catId) setSelectedCategory(null);
    } catch (err) {
      alert("Error deleting category: " + err.message);
    }
  };

  const handleAddItem = async () => {
    if (!selectedItem || !price || !selectedCategory) return alert("Fill all fields");
    const uid = auth.currentUser.uid;
    const pricedItemsColRef = collection(db, uid, "price_categories", "priced_items");
    const username = currentUser?.username || "Admin";

    try {
      if (selectedItem.pricedItemId) {
        const docRef = doc(pricedItemsColRef, selectedItem.pricedItemId);
        await updateDoc(docRef, { 
          price: Number(price), 
          editedBy: username, 
          editedAt: serverTimestamp() 
        });
        setPricedItems((prev) =>
          prev.map((i) => 
            i.id === selectedItem.pricedItemId 
              ? { ...i, price: Number(price), editedBy: username } 
              : i
          )
        );
      } else {
        const duplicate = pricedItems.find(i => i.categoryId === selectedCategory.id && i.itemId === selectedItem.id);
        if (duplicate) return alert("This item already exists in this price category.");

        const docRef = await addDoc(pricedItemsColRef, {
          categoryId: selectedCategory.id,
          categoryName: selectedCategory.name,
          itemId: selectedItem.id,
          itemName: selectedItem.name,
          itemSKU: selectedItem.sku || "",
          itemBrand: selectedItem.brand || "",
          itemType: selectedItem.type || "",
          price: Number(price),
          createdBy: username,
          editedBy: username,
          createdAt: serverTimestamp(),
        });
        const newItem = {
            id: docRef.id,
            itemId: selectedItem.id,
            categoryId: selectedCategory.id,
            itemName: selectedItem.name,
            itemSKU: selectedItem.sku || "",
            price: Number(price),
            createdBy: username,
            editedBy: username,
        };
        setPricedItems((prev) => [...prev, newItem]);
      }
      setSelectedItem(null);
      setPrice("");
      setShowItemPopup(false);
      setDropdownSearch("");
    } catch (err) {
      alert("Error saving item: " + err.message);
    }
  };

  const handleDeleteItem = async (id) => {
    if (!window.confirm("Remove this item from the price category?")) return;
    const uid = auth.currentUser.uid;
    const pricedItemDocRef = doc(db, uid, "price_categories", "priced_items", id);
    try {
      await deleteDoc(pricedItemDocRef);
      setPricedItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      alert("Error deleting item: " + err.message);
    }
  };

  const filteredItems = pricedItems
    .filter((i) => i.categoryId === selectedCategory?.id)
    .filter((i) => {
      if (!search.trim()) return true;
      const term = search.toLowerCase();
      return (
        i.itemName.toLowerCase().includes(term) ||
        (i.itemSKU && i.itemSKU.toLowerCase().includes(term))
      );
    });

  const dropdownItems = items.filter(item => 
    item.name.toLowerCase().includes(dropdownSearch.toLowerCase()) ||
    (item.sku && item.sku.toLowerCase().includes(dropdownSearch.toLowerCase()))
  );
  
  const handleItemSelect = (item) => {
    setSelectedItem(item);
    setDropdownSearch(item.name);
    setIsDropdownOpen(false);
    setActiveIndex(-1);
    priceInputRef.current?.focus();
  };

  const handleDropdownKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < dropdownItems.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && dropdownItems[activeIndex]) {
        handleItemSelect(dropdownItems[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };
  
  const handlePriceInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveButtonRef.current?.focus();
    }
  };

  return (
    <div style={{ display: "flex", height: "calc(100vh - 200px)" }}>
      <div style={{ width: "300px", borderRight: "1px solid #ddd", padding: 16, overflowY: 'auto' }}>
        <h3>Price Categories</h3>
        {isAdmin && (
          <div style={{ marginBottom: 16 }}>
            <input type="text" placeholder="New category name..." value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} style={{ width: "100%", padding: 8, marginBottom: 8, boxSizing: 'border-box' }} />
            <button onClick={handleSaveCategory} style={{ width: "100%", padding: 8, background: editingCategory ? "#f39c12" : "#2ecc71", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
              <AiOutlinePlus /> {editingCategory ? "Update Category" : "Add Category"}
            </button>
            {editingCategory && <button onClick={() => { setEditingCategory(null); setNewCategoryName(""); }} style={{width: '100%', marginTop: '4px', padding: 8, cursor: 'pointer'}}>Cancel</button>}
          </div>
        )}
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {categories.map((c) => (
            <li key={c.id} style={{ padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: selectedCategory?.id === c.id ? "#3498db" : "#f9f9f9", color: selectedCategory?.id === c.id ? "#fff" : "#333", borderRadius: 4, marginBottom: 6 }} >
              <span onClick={() => setSelectedCategory(c)} style={{ flex: 1 }}>{c.name}</span>
              {isAdmin && (
                <span style={{ display: "flex", gap: 8 }}>
                  <AiOutlineEdit title="Edit" onClick={() => { setEditingCategory(c); setNewCategoryName(c.name); }} />
                  <AiOutlineDelete title="Delete" onClick={() => handleDeleteCategory(c.id)} />
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
        {selectedCategory ? (
          <>
            <h2>Items in: {selectedCategory.name}</h2>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ position: "relative", flex: 1, marginRight: '16px' }}>
                <AiOutlineSearch style={{ position: "absolute", top: "10px", left: "10px", color: "#888" }} />
                <input type="text" placeholder="Search by item name or SKU..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: "100%", padding: "8px 8px 8px 34px", borderRadius: 4, border: "1px solid #ddd", boxSizing: 'border-box' }} />
              </div>
              {isAdmin && (
                <button onClick={() => { setSelectedItem(null); setPrice(''); setDropdownSearch(''); setShowItemPopup(true); }} style={{ padding: "8px 16px", background: "#3498db", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AiOutlinePlus /> Add Item to Category
                </button>
              )}
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f5f5f5" }}>
                    <th style={{ padding: 10, textAlign: 'left' }}>Item</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>SKU</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Price (Rs.)</th>
                    {/* NEW: Column Header */}
                    <th style={{ padding: 10, textAlign: 'left' }}>Last Updated By</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((i) => (
                  <tr key={i.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 10 }}>{i.itemName}</td>
                    <td style={{ padding: 10 }}>{i.itemSKU || "-"}</td>
                    <td style={{ padding: 10, fontWeight: 'bold' }}>{Number(i.price).toFixed(2)}</td>
                    {/* NEW: Column Data */}
                    <td style={{ padding: 10, color: '#555' }}>{i.editedBy || i.createdBy || '-'}</td>
                    <td style={{ padding: 10 }}>
                      {isAdmin && (
                        <span style={{ display: 'flex', gap: '8px' }}>
                          <AiOutlineEdit title="Edit Price" style={{ cursor: "pointer" }} onClick={() => { setSelectedItem({ ...i, pricedItemId: i.id }); setPrice(i.price); setShowItemPopup(true); }} />
                          <AiOutlineDelete title="Remove from Category" style={{ cursor: "pointer" }} onClick={() => handleDeleteItem(i.id)} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredItems.length === 0 && (<tr><td colSpan={5} style={{ textAlign: "center", padding: 20, color: "#777" }}>No items found in this category.</td></tr>)}
              </tbody>
            </table>
          </>
        ) : (
          <div style={{ textAlign: 'center', marginTop: '50px', color: '#888' }}>
            <h3>Select a Category</h3>
            <p>Please select a price category from the left panel to view or add items.</p>
          </div>
        )}

        {showItemPopup && (
          <div style={popupStyle}>
            <div style={popupInnerStyle}>
              <h3>{selectedItem?.pricedItemId ? "Edit Item Price" : "Add Item"} to {selectedCategory?.name}</h3>
              
              <div ref={dropdownRef} style={{ position: 'relative', marginBottom: 12 }}>
                <input
                  type="text"
                  placeholder="Type to search for an item..."
                  value={selectedItem?.pricedItemId ? selectedItem.itemName : dropdownSearch}
                  onChange={(e) => { setDropdownSearch(e.target.value); setIsDropdownOpen(true); setSelectedItem(null); }}
                  onFocus={() => setIsDropdownOpen(true)}
                  onKeyDown={handleDropdownKeyDown}
                  style={{ width: "100%", padding: 10, boxSizing: 'border-box' }}
                  disabled={!!selectedItem?.pricedItemId}
                  autoComplete="off"
                />
                {isDropdownOpen && !selectedItem?.pricedItemId && (
                  <ul style={styles.dropdownList}>
                    {dropdownItems.length > 0 ? (
                      dropdownItems.map((item, index) => (
                        <li
                          key={item.id}
                          ref={index === activeIndex ? activeItemRef : null}
                          style={{
                            ...styles.dropdownItem,
                            ...(index === activeIndex ? styles.dropdownItemActive : {})
                          }}
                          onClick={() => handleItemSelect(item)}
                        >
                          {item.name} {item.sku ? `(SKU: ${item.sku})` : ''}
                        </li>
                      ))
                    ) : (
                      <li style={{...styles.dropdownItem, color: '#888'}}>No items found</li>
                    )}
                  </ul>
                )}
              </div>
              
              <input
                ref={priceInputRef}
                onKeyDown={handlePriceInputKeyDown}
                type="number"
                placeholder="Set Price (Rs.)"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={{ width: "100%", padding: 10, marginBottom: 20, boxSizing: 'border-box' }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button 
                    onClick={() => { 
                        setShowItemPopup(false); 
                        setSelectedItem(null); 
                        setPrice(""); 
                        setDropdownSearch("");
                    }} 
                    style={popupBtnStyle}>Cancel</button>
                <button 
                  ref={saveButtonRef}
                  onClick={handleAddItem} 
                  style={{ ...popupBtnStyle, background: "#2ecc71", color: "#fff" }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const popupStyle = { position: "fixed", zIndex: 1001, top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" };
const popupInnerStyle = { background: "#fff", padding: 24, borderRadius: 8, width: 450, boxShadow: '0 5px 15px rgba(0,0,0,0.3)' };
const popupBtnStyle = { padding: "10px 16px", border: "none", borderRadius: 4, cursor: "pointer" };

const styles = {
    dropdownList: {
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        background: 'white',
        border: '1px solid #ddd',
        borderRadius: '0 0 4px 4px',
        maxHeight: '200px',
        overflowY: 'auto',
        listStyle: 'none',
        padding: 0,
        margin: '2px 0 0 0',
        zIndex: 1002,
    },
    dropdownItem: {
        padding: '10px',
        cursor: 'pointer',
    },
    dropdownItemActive: {
        backgroundColor: '#3498db',
        color: 'white',
    }
};

export default PriceCat;