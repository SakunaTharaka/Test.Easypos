import React, { useEffect, useState, useRef } from "react";
import { db, auth } from "../../firebase";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
} from "firebase/firestore";
import { 
  AiOutlinePlus, 
  AiOutlineDelete, 
  AiOutlineSearch, 
  AiOutlineFilter
} from "react-icons/ai";
import Select from "react-select";

const Inventory = ({ internalUser }) => {
  const [inventory, setInventory] = useState([]);
  const [filteredInventory, setFilteredInventory] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stockableItems, setStockableItems] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [paidStockInIds, setPaidStockInIds] = useState(new Set()); // State to track paid stock IDs

  // --- State for the new multi-item modal ---
  const [showModal, setShowModal] = useState(false);
  const [stagedItems, setStagedItems] = useState([]);
  const [supplierInfo, setSupplierInfo] = useState({ name: "", mobile: "", company: "" });
  const [selectedPO, setSelectedPO] = useState(null);
  
  // --- State for the item entry row ---
  const [currentItem, setCurrentItem] = useState(null);
  const [currentQty, setCurrentQty] = useState(1);
  const [currentPrice, setCurrentPrice] = useState("");
  const [currentUnit, setCurrentUnit] = useState("");
  const itemSelectRef = useRef(null);
  
  // --- Other state ---
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  const getCurrentInternal = () => {
    try {
      const stored = localStorage.getItem("internalLoggedInUser");
      return stored ? JSON.parse(stored) : null;
    } catch (e) { return null; }
  };
  const isAdmin = getCurrentInternal()?.isAdmin === true;

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid;

    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch inventory records
        const invColRef = collection(db, uid, "inventory", "stock_in");
        const invSnap = await getDocs(query(invColRef));
        const invData = invSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setInventory(invData);

        // Fetch settings
        const settingsRef = doc(db, uid, "settings");
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) setUnits(settingsSnap.data().itemUnits || []);

        // Fetch stockable items
        const itemsColRef = collection(db, uid, "items", "item_list");
        const itemsQuery = query(itemsColRef, where("type", "in", ["storesItem", "buySell"]));
        const itemsSnap = await getDocs(itemsQuery);
        const itemOptions = itemsSnap.docs.map(doc => ({
            value: doc.id,
            label: `${doc.data().name} (SKU: ${doc.data().sku || 'N/A'})`,
            ...doc.data()
        }));
        setStockableItems(itemOptions);
        
        // Fetch purchase orders
        const poColRef = collection(db, uid, "purchase_orders", "po_list");
        const poSnap = await getDocs(query(poColRef));
        setPurchaseOrders(poSnap.docs.map(d => ({ value: d.id, label: d.data().poNumber })));
        
        // ✨ Fetch payments to check for deletable stock records
        const paymentsColRef = collection(db, uid, "stock_payments", "payments");
        const paymentsSnap = await getDocs(paymentsColRef);
        const idsWithPayments = new Set(paymentsSnap.docs.map(pDoc => pDoc.data().stockInId));
        setPaidStockInIds(idsWithPayments);

      } catch (error) {
        alert("Error fetching data: " + error.message);
      }
      setLoading(false);
    };
    fetchData();
  }, []);
  
  const getNextStockInId = async (uid) => {
    const counterRef = doc(db, uid, "counters");
    try {
        const newId = await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            const currentId = counterDoc.exists() ? counterDoc.data().lastStockInId || 0 : 0;
            const nextId = currentId + 1;
            transaction.set(counterRef, { lastStockInId: nextId }, { merge: true });
            return nextId;
        });
        return `SI-${String(newId).padStart(6, "0")}`;
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
        return alert("This item is already in the list. Please remove it first to make changes.");
    }
    setStagedItems([...stagedItems, { ...currentItem, quantity: Number(currentQty), price: Number(currentPrice), unit: currentUnit }]);
    setCurrentItem(null);
    setCurrentQty(1);
    setCurrentPrice("");
    setCurrentUnit("");
    itemSelectRef.current?.focus();
  };

  const handleDeleteStagedItem = (index) => setStagedItems(stagedItems.filter((_, i) => i !== index));

  const handleSave = async () => {
    if (stagedItems.length === 0) return alert("Please add at least one item to save.");
    const user = auth.currentUser;
    if (!user) return alert("You are not logged in.");
    const uid = user.uid;
    
    const stockInId = await getNextStockInId(uid);
    if (!stockInId) return;

    try {
      const addedBy = getCurrentInternal()?.username || "Admin";
      const stockInColRef = collection(db, uid, "inventory", "stock_in");
      
      const newDoc = {
        stockInId,
        poId: selectedPO ? selectedPO.value : "",
        poNumber: selectedPO ? selectedPO.label : "",
        supplierName: supplierInfo.name,
        supplierMobile: supplierInfo.mobile,
        supplierCompany: supplierInfo.company,
        lineItems: stagedItems.map(({ value, label, ...item }) => item),
        addedBy,
        createdAt: serverTimestamp(),
      };
      
      const docRef = await addDoc(stockInColRef, newDoc);
      const newItem = { ...newDoc, id: docRef.id, createdAt: new Date() };
      setInventory((prev) => [newItem, ...prev]);
      
      setShowModal(false);
      setStagedItems([]);
      setSupplierInfo({ name: "", mobile: "", company: ""});
      setSelectedPO(null);

      alert("Stock-In record saved successfully!");
    } catch (error) {
      alert("Error adding item: " + error.message);
    }
  };

  // ✨ Updated handleDelete function with payment check
  const handleDelete = async (item) => {
    // First, check if payments exist for this stockInId
    if (paidStockInIds.has(item.stockInId)) {
        alert("This stock record cannot be deleted because payments have been made against it.\n\nPlease delete the associated payments from the Transaction History page first.");
        return; // Block the deletion
    }

    // If no payments, proceed with the original deletion logic
    if (!window.confirm("Are you sure you want to delete this record? This will remove all items associated with this Stock In ID.")) return;
    
    const uid = auth.currentUser.uid;
    const docRef = doc(db, uid, "inventory", "stock_in", item.id);
    try {
      await deleteDoc(docRef);
      setInventory((prev) => prev.filter((i) => i.id !== item.id));
    } catch (error) {
      alert("Error deleting item: " + error.message);
    }
  };
  
  useEffect(() => {
    let filtered = inventory.filter(item => {
      const searchTermMatch = search ? 
        Object.values(item).some(val => String(val).toLowerCase().includes(search.toLowerCase())) ||
        (item.lineItems && item.lineItems.some(line => line.name.toLowerCase().includes(search.toLowerCase())))
        : true;
      const dateFromMatch = dateFrom ? (item.createdAt?.toDate() ?? new Date()) >= new Date(dateFrom + "T00:00:00") : true;
      const dateToMatch = dateTo ? (item.createdAt?.toDate() ?? new Date()) <= new Date(dateTo + "T23:59:59") : true;
      return searchTermMatch && dateFromMatch && dateToMatch;
    });
    setFilteredInventory(filtered);
    setCurrentPage(1);
  }, [search, dateFrom, dateTo, inventory]);
  
  const totalPages = Math.ceil(filteredInventory.length / itemsPerPage);
  const currentItems = filteredInventory.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) return ( <div style={styles.loadingContainer}><div style={styles.loadingSpinner}></div><p>Loading inventory data...</p></div> );

  return (
    <div style={styles.container}>
      <div style={styles.headerContainer}><h2 style={styles.header}>Stock-In / Inventory</h2><p style={styles.subHeader}>Record new items coming into your inventory</p></div>
      <div style={styles.controlsContainer}><div style={styles.searchContainer}><div style={styles.searchInputContainer}><AiOutlineSearch style={styles.searchIcon} /><input type="text" placeholder="Search records..." value={search} onChange={(e) => setSearch(e.target.value)} style={styles.searchInput} /></div><button style={styles.filterToggle} onClick={() => setShowFilters(!showFilters)}><AiOutlineFilter style={{ marginRight: '6px' }} />Filters</button></div>{showFilters && (<div style={styles.filterPanel}><div style={styles.dateFilters}><div style={styles.filterGroup}><label style={styles.filterLabel}>From Date</label><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={styles.dateInput} /></div><div style={styles.filterGroup}><label style={styles.filterLabel}>To Date</label><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={styles.dateInput} /></div></div></div>)}<button style={styles.addButton} onClick={() => setShowModal(true)}><AiOutlinePlus size={20} /> New Stock-In</button></div>

      {showModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}><h3 style={styles.modalTitle}>Record New Stock-In</h3><button style={styles.closeButton} onClick={() => setShowModal(false)}>&times;</button></div>
            <div style={styles.formGrid}>
              <div style={styles.formGroup}><label style={styles.label}>Supplier Name</label><input value={supplierInfo.name} onChange={e => setSupplierInfo({...supplierInfo, name: e.target.value})} style={styles.input} /></div>
              <div style={styles.formGroup}><label style={styles.label}>Supplier Mobile</label><input value={supplierInfo.mobile} onChange={e => setSupplierInfo({...supplierInfo, mobile: e.target.value})} style={styles.input} maxLength="10"/></div>
              <div style={styles.formGroupFull}><label style={styles.label}>Supplier Company</label><input value={supplierInfo.company} onChange={e => setSupplierInfo({...supplierInfo, company: e.target.value})} style={styles.input} /></div>
              <div style={styles.formGroupFull}><label style={styles.label}>Reference Purchase Order (Optional)</label><Select options={purchaseOrders} value={selectedPO} onChange={setSelectedPO} placeholder="Search by PO ID..." isClearable /></div>
              <hr style={styles.hr} />
              <div style={styles.formGroupFull}>
                  <label style={styles.label}>Add Items</label>
                  <div style={styles.itemEntry}>
                      <div style={{flex: 3}}><Select ref={itemSelectRef} options={stockableItems} value={currentItem} onChange={setCurrentItem} placeholder="Search item..."/></div>
                      <div style={{flex: 1}}><input type="number" placeholder="Qty" value={currentQty} onChange={e => setCurrentQty(e.target.value)} style={styles.input}/></div>
                      <div style={{flex: 1}}><select value={currentUnit} onChange={e => setCurrentUnit(e.target.value)} style={styles.input}><option value="">Unit</option>{units.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
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
            <div style={styles.modalButtons}><button style={styles.cancelButton} onClick={() => setShowModal(false)}>Cancel</button><button style={styles.saveButton} onClick={handleSave}>Save Stock-In</button></div>
          </div>
        </div>
      )}

      <div style={styles.tableContainer}>
        <div style={styles.tableHeader}><span style={styles.tableTitle}>Stock-In History</span><span style={styles.resultCount}>{filteredInventory.length} record(s) found</span></div>
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead><tr><th style={styles.th}>Stock In ID</th><th style={styles.th}>Item</th><th style={styles.th}>Category/Brand</th><th style={styles.th}>Supplier</th><th style={styles.th}>Quantity</th><th style={styles.th}>Unit Price</th><th style={styles.th}>Added By</th><th style={styles.th}>Date</th>{isAdmin && <th style={styles.th}>Action</th>}</tr></thead>
            <tbody>
              {currentItems.flatMap((item, recIndex) => 
                  (item.lineItems || [{...item}]).map((lineItem, lineIndex) => (
                      <tr key={`${item.id}-${lineIndex}`}>
                          {lineIndex === 0 && <td rowSpan={item.lineItems?.length || 1} style={styles.td}>{item.stockInId}</td>}
                          <td style={styles.td}>{lineItem.name || lineItem.item}</td>
                          <td style={styles.td}>{lineItem.category} / {lineItem.brand}</td>
                          {lineIndex === 0 && <td rowSpan={item.lineItems?.length || 1} style={styles.td}><div style={styles.supplierInfo}>{item.supplierName && <div>{item.supplierName}</div>}{item.supplierCompany && <div style={styles.companyName}>{item.supplierCompany}</div>}</div></td>}
                          <td style={styles.td}>{lineItem.quantity} {lineItem.unit}</td>
                          <td style={styles.td}>Rs. {parseFloat(lineItem.price || 0).toFixed(2)}</td>
                          {lineIndex === 0 && <td rowSpan={item.lineItems?.length || 1} style={styles.td}>{item.addedBy}</td>}
                          {lineIndex === 0 && <td rowSpan={item.lineItems?.length || 1} style={styles.td}>{item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'N/A'}</td>}
                          {isAdmin && lineIndex === 0 && <td rowSpan={item.lineItems?.length || 1} style={styles.td}>
                            {/* ✨ Pass the entire item object to the delete handler */}
                            <button style={styles.deleteBtn} onClick={() => handleDelete(item)} title="Delete item">
                                <AiOutlineDelete size={16} />
                            </button>
                          </td>}
                      </tr>
                  ))
              )}
              {currentItems.length === 0 && (<tr><td colSpan={isAdmin ? 9 : 8} style={styles.noData}>No inventory records found.</td></tr>)}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (<div style={styles.pagination}><button style={styles.paginationButton} onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage === 1}>Previous</button><span style={styles.paginationInfo}>Page {currentPage} of {totalPages}</span><button style={styles.paginationButton} onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages}>Next</button></div>)}
      </div>
    </div>
  );
};

const styles = {
  container: { padding: '24px', fontFamily: "'Inter', sans-serif", backgroundColor: '#f8f9fa' },
  loadingContainer: { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '200px', color: '#6c757d' },
  loadingSpinner: { border: '3px solid #f3f3f3', borderTop: '3px solid #3498db', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', marginBottom: '15px' },
  headerContainer: { marginBottom: '24px' },
  header: { fontSize: '28px', fontWeight: '700', color: '#2c3e50' },
  subHeader: { fontSize: '16px', color: '#6c757d', margin: '4px 0 0 0' },
  controlsContainer: { backgroundColor: '#fff', borderRadius: '12px', padding: '20px', marginBottom: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' },
  searchContainer: { display: 'flex', alignItems: 'center', gap: '16px', flex: '1 1 400px' },
  searchInputContainer: { position: 'relative', flex: 1 },
  searchIcon: { position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6c757d', fontSize: '18px' },
  searchInput: { padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', width: '100%', boxSizing: 'border-box' },
  filterToggle: { display: 'flex', alignItems: 'center', padding: '10px 16px', backgroundColor: 'transparent', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', color: '#6c757d' },
  filterPanel: { padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px', marginBottom: '16px', width: '100%' },
  dateFilters: { display: 'flex', gap: '16px', flexWrap: 'wrap' },
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
  saveButton: { padding: '12px 24px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontWeight: '600' },
  cancelButton: { padding: '12px 24px', backgroundColor: 'transparent', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', color: '#6c757d' },
  tableContainer: { backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' },
  tableHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid #eaeaea' },
  tableTitle: { fontSize: '18px', fontWeight: '600', color: '#2c3e50' },
  resultCount: { fontSize: '14px', color: '#6c757d' },
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
styleSheet.innerText = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
document.head.appendChild(styleSheet);

export default Inventory;