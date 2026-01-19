import React, { useEffect, useState, useRef } from "react";
import { db, auth } from "../../firebase";
import {
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
  doc,
  getDoc,
  runTransaction,
  orderBy,
  limit,
  startAfter,
} from "firebase/firestore";
import { 
  AiOutlinePlus, 
  AiOutlineDelete, 
  AiOutlineSearch, 
  AiOutlineFilter, 
  AiOutlineLoading
} from "react-icons/ai";
import Select from "react-select";

const ITEMS_PER_PAGE = 25;

const Inventory = ({ internalUser }) => {
  const [inventory, setInventory] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // --- Race Condition Prevention ---
  const [isProcessing, setIsProcessing] = useState(false);

  const [stockableItems, setStockableItems] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  
  // --- Pagination State ---
  const [page, setPage] = useState(1);
  const [lastVisible, setLastVisible] = useState(null);
  const [pageHistory, setPageHistory] = useState([null]);
  const [isLastPage, setIsLastPage] = useState(false);

  // --- Modal State ---
  const [showModal, setShowModal] = useState(false);
  const [stagedItems, setStagedItems] = useState([]);
  const [supplierInfo, setSupplierInfo] = useState({ name: "", mobile: "", company: "" });
  const [selectedPO, setSelectedPO] = useState(null);
  
  // --- Item Entry State ---
  const [currentItem, setCurrentItem] = useState(null);
  const [currentQty, setCurrentQty] = useState(1);
  const [currentPrice, setCurrentPrice] = useState("");
  const [currentUnit, setCurrentUnit] = useState("");
  const itemSelectRef = useRef(null);
  
  // --- Search & Filter State ---
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  
  const getCurrentInternal = () => {
    try {
      const stored = localStorage.getItem("internalLoggedInUser");
      return stored ? JSON.parse(stored) : null;
    } catch (e) { return null; }
  };
  const isAdmin = getCurrentInternal()?.isAdmin === true;

  // --- Core Data Fetching ---
  const fetchInventory = async (direction = 'initial') => {
    setLoading(true);
    const user = auth.currentUser;
    if (!user) { setLoading(false); return; }
    const uid = user.uid;
    const invColRef = collection(db, uid, "inventory", "stock_in");
    
    let q = query(invColRef, orderBy("createdAt", "desc"));

    if (dateFrom) q = query(q, where("createdAt", ">=", new Date(dateFrom + "T00:00:00")));
    if (dateTo) q = query(q, where("createdAt", "<=", new Date(dateTo + "T23:59:59")));

    try {
      let querySnapshot;
      if (direction === 'next' && lastVisible) {
        q = query(q, limit(ITEMS_PER_PAGE), startAfter(lastVisible));
      } else if (direction === 'prev' && page > 1) {
        const prevPageStart = pageHistory[page - 2];
        q = query(q, limit(ITEMS_PER_PAGE), startAfter(prevPageStart));
      } else {
        q = query(q, limit(ITEMS_PER_PAGE));
      }

      querySnapshot = await getDocs(q);
      const invData = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setInventory(invData);

      if (invData.length > 0) {
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
        if (direction === 'next') setPageHistory(prev => [...prev, querySnapshot.docs[0]]);
      }
      setIsLastPage(invData.length < ITEMS_PER_PAGE);
    } catch (error) {
      console.error("Error fetching inventory data:", error);
      alert("Error fetching data: " + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchInventory('initial');
    
    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid;

    const fetchDropdownData = async () => {
      try {
        // 1. Fetch Units from Settings
        const settingsRef = doc(db, uid, "settings");
        const settingsSnap = await getDoc(settingsRef);
        
        let fetchedUnits = ["Units", "Kg", "Metre"]; // Default Fallback
        
        if (settingsSnap.exists()) {
           const data = settingsSnap.data();
           if (data.itemUnits && data.itemUnits.length > 0) {
             fetchedUnits = data.itemUnits;
           }
        }
        
        setUnits(fetchedUnits);
        // Set Default Unit Selection to the first item
        if (fetchedUnits.length > 0) {
            setCurrentUnit(fetchedUnits[0]);
        }

        // 2. Fetch Items for Dropdown
        const itemsColRef = collection(db, uid, "items", "item_list");
        const itemsQuery = query(itemsColRef, where("type", "in", ["storesItem", "buySell"]));
        const itemsSnap = await getDocs(itemsQuery);
        
        const itemOptions = itemsSnap.docs.map(doc => ({ 
            value: doc.id, 
            label: `${doc.data().name} (Curr Stock: ${doc.data().qtyOnHand || 0})`, 
            category: doc.data().category || "",
            unit: doc.data().unit || "",
            type: doc.data().type || "",
            averageCost: doc.data().averageCost || 0,
            qtyOnHand: doc.data().qtyOnHand || 0,
            name: doc.data().name,
            isManualCosting: doc.data().isManualCosting || false // Track manual mode status
        }));
        setStockableItems(itemOptions);
        
        // 3. Fetch Purchase Orders
        const poColRef = collection(db, uid, "purchase_orders", "po_list");
        const poSnap = await getDocs(query(poColRef));
        setPurchaseOrders(poSnap.docs.map(d => ({ value: d.id, label: d.data().poNumber })));
      } catch(error) {
        console.error("Error fetching auxiliary data:", error);
      }
    };
    fetchDropdownData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyFilters = () => {
    setPage(1);
    setLastVisible(null);
    setPageHistory([null]);
    fetchInventory('initial');
  };

  const handleNextPage = () => !isLastPage && (setPage(prev => prev + 1), fetchInventory('next'));
  const handlePrevPage = () => page > 1 && (setPageHistory(prev => { const n = [...prev]; n.pop(); return n; }), setPage(prev => prev - 1), fetchInventory('prev'));

  const getNextStockInId = async (uid) => {
    const counterRef = doc(db, uid, "counters");
    try {
        return await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            const currentId = counterDoc.exists() ? counterDoc.data().lastStockInId || 0 : 0;
            const nextId = currentId + 1;
            transaction.set(counterRef, { lastStockInId: nextId }, { merge: true });
            return `SI-${String(nextId).padStart(6, "0")}`;
        });
    } catch (err) {
        console.error("Error generating Stock In ID:", err);
        return null;
    }
  };
  
  const handleAddItemToStage = () => {
    if (!currentItem || !currentQty || !currentUnit || !currentPrice) {
        return alert("Please select an item and fill in Quantity, Unit, and Price.");
    }
    if (stagedItems.some(item => item.value === currentItem.value)) {
        return alert("This item is already in the list.");
    }
    setStagedItems([...stagedItems, { ...currentItem, quantity: Number(currentQty), price: Number(currentPrice), unit: currentUnit }]);
    
    // Reset fields
    setCurrentItem(null);
    setCurrentQty(1);
    setCurrentPrice("");
    // Reset unit to default (first item in units array)
    setCurrentUnit(units.length > 0 ? units[0] : "");
    
    itemSelectRef.current?.focus();
  };

  const handleDeleteStagedItem = (index) => setStagedItems(stagedItems.filter((_, i) => i !== index));

  // --- SAVE Transaction (Stock In) ---
  const handleSave = async () => {
    if (stagedItems.length === 0) return alert("Please add at least one item to save.");
    if (isProcessing) return; // Prevent double click
    
    setIsProcessing(true);
    const user = auth.currentUser;
    if (!user) { setIsProcessing(false); return alert("You are not logged in."); }
    const uid = user.uid;
    
    const stockInId = await getNextStockInId(uid);
    if (!stockInId) { setIsProcessing(false); return alert("Failed to generate Stock ID."); }

    try {
      await runTransaction(db, async (transaction) => {
          const addedBy = getCurrentInternal()?.username || "Admin";
          const stockInRef = doc(collection(db, uid, "inventory", "stock_in"));

          const stockInDoc = {
            stockInId,
            poId: selectedPO ? selectedPO.value : "",
            poNumber: selectedPO ? selectedPO.label : "",
            supplierName: supplierInfo.name,
            supplierMobile: supplierInfo.mobile,
            supplierCompany: supplierInfo.company,
            lineItems: stagedItems.map(({ value, label, ...item }) => ({
                ...item,
                itemId: value, 
                name: item.name || label.split(" (")[0],
                unit: item.unit || "",
                category: item.category || "",
                type: item.type || ""
            })),
            addedBy,
            createdAt: serverTimestamp(),
          };

          for (const item of stagedItems) {
              const itemRef = doc(db, uid, "items", "item_list", item.value);
              const itemSnap = await transaction.get(itemRef);
              
              if (!itemSnap.exists()) throw new Error(`Item "${item.name}" not found!`);

              const data = itemSnap.data();
              const oldQty = parseFloat(data.qtyOnHand) || 0;
              const incomingQty = parseFloat(item.quantity);
              
              // ✅ FIX 1: Retrieve current periodIn
              const currentPeriodIn = parseFloat(data.periodIn) || 0;

              let newQty = oldQty + incomingQty;
              let newAvgCost = parseFloat(data.averageCost) || 0;

              // --- COST CALCULATION LOGIC ---
              if (data.isManualCosting === true) {
                  // MANUAL MODE: Do not change the Average Cost
                  console.log(`Skipping cost calculation for ${item.name} (Manual Mode Active)`);
              } else {
                  // AUTOMATIC MODE: Calculate Weighted Average
                  const oldAvgCost = parseFloat(data.averageCost) || 0;
                  const incomingPrice = parseFloat(item.price);

                  if (newQty > 0) {
                     const totalValue = (oldQty * oldAvgCost) + (incomingQty * incomingPrice);
                     newAvgCost = totalValue / newQty;
                  } else {
                     newAvgCost = incomingPrice;
                  }
              }

              transaction.update(itemRef, {
                  qtyOnHand: newQty,
                  averageCost: newAvgCost, 
                  lastStockInDate: serverTimestamp(),
                  // ✅ FIX 2: Increment Period In
                  periodIn: currentPeriodIn + incomingQty
              });
          }

          transaction.set(stockInRef, stockInDoc);
      });
      
      handleApplyFilters();
      setShowModal(false);
      setStagedItems([]);
      setSupplierInfo({ name: "", mobile: "", company: ""});
      setSelectedPO(null);
      alert("Stock-In Saved! Inventory updated.");

    } catch (error) {
      console.error(error);
      alert("Transaction Failed: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- DELETE Transaction (Reverse Stock In) ---
  const handleDelete = async (stockInRecord) => {
    if (!isAdmin) return alert("Only admins can delete stock-in records.");
    if (isProcessing) return; // Prevent double click

    if (!window.confirm(`ROLLBACK WARNING:\n\nDeleting this record will:\n1. REMOVE items from inventory.\n2. REVERSE the Average Cost calculation (if in Auto mode).\n\nAre you sure you want to proceed?`)) return;
    
    setIsProcessing(true);
    const uid = auth.currentUser.uid;

    try {
        await runTransaction(db, async (transaction) => {
            const stockInRef = doc(db, uid, "inventory", "stock_in", stockInRecord.id);
            const stockInSnap = await transaction.get(stockInRef);
            if (!stockInSnap.exists()) throw new Error("Record already deleted.");

            const data = stockInSnap.data();
            const itemsToReverse = data.lineItems || [];

            for (const item of itemsToReverse) {
                const itemId = item.itemId || item.value || item.id; 
                if (!itemId) continue; 

                const itemRef = doc(db, uid, "items", "item_list", itemId);
                const itemSnap = await transaction.get(itemRef);
                
                if (!itemSnap.exists()) continue; // Skip if item master deleted

                const masterData = itemSnap.data();
                const currentQty = parseFloat(masterData.qtyOnHand) || 0;
                
                // ✅ FIX 3: Get Period In
                const currentPeriodIn = parseFloat(masterData.periodIn) || 0;

                const qtyToRemove = parseFloat(item.quantity);
                const priceToRemove = parseFloat(item.price);

                if (currentQty < qtyToRemove) {
                    throw new Error(`Cannot delete! Item "${item.name}" stock is lower than this batch quantity. Items have likely been sold.`);
                }

                const newQty = currentQty - qtyToRemove;
                let newAvgCost = parseFloat(masterData.averageCost) || 0;

                // --- REVERSE COST LOGIC ---
                if (masterData.isManualCosting === true) {
                     // MANUAL MODE: Do not touch cost on delete
                     console.log(`Skipping reverse cost calculation for ${item.name} (Manual Mode Active)`);
                } else {
                    // AUTOMATIC MODE: Reverse Weighted Average
                    const currentAvgCost = parseFloat(masterData.averageCost) || 0;

                    if (newQty > 0) {
                        const currentTotalValue = currentQty * currentAvgCost;
                        const valueToRemove = qtyToRemove * priceToRemove;
                        // Math.max(0, ...) prevents negative value floating point errors
                        const newTotalValue = Math.max(0, currentTotalValue - valueToRemove);
                        newAvgCost = newTotalValue / newQty;
                    } else {
                        newAvgCost = 0; // Reset to 0 if stock hits 0
                    }
                }

                transaction.update(itemRef, {
                    qtyOnHand: newQty,
                    averageCost: newAvgCost,
                    // ✅ FIX 4: Decrement Period In (Prevent Negative)
                    periodIn: Math.max(0, currentPeriodIn - qtyToRemove)
                });
            }

            transaction.delete(stockInRef);
        });

        fetchInventory(page > 1 ? 'prev' : 'initial');
        alert("Stock-In deleted successfully.");

    } catch (error) {
        console.error("Delete failed:", error);
        alert("Error deleting: " + error.message);
    } finally {
        setIsProcessing(false);
    }
  };
  
  const filteredInventory = inventory.filter(item => {
    if (!search) return true;
    return Object.values(item).some(val => String(val).toLowerCase().includes(search.toLowerCase())) ||
      (item.lineItems && item.lineItems.some(line => line.name.toLowerCase().includes(search.toLowerCase())));
  });

  if (loading && page === 1 && inventory.length === 0) return ( <div style={styles.loadingContainer}><div style={styles.loadingSpinner}></div><p>Loading inventory data...</p></div> );

  return (
    <div style={styles.container}>
      {/* --- HEADER --- */}
      <div style={styles.headerContainer}><h2 style={styles.header}>Stock-In / Inventory</h2><p style={styles.subHeader}>Record new items coming into your inventory</p></div>
      
      {/* --- CONTROLS --- */}
      <div style={styles.controlsContainer}>
        <div style={styles.searchContainer}>
          <div style={styles.searchInputContainer}>
            <AiOutlineSearch style={styles.searchIcon} />
            <input type="text" placeholder="Search current page..." value={search} onChange={(e) => setSearch(e.target.value)} style={styles.searchInput} />
          </div>
          <button style={styles.filterToggle} onClick={() => setShowFilters(!showFilters)}><AiOutlineFilter style={{ marginRight: '6px' }} />Filters</button>
        </div>
        {showFilters && (
          <div style={styles.filterPanel}>
            <div style={styles.dateFilters}>
              <div style={styles.filterGroup}><label style={styles.filterLabel}>From Date</label><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={styles.dateInput} /></div>
              <div style={styles.filterGroup}><label style={styles.filterLabel}>To Date</label><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={styles.dateInput} /></div>
              <button onClick={handleApplyFilters} style={styles.applyFilterBtn}>Apply</button>
            </div>
          </div>
        )}
        <button 
          style={{...styles.addButton, opacity: isProcessing ? 0.6 : 1}} 
          onClick={() => setShowModal(true)} 
          disabled={isProcessing}
        >
          <AiOutlinePlus size={20} /> New Stock-In
        </button>
      </div>

      {/* --- MODAL --- */}
      {showModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}><h3 style={styles.modalTitle}>Record New Stock-In</h3><button style={styles.closeButton} onClick={() => setShowModal(false)}>&times;</button></div>
            <div style={styles.formGrid}>
              <div style={styles.formGroup}><label style={styles.label}>Supplier Name</label><input value={supplierInfo.name} onChange={e => setSupplierInfo({...supplierInfo, name: e.target.value})} style={styles.input} /></div>
              
              <div style={styles.formGroup}>
                  <label style={styles.label}>Supplier Mobile</label>
                  <input 
                      value={supplierInfo.mobile} 
                      onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          setSupplierInfo({...supplierInfo, mobile: val});
                      }} 
                      style={styles.input} 
                      maxLength="10"
                      placeholder="07XXXXXXXX"
                  />
              </div>

              <div style={styles.formGroupFull}><label style={styles.label}>Supplier Company</label><input value={supplierInfo.company} onChange={e => setSupplierInfo({...supplierInfo, company: e.target.value})} style={styles.input} /></div>
              <div style={styles.formGroupFull}><label style={styles.label}>Reference Purchase Order (Optional)</label><Select options={purchaseOrders} value={selectedPO} onChange={setSelectedPO} placeholder="Search by PO ID..." isClearable /></div>
              <hr style={styles.hr} />
              <div style={styles.formGroupFull}>
                  <label style={styles.label}>Add Items</label>
                  <div style={styles.itemEntry}>
                      <div style={{flex: 3}}><Select ref={itemSelectRef} options={stockableItems} value={currentItem} onChange={setCurrentItem} placeholder="Search item..."/></div>
                      <div style={{flex: 1}}><input type="number" placeholder="Qty" value={currentQty} onChange={e => setCurrentQty(e.target.value)} style={styles.input}/></div>
                      <div style={{flex: 1}}>
                          <select value={currentUnit} onChange={e => setCurrentUnit(e.target.value)} style={styles.input}>
                            {units.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                      </div>
                      <div style={{flex: 1}}><input type="number" placeholder="Price" value={currentPrice} onChange={e => setCurrentPrice(e.target.value)} style={styles.input}/></div>
                      <button onClick={handleAddItemToStage} style={styles.addItemBtn}>Add</button>
                  </div>
              </div>
              {stagedItems.length > 0 && (
                  <div style={styles.formGroupFull}>
                      <table style={{...styles.table, ...styles.stagedTable}}>
                          <thead><tr><th style={styles.th}>Item</th><th style={styles.th}>Qty</th><th style={styles.th}>Price</th><th style={styles.th}>Action</th></tr></thead>
                          <tbody>{stagedItems.map((item, index) => (<tr key={index}><td style={styles.td}>{item.label}</td><td style={styles.td}>{item.quantity} {item.unit}</td><td style={styles.td}>Rs. {item.price}</td><td style={styles.td}><button onClick={() => handleDeleteStagedItem(index)} style={styles.deleteBtn}><AiOutlineDelete/></button></td></tr>))}</tbody>
                      </table>
                  </div>
              )}
            </div>
            <div style={styles.modalButtons}>
                <button style={styles.cancelButton} onClick={() => setShowModal(false)} disabled={isProcessing}>Cancel</button>
                <button style={styles.saveButton} onClick={handleSave} disabled={isProcessing}>
                    {isProcessing ? <AiOutlineLoading className="spin-anim" /> : "Save Stock-In"}
                </button>
            </div>
          </div>
        </div>
      )}

      {/* --- TABLE SECTION --- */}
      <div style={styles.tableContainer}>
        {loading && <div style={styles.loadingOverlay}><span>Loading...</span></div>}
        <div style={styles.tableHeader}><span style={styles.tableTitle}>Stock-In History</span></div>
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead><tr><th style={styles.th}>Stock In ID</th><th style={styles.th}>Item</th><th style={styles.th}>Category</th><th style={styles.th}>Supplier</th><th style={styles.th}>Quantity</th><th style={styles.th}>Unit Price</th><th style={styles.th}>Added By</th><th style={styles.th}>Date</th>{isAdmin && <th style={styles.th}>Action</th>}</tr></thead>
            <tbody>
              {filteredInventory.flatMap((item) => 
                  (item.lineItems || [{...item}]).map((lineItem, lineIndex) => (
                      <tr key={`${item.id}-${lineIndex}`}>
                          {lineIndex === 0 && <td rowSpan={item.lineItems?.length || 1} style={styles.td}>{item.stockInId}</td>}
                          <td style={styles.td}>{lineItem.name || lineItem.item}</td>
                          <td style={styles.td}>{lineItem.category}</td>
                          {lineIndex === 0 && <td rowSpan={item.lineItems?.length || 1} style={styles.td}><div style={styles.supplierInfo}>{item.supplierName && <div>{item.supplierName}</div>}{item.supplierCompany && <div style={styles.companyName}>{item.supplierCompany}</div>}</div></td>}
                          <td style={styles.td}>{lineItem.quantity} {lineItem.unit}</td>
                          <td style={styles.td}>Rs. {parseFloat(lineItem.price || 0).toFixed(2)}</td>
                          {lineIndex === 0 && <td rowSpan={item.lineItems?.length || 1} style={styles.td}>{item.addedBy}</td>}
                          {lineIndex === 0 && <td rowSpan={item.lineItems?.length || 1} style={styles.td}>{item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'N/A'}</td>}
                          {isAdmin && lineIndex === 0 && <td rowSpan={item.lineItems?.length || 1} style={styles.td}>
                            <button 
                                style={{...styles.deleteBtn, cursor: isProcessing ? 'not-allowed' : 'pointer'}} 
                                onClick={() => handleDelete(item)} 
                                disabled={isProcessing}
                                title="Delete item"
                            >
                                {isProcessing ? <AiOutlineLoading className="spin-anim" /> : <AiOutlineDelete size={16} />}
                            </button>
                          </td>}
                      </tr>
                  ))
              )}
              {filteredInventory.length === 0 && !loading && (<tr><td colSpan={isAdmin ? 9 : 8} style={styles.noData}>No inventory records found.</td></tr>)}
            </tbody>
          </table>
        </div>
        <div style={styles.pagination}>
            <button style={styles.paginationButton} onClick={handlePrevPage} disabled={page === 1}>Previous</button>
            <span style={styles.paginationInfo}>Page {page}</span>
            <button style={styles.paginationButton} onClick={handleNextPage} disabled={isLastPage}>Next</button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: { padding: '24px', fontFamily: "'Inter', sans-serif", backgroundColor: '#f8f9fa' },
  loadingContainer: { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '200px', color: '#6c757d' },
  loadingSpinner: { border: '3px solid #f3f3f3', borderTop: '3px solid #3498db', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', marginBottom: '15px' },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10, borderRadius: '12px' },
  headerContainer: { marginBottom: '24px' },
  header: { fontSize: '28px', fontWeight: '700', color: '#2c3e50' },
  subHeader: { fontSize: '16px', color: '#6c757d', margin: '4px 0 0 0' },
  controlsContainer: { backgroundColor: '#fff', borderRadius: '12px', padding: '20px', marginBottom: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' },
  searchContainer: { display: 'flex', alignItems: 'center', gap: '16px', flex: '1 1 400px' },
  searchInputContainer: { position: 'relative', flex: 1 },
  searchIcon: { position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6c757d', fontSize: '18px' },
  searchInput: { padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', width: '100%', boxSizing: 'border-box' },
  filterToggle: { display: 'flex', alignItems: 'center', padding: '10px 16px', backgroundColor: 'transparent', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', color: '#6c757d' },
  filterPanel: { padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px', margin: '16px 0 0 0', width: '100%', gridColumn: 'span 2'},
  dateFilters: { display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' },
  applyFilterBtn: { padding: '8px 16px', border: 'none', backgroundColor: '#3498db', color: 'white', borderRadius: '6px', cursor: 'pointer' },
  filterGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  filterLabel: { fontSize: '14px', fontWeight: '500', color: '#495057' },
  dateInput: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' },
  addButton: { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 20px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontWeight: '600' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' },
  modal: { backgroundColor: 'white', borderRadius: '12px', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px', borderBottom: '1px solid #eaeaea', flexShrink: 0 },
  modalTitle: { margin: 0, fontSize: '20px', fontWeight: '600', color: '#2c3e50' },
  closeButton: { background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#6c757d' },
  formGrid: { padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', overflowY: 'auto' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  formGroupFull: { gridColumn: 'span 2' },
  label: { fontSize: '14px', fontWeight: '500', color: '#495057' },
  input: { padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px' },
  itemEntry: { display: 'flex', gap: '10px', alignItems: 'center' },
  addItemBtn: { padding: '12px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '8px' },
  stagedTable: { marginTop: '16px' },
  hr: { gridColumn: 'span 2', border: 'none', borderTop: '1px solid #eaeaea', margin: '10px 0' },
  modalButtons: { display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px', borderTop: '1px solid #eaeaea', flexShrink: 0 },
  saveButton: { padding: '12px 24px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cancelButton: { padding: '12px 24px', backgroundColor: 'transparent', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', color: '#6c757d' },
  tableContainer: { position: 'relative', backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', minHeight: '400px' },
  tableHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid #eaeaea' },
  tableTitle: { fontSize: '18px', fontWeight: '600', color: '#2c3e50' },
  tableWrapper: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '16px', textAlign: 'left', backgroundColor: '#f8f9fa', fontWeight: '600', color: '#495057', fontSize: '14px', borderBottom: '1px solid #eaeaea' },
  tr: { borderBottom: '1px solid #eaeaea' },
  td: { padding: '16px', fontSize: '14px', color: '#495057', verticalAlign: 'top' },
  supplierInfo: { display: 'flex', flexDirection: 'column', gap: '4px' },
  companyName: { fontSize: '12px', color: '#6c757d' },
  noData: { padding: '40px', textAlign: 'center', color: '#6c757d', fontSize: '16px' },
  deleteBtn: { backgroundColor: 'transparent', color: '#e74c3c', border: 'none', borderRadius: '6px', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', padding: '20px', borderTop: '1px solid #eaeaea' },
  paginationButton: { padding: '8px 16px', backgroundColor: '#f8f9fa', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
  paginationInfo: { fontSize: '14px', color: '#495057' }
};

const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  .spin-anim { animation: spin 1s linear infinite; }
`;
document.head.appendChild(styleSheet);

export default Inventory;