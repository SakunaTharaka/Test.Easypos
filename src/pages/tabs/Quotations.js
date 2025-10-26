import React, { useState, useEffect, useRef, useCallback } from "react";
import { db, auth } from "../../firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  runTransaction,
  orderBy,
  Timestamp,
  deleteDoc, // Added deleteDoc
} from "firebase/firestore";
import Select from "react-select";
// Added AiOutlineDelete and AiOutlineSearch
import { AiOutlinePlus, AiOutlineEye, AiOutlineDelete, AiOutlineSearch } from "react-icons/ai";

// --- Reusable Quotation Viewer Modal (Modified to show new fields) ---
const QuotationViewerModal = ({ quotation, onClose }) => {
    if (!quotation) return null;
    const createdAtDate = quotation.createdAt instanceof Date ? quotation.createdAt : quotation.createdAt?.toDate();

    // Basic styling for the modal viewer
    const modalStyles = {
        overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' },
        content: { background: 'white', padding: '30px', borderRadius: '8px', width: '90%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto', position: 'relative' },
        closeButton: { position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#666' },
        title: { marginTop: 0, borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '20px', fontSize: '22px', fontWeight: '600' },
        fieldLabel: { fontWeight: '600', color: '#333', marginRight: '8px'},
        fieldValue: { color: '#555'},
        infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '10px', marginBottom: '20px'},
        table: { width: '100%', borderCollapse: 'collapse', marginTop: '15px', fontSize: '14px' },
        th: { background: '#f8f8f8', padding: '10px', border: '1px solid #ddd', textAlign: 'left', fontWeight: '600' },
        td: { padding: '10px', border: '1px solid #ddd', verticalAlign: 'top' },
        totalRow: { display: 'flex', justifyContent: 'flex-end', marginTop: '15px', fontWeight: 'bold', fontSize: '16px' }
    };

    return (
        <div style={modalStyles.overlay} onClick={onClose}>
            <div style={modalStyles.content} onClick={(e) => e.stopPropagation()}>
                <button style={modalStyles.closeButton} onClick={onClose}>&times;</button>
                <h2 style={modalStyles.title}>Quotation Details ({quotation.quotationNumber})</h2>
                <div style={modalStyles.infoGrid}>
                    <p><span style={modalStyles.fieldLabel}>Date:</span> <span style={modalStyles.fieldValue}>{createdAtDate?.toLocaleDateString()}</span></p>
                    <p><span style={modalStyles.fieldLabel}>Requested By:</span> <span style={modalStyles.fieldValue}>{quotation.requestingPerson || 'N/A'}</span></p>
                    <p><span style={modalStyles.fieldLabel}>Price Category:</span> <span style={modalStyles.fieldValue}>{quotation.priceCategoryName}</span></p>
                    <p><span style={modalStyles.fieldLabel}>Created By:</span> <span style={modalStyles.fieldValue}>{quotation.createdBy}</span></p>
                </div>
                {quotation.details && <p><span style={modalStyles.fieldLabel}>Details:</span> <span style={modalStyles.fieldValue}>{quotation.details}</span></p>}

                <table style={modalStyles.table}>
                    <thead>
                        <tr>
                            <th style={modalStyles.th}>Item</th>
                            <th style={modalStyles.th}>Qty</th>
                            <th style={{...modalStyles.th, textAlign: 'right'}}>Price (Rs.)</th>
                            <th style={{...modalStyles.th, textAlign: 'right'}}>Total (Rs.)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {quotation.items.map((item, index) => (
                            <tr key={index}>
                                <td style={modalStyles.td}>{item.itemName}</td>
                                <td style={{...modalStyles.td, textAlign: 'center'}}>{item.quantity}</td>
                                <td style={{...modalStyles.td, textAlign: 'right'}}>{item.price.toFixed(2)}</td>
                                <td style={{...modalStyles.td, textAlign: 'right'}}>{(item.price * item.quantity).toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div style={modalStyles.totalRow}>
                    <span>Grand Total: Rs. {quotation.total.toFixed(2)}</span>
                </div>
            </div>
        </div>
    );
};
// --- End Quotation Viewer Modal ---


const Quotations = ({ internalUser }) => {
  const [priceCategories, setPriceCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [itemsInCategoryWithPrice, setItemsInCategoryWithPrice] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);

  const [itemInput, setItemInput] = useState("");
  const [selectedItemData, setSelectedItemData] = useState(null);
  const [displayPrice, setDisplayPrice] = useState("");
  const [qtyInput, setQtyInput] = useState(1);
  const [quotationItems, setQuotationItems] = useState([]);

  // --- ADDED STATE FOR NEW FIELDS ---
  const [requestingPerson, setRequestingPerson] = useState("");
  const [details, setDetails] = useState("");

  const [quotationNumber, setQuotationNumber] = useState("");
  const [savedQuotations, setSavedQuotations] = useState([]);
  // --- ADDED STATE FOR SEARCH ---
  const [savedSearchTerm, setSavedSearchTerm] = useState("");

  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingQuotations, setLoadingQuotations] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);
  const [viewingQuotation, setViewingQuotation] = useState(null);

  const itemInputRef = useRef(null);
  const qtyInputRef = useRef(null);

  const getCurrentInternal = () => {
    if (internalUser && Object.keys(internalUser).length) return internalUser;
    try {
      const stored = localStorage.getItem("internalLoggedInUser");
      if (stored) return JSON.parse(stored);
    } catch {}
    return null;
  };

  // Fetch Provisional Quotation Number (no change)
  const fetchProvisionalQuotationNumber = async () => {
    const user = auth.currentUser;
    if (!user) { setQuotationNumber("QTN-ERR"); return; }
    const today = new Date();
    const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const counterRef = doc(db, user.uid, "counters");
    try {
      const counterDoc = await getDoc(counterRef);
      const dailyCounter = counterDoc.exists() ? counterDoc.data().quotationCounters?.[datePrefix] || 0 : 0;
      const nextSeq = dailyCounter + 1;
      const provisionalNum = `QTN-${datePrefix}-${String(nextSeq).padStart(4, "0")}`;
      setQuotationNumber(provisionalNum);
    } catch (err) {
      console.error("Error fetching provisional quotation number:", err);
      setQuotationNumber(`QTN-${datePrefix}-ERR`);
    }
  };

  // Fetch Price Categories (no change)
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const fetchCats = async () => {
      try {
        const catColRef = collection(db, user.uid, "price_categories", "categories");
        const snap = await getDocs(query(catColRef, orderBy("name")));
        setPriceCategories(snap.docs.map(d => ({ value: d.id, label: d.data().name, ...d.data() })));
      } catch (err) {
        console.error("Error fetching categories:", err.message);
      }
    };
    fetchCats();
    fetchProvisionalQuotationNumber(); // Fetch initial number
  }, []);

  // Fetch Items when Category Changes (no change)
  useEffect(() => {
    const user = auth.currentUser;
    if (!selectedCategory || !user) {
      setItemsInCategoryWithPrice([]);
      return;
    }
    const fetchPricedItems = async () => {
      setLoadingItems(true);
      try {
        const pricedItemsColRef = collection(db, user.uid, "price_categories", "priced_items");
        const q = query(pricedItemsColRef, where("categoryId", "==", selectedCategory.value));
        const itemsSnap = await getDocs(q);
        setItemsInCategoryWithPrice(itemsSnap.docs.map(d => ({ pricedItemId: d.id, price: d.data().price, itemInfo: d.data() })));
      } catch (err) { console.error("Error fetching priced items:", err.message); }
      setLoadingItems(false);
    };
    fetchPricedItems();
  }, [selectedCategory]);

  // Fetch Saved Quotations (no change)
  const fetchSavedQuotations = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    setLoadingQuotations(true);
    try {
      const qtnColRef = collection(db, user.uid, "quotations", "quotation_list");
      const snap = await getDocs(query(qtnColRef, orderBy("createdAt", "desc")));
      setSavedQuotations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error("Error fetching saved quotations:", err); }
    setLoadingQuotations(false);
  }, []);
  useEffect(() => { fetchSavedQuotations(); }, [fetchSavedQuotations]);


  // Item Input Filtering Logic (no change)
  useEffect(() => {
    if (!itemInput.trim() || !selectedCategory) {
      setFilteredItems([]); setShowDropdown(false); return;
    }
    const filtered = itemsInCategoryWithPrice.filter(i =>
      i.itemInfo.itemName.toLowerCase().includes(itemInput.toLowerCase()) ||
      i.itemInfo.itemSKU?.toLowerCase().includes(itemInput.toLowerCase())
    );
    setFilteredItems(filtered); setSelectedIndex(0); setShowDropdown(filtered.length > 0);
  }, [itemInput, itemsInCategoryWithPrice, selectedCategory]);

  // Item Selection and Quantity Logic (no change)
  const handleItemKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(prev => (prev + 1) % filteredItems.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length); }
    else if (e.key === "Enter") { e.preventDefault(); if (filteredItems[selectedIndex]) handleItemSelect(filteredItems[selectedIndex]); }
  };
  const handleItemSelect = (itemData) => {
    setItemInput(itemData.itemInfo.itemName);
    setDisplayPrice(itemData.price.toFixed(2));
    setSelectedItemData(itemData);
    setShowDropdown(false);
    setTimeout(() => qtyInputRef.current?.focus(), 50);
  };
  const handleQtyKeyDown = (e) => { if (e.key === "Enter") { e.preventDefault(); addItemToQuotation(); } };
  const handleQtyChange = (e) => { const value = e.target.value; if (value === "" || /^[0-9]*\.?[0-9]*$/.test(value)) { setQtyInput(value); } };
  const addItemToQuotation = () => {
    if (!selectedItemData || !qtyInput || isNaN(qtyInput) || qtyInput <= 0 || !selectedCategory) return;
    const existingItemIndex = quotationItems.findIndex(item => item.itemId === selectedItemData.itemInfo.itemId);
    if (existingItemIndex > -1) {
      const updatedItems = [...quotationItems]; updatedItems[existingItemIndex].quantity += Number(qtyInput); setQuotationItems(updatedItems);
    } else {
      setQuotationItems(prev => [...prev, { itemId: selectedItemData.itemInfo.itemId, itemName: selectedItemData.itemInfo.itemName, price: selectedItemData.price, quantity: Number(qtyInput), }]);
    }
    setItemInput(""); setDisplayPrice(""); setQtyInput(1); setSelectedItemData(null); setShowDropdown(false); itemInputRef.current?.focus();
  };
  const removeQuotationItem = (index) => setQuotationItems(prev => prev.filter((_, i) => i !== index));

  // Calculate Total (no change)
  const total = quotationItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Save Quotation Logic
  const handleSaveQuotation = async () => {
    if (!selectedCategory || quotationItems.length === 0) { return alert("Please select a price category and add items."); }
    if (!requestingPerson.trim()) { return alert("Please enter the requesting person or company name."); }
    const user = auth.currentUser; if (!user) return alert("You are not logged in.");
    const internalUser = getCurrentInternal();
    setIsSaving(true);
    try {
      const counterRef = doc(db, user.uid, "counters");
      const qtnColRef = collection(db, user.uid, "quotations", "quotation_list");
      const newQuotationRef = doc(qtnColRef);
      await runTransaction(db, async (transaction) => {
        const today = new Date(); const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const counterDoc = await transaction.get(counterRef); const dailyCounter = counterDoc.exists() ? counterDoc.data().quotationCounters?.[datePrefix] || 0 : 0;
        const nextSeq = dailyCounter + 1; const newQtnNum = `QTN-${datePrefix}-${String(nextSeq).padStart(4, "0")}`;
        transaction.set(counterRef, { quotationCounters: { [datePrefix]: nextSeq } }, { merge: true });
        const quotationDataForDb = {
          priceCategoryId: selectedCategory.value, priceCategoryName: selectedCategory.label, items: quotationItems, total: total, createdAt: serverTimestamp(), quotationNumber: newQtnNum, createdBy: internalUser?.username || "Admin",
          // --- ADDED NEW FIELDS TO SAVE ---
          requestingPerson: requestingPerson.trim(), details: details.trim(),
        };
        transaction.set(newQuotationRef, quotationDataForDb);
      });
      alert("Quotation saved successfully!");
      setQuotationItems([]); setSelectedCategory(null); setItemInput(""); setDisplayPrice(""); setQtyInput(1); setSelectedItemData(null);
      // --- RESET NEW FIELDS ---
      setRequestingPerson(""); setDetails("");
      await fetchProvisionalQuotationNumber(); await fetchSavedQuotations();
    } catch (error) { alert("Failed to save quotation: " + error.message); }
    finally { setIsSaving(false); }
  };

  // --- NEW DELETE FUNCTION ---
  const handleDeleteQuotation = async (quotationId) => {
      if (!window.confirm("Are you sure you want to delete this quotation? This cannot be undone.")) return;
      const user = auth.currentUser; if (!user) return alert("You are not logged in.");
      try {
          const qtnDocRef = doc(db, user.uid, "quotations", "quotation_list", quotationId);
          await deleteDoc(qtnDocRef);
          alert("Quotation deleted successfully.");
          await fetchSavedQuotations(); // Refresh the list
      } catch (error) {
          console.error("Error deleting quotation:", error);
          alert("Failed to delete quotation: " + error.message);
      }
  };

  // --- NEW FILTERING FOR SAVED QUOTATIONS ---
  const filteredSavedQuotations = savedQuotations.filter(qtn => {
      if (!savedSearchTerm.trim()) return true;
      const term = savedSearchTerm.toLowerCase();
      return (
          qtn.quotationNumber.toLowerCase().includes(term) ||
          (qtn.requestingPerson && qtn.requestingPerson.toLowerCase().includes(term))
      );
  });


  // --- JSX Structure ---
  return (
    <div style={styles.container}>
      {isSaving && ( <div style={styles.savingOverlay}> Saving Quotation... </div> )}
      {viewingQuotation && ( <QuotationViewerModal quotation={viewingQuotation} onClose={() => setViewingQuotation(null)} /> )}

      <div style={styles.mainPanel}>
        {/* Header */}
        <div style={styles.header}>
            <div style={{textAlign: 'left'}}> <h2 style={styles.title}>Create Quotation</h2> </div>
            <div style={{textAlign: 'right'}}> <div style={styles.invoiceLabel}>QUOTATION #</div> <div style={styles.invoiceNumber}>{quotationNumber}</div> </div>
            <div style={{textAlign: 'right'}}> <div style={styles.invoiceLabel}>CREATED BY</div> <div style={styles.invoiceNumber}>{internalUser?.username || 'Admin'}</div> </div>
        </div>

        {/* --- ADDED Requesting Person/Company and Details Inputs --- */}
        <div style={styles.detailsInputSection}>
             <div style={{flex: 1}}>
                 <label style={styles.label}>REQUESTING PERSON / COMPANY *</label>
                 <input type="text" value={requestingPerson} onChange={e => setRequestingPerson(e.target.value)} placeholder="Enter name or company..." style={styles.input} required />
             </div>
             <div style={{flex: 1}}>
                 <label style={styles.label}>DETAILS / REMARKS (Optional)</label>
                 <input type="text" value={details} onChange={e => setDetails(e.target.value)} placeholder="Any additional notes..." style={styles.input} />
             </div>
        </div>

        {/* Price Category Selection */}
        <div style={styles.inputSection}>
          <label style={styles.label}>SELECT PRICE CATEGORY *</label>
          <Select options={priceCategories} value={selectedCategory} onChange={(selectedOption) => { setSelectedCategory(selectedOption); setItemInput(""); setDisplayPrice(""); setQtyInput(1); setSelectedItemData(null); setQuotationItems([]); itemInputRef.current?.focus(); }} placeholder="Select a price category..." styles={{ control: base => ({...base, height: '45px'}) }} />
        </div>

        {/* Item Entry Section */}
        <div style={styles.itemEntrySection}>
             {/* Item Search Input */}
             <div style={{position: 'relative', flex: 2}}>
                <label style={styles.label}>ADD ITEM *</label>
                <input ref={itemInputRef} value={itemInput} onChange={e => setItemInput(e.target.value)} onKeyDown={handleItemKeyDown} placeholder="Type item name or SKU..." style={styles.input} disabled={!selectedCategory || loadingItems} />
                {showDropdown && filteredItems.length > 0 && (
                <ul style={styles.dropdown}>
                    {filteredItems.map((i, idx) => ( <li key={i.pricedItemId} style={{ ...styles.dropdownItem, ...(idx === selectedIndex ? styles.dropdownItemSelected : {}) }} onClick={() => handleItemSelect(i)}> {i.itemInfo.itemName} <span style={styles.dropdownPrice}>Rs. {i.price.toFixed(2)}</span> </li> ))}
                </ul>
                )}
                {loadingItems && <div style={{position: 'absolute', top: '35px', left: '10px', color: '#888'}}>Loading items...</div>}
             </div>
            {/* Price Display */}
            <div style={{width: '120px'}}>
                <label style={styles.label}>PRICE (Rs.)</label>
                <input type="text" value={displayPrice} readOnly style={{...styles.input, backgroundColor: '#eee', textAlign: 'right'}} />
            </div>
             {/* Quantity Input */}
            <div style={{width: '100px'}}>
                <label style={styles.label}>QTY *</label>
                <input ref={qtyInputRef} value={qtyInput} onChange={handleQtyChange} onKeyDown={handleQtyKeyDown} onFocus={(e) => e.target.select()} type="text" inputMode="decimal" style={styles.input} disabled={!selectedItemData} />
            </div>
            {/* Add Button */}
            <button onClick={addItemToQuotation} style={styles.addButton} disabled={!selectedItemData || qtyInput <= 0}> ADD </button>
        </div>

         {/* Quotation Items Table */}
        <div style={styles.tableContainer}>
            <table style={styles.table}>
                <thead><tr><th style={styles.th}>ITEM</th><th style={styles.th}>QTY</th><th style={styles.th}>PRICE</th><th style={styles.th}>TOTAL</th><th style={styles.th}></th></tr></thead>
                <tbody>
                    {quotationItems.length === 0 ? ( <tr><td colSpan="5" style={styles.emptyState}>No items added to quotation</td></tr> ) : (
                      quotationItems.map((item, idx) => ( <tr key={idx}><td style={styles.td}>{item.itemName}</td><td style={styles.td}>{item.quantity}</td><td style={styles.td}>Rs. {item.price.toFixed(2)}</td><td style={styles.td}>Rs. {(item.price * item.quantity).toFixed(2)}</td><td style={styles.td}><button onClick={() => removeQuotationItem(idx)} style={styles.removeButton}>✕</button></td></tr> ))
                    )}
                </tbody>
            </table>
        </div>
         {/* Total and Save Button */}
        <div style={styles.footerSection}>
             <div style={styles.grandTotalRow}> <span>TOTAL</span> <span>Rs. {total.toFixed(2)}</span> </div>
            <button
                onClick={handleSaveQuotation}
                disabled={isSaving || quotationItems.length === 0 || !selectedCategory || !requestingPerson.trim()} // Added requestingPerson check
                style={{...styles.saveButton, ...(isSaving || quotationItems.length === 0 || !selectedCategory || !requestingPerson.trim() ? styles.saveButtonDisabled : {})}}
            > {isSaving ? 'SAVING...' : 'SAVE QUOTATION'} </button>
        </div>
      </div>

       {/* Saved Quotations Panel */}
      <div style={styles.savedPanel}>
        <h3 style={styles.title}>Saved Quotations</h3>
        {/* --- ADDED SEARCH BAR --- */}
        <div style={{ position: "relative", marginBottom: '16px' }}>
            <AiOutlineSearch style={{ position: "absolute", top: "10px", left: "10px", color: "#888" }} />
            <input type="text" placeholder="Search by QTN # or Name/Company..." value={savedSearchTerm} onChange={(e) => setSavedSearchTerm(e.target.value)} style={{ width: "100%", padding: "8px 8px 8px 34px", borderRadius: 4, border: "1px solid #ddd", boxSizing: 'border-box' }} />
        </div>

         <div style={{...styles.tableContainer, height: 'calc(100% - 100px)'}}> {/* Adjust height */}
            <table style={{...styles.table, tableLayout: 'fixed'}}>
                <thead>
                    <tr>
                        <th style={{...styles.th, width: '130px'}}>QTN #</th>
                        <th style={{...styles.th, width: '100px'}}>Date</th>
                        <th style={{...styles.th}}>Requested By</th>
                        <th style={{...styles.th, width: '100px'}}>Total</th>
                        <th style={{...styles.th, width: '100px'}}>User</th> {/* Added User Column */}
                        <th style={{...styles.th, width: '80px'}}>Actions</th>{/* Added Actions Column */}
                    </tr>
                </thead>
                <tbody>
                     {loadingQuotations ? ( <tr><td colSpan="6" style={styles.emptyState}>Loading...</td></tr> )
                     : filteredSavedQuotations.length === 0 ? ( <tr><td colSpan="6" style={styles.emptyState}>No quotations found.</td></tr> ) // Use filtered list
                     : (
                        filteredSavedQuotations.map(qtn => { // --- USE FILTERED LIST ---
                            const createdAtDate = qtn.createdAt instanceof Date ? qtn.createdAt : qtn.createdAt?.toDate();
                            return (
                                <tr key={qtn.id}>
                                    <td style={{...styles.td, whiteSpace: 'nowrap'}}>{qtn.quotationNumber}</td>
                                    <td style={{...styles.td, whiteSpace: 'nowrap'}}>{createdAtDate?.toLocaleDateString()}</td>
                                    <td style={{...styles.td, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{qtn.requestingPerson}</td>
                                    <td style={{...styles.td, whiteSpace: 'nowrap'}}>Rs. {qtn.total.toFixed(2)}</td>
                                    {/* --- ADDED USERNAME --- */}
                                    <td style={{...styles.td, whiteSpace: 'nowrap'}}>{qtn.createdBy}</td>
                                    {/* --- ADDED ACTIONS --- */}
                                    <td style={styles.td}>
                                        <div style={{display: 'flex', gap: '8px', justifyContent: 'center'}}>
                                            <button onClick={() => setViewingQuotation(qtn)} style={{...styles.viewButton, padding: '4px'}} title="View Details"><AiOutlineEye size={16} /></button>
                                            <button onClick={() => handleDeleteQuotation(qtn.id)} style={{...styles.deleteButtonSmall, padding: '4px'}} title="Delete Quotation"><AiOutlineDelete size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
         </div>
      </div>
    </div>
  );
};

// --- Styles (Adapted and Added) ---
const styles = {
    container: { display: 'flex', height: 'calc(100vh - 180px)', fontFamily: "'Inter', sans-serif", gap: '20px', padding: '20px', backgroundColor: '#f3f4f6' },
    mainPanel: { flex: 3, display: 'flex', flexDirection: 'column', gap: '20px', backgroundColor: 'white', padding: '24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    savedPanel: { flex: 2, display: 'flex', flexDirection: 'column', backgroundColor: 'white', padding: '24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: '16px' },
    title: { fontSize: '22px', fontWeight: '600', color: '#1f2937', margin: 0 },
    invoiceLabel: { fontSize: '12px', color: '#6b7280', fontWeight: '600' },
    invoiceNumber: { fontSize: '18px', fontWeight: '700', color: '#1f2937' },
    inputSection: { marginBottom: '10px' }, // Added margin
    detailsInputSection: { display: 'flex', gap: '20px', marginBottom: '10px'}, // Added styles
    itemEntrySection: { display: 'flex', gap: '10px', alignItems: 'flex-end' },
    label: { display: 'block', fontSize: '12px', fontWeight: '600', color: '#4b5563', marginBottom: '8px' },
    input: { width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' },
    dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #d1d5db', borderRadius: '0 0 6px 6px', maxHeight: '200px', overflowY: 'auto', zIndex: 100, listStyle: 'none', margin: 0, padding: 0 },
    dropdownItem: { padding: '10px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between' },
    dropdownItemSelected: { backgroundColor: '#e0e7ff', color: '#3730a3' },
    dropdownPrice: { color: '#6b7280', fontSize: '12px' },
    addButton: { padding: '12px 24px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', height: '45px' },
    tableContainer: { flex: 1, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', marginTop: '10px' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { padding: '10px', textAlign: 'left', color: '#6b7280', fontSize: '12px', fontWeight: '600', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb', position: 'sticky', top: 0, zIndex: 1 },
    td: { padding: '10px', borderBottom: '1px solid #e5e7eb' },
    emptyState: { textAlign: 'center', color: '#9ca3af', padding: '20px' },
    removeButton: { background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' },
    footerSection: { borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginTop: 'auto' },
    grandTotalRow: { display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '20px', color: '#16a34a', marginBottom: '16px' },
    saveButton: { width: '100%', padding: '16px', backgroundColor: '#2563eb', color: 'white', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '6px' },
    saveButtonDisabled: { backgroundColor: '#9ca3af', cursor: 'not-allowed' },
    savingOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, fontSize: '18px', fontWeight: '600' },
    viewButton: { background: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' },
    deleteButtonSmall: { background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' },
    // Modal Styles (Copied and adjusted)
    modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' },
    modalContent: { background: 'white', padding: '30px', borderRadius: '8px', width: '90%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto', position: 'relative' },
    closeButton: { position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#666' },
    modalTitle: { marginTop: 0, borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '20px', fontSize: '22px', fontWeight: '600' },
    totalRow: { display: 'flex', justifyContent: 'flex-end', marginTop: '15px', fontWeight: 'bold', fontSize: '16px' }

};


export default Quotations;