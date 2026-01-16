import React, { useEffect, useState, useRef } from "react";
import { db, auth } from "../../firebase";
import {
  collection,
  addDoc,
  query,
  getDocs,
  getDoc,
  serverTimestamp,
  doc,
  runTransaction,
  deleteDoc,
  orderBy,
  limit,
  startAfter,
  where
} from "firebase/firestore";
import { AiOutlinePlus, AiOutlineSearch, AiOutlineEye, AiOutlineDelete, AiOutlineFilter } from "react-icons/ai";
import Select from "react-select";

const ITEMS_PER_PAGE = 20;

const PurchasingOrder = ({ internalUser }) => {
  const [orders, setOrders] = useState([]);
  // Removed unused 'loading' state
  const [itemsForDropdown, setItemsForDropdown] = useState([]);
  const [companyInfo, setCompanyInfo] = useState(null);

  // --- Pagination State ---
  const [page, setPage] = useState(1);
  const [lastVisible, setLastVisible] = useState(null);
  const [pageHistory, setPageHistory] = useState([null]); 
  const [isLastPage, setIsLastPage] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState({
    poNumber: "",
    poDate: new Date().toISOString().split('T')[0],
    supplierName: "",
    supplierAddress: "",
    supplierContact: "",
    lineItems: [{ itemId: "", name: "", quantity: 1, price: 0, total: 0 }],
    subtotal: 0,
    tax: 0,
    shipping: 0,
    total: 0,
  });

  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const printComponentRef = useRef();

  const getCurrentInternal = () => {
    try {
      const stored = localStorage.getItem("internalLoggedInUser");
      return stored ? JSON.parse(stored) : null;
    } catch (e) { return null; }
  };
  const isAdmin = getCurrentInternal()?.isAdmin === true;

  const fetchOrders = async (direction = 'initial') => {
    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid;
    const poColRef = collection(db, uid, "purchase_orders", "po_list");

    let q = query(poColRef, orderBy("createdAt", "desc"));

    if (dateFrom) {
        q = query(q, where("createdAt", ">=", new Date(dateFrom + "T00:00:00")));
    }
    if (dateTo) {
        q = query(q, where("createdAt", "<=", new Date(dateTo + "T23:59:59")));
    }
    
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

        const poData = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setOrders(poData);

        if (poData.length > 0) {
            setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
            const firstDoc = querySnapshot.docs[0];

            if (direction === 'next') {
                setPageHistory(prev => [...prev, firstDoc]);
            }
        }
        setIsLastPage(poData.length < ITEMS_PER_PAGE);

    } catch (error) {
        console.error("Error fetching purchase orders:", error);
    }
  };

  useEffect(() => {
    fetchOrders('initial');

    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid;

    const fetchInitialDropdowns = async () => {
        try {
            const itemsColRef = collection(db, uid, "items", "item_list");
            const itemsSnap = await getDocs(query(itemsColRef));
            const itemsData = itemsSnap.docs.map(d => ({
                value: d.id, label: `${d.data().name} (SKU: ${d.data().sku || 'N/A'})`, ...d.data()
            }));
            setItemsForDropdown(itemsData);

            const settingsRef = doc(db, uid, "settings");
            const settingsSnap = await getDoc(settingsRef);
            if (settingsSnap.exists()) setCompanyInfo(settingsSnap.data());
        } catch(error) {
             console.error("Error fetching dropdowns/settings:", error);
        }
    };
    fetchInitialDropdowns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyFilters = () => {
    setPage(1);
    setLastVisible(null);
    setPageHistory([null]);
    fetchOrders('initial');
  };

  const handleNextPage = () => {
    if (!isLastPage) {
        setPage(prev => prev + 1);
        fetchOrders('next');
    }
  };

  const handlePrevPage = () => {
    if (page > 1) {
        const newPageHistory = [...pageHistory];
        newPageHistory.pop();
        setPageHistory(newPageHistory);
        setPage(prev => prev - 1);
        fetchOrders('prev');
    }
  };

  const getNextPONumber = async (uid) => {
    const counterRef = doc(db, uid, "counters");
    try {
      const newId = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        const currentId = counterDoc.exists() ? counterDoc.data().lastPO_ID || 0 : 0;
        const nextId = currentId + 1;
        transaction.set(counterRef, { lastPO_ID: nextId }, { merge: true });
        return nextId;
      });
      return `PO-${String(newId).padStart(6, "0")}`;
    } catch (err) {
      console.error("Error generating PO Number:", err.message);
      return null;
    }
  };

  const handleLineItemChange = (index, field, value) => {
    const updatedLineItems = [...form.lineItems];
    updatedLineItems[index][field] = value;
    if (field === "quantity" || field === "price") {
      const qty = Number(updatedLineItems[index].quantity) || 0;
      const price = Number(updatedLineItems[index].price) || 0;
      updatedLineItems[index].total = qty * price;
    }
    setForm({ ...form, lineItems: updatedLineItems });
  };
  
  const handleItemSelect = (index, selectedOption) => {
    const updatedLineItems = [...form.lineItems];
    updatedLineItems[index].itemId = selectedOption.value;
    updatedLineItems[index].name = selectedOption.name;
    setForm({ ...form, lineItems: updatedLineItems });
  };

  const addLineItem = () => {
    setForm({
      ...form,
      lineItems: [...form.lineItems, { itemId: "", name: "", quantity: 1, price: 0, total: 0 }]
    });
  };

  const removeLineItem = (index) => {
    const updatedLineItems = form.lineItems.filter((_, i) => i !== index);
    setForm({ ...form, lineItems: updatedLineItems });
  };
  
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    if (name === 'supplierContact') {
        const numericValue = value.replace(/[^0-9]/g, '');
        if (numericValue.length <= 10) {
            setForm({ ...form, [name]: numericValue });
        }
    } else {
        setForm({ ...form, [name]: value });
    }
  };

  useEffect(() => {
    const subtotal = form.lineItems.reduce((acc, item) => acc + item.total, 0);
    const tax = Number(form.tax) || 0;
    const shipping = Number(form.shipping) || 0;
    const total = subtotal + tax + shipping;
    setForm(prev => ({ ...prev, subtotal, total }));
  }, [form.lineItems, form.tax, form.shipping]);

  const handleSave = async () => {
    if (!form.supplierName || form.lineItems.some(item => !item.itemId || !item.quantity)) {
        return alert("Please fill in Supplier Name and ensure all line items are complete.");
    }
    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid;

    const poNumber = await getNextPONumber(uid);
    if (!poNumber) return;

    try {
        const addedBy = getCurrentInternal()?.username || "Admin";
        const poColRef = collection(db, uid, "purchase_orders", "po_list");
        const newOrderData = { ...form, poNumber, addedBy, createdAt: serverTimestamp() };
        await addDoc(poColRef, newOrderData);
        handleApplyFilters();
        setShowCreateModal(false);
        setForm({ poNumber: "", poDate: new Date().toISOString().split('T')[0], supplierName: "", supplierAddress: "", supplierContact: "", lineItems: [{ itemId: "", name: "", quantity: 1, price: 0, total: 0 }], subtotal: 0, tax: 0, shipping: 0, total: 0 });
    } catch(error) {
        alert("Error creating PO: " + error.message);
    }
  };

  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm("Are you sure you want to delete this PO?")) return;
    const user = auth.currentUser;
    if (!user) return;
    try {
        const orderDocRef = doc(db, user.uid, "purchase_orders", "po_list", orderId);
        await deleteDoc(orderDocRef);
        fetchOrders('initial');
    } catch(error) {
        alert("Error deleting PO: " + error.message);
    }
  };

  const searchedOrders = orders.filter(order =>
    search ?
    order.poNumber.toLowerCase().includes(search.toLowerCase()) ||
    order.supplierName.toLowerCase().includes(search.toLowerCase()) :
    true
  );

  return (
    <div style={styles.container}>
      <div className="non-printable">
        <div style={styles.headerContainer}>
            <h2 style={styles.header}>Purchase Orders</h2>
            <button style={styles.addButton} onClick={() => setShowCreateModal(true)}>
                <AiOutlinePlus /> Create New PO
            </button>
        </div>
        <div style={styles.controlsContainer}>
            <div style={styles.searchInputContainer}>
                <AiOutlineSearch style={styles.searchIcon} />
                <input type="text" placeholder="Search POs..." value={search} onChange={(e) => setSearch(e.target.value)} style={styles.searchInput} />
            </div>
            <div style={styles.dateFilters}>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={styles.dateInput} />
                <span>to</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={styles.dateInput} />
                <button style={styles.filterButton} onClick={handleApplyFilters}><AiOutlineFilter/> Apply</button>
            </div>
        </div>
        <div style={styles.tableContainer}>
            <table style={styles.table}>
            <thead><tr><th style={styles.th}>PO #</th><th style={styles.th}>Date</th><th style={styles.th}>Supplier</th><th style={styles.th}>Total</th><th style={styles.th}>Actions</th></tr></thead>
            <tbody>
                {searchedOrders.map(order => (
                <tr key={order.id}>
                    <td style={styles.td}>{order.poNumber}</td>
                    <td style={styles.td}>{order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : order.poDate}</td>
                    <td style={styles.td}>{order.supplierName}</td>
                    <td style={styles.td}>Rs. {Number(order.total).toFixed(2)}</td>
                    <td style={styles.td}>
                        <div style={{display: 'flex', gap: '10px'}}>
                            <button onClick={() => { setSelectedOrder(order); setShowViewModal(true); }} style={styles.actionButton}><AiOutlineEye /></button>
                            {isAdmin && <button onClick={() => handleDeleteOrder(order.id)} style={{...styles.actionButton, color: '#e74c3c'}}><AiOutlineDelete /></button>}
                        </div>
                    </td>
                </tr>
                ))}
            </tbody>
            </table>
        </div>
        <div style={styles.paginationControls}>
            <button onClick={handlePrevPage} disabled={page === 1}>Previous</button>
            <span>Page {page}</span>
            <button onClick={handleNextPage} disabled={isLastPage}>Next</button>
        </div>
      </div>

      {showCreateModal && (
        <div style={styles.modalOverlay}>
            <div style={{...styles.modal, maxWidth: '900px'}}>
                <div style={styles.modalHeader}><h3>Create Purchase Order</h3><button style={styles.closeButton} onClick={() => setShowCreateModal(false)}>&times;</button></div>
                <div style={styles.formGrid}>
                    <div style={styles.formGroup}><label>PO Date</label><input type="date" name="poDate" value={form.poDate} onChange={handleFormChange} style={styles.input}/></div>
                    <div style={styles.formGroup}><label>Supplier Name *</label><input name="supplierName" value={form.supplierName} onChange={handleFormChange} style={styles.input}/></div>
                    <div style={styles.formGroup}><label>Address</label><input name="supplierAddress" value={form.supplierAddress} onChange={handleFormChange} style={styles.input}/></div>
                    <div style={styles.formGroup}><label>Contact</label><input name="supplierContact" value={form.supplierContact} onChange={handleFormChange} style={styles.input}/></div>
                    <div style={styles.formGroupFull}>
                        <h4>Items</h4>
                        {form.lineItems.map((item, index) => (
                            <div key={index} style={styles.lineItem}>
                                <Select options={itemsForDropdown} onChange={opt => handleItemSelect(index, opt)} placeholder="Select Item" styles={{container: base => ({...base, flex: 3})}} />
                                <input type="number" placeholder="Qty" value={item.quantity} onChange={e => handleLineItemChange(index, 'quantity', e.target.value)} style={{...styles.input, flex: 1}}/>
                                <input type="number" placeholder="Price" value={item.price} onChange={e => handleLineItemChange(index, 'price', e.target.value)} style={{...styles.input, flex: 1}}/>
                                <button onClick={() => removeLineItem(index)} style={styles.deleteBtn}><AiOutlineDelete /></button>
                            </div>
                        ))}
                        <button onClick={addLineItem} style={styles.addLineBtn}>+ Add Item</button>
                    </div>
                </div>
                <div style={styles.modalButtons}>
                    <button style={styles.cancelButton} onClick={() => setShowCreateModal(false)}>Cancel</button>
                    <button style={styles.saveButton} onClick={handleSave}>Save PO</button>
                </div>
            </div>
        </div>
      )}

      {showViewModal && selectedOrder && (
         <div className="print-overlay" style={styles.modalOverlay}>
            <div className="printable-content" style={{...styles.modal, maxWidth: '800px'}}>
                <div className="non-printable" style={styles.modalHeader}>
                    <h3>Purchase Order Details</h3>
                    <button style={styles.closeButton} onClick={() => setShowViewModal(false)}>&times;</button>
                </div>

                <div ref={printComponentRef} style={{...styles.printView, overflowY: 'auto'}}>
                    <div style={styles.printHeader}>
                        {companyInfo?.companyLogo && <img src={companyInfo.companyLogo} alt="Logo" style={styles.printLogo} />}
                        <div>
                            <h2 style={{margin: 0}}>{companyInfo?.companyName || 'Your Company'}</h2>
                            <p style={{margin: 0}}>{companyInfo?.companyAddress}</p>
                            <p style={{margin: 0}}>{companyInfo?.phone}</p>
                        </div>
                    </div>
                    
                    <h2 style={{textAlign: 'center', textDecoration: 'underline', margin: '20px 0'}}>PURCHASE ORDER</h2>
                    
                    <div style={styles.poHeader}>
                        <div><strong>PO #:</strong> {selectedOrder.poNumber}</div>
                        <div><strong>Date:</strong> {selectedOrder.createdAt?.toDate ? selectedOrder.createdAt.toDate().toLocaleDateString() : selectedOrder.poDate}</div>
                    </div>

                    <div style={styles.poDetails}>
                        <div>
                            <strong>Supplier Details:</strong><br/>
                            {selectedOrder.supplierName}<br/>
                            {selectedOrder.supplierAddress}<br/>
                            {selectedOrder.supplierContact}
                        </div>
                    </div>

                    <table style={{...styles.table, marginTop: '20px', width: '100%'}}>
                        <thead><tr><th style={styles.th}>Item</th><th style={styles.th}>Qty</th><th style={styles.th}>Price</th><th style={styles.th}>Total</th></tr></thead>
                        <tbody>
                            {selectedOrder.lineItems.map((item, i) => (
                                <tr key={i}>
                                    <td style={styles.td}>{item.name}</td>
                                    <td style={styles.td}>{item.quantity}</td>
                                    <td style={styles.td}>Rs. {Number(item.price).toFixed(2)}</td>
                                    <td style={styles.td}>Rs. {Number(item.total).toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: '20px'}}>
                        <div style={{width: '100%', maxWidth: '200px'}}>
                            <div style={styles.totalRow}><span>Subtotal</span><span>Rs. {Number(selectedOrder.subtotal).toFixed(2)}</span></div>
                            <div style={styles.totalRow}><span>Tax</span><span>Rs. {Number(selectedOrder.tax).toFixed(2)}</span></div>
                            <div style={styles.totalRow}><span>Shipping</span><span>Rs. {Number(selectedOrder.shipping).toFixed(2)}</span></div>
                            <div style={{...styles.totalRow, fontWeight: 'bold', borderTop: '2px solid black', marginTop: '5px'}}>
                                <span>TOTAL</span><span>Rs. {Number(selectedOrder.total).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="non-printable" style={styles.modalButtons}>
                    <button style={styles.cancelButton} onClick={() => setShowViewModal(false)}>Close</button>
                    <button onClick={() => window.print()} style={{...styles.saveButton, backgroundColor: '#3498db'}}>Print PO</button>
                </div>
            </div>
         </div>
      )}
    </div>
  );
};

const styles = {
    container: { padding: '24px', fontFamily: "'Inter', sans-serif" },
    headerContainer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
    header: { fontSize: '28px', fontWeight: '700', color: '#2c3e50' },
    addButton: { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' },
    controlsContainer: { display: 'flex', gap: '16px', marginBottom: '20px', padding: '16px', backgroundColor: '#fff', borderRadius: '8px' },
    searchInputContainer: { flex: 1, position: 'relative' },
    searchIcon: { position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6c757d' },
    searchInput: { width: '100%', padding: '10px 10px 10px 40px', borderRadius: '6px', border: '1px solid #ddd' },
    dateFilters: { display: 'flex', alignItems: 'center', gap: '8px' },
    dateInput: { padding: '10px', borderRadius: '6px', border: '1px solid #ddd' },
    filterButton: { display: 'flex', alignItems: 'center', gap: '5px', padding: '10px 15px', backgroundColor: '#34495e', color: 'white', border: 'none', borderRadius: '6px' },
    tableContainer: { backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflowX: 'auto' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { padding: '12px', textAlign: 'left', backgroundColor: '#f8f9fa', color: '#495057', borderBottom: '2px solid #dee2e6' },
    td: { padding: '12px', borderBottom: '1px solid #eaeaea' },
    actionButton: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#3498db' },
    paginationControls: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginTop: '20px' },
    modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' },
    modal: { backgroundColor: 'white', borderRadius: '12px', width: '100%', maxHeight: '95vh', display: 'flex', flexDirection: 'column' },
    modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 24px', borderBottom: '1px solid #eaeaea' },
    closeButton: { background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer' },
    formGrid: { padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', overflowY: 'auto' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
    formGroupFull: { gridColumn: 'span 2' },
    input: { padding: '10px', borderRadius: '6px', border: '1px solid #ddd' },
    lineItem: { display: 'flex', gap: '10px', marginBottom: '10px' },
    deleteBtn: { backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '6px', padding: '10px' },
    addLineBtn: { padding: '8px 12px', background: 'white', border: '1px dashed #3498db', color: '#3498db', borderRadius: '6px', cursor: 'pointer' },
    totalRow: { display: 'flex', justifyContent: 'space-between', padding: '5px 0' },
    modalButtons: { display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '15px 24px', borderTop: '1px solid #eaeaea' },
    saveButton: { padding: '10px 20px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' },
    cancelButton: { padding: '10px 20px', backgroundColor: '#ecf0f1', border: 'none', borderRadius: '8px', cursor: 'pointer' },
    printView: { padding: '30px', fontFamily: 'serif' },
    printHeader: { display: 'flex', alignItems: 'center', gap: '20px', borderBottom: '2px solid #000', paddingBottom: '15px' },
    printLogo: { maxHeight: '60px' },
    poHeader: { display: 'flex', justifyContent: 'space-between', margin: '20px 0' },
    poDetails: { marginBottom: '20px' },
};

const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @media print {
    @page {
      size: A5;
      margin: 10mm;
    }
    body * {
      visibility: hidden;
    }
    .print-overlay, .print-overlay * {
      visibility: visible;
    }
    .print-overlay {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      background: white !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    .printable-content {
      width: 100% !important;
      max-width: none !important;
      box-shadow: none !important;
      border: none !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .non-printable {
      display: none !important;
    }
    /* Fixed right-side cutoff by shrinking container padding on A5 */
    div[style*="padding: 30px"] {
        padding: 5px !important;
    }
  }
`;
document.head.appendChild(styleSheet);

export default PurchasingOrder;