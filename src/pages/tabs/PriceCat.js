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
import { AiOutlinePlus, AiOutlineDelete, AiOutlineSearch, AiOutlineEdit, AiFillTag } from "react-icons/ai";

const PriceCat = ({ internalUser }) => {
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [items, setItems] = useState([]);
  const [pricedItems, setPricedItems] = useState([]);
  
  // Modals
  const [showItemPopup, setShowItemPopup] = useState(false);
  const [showCatTypePopup, setShowCatTypePopup] = useState(false); 

  const [selectedItem, setSelectedItem] = useState(null);
  
  // Item Form States
  const [price, setPrice] = useState(""); // Final Selling Price
  const [originalPrice, setOriginalPrice] = useState(""); 
  const [discountPercentage, setDiscountPercentage] = useState(""); 
  const [saveAmount, setSaveAmount] = useState(""); 
  
  // --- NEW: Buy X Get Y States ---
  const [isBuyXGetY, setIsBuyXGetY] = useState(false);
  const [buyQty, setBuyQty] = useState("");
  const [getQty, setGetQty] = useState("");

  const [search, setSearch] = useState("");
  const [editingCategory, setEditingCategory] = useState(null);

  const [isSavingCategory, setIsSavingCategory] = useState(false);
  // ✅ NEW: Loading state for item submission
  const [isSubmittingItem, setIsSubmittingItem] = useState(false);

  const [dropdownSearch, setDropdownSearch] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  
  const dropdownRef = useRef(null);
  const activeItemRef = useRef(null);
  const priceInputRef = useRef(null); 
  const saveButtonRef = useRef(null);

  // ✅ Defined Constant for Limit
  const MAX_CATEGORIES = 50;

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

  // Handle dropdown click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  // Scroll to active item in dropdown
  useEffect(() => {
    if (activeItemRef.current) {
        activeItemRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
        });
    }
  }, [activeIndex]);

  // --- HANDLERS FOR BIDIRECTIONAL CALCULATION ---

  const handleOriginalPriceChange = (e) => {
    const val = e.target.value;
    setOriginalPrice(val);
    
    const orig = parseFloat(val);
    const disc = parseFloat(discountPercentage);
    
    if (!isNaN(orig) && !isNaN(disc)) {
        const saved = orig * (disc / 100);
        setSaveAmount(saved.toFixed(2));
        setPrice((orig - saved).toFixed(2));
    } else if (!isNaN(orig)) {
        setPrice(orig.toFixed(2));
        setSaveAmount(""); 
    } else {
        setPrice("");
        setSaveAmount("");
    }
  };

  const handleDiscountChange = (e) => {
    const val = e.target.value;
    setDiscountPercentage(val);
    
    const orig = parseFloat(originalPrice);
    const disc = parseFloat(val);
    
    if (!isNaN(orig) && !isNaN(disc)) {
        const saved = orig * (disc / 100);
        setSaveAmount(saved.toFixed(2));
        setPrice((orig - saved).toFixed(2));
    } else if (!isNaN(orig) && val === "") {
        setSaveAmount("");
        setPrice(orig.toFixed(2));
    }
  };

  const handleSaveAmountChange = (e) => {
    const val = e.target.value;
    setSaveAmount(val);
    
    const orig = parseFloat(originalPrice);
    const saved = parseFloat(val);
    
    if (!isNaN(orig) && !isNaN(saved) && orig > 0) {
        const disc = (saved / orig) * 100;
        setDiscountPercentage(disc.toFixed(2));
        setPrice((orig - saved).toFixed(2));
    } else if (!isNaN(orig) && val === "") {
        setDiscountPercentage("");
        setPrice(orig.toFixed(2));
    }
  };

  // --- END HANDLERS ---

  const initiateSaveCategory = () => {
    if (!newCategoryName.trim()) return alert("Enter category name");
    
    // ✅ LIMIT CHECK
    if (!editingCategory && categories.length >= MAX_CATEGORIES) {
        return alert(`Category Limit Reached (Max ${MAX_CATEGORIES}).\nPlease delete old categories to add new ones.`);
    }

    if (editingCategory) {
        handleSaveCategory(editingCategory.isDiscountable || false);
    } else {
        setShowCatTypePopup(true);
    }
  };

  const handleSaveCategory = async (isDiscountable) => {
    setIsSavingCategory(true);
    setShowCatTypePopup(false); 

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
          isDiscountable: isDiscountable, 
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
    } finally {
      setIsSavingCategory(false);
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
    // ✅ PREVENT DOUBLE SUBMISSION
    if (isSubmittingItem) return;

    if (!selectedItem || !price || !selectedCategory) return alert("Fill all required fields");
    
    if (selectedCategory.isDiscountable) {
        if(!originalPrice) return alert("Please enter original price.");
    }

    // New Offer Validation
    if (isBuyXGetY) {
        if (!buyQty || !getQty || Number(buyQty) <= 0 || Number(getQty) <= 0) {
            return alert("Please enter valid Buy and Get quantities greater than 0.");
        }
    }

    // ✅ LOCK BUTTON
    setIsSubmittingItem(true);

    const uid = auth.currentUser.uid;
    const pricedItemsColRef = collection(db, uid, "price_categories", "priced_items");
    const username = currentUser?.username || "Admin";

    const commonData = {
        price: Number(price), 
        originalPrice: selectedCategory.isDiscountable ? Number(originalPrice) : null,
        discountPercentage: selectedCategory.isDiscountable ? Number(discountPercentage) : null,
        // ✅ Saving Offer Data
        buyQty: isBuyXGetY ? Number(buyQty) : null,
        getQty: isBuyXGetY ? Number(getQty) : null,
        editedBy: username, 
        editedAt: serverTimestamp() 
    };

    try {
      if (selectedItem.pricedItemId) {
        const docRef = doc(pricedItemsColRef, selectedItem.pricedItemId);
        await updateDoc(docRef, commonData);

        setPricedItems((prev) =>
          prev.map((i) => 
            i.id === selectedItem.pricedItemId 
              ? { ...i, ...commonData } 
              : i
          )
        );
      } else {
        // CHECK FOR DUPLICATES BEFORE SAVING
        const duplicate = pricedItems.find(i => i.categoryId === selectedCategory.id && i.itemId === selectedItem.id);
        if (duplicate) {
            setIsSubmittingItem(false); // Reset lock
            return alert("This item already exists in this price category.");
        }

        const newItemData = {
          categoryId: selectedCategory.id,
          categoryName: selectedCategory.name,
          itemId: selectedItem.id,
          itemName: selectedItem.name,
          itemSKU: selectedItem.sku || "",
          itemBrand: selectedItem.brand || "",
          itemType: selectedItem.type || "",
          pid: selectedItem.pid || "",
          createdBy: username,
          createdAt: serverTimestamp(),
          ...commonData
        };

        const docRef = await addDoc(pricedItemsColRef, newItemData);
        
        setPricedItems((prev) => [...prev, { id: docRef.id, ...newItemData }]);
      }
      
      closePopup();
      // State is reset in closePopup, but good to be explicit if closePopup changes
      setIsSubmittingItem(false);

    } catch (err) {
      alert("Error saving item: " + err.message);
      setIsSubmittingItem(false); // ✅ UNLOCK ON ERROR
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

  const closePopup = () => {
    setShowItemPopup(false);
    setSelectedItem(null);
    setPrice("");
    setOriginalPrice("");
    setDiscountPercentage("");
    setSaveAmount("");
    setDropdownSearch("");
    // Reset Offer States
    setIsBuyXGetY(false);
    setBuyQty("");
    setGetQty("");
    
    // ✅ RESET SUBMISSION STATE
    setIsSubmittingItem(false);
  };

  const filteredItems = pricedItems
    .filter((i) => i.categoryId === selectedCategory?.id)
    .filter((i) => {
      if (!search.trim()) return true;
      const term = search.toLowerCase();

      // ✅ FIXED: Handle Array SKU for View List
      let skuMatch = false;
      if (Array.isArray(i.itemSKU)) {
          skuMatch = i.itemSKU.some(s => s.toLowerCase().includes(term));
      } else if (i.itemSKU) {
          skuMatch = String(i.itemSKU).toLowerCase().includes(term);
      }

      return (
        i.itemName.toLowerCase().includes(term) || skuMatch
      );
    });

  const dropdownItems = items.filter(item => {
    const term = dropdownSearch.toLowerCase();
    
    // ✅ FIXED: Handle Array SKU for Dropdown Search
    let skuMatch = false;
    if (Array.isArray(item.sku)) {
        skuMatch = item.sku.some(s => s.toLowerCase().includes(term));
    } else if (item.sku) {
        skuMatch = String(item.sku).toLowerCase().includes(term);
    }

    const matchesSearch = 
        item.name.toLowerCase().includes(term) ||
        skuMatch ||
        (item.pid && String(item.pid).includes(dropdownSearch));

    const alreadyInCat = pricedItems.some(
        (pItem) => pItem.categoryId === selectedCategory?.id && pItem.itemId === item.id
    );

    return matchesSearch && !alreadyInCat;
  });
  
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

  const openItemPopup = (existingItem = null) => {
    if (existingItem) {
        setSelectedItem({ ...existingItem, pricedItemId: existingItem.id });
        setPrice(existingItem.price);
        setOriginalPrice(existingItem.originalPrice || "");
        setDiscountPercentage(existingItem.discountPercentage || "");
        
        // Load Offer Data
        if (existingItem.buyQty && existingItem.getQty) {
            setIsBuyXGetY(true);
            setBuyQty(existingItem.buyQty);
            setGetQty(existingItem.getQty);
        } else {
            setIsBuyXGetY(false);
            setBuyQty("");
            setGetQty("");
        }

        if(existingItem.originalPrice && existingItem.price) {
             const saved = existingItem.originalPrice - existingItem.price;
             setSaveAmount(saved.toFixed(2));
        } else {
             setSaveAmount("");
        }
    } else {
        setSelectedItem(null);
        setPrice("");
        setOriginalPrice("");
        setDiscountPercentage("");
        setSaveAmount("");
        setDropdownSearch("");
        // Reset Offer
        setIsBuyXGetY(false);
        setBuyQty("");
        setGetQty("");
    }
    setShowItemPopup(true);
  };

  return (
    <div style={{ display: "flex", height: "calc(100vh - 200px)" }}>
      <div style={{ width: "300px", borderRight: "1px solid #ddd", padding: 16, overflowY: 'auto' }}>
        
        {/* ✅ SIDEBAR HEADER with LIMIT BADGE */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>Price Categories</h3>
            <div style={{ 
                backgroundColor: categories.length >= MAX_CATEGORIES ? '#fadbd8' : '#e8f6f3',
                color: categories.length >= MAX_CATEGORIES ? '#c0392b' : '#27ae60',
                padding: '4px 10px',
                borderRadius: '12px',
                fontWeight: '600',
                fontSize: '11px',
                border: categories.length >= MAX_CATEGORIES ? '1px solid #e74c3c' : '1px solid #2ecc71',
                whiteSpace: 'nowrap'
            }}>
                {categories.length} / {MAX_CATEGORIES}
            </div>
        </div>

        {isAdmin && (
          <div style={{ marginBottom: 16 }}>
            <input type="text" placeholder="New category name..." value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} style={{ width: "100%", padding: 8, marginBottom: 8, boxSizing: 'border-box' }} />
            <button 
              onClick={initiateSaveCategory} 
              disabled={isSavingCategory || (!editingCategory && categories.length >= MAX_CATEGORIES)}
              style={{ 
                width: "100%", 
                padding: 8, 
                background: editingCategory ? "#f39c12" : (categories.length >= MAX_CATEGORIES ? "#95a5a6" : "#2ecc71"), 
                color: "#fff", 
                border: "none", 
                borderRadius: 4, 
                cursor: (categories.length >= MAX_CATEGORIES && !editingCategory) ? "not-allowed" : "pointer",
                opacity: isSavingCategory ? 0.7 : 1
              }}
            >
              {isSavingCategory ? 'Saving...' : (
                <><AiOutlinePlus /> {editingCategory ? "Update Category" : "Add Category"}</>
              )}
            </button>
            {editingCategory && <button onClick={() => { setEditingCategory(null); setNewCategoryName(""); }} style={{width: '100%', marginTop: '4px', padding: 8, cursor: 'pointer'}}>Cancel</button>}
          </div>
        )}
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {categories.map((c) => (
            <li key={c.id} style={{ padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: selectedCategory?.id === c.id ? "#3498db" : "#f9f9f9", color: selectedCategory?.id === c.id ? "#fff" : "#333", borderRadius: 4, marginBottom: 6 }} >
              <span onClick={() => setSelectedCategory(c)} style={{ flex: 1 }}>
                {c.name} {c.isDiscountable && <span style={{fontSize:'10px', background:'#e74c3c', color:'white', padding:'2px 4px', borderRadius:'3px'}}>Promo</span>}
              </span>
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
            <h2>Items in: {selectedCategory.name} {selectedCategory.isDiscountable && "(Discountable)"}</h2>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ position: "relative", flex: 1, marginRight: '16px' }}>
                <AiOutlineSearch style={{ position: "absolute", top: "10px", left: "10px", color: "#888" }} />
                <input type="text" placeholder="Search by item name or SKU..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: "100%", padding: "8px 8px 8px 34px", borderRadius: 4, border: "1px solid #ddd", boxSizing: 'border-box' }} />
              </div>
              {isAdmin && (
                <button onClick={() => openItemPopup()} style={{ padding: "8px 16px", background: "#3498db", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AiOutlinePlus /> Add Item to Category
                </button>
              )}
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f5f5f5" }}>
                    <th style={{ padding: 10, textAlign: 'left' }}>Item</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>SKU</th>
                    {selectedCategory.isDiscountable && (
                        <>
                         <th style={{ padding: 10, textAlign: 'left' }}>Orig. Price</th>
                         <th style={{ padding: 10, textAlign: 'left' }}>Disc %</th>
                        </>
                    )}
                    <th style={{ padding: 10, textAlign: 'left' }}>{selectedCategory.isDiscountable ? 'Final Price' : 'Price'} (Rs.)</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Offers</th> {/* ✅ New Column */}
                    <th style={{ padding: 10, textAlign: 'left' }}>Last Updated By</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((i) => (
                  <tr key={i.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 10 }}>{i.itemName}</td>
                    
                    {/* ✅ FIXED: Display Array SKUs properly */}
                    <td style={{ padding: 10 }}>
                        {Array.isArray(i.itemSKU) 
                            ? i.itemSKU.join(", ") 
                            : (i.itemSKU || "-")
                        }
                    </td>
                    
                    {selectedCategory.isDiscountable && (
                        <>
                         <td style={{ padding: 10, color: '#7f8c8d' }}>{i.originalPrice ? Number(i.originalPrice).toFixed(2) : '-'}</td>
                         <td style={{ padding: 10, color: '#e74c3c' }}>{i.discountPercentage ? `${i.discountPercentage}%` : '-'}</td>
                        </>
                    )}

                    <td style={{ padding: 10, fontWeight: 'bold' }}>{Number(i.price).toFixed(2)}</td>
                    
                    {/* ✅ Display Offer Logic */}
                    <td style={{ padding: 10 }}>
                        {(i.buyQty && i.getQty) ? (
                            <span style={{ 
                                background: '#8e44ad', 
                                color: 'white', 
                                padding: '2px 8px', 
                                borderRadius: '12px', 
                                fontSize: '11px',
                                whiteSpace: 'nowrap'
                            }}>
                                Buy {i.buyQty} Get {i.getQty}
                            </span>
                        ) : '-'}
                    </td>

                    <td style={{ padding: 10, color: '#555' }}>{i.editedBy || i.createdBy || '-'}</td>
                    <td style={{ padding: 10 }}>
                      {isAdmin && (
                        <span style={{ display: 'flex', gap: '8px' }}>
                          <AiOutlineEdit title="Edit Price" style={{ cursor: "pointer" }} onClick={() => openItemPopup(i)} />
                          <AiOutlineDelete title="Remove from Category" style={{ cursor: "pointer" }} onClick={() => handleDeleteItem(i.id)} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredItems.length === 0 && (<tr><td colSpan={selectedCategory.isDiscountable ? 8 : 6} style={{ textAlign: "center", padding: 20, color: "#777" }}>No items found in this category.</td></tr>)}
              </tbody>
            </table>
          </>
        ) : (
          <div style={{ textAlign: 'center', marginTop: '50px', color: '#888' }}>
            <h3>Select a Category</h3>
            <p>Please select a price category from the left panel to view or add items.</p>
          </div>
        )}

        {/* Modal: Category Type Selection */}
        {showCatTypePopup && (
            <div style={popupStyle}>
                <div style={popupInnerStyle}>
                    <h3>Select Category Type</h3>
                    <p>What kind of price category is <b>{newCategoryName}</b>?</p>
                    <div style={{display:'flex', gap:'10px', marginTop:'20px'}}>
                        <button onClick={() => handleSaveCategory(false)} style={{flex:1, padding: '15px', background:'#3498db', color:'white', border:'none', borderRadius:'6px', cursor:'pointer'}}>
                            <b>Regular Price</b><br/><span style={{fontSize:'12px', opacity:0.9}}>Set a specific price for items.</span>
                        </button>
                        <button onClick={() => handleSaveCategory(true)} style={{flex:1, padding: '15px', background:'#e67e22', color:'white', border:'none', borderRadius:'6px', cursor:'pointer'}}>
                            <b>Discountable</b><br/><span style={{fontSize:'12px', opacity:0.9}}>Set base price & discount %.</span>
                        </button>
                    </div>
                    <button onClick={() => setShowCatTypePopup(false)} style={{marginTop:'15px', padding:'8px', width:'100%', background:'transparent', border:'none', color:'#777', cursor:'pointer'}}>Cancel</button>
                </div>
            </div>
        )}

        {/* Modal: Add Item */}
        {showItemPopup && (
          <div style={popupStyle}>
            {/* ✅ Increased Height for PopupInnerStyle via spreading logic or style adjustments */}
            <div style={{...popupInnerStyle, width: 480}}> 
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
                          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                <span>{item.name} {Array.isArray(item.sku) ? `(SKU: ${item.sku.join(", ")})` : (item.sku ? `(SKU: ${item.sku})` : '')}</span>
                                {item.pid && <span style={{fontWeight: 'bold', color: '#555', fontSize: '13px'}}>{item.pid}</span>}
                          </div>
                        </li>
                      ))
                    ) : (
                      <li style={{...styles.dropdownItem, color: '#888'}}>No items found</li>
                    )}
                  </ul>
                )}
              </div>
              
              {/* Conditional Rendering based on Category Type */}
              {selectedCategory?.isDiscountable ? (
                <>
                    <div>
                         <label style={{fontSize:'12px', fontWeight:'bold', color:'#555'}}>Original Price (Rs.)</label>
                         <input
                            ref={priceInputRef}
                            type="number"
                            placeholder="e.g. 1000"
                            value={originalPrice}
                            onChange={handleOriginalPriceChange}
                            style={{ width: "100%", padding: 10, marginTop:5, marginBottom: 15, boxSizing: 'border-box' }}
                        />
                    </div>
                    <div style={{display:'flex', gap:'10px'}}>
                        <div style={{flex:1}}>
                             <label style={{fontSize:'12px', fontWeight:'bold', color:'#555'}}>Discount (%)</label>
                             <input
                                type="number"
                                placeholder="e.g. 10"
                                value={discountPercentage}
                                onChange={handleDiscountChange}
                                style={{ width: "100%", padding: 10, marginTop:5, marginBottom: 15, boxSizing: 'border-box' }}
                            />
                        </div>
                        <div style={{flex:1}}>
                             <label style={{fontSize:'12px', fontWeight:'bold', color:'#555'}}>Save (Rs.)</label>
                             <input
                                type="number"
                                placeholder="e.g. 100"
                                value={saveAmount}
                                onChange={handleSaveAmountChange}
                                style={{ width: "100%", padding: 10, marginTop:5, marginBottom: 15, boxSizing: 'border-box' }}
                            />
                        </div>
                    </div>
                    <div style={{marginBottom:'20px', padding:'10px', background:'#f0f9ff', borderRadius:'6px', border:'1px solid #bae6fd'}}>
                        <label style={{display:'block', fontSize:'12px', color:'#0369a1', marginBottom:'4px'}}>New Selling Price (Calculated)</label>
                        <strong style={{fontSize:'18px', color:'#0284c7'}}>Rs. {price || "0.00"}</strong>
                    </div>
                </>
              ) : (
                <input
                    ref={priceInputRef}
                    onKeyDown={handlePriceInputKeyDown}
                    type="number"
                    placeholder="Set Price (Rs.)"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    style={{ width: "100%", padding: 10, marginBottom: 20, boxSizing: 'border-box' }}
                />
              )}

              {/* ✅ NEW: BUY X GET Y SECTION */}
              <div style={{marginBottom: '20px', borderTop: '1px solid #eee', paddingTop: '15px'}}>
                  <div style={{display: 'flex', alignItems: 'center', marginBottom: '10px', cursor: 'pointer'}} onClick={() => setIsBuyXGetY(!isBuyXGetY)}>
                      <div style={{
                          width: '40px', height: '22px', background: isBuyXGetY ? '#8e44ad' : '#ccc', borderRadius: '20px', position: 'relative', transition: '0.3s', marginRight: '10px'
                      }}>
                          <div style={{
                              width: '18px', height: '18px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: isBuyXGetY ? '20px' : '2px', transition: '0.3s'
                          }}></div>
                      </div>
                      <span style={{fontWeight: 'bold', fontSize: '14px', color: '#555'}}><AiFillTag style={{marginRight: '5px'}}/> Buy X Get Y Offer</span>
                  </div>

                  {isBuyXGetY && (
                      <div style={{display: 'flex', gap: '15px', background: '#f8f4fc', padding: '12px', borderRadius: '6px', border: '1px solid #e1d2f0'}}>
                          <div style={{flex: 1}}>
                              <label style={{fontSize: '12px', fontWeight: 'bold', color: '#8e44ad'}}>Buy Qty</label>
                              <input 
                                  type="text" 
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  placeholder="Ex: 2"
                                  value={buyQty}
                                  onChange={(e) => setBuyQty(e.target.value.replace(/\D/, ''))} // Digits only
                                  style={{width: '100%', padding: '8px', marginTop: '4px', borderRadius: '4px', border: '1px solid #dcdcdc'}}
                              />
                          </div>
                          <div style={{flex: 1}}>
                              <label style={{fontSize: '12px', fontWeight: 'bold', color: '#8e44ad'}}>Get Qty (Free)</label>
                              <input 
                                  type="text" 
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  placeholder="Ex: 1"
                                  value={getQty}
                                  onChange={(e) => setGetQty(e.target.value.replace(/\D/, ''))} // Digits only
                                  style={{width: '100%', padding: '8px', marginTop: '4px', borderRadius: '4px', border: '1px solid #dcdcdc'}}
                              />
                          </div>
                      </div>
                  )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button 
                    onClick={closePopup} 
                    style={popupBtnStyle}>Cancel</button>
                <button 
                  ref={saveButtonRef}
                  onClick={handleAddItem}
                  disabled={isSubmittingItem} 
                  style={{ 
                      ...popupBtnStyle, 
                      background: isSubmittingItem ? "#95a5a6" : "#2ecc71", 
                      color: "#fff",
                      cursor: isSubmittingItem ? "not-allowed" : "pointer" 
                  }}
                >
                  {isSubmittingItem ? "Saving..." : "Save"}
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
const popupInnerStyle = { background: "#fff", padding: 24, borderRadius: 8, width: 450, boxShadow: '0 5px 15px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' };
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