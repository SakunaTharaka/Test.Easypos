import React, { useEffect, useState } from "react";
import { db, auth } from "../../firebase";
import { 
  collection, 
  getDocs, 
  query, 
  serverTimestamp, 
  deleteDoc, 
  doc, 
  runTransaction, 
  orderBy, 
  limit, 
  startAfter, 
  where 
} from "firebase/firestore";
import { Link } from "react-router-dom";
import { 
  AiOutlinePlus, 
  AiOutlineDelete, 
  AiOutlineSearch, 
  AiOutlineFilter,
  AiOutlineLoading 
} from "react-icons/ai";
import AsyncSelect from "react-select/async";

const ITEMS_PER_PAGE = 25;

const StockOut = ({ internalUser }) => {
  const [stockOutList, setStockOutList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [form, setForm] = useState({
    itemId: "",
    category: "",
    item: "",
    type: "",
    quantity: "",
    receiverId: "",
    receiverName: "",
    unit: "",
    remark: "",
  });

  // --- Search & Filter State ---
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // --- Pagination State ---
  const [page, setPage] = useState(1);
  const [lastVisible, setLastVisible] = useState(null);
  const [pageHistory, setPageHistory] = useState([null]); 
  const [isLastPage, setIsLastPage] = useState(false);

  const getCurrentInternal = () => {
    try {
      const stored = localStorage.getItem("internalLoggedInUser");
      return stored ? JSON.parse(stored) : null;
    } catch (e) { return null; }
  };
  const isAdmin = getCurrentInternal()?.isAdmin === true;

  // --- ASYNC OPTION LOADER (FIXED) ---
  const loadDropdownOptions = async (inputValue) => {
    const user = auth.currentUser;
    if (!user) return [];
    const uid = user.uid;

    const itemsColRef = collection(db, uid, "items", "item_list");
    
    // 1. Base Constraints: Only show 'storesItem' or 'buySell' items
    let constraints = [
        where("type", "in", ["storesItem", "buySell"]),
        limit(20) 
    ];

    if (inputValue) {
        // 2. Case Sensitivity Fix:
        // Most items are saved like "Samsung Phone" (Capitalized).
        // If user types "sam", we convert it to "Sam" to match the DB.
        const formattedInput = inputValue.charAt(0).toUpperCase() + inputValue.slice(1);

        constraints.push(where("name", ">=", formattedInput));
        constraints.push(where("name", "<=", formattedInput + "\uf8ff"));
        constraints.push(orderBy("name"));
    } else {
        // 3. Default View: Sort by name A-Z
        constraints.push(orderBy("name"));
    }

    try {
        const q = query(itemsColRef, ...constraints);
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                value: doc.id, 
                label: `${data.name} (Available: ${data.qtyOnHand || 0} ${data.unit || ''})`, 
                category: data.category || "",
                unit: data.unit || "", 
                type: data.type || "",
                itemName: data.name,
                currentAvgCost: data.averageCost 
            };
        });
    } catch (error) {
        console.error("Error loading items:", error);
        
        // 4. Missing Index Handler
        if (error.code === 'failed-precondition') {
            alert("System Error: Missing Database Index.\n\nOpen your browser console (F12) and click the link provided by Firebase to fix this instantly.");
        }
        return [];
    }
  };

  // --- Data Fetching (List View) ---
  const fetchStockOuts = async (direction = 'initial') => {
    setLoading(true);
    const user = auth.currentUser;
    if (!user) { setLoading(false); return; }
    const uid = user.uid;
    const stockOutColRef = collection(db, uid, "inventory", "stock_out");
    
    let q = query(stockOutColRef, orderBy("createdAt", "desc"));

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
      const stockData = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setStockOutList(stockData);

      if (stockData.length > 0) {
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
        if (direction === 'next') setPageHistory(prev => [...prev, querySnapshot.docs[0]]);
      }
      setIsLastPage(stockData.length < ITEMS_PER_PAGE);
    } catch (error) {
      console.error("Error fetching stock out data:", error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchStockOuts('initial');
  }, []);

  // --- MODAL HANDLER ---
  const handleOpenModal = () => {
      setShowModal(true);
  };

  const handleApplyFilters = () => {
    setPage(1);
    setLastVisible(null);
    setPageHistory([null]);
    fetchStockOuts('initial');
  };

  const handleNextPage = () => !isLastPage && (setPage(prev => prev + 1), fetchStockOuts('next'));
  const handlePrevPage = () => page > 1 && (setPageHistory(prev => { const n = [...prev]; n.pop(); return n; }), setPage(prev => prev - 1), fetchStockOuts('prev'));

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "quantity" && isNaN(value)) return;
    setForm({ ...form, [name]: value });
  };
  
  const handleItemSelect = (selectedOption) => {
    if (selectedOption) {
        setForm({ 
            ...form, 
            itemId: selectedOption.value,
            item: selectedOption.itemName, 
            category: selectedOption.category || "", 
            unit: selectedOption.unit || "", 
            type: selectedOption.type || "",
        });
    } else {
        setForm({ ...form, itemId: "", item: "", category: "", unit: "", type: "" });
    }
  };

  const getNextStockOutId = async (uid) => {
    const counterRef = doc(db, uid, "counters");
    try {
      return await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        const currentId = counterDoc.exists() ? counterDoc.data().lastStockOutID || 0 : 0;
        const nextId = currentId + 1;
        transaction.set(counterRef, { lastStockOutID: nextId }, { merge: true });
        return `SO-${String(nextId).padStart(6, "0")}`;
      });
    } catch (err) {
      console.error("Error generating Stock Out ID:", err);
      return null;
    }
  };

  // --- SAVE Transaction ---
  const handleSave = async () => {
    if (!form.item || !form.quantity || !form.receiverId || !form.receiverName) { return alert("Please fill all required fields (*)."); }
    if (isProcessing) return; 

    setIsProcessing(true);
    const user = auth.currentUser;
    if (!user) { setIsProcessing(false); return alert("You are not logged in."); }
    const uid = user.uid;

    const stockOutId = await getNextStockOutId(uid);
    if (!stockOutId) { setIsProcessing(false); return alert("System busy, please try again."); }

    try {
      await runTransaction(db, async (transaction) => {
          const itemRef = doc(db, uid, "items", "item_list", form.itemId);
          const itemSnap = await transaction.get(itemRef);

          if (!itemSnap.exists()) throw new Error("Item not found!");

          const itemData = itemSnap.data();
          const currentQty = parseFloat(itemData.qtyOnHand) || 0;
          const requestedQty = parseFloat(form.quantity);

          if (currentQty < requestedQty) {
              throw new Error(`Insufficient Stock! Available: ${currentQty}, Requested: ${requestedQty}`);
          }

          const newQty = currentQty - requestedQty;
          const costAtTimeOfSale = parseFloat(itemData.averageCost) || 0;

          transaction.update(itemRef, { qtyOnHand: newQty });

          const stockOutRef = doc(collection(db, uid, "inventory", "stock_out"));
          const stockOutData = { 
              itemId: form.itemId,
              category: form.category || "",
              item: form.item,
              type: form.type || "",
              unit: form.unit || "", 
              remark: form.remark || "",
              receiverId: form.receiverId,
              receiverName: form.receiverName,
              stockOutId, 
              quantity: requestedQty, 
              costAtTimeOfSale: costAtTimeOfSale, 
              addedBy: getCurrentInternal()?.username || "Admin", 
              createdAt: serverTimestamp() 
          };
          
          transaction.set(stockOutRef, stockOutData);
      });
      
      handleApplyFilters();
      setForm({ itemId: "", category: "", item: "", quantity: "", receiverId: "", receiverName: "", unit: "", remark: "", type: "" });
      setShowModal(false);
      alert("Stock Out Recorded Successfully.");

    } catch (error) {
      console.error(error);
      alert("Failed: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- DELETE Transaction ---
  const handleDelete = async (item) => {
    if (!isAdmin) return alert("Only admins can delete stock-out entries.");
    if (isProcessing) return; 

    if (!window.confirm(`ROLLBACK WARNING:\n\nDeleting this record will:\n1. RESTORE ${item.quantity} ${item.unit} to inventory.\n2. Recalculate Average Cost (treating returned items at their original cost).\n\nAre you sure you want to proceed?`)) return;
    
    setIsProcessing(true);
    const user = auth.currentUser;
    const uid = user.uid;

    try {
      await runTransaction(db, async (transaction) => {
        const stockOutRef = doc(db, uid, "inventory", "stock_out", item.id);
        const stockOutSnap = await transaction.get(stockOutRef);
        if (!stockOutSnap.exists()) throw new Error("Record already deleted.");
        
        const data = stockOutSnap.data();
        const restoreQty = parseFloat(data.quantity);
        const restoreCost = parseFloat(data.costAtTimeOfSale) || 0; 
        const itemId = data.itemId;

        const itemRef = doc(db, uid, "items", "item_list", itemId);
        const itemSnap = await transaction.get(itemRef);

        if (!itemSnap.exists()) throw new Error("The original item master no longer exists. Cannot restore stock.");

        const masterData = itemSnap.data();
        const currentMasterQty = parseFloat(masterData.qtyOnHand) || 0;
        const currentMasterAvg = parseFloat(masterData.averageCost) || 0;
        
        const newMasterQty = currentMasterQty + restoreQty;
        let newAvgCost = 0;

        if (newMasterQty > 0) {
            const currentTotalValue = currentMasterQty * currentMasterAvg;
            const returnedValue = restoreQty * restoreCost;
            newAvgCost = (currentTotalValue + returnedValue) / newMasterQty;
        } else {
            newAvgCost = restoreCost;
        }

        transaction.update(itemRef, { 
            qtyOnHand: newMasterQty,
            averageCost: newAvgCost 
        });
        
        transaction.delete(stockOutRef);
      });

      fetchStockOuts(page > 1 ? 'prev' : 'initial');
      alert("Record deleted, Stock Restored, and Average Cost updated successfully.");

    } catch (error) {
      console.error("Delete failed:", error);
      alert("Error rolling back: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const filteredList = stockOutList.filter((item) => {
    if (!search) return true;
    return Object.values(item).some((val) => val?.toString().toLowerCase().includes(search.toLowerCase()));
  });
  
  if (loading && page === 1 && stockOutList.length === 0) return ( <div style={styles.loadingContainer}><div style={styles.loadingSpinner}></div><p>Loading stock data...</p></div> );

  return (
    <div style={styles.container}>
      <div style={styles.headerContainer}><h2 style={styles.header}>Stock Out</h2><p style={styles.subHeader}>Record inventory items leaving your stock</p></div>
      
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
            style={{...styles.stockOutBtn, opacity: isProcessing ? 0.6 : 1}} 
            onClick={handleOpenModal}
            disabled={isProcessing}
          >
            <AiOutlinePlus size={20} /> New Stock Out
          </button>
      </div>
      
      {showModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Record New Stock Out</h3>
                <button style={styles.closeButton} onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div style={styles.formGrid}>
                <div style={styles.formGroupFull}>
                    <label style={styles.label}>Select Item *</label>
                    <AsyncSelect 
                        // Removed cacheOptions to fix "new item not showing" issue
                        defaultOptions 
                        loadOptions={loadDropdownOptions} 
                        onChange={handleItemSelect}
                        placeholder="Type to search item..."
                        isClearable
                    />
                </div>
                <div style={styles.formGroupFull}>
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px'}}>
                        <div style={styles.formGroup}><label style={styles.label}>Category</label><input type="text" value={form.category || 'N/A'} style={styles.inputDisabled} readOnly /></div>
                        <div style={styles.formGroup}><label style={styles.label}>Type</label><input type="text" value={form.type || 'N/A'} style={styles.inputDisabled} readOnly /></div>
                        <div style={styles.formGroup}><label style={styles.label}>Unit</label><input type="text" value={form.unit || 'N/A'} style={styles.inputDisabled} readOnly /></div>
                    </div>
                </div>
                <div style={styles.formGroupFull}><label style={styles.label}>Quantity *</label><input type="number" name="quantity" value={form.quantity} onChange={handleChange} style={styles.input} placeholder="Enter quantity being removed"/></div>
                <hr style={styles.hr} />
                <div style={styles.formGroup}><label style={styles.label}>Receiver Emp ID *</label><input type="text" name="receiverId" value={form.receiverId} onChange={handleChange} style={styles.input} placeholder="Employee ID"/></div>
                <div style={styles.formGroup}><label style={styles.label}>Receiver Name *</label><input type="text" name="receiverName" value={form.receiverName} onChange={handleChange} style={styles.input} placeholder="Full name"/></div>
                <div style={styles.formGroupFull}><label style={styles.label}>Remark</label><textarea name="remark" value={form.remark} onChange={handleChange} style={styles.textarea} rows={3} maxLength={250} placeholder="Add a note or reason..."/></div>
            </div>
            
            <div style={styles.modalButtons}>
                <button style={styles.cancelButton} onClick={() => setShowModal(false)} disabled={isProcessing}>Cancel</button>
                <button style={styles.saveButton} onClick={handleSave} disabled={isProcessing}>
                    {isProcessing ? <AiOutlineLoading className="spin-anim" /> : "Save Stock Out"}
                </button>
            </div>
          </div>
        </div>
      )}

      <div style={styles.tableContainer}>
        {loading && <div style={styles.loadingOverlay}><span>Loading...</span></div>}
        <div style={styles.tableHeader}><span style={styles.tableTitle}>Stock Out History</span></div>
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead><tr><th style={styles.th}>Stock Out ID</th><th style={styles.th}>Item</th><th style={styles.th}>Type</th><th style={styles.th}>Category</th><th style={styles.th}>Quantity</th><th style={styles.th}>Receiver</th><th style={styles.th}>Added By</th><th style={styles.th}>Date & Time</th>{isAdmin && <th style={styles.th}>Action</th>}</tr></thead>
            <tbody>
              {filteredList.length > 0 ? (filteredList.map((item) => (
                  <tr key={item.id} style={styles.tr}>
                    <td style={styles.td}><Link to={`/stockout-view/${item.id}`} style={styles.link}>{item.stockOutId}</Link></td>
                    <td style={styles.td}>{item.item}</td>
                    <td style={styles.td}>{item.type}</td>
                    <td style={styles.td}>{item.category}</td>
                    <td style={styles.td}>{item.quantity} {item.unit}</td>
                    <td style={styles.td}>{item.receiverName} ({item.receiverId})</td>
                    <td style={styles.td}>{item.addedBy}</td>
                    <td style={styles.td}>{item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString() : 'N/A'}</td>
                    {isAdmin && (<td style={styles.td}>
                        <button 
                            style={{...styles.deleteBtn, cursor: isProcessing ? 'not-allowed' : 'pointer'}} 
                            onClick={() => handleDelete(item)} 
                            disabled={isProcessing}
                            title="Delete entry"
                        >
                            {isProcessing ? <AiOutlineLoading className="spin-anim" /> : <AiOutlineDelete size={16}/>}
                        </button>
                    </td>)}
                  </tr>
                ))) : (!loading && <tr><td colSpan={isAdmin ? 9 : 8} style={styles.noData}>No stock out records found.</td></tr>)}
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
    filterPanel: { padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px', margin: '16px 0 0 0', width: '100%', gridColumn: 'span 2' },
    dateFilters: { display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' },
    filterGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
    filterLabel: { fontSize: '14px', fontWeight: '500', color: '#495057' },
    dateInput: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' },
    applyFilterBtn: { padding: '8px 16px', border: 'none', backgroundColor: '#3498db', color: 'white', borderRadius: '6px', cursor: 'pointer' },
    stockOutBtn: { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 20px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontWeight: '600' },
    modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' },
    modal: { backgroundColor: 'white', borderRadius: '12px', width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' },
    modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px', borderBottom: '1px solid #eaeaea', flexShrink: 0 },
    modalTitle: { margin: 0, fontSize: '20px', fontWeight: '600', color: '#2c3e50' },
    closeButton: { background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#6c757d' },
    formGrid: { padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', overflowY: 'auto' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
    formGroupFull: { gridColumn: 'span 2' },
    label: { fontSize: '14px', fontWeight: '500', color: '#495057' },
    input: { padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px' },
    inputDisabled: { padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', backgroundColor: '#f8f9fa', color: '#6c757d', cursor: 'not-allowed' },
    textarea: { padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', resize: 'vertical', minHeight: '80px', fontFamily: 'inherit' },
    hr: { gridColumn: 'span 2', border: 'none', borderTop: '1px solid #eaeaea', margin: '10px 0' },
    modalButtons: { display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px', borderTop: '1px solid #eaeaea', flexShrink: 0 },
    saveButton: { padding: '12px 24px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    cancelButton: { padding: '12px 24px', backgroundColor: 'transparent', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', color: '#6c757d' },
    tableContainer: { position: 'relative', backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' },
    tableHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid #eaeaea' },
    tableTitle: { fontSize: '18px', fontWeight: '600', color: '#2c3e50' },
    tableWrapper: { overflowX: 'auto' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { padding: '16px', textAlign: 'left', backgroundColor: '#f8f9fa', fontWeight: '600', color: '#495057', fontSize: '14px', borderBottom: '1px solid #eaeaea' },
    tr: { borderBottom: '1px solid #eaeaea' },
    td: { padding: '16px', fontSize: '14px', color: '#495057' },
    link: { color: '#3498db', textDecoration: 'none', fontWeight: '500' },
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

export default StockOut;