import React, { useEffect, useState, useRef } from "react";
import { db, auth } from "../../firebase";
import {
  collection,
  addDoc,
  query,
  getDocs,
  serverTimestamp,
  doc,
  runTransaction,
  deleteDoc // 💡 1. Import deleteDoc
} from "firebase/firestore";
import { AiOutlinePlus, AiOutlineSearch, AiOutlineFilter, AiOutlineEye, AiOutlineDelete } from "react-icons/ai";
import Select from "react-select";
import ReactToPrint from "react-to-print";

const PurchasingOrder = ({ internalUser }) => {
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [itemsForDropdown, setItemsForDropdown] = useState([]);
  
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

  // 💡 2. Add logic to determine if the current user is an admin
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
        const poColRef = collection(db, uid, "purchase_orders", "po_list");
        const poSnap = await getDocs(query(poColRef));
        const poData = poSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.poNumber?.localeCompare(a.poNumber, undefined, { numeric: true })) || 0);
        setOrders(poData);

        const itemsColRef = collection(db, uid, "items", "item_list");
        const itemsSnap = await getDocs(query(itemsColRef));
        const itemsData = itemsSnap.docs.map(d => ({
          value: d.id,
          label: `${d.data().name} (SKU: ${d.data().sku || 'N/A'})`,
          ...d.data()
        }));
        setItemsForDropdown(itemsData);

      } catch (error) {
        console.error("Error fetching data:", error);
        alert("Could not fetch data. Please try again.");
      }
      setLoading(false);
    };
    fetchData();
  }, []);

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
      alert("Could not generate a PO Number.");
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
    if (!user) return alert("You are not logged in.");
    const uid = user.uid;

    const poNumber = await getNextPONumber(uid);
    if (!poNumber) return;

    try {
        const addedBy = JSON.parse(localStorage.getItem("internalLoggedInUser"))?.username || "Admin";
        const poColRef = collection(db, uid, "purchase_orders", "po_list");
        const newOrderData = { ...form, poNumber, addedBy, createdAt: serverTimestamp() };

        const docRef = await addDoc(poColRef, newOrderData);
        setOrders(prev => [{ id: docRef.id, ...newOrderData, createdAt: new Date() }, ...prev]);

        setShowCreateModal(false);
        setForm({ poNumber: "", poDate: new Date().toISOString().split('T')[0], supplierName: "", supplierAddress: "", supplierContact: "", lineItems: [{ itemId: "", name: "", quantity: 1, price: 0, total: 0 }], subtotal: 0, tax: 0, shipping: 0, total: 0 });
    } catch(error) {
        alert("Error creating PO: " + error.message);
    }
  };

  // 💡 3. Add the new delete handler function
  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm("Are you sure you want to permanently delete this Purchase Order?")) return;
    
    const user = auth.currentUser;
    if (!user) return alert("You are not logged in.");

    try {
        const orderDocRef = doc(db, user.uid, "purchase_orders", "po_list", orderId);
        await deleteDoc(orderDocRef);
        setOrders(prev => prev.filter(order => order.id !== orderId)); // Update UI in real-time
        alert("Purchase Order deleted successfully.");
    } catch(error) {
        alert("Error deleting Purchase Order: " + error.message);
    }
  };


  useEffect(() => {
    let filtered = orders.filter(order => {
        const searchTermMatch = search ? 
            order.poNumber.toLowerCase().includes(search.toLowerCase()) || 
            order.supplierName.toLowerCase().includes(search.toLowerCase()) ||
            order.lineItems.some(item => item.name.toLowerCase().includes(search.toLowerCase()))
            : true;
        
        const poDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.poDate);
        const dateFromMatch = dateFrom ? poDate >= new Date(dateFrom + "T00:00:00") : true;
        const dateToMatch = dateTo ? poDate <= new Date(dateTo + "T23:59:59") : true;

        return searchTermMatch && dateFromMatch && dateToMatch;
    });
    setFilteredOrders(filtered);
  }, [search, dateFrom, dateTo, orders]);
  
  if (loading) return <p>Loading Purchase Orders...</p>;

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
            <div style={styles.searchInputContainer}><AiOutlineSearch style={styles.searchIcon} /><input type="text" placeholder="Search by PO#, Supplier, or Item..." value={search} onChange={(e) => setSearch(e.target.value)} style={styles.searchInput} /></div>
            <div style={styles.dateFilters}>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={styles.dateInput} />
            <span>to</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={styles.dateInput} />
            </div>
        </div>
        <div style={styles.tableContainer}>
            <table style={styles.table}>
            <thead><tr><th style={styles.th}>PO #</th><th style={styles.th}>Date</th><th style={styles.th}>Supplier</th><th style={styles.th}>Total Amount</th><th style={styles.th}>Actions</th></tr></thead>
            <tbody>
                {filteredOrders.map(order => (
                <tr key={order.id}>
                    <td style={styles.td}>{order.poNumber}</td>
                    <td style={styles.td}>{order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : new Date(order.poDate).toLocaleDateString()}</td>
                    <td style={styles.td}>{order.supplierName}</td>
                    <td style={styles.td}>Rs. {Number(order.total).toFixed(2)}</td>
                    <td style={styles.td}>
                        <div style={{display: 'flex', gap: '10px'}}>
                            <button onClick={() => { setSelectedOrder(order); setShowViewModal(true); }} style={styles.actionButton} title="View/Print PO"><AiOutlineEye /></button>
                            {/* 💡 4. Add the delete button, visible only to admins */}
                            {isAdmin && (
                                <button onClick={() => handleDeleteOrder(order.id)} style={{...styles.actionButton, color: '#e74c3c'}} title="Delete PO"><AiOutlineDelete /></button>
                            )}
                        </div>
                    </td>
                </tr>
                ))}
                {filteredOrders.length === 0 && <tr><td colSpan="5" style={styles.noData}>No purchase orders found.</td></tr>}
            </tbody>
            </table>
        </div>
      </div>

      {/* Create PO Modal */}
      {showCreateModal && (
        <div style={styles.modalOverlay}>
            <div style={{...styles.modal, maxWidth: '900px'}}>
                <div style={styles.modalHeader}><h3>Create Purchase Order</h3><button style={styles.closeButton} onClick={() => setShowCreateModal(false)}>&times;</button></div>
                <div style={styles.formGrid}>
                    <div style={styles.formGroup}><label>PO Date</label><input type="date" value={form.poDate} onChange={e => setForm({...form, poDate: e.target.value})} style={styles.input}/></div>
                    <div style={styles.formGroup}><label>Supplier Name *</label><input value={form.supplierName} onChange={e => setForm({...form, supplierName: e.target.value})} style={styles.input}/></div>
                    <div style={styles.formGroup}><label>Supplier Address</label><input value={form.supplierAddress} onChange={e => setForm({...form, supplierAddress: e.target.value})} style={styles.input}/></div>
                    <div style={styles.formGroup}><label>Supplier Contact</label><input value={form.supplierContact} onChange={e => setForm({...form, supplierContact: e.target.value})} style={styles.input}/></div>
                    <div style={styles.formGroupFull}>
                        <h4>Line Items</h4>
                        {form.lineItems.map((item, index) => (
                            <div key={index} style={styles.lineItem}>
                                <Select options={itemsForDropdown} onChange={opt => handleItemSelect(index, opt)} placeholder="Select an item..." styles={{container: base => ({...base, flex: 3})}} />
                                <input type="number" placeholder="Qty" value={item.quantity} onChange={e => handleLineItemChange(index, 'quantity', e.target.value)} style={{...styles.input, flex: 1}}/>
                                <input type="number" placeholder="Price" value={item.price} onChange={e => handleLineItemChange(index, 'price', e.target.value)} style={{...styles.input, flex: 1}}/>
                                <input type="text" placeholder="Total" value={Number(item.total).toFixed(2)} style={{...styles.input, flex: 1, backgroundColor: '#f4f4f4'}} readOnly/>
                                <button onClick={() => removeLineItem(index)} style={styles.deleteBtn}><AiOutlineDelete /></button>
                            </div>
                        ))}
                        <button onClick={addLineItem} style={styles.addLineBtn}>+ Add Another Item</button>
                    </div>
                    <div style={{...styles.formGroupFull, display: 'flex', justifyContent: 'flex-end'}}>
                        <div style={{width: '300px'}}>
                            <div style={styles.totalRow}><span>Subtotal</span><span>Rs. {form.subtotal.toFixed(2)}</span></div>
                            <div style={styles.totalRow}><label>Tax</label><input type="number" value={form.tax} onChange={e => setForm({...form, tax: e.target.value})} style={{...styles.input, width: '100px'}}/></div>
                            <div style={styles.totalRow}><label>Shipping</label><input type="number" value={form.shipping} onChange={e => setForm({...form, shipping: e.target.value})} style={{...styles.input, width: '100px'}}/></div>
                            <div style={{...styles.totalRow, fontWeight: 'bold', borderTop: '2px solid black', paddingTop: '10px'}}><span>TOTAL</span><span>Rs. {form.total.toFixed(2)}</span></div>
                        </div>
                    </div>
                </div>
                <div style={styles.modalButtons}><button style={styles.cancelButton} onClick={() => setShowCreateModal(false)}>Cancel</button><button style={styles.saveButton} onClick={handleSave}>Save Purchase Order</button></div>
            </div>
        </div>
      )}

      {/* View/Print PO Modal */}
      {showViewModal && selectedOrder && (
         <div className="print-overlay" style={styles.modalOverlay}>
            <div className="printable-content" style={{...styles.modal, maxWidth: '800px'}}>
                <div className="non-printable" style={styles.modalHeader}>
                    <h3>Purchase Order Details</h3>
                    <button style={styles.closeButton} onClick={() => setShowViewModal(false)}>&times;</button>
                </div>
                <div ref={printComponentRef} style={styles.printView}>
                    <h2>Purchase Order</h2>
                    <div style={styles.poHeader}>
                        <div><strong>PO #:</strong> {selectedOrder.poNumber}</div>
                        <div><strong>Date:</strong> {selectedOrder.createdAt?.toDate ? selectedOrder.createdAt.toDate().toLocaleDateString() : new Date(selectedOrder.poDate).toLocaleDateString()}</div>
                    </div>
                    <div style={styles.poDetails}>
                        <div>
                            <strong>Supplier:</strong><br/>
                            {selectedOrder.supplierName}<br/>
                            {selectedOrder.supplierAddress}<br/>
                            {selectedOrder.supplierContact}
                        </div>
                    </div>
                    <table style={{...styles.table, marginTop: '20px'}}>
                        <thead><tr><th style={styles.th}>Item</th><th style={styles.th}>Quantity</th><th style={styles.th}>Unit Price</th><th style={styles.th}>Total</th></tr></thead>
                        <tbody>
                            {selectedOrder.lineItems.map((item, i) => (
                                <tr key={i}><td style={styles.td}>{item.name}</td><td style={styles.td}>{item.quantity}</td><td style={styles.td}>Rs. {Number(item.price).toFixed(2)}</td><td style={styles.td}>Rs. {Number(item.total).toFixed(2)}</td></tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: '20px'}}>
                        <div style={{width: '250px'}}>
                            <div style={styles.totalRow}><span>Subtotal</span><span>Rs. {Number(selectedOrder.subtotal).toFixed(2)}</span></div>
                            <div style={styles.totalRow}><span>Tax</span><span>Rs. {Number(selectedOrder.tax).toFixed(2)}</span></div>
                            <div style={styles.totalRow}><span>Shipping</span><span>Rs. {Number(selectedOrder.shipping).toFixed(2)}</span></div>
                            <div style={{...styles.totalRow, fontWeight: 'bold', fontSize: '1.2em'}}><span>TOTAL</span><span>Rs. {Number(selectedOrder.total).toFixed(2)}</span></div>
                        </div>
                    </div>
                </div>
                <div className="non-printable" style={styles.modalButtons}>
                    <button onClick={() => window.print()} style={styles.saveButton}>Print PO</button>
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
    addButton: { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px' },
    controlsContainer: { display: 'flex', gap: '16px', marginBottom: '20px', padding: '16px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' },
    searchInputContainer: { flex: 1, position: 'relative' },
    searchIcon: { position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6c757d' },
    searchInput: { width: '100%', padding: '10px 10px 10px 40px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' },
    dateFilters: { display: 'flex', alignItems: 'center', gap: '8px' },
    dateInput: { padding: '10px', borderRadius: '6px', border: '1px solid #ddd' },
    tableContainer: { backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflowX: 'auto' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { padding: '12px', textAlign: 'left', backgroundColor: '#f8f9fa', fontWeight: '600', color: '#495057' },
    td: { padding: '12px', borderBottom: '1px solid #eaeaea' },
    noData: { padding: '40px', textAlign: 'center', color: '#6c757d' },
    actionButton: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#3498db' },
    modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '40px' },
    modal: { backgroundColor: 'white', borderRadius: '12px', width: '100%', maxHeight: '90vh', overflowY: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' },
    modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #eaeaea', flexShrink: 0 },
    closeButton: { background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#6c757d' },
    formGrid: { padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', overflowY: 'auto' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
    formGroupFull: { gridColumn: 'span 2' },
    input: { padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' },
    lineItem: { display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' },
    deleteBtn: { backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '6px', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    addLineBtn: { padding: '8px 12px', background: 'transparent', border: '1px dashed #3498db', color: '#3498db', borderRadius: '6px', cursor: 'pointer', width: 'fit-content' },
    totalRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', alignItems: 'center' },
    modalButtons: { display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px', borderTop: '1px solid #eaeaea', flexShrink: 0 },
    saveButton: { padding: '12px 24px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px' },
    cancelButton: { padding: '12px 24px', backgroundColor: '#ecf0f1', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px' },
    printView: { padding: '40px', fontFamily: 'serif' },
    poHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '30px' },
    poDetails: { display: 'flex', justifyContent: 'space-between', marginBottom: '20px' },
};

const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @media print {
    .non-printable {
      display: none !important;
    }
    .print-overlay {
      position: absolute !important;
      top: 0;
      left: 0;
      width: 100%;
      height: auto;
      padding: 0;
      margin: 0;
      background: white !important;
      overflow: visible !important;
    }
    .printable-content {
      box-shadow: none !important;
      border: none !important;
      max-height: none !important;
      overflow: visible !important;
    }
    body > *:not(.print-overlay) {
      display: none;
    }
  }
`;
document.head.appendChild(styleSheet);


export default PurchasingOrder;