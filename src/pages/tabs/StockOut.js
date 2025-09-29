import React, { useEffect, useState } from "react";
import { db, auth } from "../../firebase";
import { collection, addDoc, getDocs, query, serverTimestamp, deleteDoc, doc, runTransaction } from "firebase/firestore";
import { Link } from "react-router-dom";
import { AiOutlinePlus, AiOutlineDelete, AiOutlineSearch, AiOutlineFilter } from "react-icons/ai";
import Select from "react-select";

const StockOut = ({ internalUser }) => {
  const [stockOutList, setStockOutList] = useState([]);
  const [availableItems, setAvailableItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    stockInId: "",
    itemId: "", // This will now hold a unique identifier for the line item
    category: "",
    item: "",
    quantity: "",
    receiverId: "",
    receiverName: "",
    unit: "",
    remark: "",
  });
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [showStockInId, setShowStockInId] = useState(true);
  const itemsPerPage = 10;

  const getCurrentInternal = () => {
    if (internalUser && Object.keys(internalUser).length) return internalUser;
    try {
      const stored = localStorage.getItem("internalLoggedInUser");
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return null;
  };
  const isAdmin = getCurrentInternal()?.isAdmin === true;

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid;

    const fetchData = async () => {
      setLoading(true);
      try {
        const stockInColRef = collection(db, uid, "inventory", "stock_in");
        const invSnap = await getDocs(query(stockInColRef));
        
        // 💡 FIX: Use flatMap to create a flat list of all line items from all stock-in documents.
        // Each line item will now be a selectable option in the dropdown.
        const itemOptions = invSnap.docs.flatMap(doc => {
            const stockInData = doc.data();
            const stockInId = stockInData.stockInId;
            const docId = doc.id;

            // Ensure lineItems exists and is an array before mapping
            if (Array.isArray(stockInData.lineItems)) {
                return stockInData.lineItems.map((lineItem, index) => ({
                    // Create a unique value for each line item to avoid conflicts in the Select component
                    value: `${docId}-${index}`, 
                    label: `${lineItem.name} (from ${stockInId})`,
                    category: lineItem.category,
                    unit: lineItem.unit,
                    stockInId: stockInId,
                    itemName: lineItem.name,
                }));
            }
            // Return an empty array for documents that don't have the new structure, preventing errors.
            return []; 
        });
        setAvailableItems(itemOptions);

        const stockOutColRef = collection(db, uid, "inventory", "stock_out");
        const stockSnap = await getDocs(query(stockOutColRef));
        const stockData = stockSnap.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setStockOutList(stockData);
      } catch (error) {
        alert("Error fetching data: " + error.message);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "quantity" && isNaN(value)) return;
    setForm({ ...form, [name]: value });
  };
  
  // 💡 FIX: This handler now correctly populates the form from the selected line item.
  const handleItemSelect = (selectedOption) => {
    if (selectedOption) {
        setForm({ 
            ...form, 
            itemId: selectedOption.value, // The unique value for the line item
            item: selectedOption.itemName, 
            category: selectedOption.category, 
            unit: selectedOption.unit, 
            stockInId: selectedOption.stockInId 
        });
    } else {
        // Reset form fields when the selection is cleared
        setForm({ ...form, itemId: "", item: "", category: "", unit: "", stockInId: "" });
    }
  };

  const getNextStockOutId = async (uid) => {
    const counterRef = doc(db, uid, "counters");
    try {
      const newId = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        const currentId = counterDoc.exists() ? counterDoc.data().lastStockOutID || 0 : 0;
        const nextId = currentId + 1;
        transaction.set(counterRef, { lastStockOutID: nextId }, { merge: true });
        return nextId;
      });
      return `SO-${String(newId).padStart(6, "0")}`;
    } catch (err) {
      console.error("Error generating Stock Out ID:", err);
      alert("Could not generate a new Stock Out ID. Please try again.");
      return null;
    }
  };

  const handleSave = async () => {
    if (!form.item || !form.quantity || !form.receiverId || !form.receiverName) { return alert("Please fill all required fields (*)."); }
    const user = auth.currentUser;
    if (!user) return alert("You are not logged in.");
    const uid = user.uid;

    try {
      const addedBy = getCurrentInternal()?.username || "Admin";
      const stockOutId = await getNextStockOutId(uid);
      if (stockOutId === null) return;
      const stockOutColRef = collection(db, uid, "inventory", "stock_out");
      const stockOutData = { ...form, quantity: Number(form.quantity), stockOutId, addedBy, createdAt: serverTimestamp() };
      const docRef = await addDoc(stockOutColRef, stockOutData);
      const newItem = { ...stockOutData, id: docRef.id, createdAt: new Date() };
      setStockOutList((prev) => [newItem, ...prev]);
      // Clear form completely after saving
      setForm({ itemId: "", category: "", item: "", quantity: "", receiverId: "", receiverName: "", unit: "", remark: "", stockInId: "" });
      setShowModal(false);
    } catch (error) {
      alert("Error adding stock-out record: " + error.message);
    }
  };

  const handleDelete = async (id) => {
    if (!isAdmin) return alert("Only admins can delete stock-out entries.");
    if (!window.confirm("Are you sure you want to delete this entry?")) return;
    const uid = auth.currentUser.uid;
    const docRef = doc(db, uid, "inventory", "stock_out", id);
    try {
      await deleteDoc(docRef);
      setStockOutList((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      alert("Error deleting stock-out: " + error.message);
    }
  };

  const filteredList = stockOutList.filter((item) => {
    let match = true;
    if (search) { match = Object.values(item).some((val) => val?.toString().toLowerCase().includes(search.toLowerCase())); }
    if (match && dateFrom) { match = item.createdAt?.toDate ? item.createdAt.toDate() >= new Date(dateFrom + "T00:00:00") : true; }
    if (match && dateTo) { match = item.createdAt?.toDate ? item.createdAt.toDate() <= new Date(dateTo + "T23:59:59") : true; }
    return match;
  });

  const totalPages = Math.ceil(filteredList.length / itemsPerPage);
  const currentItems = filteredList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) return ( <div style={styles.loadingContainer}><div style={styles.loadingSpinner}></div><p>Loading stock data...</p></div> );

  return (
    <div style={styles.container}>
      <div style={styles.headerContainer}><h2 style={styles.header}>Stock Out</h2><p style={styles.subHeader}>Record inventory items leaving your stock</p></div>
      <div style={styles.controlsContainer}><div style={styles.searchContainer}><div style={styles.searchInputContainer}><AiOutlineSearch style={styles.searchIcon} /><input type="text" placeholder="Search records..." value={search} onChange={(e) => setSearch(e.target.value)} style={styles.searchInput} /></div><button style={styles.filterToggle} onClick={() => setShowFilters(!showFilters)}><AiOutlineFilter style={{ marginRight: '6px' }} />Filters</button></div>{showFilters && (<div style={styles.filterPanel}><div style={styles.dateFilters}><div style={styles.filterGroup}><label style={styles.filterLabel}>From Date</label><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={styles.dateInput} /></div><div style={styles.filterGroup}><label style={styles.filterLabel}>To Date</label><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={styles.dateInput} /></div></div></div>)}<button style={styles.stockOutBtn} onClick={() => setShowModal(true)}><AiOutlinePlus size={20} /> New Stock Out</button></div>
      {showModal && (<div style={styles.modalOverlay}><div style={styles.modal}><div style={styles.modalHeader}><h3 style={styles.modalTitle}>Record New Stock Out</h3><button style={styles.closeButton} onClick={() => setShowModal(false)}>&times;</button></div><div style={styles.formGrid}><div style={styles.formGroupFull}><label style={styles.label}>Select Item *</label><Select options={availableItems} onChange={handleItemSelect} placeholder="Search by item name or Stock In ID..." isClearable /></div><div style={styles.formGroup}><label style={styles.label}>Category</label><input type="text" value={form.category} style={styles.inputDisabled} readOnly /></div><div style={styles.formGroup}><label style={styles.label}>Unit</label><input type="text" value={form.unit} style={styles.inputDisabled} readOnly /></div><div style={styles.formGroupFull}><label style={styles.label}>Quantity *</label><input type="number" name="quantity" value={form.quantity} onChange={handleChange} style={styles.input} placeholder="Enter quantity being removed"/></div><hr style={styles.hr} /><div style={styles.formGroup}><label style={styles.label}>Receiver Emp ID *</label><input type="text" name="receiverId" value={form.receiverId} onChange={handleChange} style={styles.input} placeholder="Employee ID"/></div><div style={styles.formGroup}><label style={styles.label}>Receiver Name *</label><input type="text" name="receiverName" value={form.receiverName} onChange={handleChange} style={styles.input} placeholder="Full name"/></div><div style={styles.formGroupFull}><label style={styles.label}>Remark</label><textarea name="remark" value={form.remark} onChange={handleChange} style={styles.textarea} rows={3} maxLength={250} placeholder="Add a note or reason..."/></div></div><div style={styles.modalButtons}><button style={styles.cancelButton} onClick={() => setShowModal(false)}>Cancel</button><button style={styles.saveButton} onClick={handleSave}>Save Stock Out</button></div></div></div>)}
      <div style={styles.tableContainer}><div style={styles.tableHeader}><span style={styles.tableTitle}>Stock Out History</span><label><input type="checkbox" checked={showStockInId} onChange={() => setShowStockInId(!showStockInId)} /> Show Stock In ID</label></div><div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead><tr><th style={styles.th}>Stock Out ID</th>{showStockInId && <th style={styles.th}>From Stock In ID</th>}<th style={styles.th}>Item</th><th style={styles.th}>Category</th><th style={styles.th}>Quantity</th><th style={styles.th}>Receiver</th><th style={styles.th}>Added By</th><th style={styles.th}>Date & Time</th>{isAdmin && <th style={styles.th}>Action</th>}</tr></thead>
            <tbody>
              {currentItems.length > 0 ? (currentItems.map((item) => (
                  <tr key={item.id} style={styles.tr}>
                    <td style={styles.td}>
                      <Link to={`/stockout-view/${item.id}`} style={styles.link}>{item.stockOutId}</Link>
                    </td>
                    {showStockInId && <td style={styles.td}>{item.stockInId}</td>}
                    <td style={styles.td}>{item.item}</td>
                    <td style={styles.td}>{item.category}</td>
                    <td style={styles.td}>{item.quantity} {item.unit}</td>
                    <td style={styles.td}>{item.receiverName} ({item.receiverId})</td>
                    <td style={styles.td}>{item.addedBy}</td>
                    <td style={styles.td}>{item.createdAt ? (item.createdAt.toDate ? item.createdAt.toDate().toLocaleString() : item.createdAt.toLocaleString()) : 'N/A'}</td>
                    {isAdmin && (<td style={styles.td}><button style={styles.deleteBtn} onClick={() => handleDelete(item.id)} title="Delete entry"><AiOutlineDelete size={16}/></button></td>)}
                  </tr>
                ))) : (<tr><td colSpan={isAdmin ? (showStockInId ? 9 : 8) : (showStockInId ? 8 : 7)} style={styles.noData}>No stock out records found.</td></tr>)}
            </tbody>
          </table>
        </div>{totalPages > 1 && (<div style={styles.pagination}><button style={styles.paginationButton} onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage === 1}>Previous</button><span style={styles.paginationInfo}>Page {currentPage} of {totalPages}</span><button style={styles.paginationButton} onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages}>Next</button></div>)}</div>
    </div>
  );
};

// Styles remain the same
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
    saveButton: { padding: '12px 24px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontWeight: '600' },
    cancelButton: { padding: '12px 24px', backgroundColor: 'transparent', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', color: '#6c757d' },
    tableContainer: { backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' },
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
styleSheet.innerText = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
document.head.appendChild(styleSheet);

export default StockOut;