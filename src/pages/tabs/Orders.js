
/* global qz */
import React, { useEffect, useState, useRef } from "react";
import { auth, db } from "../../firebase"; 
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  addDoc,
  orderBy,
  updateDoc,
  deleteDoc,
  runTransaction 
} from "firebase/firestore";
import Select from "react-select";
import { FaSave, FaTrash, FaCheckCircle, FaSearch, FaPlus, FaMoneyBillWave, FaEye } from 'react-icons/fa';

const Orders = ({ internalUser }) => {
  // Data State
  const [priceCategories, setPriceCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null); 
  const [items, setItems] = useState([]); 
  const [checkout, setCheckout] = useState([]);
  const [settings, setSettings] = useState(null);
  const [invoiceNumber, setInvoiceNumber] = useState("Loading...");

  // Order List State
  const [savedOrders, setSavedOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [showCompletedOrders, setShowCompletedOrders] = useState(false);

  // Payment & Modal State
  const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
  const [confirmPaymentMethod, setConfirmPaymentMethod] = useState('Cash');
  const [pendingAction, setPendingAction] = useState(null); 
  const paymentOptions = ['Cash', 'Card', 'Online'];

  // View Modal State
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Order Details
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [remarks, setRemarks] = useState(""); 
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [deliveryCharge, setDeliveryCharge] = useState(""); 

  // Processing State
  const [isSaving, setIsSaving] = useState(false);
  
  // Inputs
  const [itemInput, setItemInput] = useState("");
  const [qtyInput, setQtyInput] = useState(1);
  const [filteredItems, setFilteredItems] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [tempSelectedItem, setTempSelectedItem] = useState(null);
  
  const itemInputRef = useRef(null);
  const qtyInputRef = useRef(null);

  const uid = auth.currentUser ? auth.currentUser.uid : null;

  // 1. Initial Load & Fetch Saved Orders
  useEffect(() => {
    if(!uid) return;
    const initialize = async () => {
      fetchProvisionalInvoiceNumber();
      const settingsSnap = await getDoc(doc(db, uid, "settings"));
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        setSettings(data);
      }
      const catCol = collection(db, uid, "price_categories", "categories");
      const snap = await getDocs(catCol);
      setPriceCategories(snap.docs.map(d => ({ value: d.id, label: d.data().name })));
    };
    initialize();
    fetchSavedOrders();
  }, [uid]);

  const fetchSavedOrders = async () => {
      setLoadingOrders(true);
      const q = query(collection(db, uid, "data", "orders"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setSavedOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingOrders(false);
  };

  // 2. Fetch Items
  useEffect(() => {
    const fetchItems = async () => {
        setItems([]);
        if (!selectedCategory || !uid) return;
        const itemsRef = collection(db, uid, "price_categories", "priced_items");
        const q = query(itemsRef, where("categoryId", "==", selectedCategory.value));
        const snap = await getDocs(q);
        setItems(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    };
    fetchItems();
  }, [selectedCategory, uid]);

  // 3. Search Logic
  useEffect(() => {
    if (!itemInput.trim()) { 
        setFilteredItems([]); 
        setShowDropdown(false); 
        return; 
    }
    if (tempSelectedItem && itemInput === tempSelectedItem.itemName) { return; }

    const lower = itemInput.toLowerCase();
    const filtered = items.filter(i => i.itemName.toLowerCase().includes(lower) || (i.itemSKU && i.itemSKU.toLowerCase().includes(lower)));
    setFilteredItems(filtered);
    setShowDropdown(filtered.length > 0);
    setSelectedIndex(0);
  }, [itemInput, items, tempSelectedItem]);

  // 4. Keyboard Nav
  useEffect(() => {
    const handlePaymentConfirmKeyDown = (e) => {
        if (!showPaymentConfirm) return;
        const currentIndex = paymentOptions.indexOf(confirmPaymentMethod);
        
        if (e.key === 'ArrowRight') {
            setConfirmPaymentMethod(paymentOptions[(currentIndex + 1) % paymentOptions.length]);
        }
        if (e.key === 'ArrowLeft') {
            setConfirmPaymentMethod(paymentOptions[(currentIndex - 1 + paymentOptions.length) % paymentOptions.length]);
        }
        
        if (e.key === 'Enter') handleProcessPayment(confirmPaymentMethod);
        if (e.key === 'Escape') { setShowPaymentConfirm(false); setPendingAction(null); }
    };
    window.addEventListener('keydown', handlePaymentConfirmKeyDown);
    return () => window.removeEventListener('keydown', handlePaymentConfirmKeyDown);
  }, [showPaymentConfirm, confirmPaymentMethod]);

  const fetchProvisionalInvoiceNumber = async () => {
    if(!uid) return;
    const today = new Date();
    const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const counterDoc = await getDoc(doc(db, uid, "counters"));
    const dailyCounter = counterDoc.exists() ? counterDoc.data().invoiceCounters?.[datePrefix] || 0 : 0;
    setInvoiceNumber(`ORD-${datePrefix}-${String(dailyCounter + 1).padStart(4, "0")}`);
  };

  const handleItemKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(prev => (prev < filteredItems.length - 1 ? prev + 1 : prev)); } 
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0)); } 
    else if (e.key === 'Enter') { e.preventDefault(); if (filteredItems.length > 0 && selectedIndex >= 0) selectItemAndJumpToQty(filteredItems[selectedIndex]); }
  };
  const handleQtyKeyDown = (e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddItem(); } };
  const selectItemAndJumpToQty = (item) => { setItemInput(item.itemName); setTempSelectedItem(item); setShowDropdown(false); qtyInputRef.current.focus(); qtyInputRef.current.select(); };

  const handleAddItem = (overrideItem = null) => {
      const itemToAdd = overrideItem || tempSelectedItem || (filteredItems.length > 0 ? filteredItems[selectedIndex] : null);
      if (!itemToAdd || !qtyInput || qtyInput <= 0) return;
      const existingIdx = checkout.findIndex(i => i.itemId === itemToAdd.itemId);
      if (existingIdx > -1) {
          const newCheckout = [...checkout];
          newCheckout[existingIdx].quantity += Number(qtyInput);
          setCheckout(newCheckout);
      } else {
          setCheckout([...checkout, { ...itemToAdd, quantity: Number(qtyInput) }]);
      }
      setItemInput(""); setQtyInput(1); setTempSelectedItem(null); setShowDropdown(false); itemInputRef.current?.focus();
  };

  // Helper: Get Date in Sri Lanka Time
  const getSriLankaDate = (dateObj = new Date()) => {
    return dateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' }); // YYYY-MM-DD
  };

  const handleSaveClick = () => {
    if (!selectedCategory || checkout.length === 0) return alert("Category and Items are required.");
    setPendingAction({ type: 'SAVE' });
    setConfirmPaymentMethod('Cash');
    setShowPaymentConfirm(true);
  };
  const handleCompleteClick = (order) => { setPendingAction({ type: 'COMPLETE', order }); setConfirmPaymentMethod('Cash'); setShowPaymentConfirm(true); };
  
  // View Handler
  const handleViewOrder = (order) => {
      setSelectedOrder(order);
      setIsViewModalOpen(true);
  };

  const handleProcessPayment = (method) => {
      if (!pendingAction) return;
      setShowPaymentConfirm(false);
      if (pendingAction.type === 'SAVE') executeSaveOrder(method);
      else if (pendingAction.type === 'COMPLETE') executeCompleteOrder(pendingAction.order, method);
  };

  // --- SAVE ORDER (UPDATED: Adds Advance to Daily Sales & Payment Specific Field) ---
  const executeSaveOrder = async (paymentMethod) => {
    setIsSaving(true);
    try {
        await runTransaction(db, async (transaction) => {
            // PHASE 1: ALL READS
            const today = new Date();
            const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
            
            const counterRef = doc(db, uid, "counters");
            const counterDoc = await transaction.get(counterRef);
            const currentCount = counterDoc.exists() ? counterDoc.data().invoiceCounters?.[datePrefix] || 0 : 0;
            const newCount = currentCount + 1;
            
            // Wallet Reads
            let walletDocId = null;
            let salesMethodField = null;

            if (paymentMethod === 'Cash') { walletDocId = 'cash'; salesMethodField = 'totalSales_cash'; }
            else if (paymentMethod === 'Card') { walletDocId = 'card'; salesMethodField = 'totalSales_card'; }
            else if (paymentMethod === 'Online') { walletDocId = 'online'; salesMethodField = 'totalSales_online'; }
            
            const walletRef = walletDocId ? doc(db, uid, "wallet", "accounts", walletDocId) : null;
            let currentWalletBalance = 0;
            if (walletRef) {
                const wDoc = await transaction.get(walletRef);
                if (wDoc.exists()) {
                    currentWalletBalance = Number(wDoc.data().balance) || 0;
                }
            }
            
            // Daily Stats Read
            const dailyDateString = getSriLankaDate(); 
            const dailyStatsRef = doc(db, uid, "daily_stats", "entries", dailyDateString);
            const dailyStatsSnap = await transaction.get(dailyStatsRef);
            const currentDailySales = dailyStatsSnap.exists() ? (Number(dailyStatsSnap.data().totalSales) || 0) : 0;
            const currentMethodSales = dailyStatsSnap.exists() ? (Number(dailyStatsSnap.data()[salesMethodField]) || 0) : 0;

            // PHASE 2: CALCULATIONS & WRITES
            const newInvNum = `ORD-${datePrefix}-${String(newCount).padStart(4, "0")}`;
            const subtotal = checkout.reduce((sum, i) => sum + (i.price * i.quantity), 0);
            const dCharge = (settings?.offerDelivery && Number(deliveryCharge)) ? Number(deliveryCharge) : 0;
            const grandTotal = subtotal + dCharge;
            const advance = Number(advanceAmount) || 0;

            // Update Daily Stats (Add Advance to Total AND Specific Method)
            if (advance > 0) {
                 transaction.set(dailyStatsRef, { 
                    totalSales: currentDailySales + advance,
                    [salesMethodField]: currentMethodSales + advance,
                    date: dailyDateString,
                    lastUpdated: serverTimestamp()
                }, { merge: true });
            }

            const invRef = doc(collection(db, uid, "invoices", "invoice_list"));
            const orderRef = doc(collection(db, uid, "data", "orders"));

            const invoiceData = {
                invoiceNumber: newInvNum,
                customerId: "WALK-IN",
                customerName: customerName || "Walk-in Customer",
                customerTelephone: customerPhone,
                items: checkout,
                total: advance, 
                deliveryCharge: 0, 
                advanceAmount: 0, 
                received: advance, 
                createdAt: serverTimestamp(),
                issuedBy: internalUser?.username || "Admin",
                status: "Pending", 
                type: "ORDER",
                remarks: `[ADVANCE] Order Total Value: ${grandTotal.toFixed(2)}. ${remarks}`,
                relatedOrderId: orderRef.id,
                paymentMethod: paymentMethod 
            };

            const orderData = {
                orderNumber: newInvNum,
                customerName: customerName || "Walk-in",
                customerPhone,
                items: checkout,
                totalAmount: grandTotal, 
                deliveryCharge: dCharge,
                advanceAmount: advance,
                balance: grandTotal - advance,
                status: "Pending",
                createdAt: serverTimestamp(),
                linkedInvoiceId: invRef.id,
                deliveryDate,
                remarks
            };

            transaction.set(invRef, invoiceData);
            transaction.set(orderRef, orderData);
            transaction.set(counterRef, { invoiceCounters: { [datePrefix]: newCount } }, { merge: true });

            if (walletRef && advance > 0) {
                 transaction.set(walletRef, { 
                    balance: currentWalletBalance + advance,
                    lastUpdated: serverTimestamp() 
                }, { merge: true });
            }
        });

        resetForm();
        fetchSavedOrders();
    } catch (err) { alert("Error: " + err.message); } 
    finally { setIsSaving(false); setPendingAction(null); }
  };

  // --- COMPLETE ORDER (UPDATED: Adds Balance to Daily Sales & Payment Specific Field) ---
  const executeCompleteOrder = async (order, paymentMethod) => {
      setIsSaving(true);
      try {
          await runTransaction(db, async (transaction) => {
              // =========================================================
              // PHASE 1: ALL READS
              // =========================================================
              
              // 1. Read Wallet & Determine Field
              let walletDocId = null;
              let salesMethodField = null;

              if (paymentMethod === 'Cash') { walletDocId = 'cash'; salesMethodField = 'totalSales_cash'; }
              else if (paymentMethod === 'Card') { walletDocId = 'card'; salesMethodField = 'totalSales_card'; }
              else if (paymentMethod === 'Online') { walletDocId = 'online'; salesMethodField = 'totalSales_online'; }
              
              const walletRef = walletDocId ? doc(db, uid, "wallet", "accounts", walletDocId) : null;
              
              let currentWalletBalance = 0;
              if (walletRef) {
                  const wDoc = await transaction.get(walletRef);
                  if (wDoc.exists()) {
                      currentWalletBalance = Number(wDoc.data().balance) || 0;
                  }
              }

              // 2. Read Daily Stats
              const dailyDateString = getSriLankaDate(); 
              const dailyStatsRef = doc(db, uid, "daily_stats", "entries", dailyDateString);
              const dailyStatsSnap = await transaction.get(dailyStatsRef);
              const currentDailySales = dailyStatsSnap.exists() ? (Number(dailyStatsSnap.data().totalSales) || 0) : 0;
              const currentMethodSales = dailyStatsSnap.exists() ? (Number(dailyStatsSnap.data()[salesMethodField]) || 0) : 0;

              // =========================================================
              // PHASE 2: ALL WRITES
              // =========================================================

              const orderDocRef = doc(db, uid, "data", "orders", order.id);
              transaction.update(orderDocRef, { status: "Completed" });

              if(order.linkedInvoiceId) {
                 const invRef = doc(db, uid, "invoices", "invoice_list", order.linkedInvoiceId);
                 transaction.update(invRef, { status: "Paid", received: order.advanceAmount });
              }

              if (order.balance > 0) {
                  // Add balance to daily stats (Aggregate & Specific)
                  transaction.set(dailyStatsRef, { 
                    totalSales: currentDailySales + order.balance,
                    [salesMethodField]: currentMethodSales + order.balance,
                    date: dailyDateString,
                    lastUpdated: serverTimestamp()
                }, { merge: true });

                  const balInvoiceRef = doc(collection(db, uid, "invoices", "invoice_list"));
                  const balInvoiceData = {
                      invoiceNumber: `${order.orderNumber}_BAL`,
                      customerName: order.customerName,
                      items: [{ itemName: "Balance Payment", quantity: 1, price: order.balance }],
                      total: order.balance,
                      received: order.balance, 
                      status: "Paid",
                      type: "ORDER",
                      relatedOrderId: order.id,
                      createdAt: serverTimestamp(),
                      issuedBy: internalUser?.username || "System",
                      paymentMethod: paymentMethod 
                  };
                  transaction.set(balInvoiceRef, balInvoiceData);

                  if (walletRef) {
                      transaction.set(walletRef, { 
                        balance: currentWalletBalance + order.balance,
                        lastUpdated: serverTimestamp() 
                    }, { merge: true });
                  }
              }
          });

          fetchSavedOrders();
      } catch (err) { alert("Error completing: " + err.message); }
      finally { setIsSaving(false); setPendingAction(null); }
  };

  // --- DELETE ORDER (UPDATED: DEDUCT FROM WALLET & DAILY SALES SPECIFIC FIELDS) ---
  const handleDeleteOrder = async (orderId, linkedInvoiceId) => {
      if(!window.confirm("Delete this order and linked invoices? This will deduct amounts from wallet.")) return;
      
      try {
          await runTransaction(db, async (transaction) => {
              // 1. Get Order Data
              const orderRef = doc(db, uid, "data", "orders", orderId);
              const orderSnap = await transaction.get(orderRef);
              if (!orderSnap.exists()) throw "Order not found";
              const orderData = orderSnap.data();

              // 2. Find Linked Advance Invoice
              let advInvoiceRef = null;
              let advInvoiceData = null;
              if (linkedInvoiceId) {
                  advInvoiceRef = doc(db, uid, "invoices", "invoice_list", linkedInvoiceId);
                  const advSnap = await transaction.get(advInvoiceRef);
                  if (advSnap.exists()) advInvoiceData = advSnap.data();
              }

              // 3. Find Potential Balance Invoice
              let balInvoiceRef = null;
              let balInvoiceData = null;
              if (orderData.orderNumber) {
                  const balInvNum = `${orderData.orderNumber}_BAL`;
                  const q = query(collection(db, uid, "invoices", "invoice_list"), where("invoiceNumber", "==", balInvNum));
                  const balSnaps = await getDocs(q); 
                  if (!balSnaps.empty) {
                      balInvoiceRef = balSnaps.docs[0].ref;
                      const balSnap = await transaction.get(balInvoiceRef);
                      if (balSnap.exists()) balInvoiceData = balSnap.data();
                  }
              }

              // 4. Helper to Collect Reversal Operations
              const ops = []; // { type: 'wallet'|'stats', ref: ..., amount: ..., field: ... }

              const prepareReversal = async (invoice) => {
                  if (!invoice || !invoice.received || invoice.received <= 0) return;

                  let wId = null;
                  let salesMethodField = null;

                  if (invoice.paymentMethod === 'Cash') { wId = 'cash'; salesMethodField = 'totalSales_cash'; }
                  else if (invoice.paymentMethod === 'Card') { wId = 'card'; salesMethodField = 'totalSales_card'; }
                  else if (invoice.paymentMethod === 'Online') { wId = 'online'; salesMethodField = 'totalSales_online'; }

                  // Wallet Read
                  if (wId) {
                      const wRef = doc(db, uid, "wallet", "accounts", wId);
                      const wDoc = await transaction.get(wRef); // READ
                      if (wDoc.exists()) {
                           ops.push({ type: 'wallet', ref: wRef, currentVal: Number(wDoc.data().balance) || 0, deduct: Number(invoice.received) });
                      }
                  }

                  // Daily Stats Read
                  if (invoice.createdAt) {
                      const dateVal = invoice.createdAt.toDate ? invoice.createdAt.toDate() : new Date(invoice.createdAt);
                      const dailyDateString = getSriLankaDate(dateVal);
                      const dailyStatsRef = doc(db, uid, "daily_stats", "entries", dailyDateString);
                      const dailyStatsSnap = await transaction.get(dailyStatsRef); // READ
                      if (dailyStatsSnap.exists()) {
                          const data = dailyStatsSnap.data();
                          const currentTotal = Number(data.totalSales) || 0;
                          const currentMethod = salesMethodField ? (Number(data[salesMethodField]) || 0) : 0;
                          
                          ops.push({ 
                              type: 'stats', 
                              ref: dailyStatsRef, 
                              currentTotal: currentTotal,
                              currentMethod: currentMethod,
                              methodField: salesMethodField,
                              deduct: Number(invoice.received) 
                          });
                      }
                  }
              };

              // EXECUTE READS
              if (advInvoiceData) await prepareReversal(advInvoiceData);
              if (balInvoiceData) await prepareReversal(balInvoiceData);

              // EXECUTE WRITES
              ops.forEach(op => {
                  if (op.type === 'wallet') {
                      transaction.set(op.ref, { balance: op.currentVal - op.deduct, lastUpdated: serverTimestamp() }, { merge: true });
                  } else if (op.type === 'stats') {
                      const updateData = {
                          totalSales: op.currentTotal - op.deduct,
                          lastUpdated: serverTimestamp()
                      };
                      if(op.methodField) {
                          updateData[op.methodField] = op.currentMethod - op.deduct;
                      }
                      transaction.set(op.ref, updateData, { merge: true });
                  }
              });

              // Delete Documents
              transaction.delete(orderRef);
              if (advInvoiceRef) transaction.delete(advInvoiceRef);
              if (balInvoiceRef) transaction.delete(balInvoiceRef);
          });

          fetchSavedOrders();
      } catch(e) { 
          console.error(e);
          alert("Error deleting: " + e.message); 
      }
  };

  const resetForm = () => {
    setCheckout([]); setCustomerName(""); setCustomerPhone(""); setDeliveryDate(""); setRemarks(""); 
    setAdvanceAmount(""); setDeliveryCharge(""); 
    setItemInput(""); fetchProvisionalInvoiceNumber();
  };

  // Calculations & Helpers
  const subtotal = checkout.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const dCharge = (settings?.offerDelivery && Number(deliveryCharge)) ? Number(deliveryCharge) : 0;
  const grandTotal = subtotal + dCharge;
  const balance = grandTotal - (Number(advanceAmount) || 0);

  const filteredOrders = savedOrders.filter(o => showCompletedOrders || o.status !== 'Completed');

  const formatDate = (date) => { 
      if (!date) return 'N/A'; 
      try { 
          const d = date.toDate ? date.toDate() : new Date(date);
          return d.toLocaleString(); 
      } catch{ return 'Invalid'; }
  };

  return (
    <div style={styles.container}>
      <div style={styles.headerContainer}><h1 style={styles.header}>Orders Management</h1></div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
            <div style={{flex: 1}}>
                <h2 style={styles.sectionTitle}>New Order</h2>
                <div style={styles.invoiceBadge}>{invoiceNumber}</div>
            </div>
            <div style={{width: 300}}>
                 <label style={styles.label}>Price Category *</label>
                 <Select options={priceCategories} value={selectedCategory} onChange={setSelectedCategory} placeholder="Select Category..." styles={customSelectStyles} />
            </div>
        </div>

        <div style={styles.formContent}>
            <div style={styles.gridThree}>
                <div style={styles.inputGroup}>
                    <label style={styles.label}>Customer Name</label>
                    <input style={styles.input} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Walk-in Customer" />
                </div>
                <div style={styles.inputGroup}>
                    <label style={styles.label}>Phone Number</label>
                    <input type="text" style={styles.input} value={customerPhone} onChange={(e) => { const val = e.target.value.replace(/\D/g, ''); if (val.length <= 10) setCustomerPhone(val); }} placeholder="07xxxxxxxx" />
                </div>
                <div style={styles.inputGroup}>
                    <label style={styles.label}>Delivery Date</label>
                    <input type="datetime-local" style={styles.input} value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
                </div>
            </div>
            <div style={{marginTop: 15}}>
                <label style={styles.label}>Remarks / Instructions</label>
                <input style={styles.input} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Any special instructions..." />
            </div>
            <hr style={styles.divider} />
            <div style={styles.itemEntryRow}>
                <div style={{ flex: 3, position: 'relative' }}>
                    <label style={styles.label}>Search Item to Add</label>
                    <div style={styles.searchWrapper}>
                        <FaSearch style={styles.searchIcon} />
                        <input ref={itemInputRef} style={styles.searchInput} value={itemInput} onChange={e => setItemInput(e.target.value)} onKeyDown={handleItemKeyDown} placeholder="Type item name... (Arrow Keys + Enter)" />
                    </div>
                    {showDropdown && (
                        <ul style={styles.dropdown}>
                            {filteredItems.map((item, idx) => ( <li key={item.id} style={{...styles.ddItem, backgroundColor: idx === selectedIndex ? '#eff6ff' : 'white'}} onClick={() => selectItemAndJumpToQty(item)}><span>{item.itemName}</span><span style={{fontWeight:'bold'}}>Rs. {item.price}</span></li> ))}
                        </ul>
                    )}
                </div>
                <div style={{ flex: 1 }}>
                    <label style={styles.label}>Qty</label>
                    <input ref={qtyInputRef} type="number" style={styles.input} value={qtyInput} onChange={e => setQtyInput(e.target.value)} onKeyDown={handleQtyKeyDown} />
                </div>
                <div style={{ alignSelf: 'flex-end' }}>
                    <button style={styles.btnAdd} onClick={() => handleAddItem()}><FaPlus /> Add</button>
                </div>
            </div>
            <div style={styles.tableWrapper}>
                <table style={styles.table}>
                    <thead><tr><th style={styles.th}>Item</th><th style={styles.th}>Qty</th><th style={styles.th}>Price</th><th style={styles.th}>Total</th><th style={styles.thAction}></th></tr></thead>
                    <tbody>
                        {checkout.length === 0 ? (<tr><td colSpan="5" style={styles.emptyTd}>No items added yet.</td></tr>) : (checkout.map((item, idx) => ( <tr key={idx}><td style={styles.td}>{item.itemName}</td><td style={styles.td}>{item.quantity}</td><td style={styles.td}>{item.price.toFixed(2)}</td><td style={styles.td}>{(item.price * item.quantity).toFixed(2)}</td><td style={styles.tdAction}><button style={styles.btnIconDanger} onClick={()=>setCheckout(checkout.filter((_,i)=>i!==idx))}><FaTrash /></button></td></tr> )))}
                    </tbody>
                </table>
            </div>
            <div style={styles.footerPanel}>
                 <div style={styles.financialRow}>
                    <div style={{display:'flex', flexDirection:'column', gap: 10}}>
                        {settings?.offerDelivery && (
                            <div style={{width: 200}}>
                                <label style={styles.label}>Delivery Charge (Rs.)</label>
                                <input type="number" style={styles.inputBig} value={deliveryCharge} onChange={e=>setDeliveryCharge(e.target.value)} placeholder="0.00" />
                            </div>
                        )}
                        <div style={{width: 200}}>
                            <label style={styles.label}>Advance Paid (Rs.)</label>
                            <input type="number" style={styles.inputBig} value={advanceAmount} onChange={e=>setAdvanceAmount(e.target.value)} placeholder="0.00" />
                        </div>
                    </div>
                    <div style={styles.totalsBlock}>
                        <div style={styles.totalRow}><span>Subtotal:</span> <strong>Rs. {subtotal.toFixed(2)}</strong></div>
                        {dCharge > 0 && <div style={styles.totalRow}><span>Delivery:</span> <strong>Rs. {dCharge.toFixed(2)}</strong></div>}
                        <div style={{...styles.totalRow, fontSize: 16, color: '#000'}}><span>Grand Total:</span> <strong>Rs. {grandTotal.toFixed(2)}</strong></div>
                        <div style={styles.balanceRow}><span>Balance Due:</span> <strong>Rs. {balance.toFixed(2)}</strong></div>
                    </div>
                 </div>
                 <button onClick={handleSaveClick} disabled={isSaving || checkout.length === 0} style={isSaving ? styles.btnDisabled : styles.btnPrimary}>
                     <FaSave style={{marginRight: 8}}/> {isSaving ? 'Saving...' : 'Save Order'}
                 </button>
            </div>
        </div>
      </div>

      <div style={{...styles.card, marginTop: 20}}>
          <div style={styles.listHeader}>
              <h2 style={styles.sectionTitle}>Order History</h2>
              <label style={styles.checkboxLabel}><input type="checkbox" checked={showCompletedOrders} onChange={e=>setShowCompletedOrders(e.target.checked)}/> Show Completed</label>
          </div>
          <div style={styles.ordersGrid}>
              {loadingOrders ? <p style={{padding: 20, color: '#6b7280'}}>Loading orders...</p> : filteredOrders.length === 0 ? <p style={{padding: 20, color: '#6b7280'}}>No active orders found.</p> : filteredOrders.map(order => (
                  <div key={order.id} style={styles.orderCard}>
                      <div style={styles.orderCardTop}>
                          <div><span style={styles.orderName}>{order.customerName}</span><span style={styles.orderNum}>{order.orderNumber}</span></div>
                          <span style={order.status==='Pending' ? styles.statusPending : styles.statusCompleted}>{order.status}</span>
                      </div>
                      <div style={styles.orderMeta}>
                          <div style={styles.metaRow}><span>Total:</span> <strong>{order.totalAmount?.toFixed(2)}</strong></div>
                          {order.deliveryCharge > 0 && <div style={styles.metaRow}><span>Delivery:</span> {order.deliveryCharge?.toFixed(2)}</div>}
                          <div style={styles.metaRow}><span>Advance:</span> {order.advanceAmount?.toFixed(2)}</div>
                          <div style={{...styles.metaRow, color: order.balance > 0 ? '#ef4444' : '#10b981'}}><span>Balance:</span> <strong>{order.balance?.toFixed(2)}</strong></div>
                      </div>
                      <div style={styles.orderActions}>
                          {order.status === 'Pending' && (<button style={styles.actionBtnSuccess} onClick={() => handleCompleteClick(order)} title="Complete & Pay"><FaCheckCircle /> Pay Balance</button>)}
                          <button style={styles.actionBtnPrimary} onClick={() => handleViewOrder(order)} title="View Details"><FaEye /></button>
                          <button style={styles.actionBtnDanger} onClick={() => handleDeleteOrder(order.id, order.linkedInvoiceId)} title="Delete"><FaTrash /></button>
                      </div>
                  </div>
              ))}
          </div>
      </div>

      {/* --- PAYMENT MODAL --- */}
      {showPaymentConfirm && (
        <div style={styles.confirmOverlay}>
          <div style={styles.confirmPopup}>
            <h4>Confirm Payment</h4>
            <p style={{margin: '0 0 20px 0', color: '#6b7280', fontSize: '14px'}}>
                {pendingAction?.type === 'COMPLETE' ? `Collecting Balance: Rs. ${pendingAction.order.balance.toFixed(2)}` : `Advance: Rs. ${(parseFloat(advanceAmount)||0).toFixed(2)}`}
            </p>
            <p style={{fontSize: '12px', color: '#9ca3af', marginBottom: '15px'}}>Use ← → arrow keys and press Enter to confirm.</p>
            <div style={styles.confirmButtons}>
                {paymentOptions.map(method => (
                    <button 
                        key={method}
                        onClick={() => handleProcessPayment(method)} 
                        style={confirmPaymentMethod === method ? styles.confirmButtonActive : styles.confirmButton}
                    >
                        {method === 'Online' ? 'Online' : method}
                    </button>
                ))}
            </div>
            <button onClick={() => setShowPaymentConfirm(false)} style={{marginTop: '20px', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', color: '#6b7280', fontSize: '12px'}}>Cancel</button>
          </div>
        </div>
      )}

      {/* --- VIEW MODAL --- */}
      {isViewModalOpen && selectedOrder && (
        <div style={styles.modalOverlay} onClick={() => setIsViewModalOpen(false)}>
            <div style={styles.modalContentWide} onClick={e => e.stopPropagation()}>
                <div style={styles.modalHeader}>
                    <h3 style={styles.modalTitle}>Order Details</h3>
                    <button onClick={() => setIsViewModalOpen(false)} style={styles.closeIcon}>&times;</button>
                </div>
                <div style={styles.modalBody}>
                    <div style={styles.detailGrid}>
                        <div style={styles.detailItem}><label>Customer:</label> <span>{selectedOrder.customerName}</span></div>
                        <div style={styles.detailItem}><label>Phone:</label> <span>{selectedOrder.customerPhone || 'N/A'}</span></div>
                        <div style={styles.detailItem}><label>Order #:</label> <span>{selectedOrder.orderNumber}</span></div>
                        <div style={styles.detailItem}><label>Status:</label> <span style={{fontWeight: 'bold', color: selectedOrder.status === 'Pending' ? '#f59e0b' : '#10b981'}}>{selectedOrder.status}</span></div>
                        <div style={styles.detailItem}><label>Date:</label> <span>{formatDate(selectedOrder.createdAt)}</span></div>
                        <div style={styles.detailItem}><label>Delivery:</label> <span>{formatDate(selectedOrder.deliveryDate)}</span></div>
                    </div>

                    <div style={styles.notesBox}>
                        <label>Remarks:</label>
                        <p>{selectedOrder.remarks || "No remarks."}</p>
                    </div>

                    <div style={{maxHeight: '200px', overflowY: 'auto', border: '1px solid #e5e7eb', marginBottom: '20px'}}>
                        <table style={styles.itemsTable}>
                            <thead>
                                <tr>
                                    <th style={{...styles.th, background:'#f9fafb'}}>Item</th>
                                    <th style={{...styles.th, background:'#f9fafb'}}>Qty</th>
                                    <th style={{...styles.th, background:'#f9fafb'}}>Rate</th>
                                    <th style={{...styles.th, background:'#f9fafb'}}>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedOrder.items && selectedOrder.items.map((item, idx) => (
                                    <tr key={idx}>
                                        <td style={styles.td}>{item.itemName}</td>
                                        <td style={styles.td}>{item.quantity}</td>
                                        <td style={styles.td}>{item.price.toFixed(2)}</td>
                                        <td style={styles.td}>{(item.price * item.quantity).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div style={styles.financialBox}>
                        <div>Total: <strong>Rs. {selectedOrder.totalAmount?.toFixed(2)}</strong></div>
                        {selectedOrder.deliveryCharge > 0 && <div>Delivery: <strong>Rs. {selectedOrder.deliveryCharge?.toFixed(2)}</strong></div>}
                        <div>Advance: <strong>Rs. {selectedOrder.advanceAmount?.toFixed(2)}</strong></div>
                        <div style={{color: selectedOrder.balance > 0 ? '#ef4444' : '#10b981'}}>
                            Balance: <strong>Rs. {selectedOrder.balance?.toFixed(2)}</strong>
                        </div>
                    </div>
                    
                    <div style={styles.modalActionsRow}>
                        <button style={styles.btnSecondary} onClick={()=> window.open(`/invoice/view/${selectedOrder.linkedInvoiceId}`, '_blank')}>
                            Print Receipt
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

const styles = {
  container: { padding: '20px', fontFamily: "'Inter', sans-serif", background: '#f3f4f6', minHeight: '100vh' },
  headerContainer: { marginBottom: '20px' },
  header: { fontSize: '24px', fontWeight: '600', color: '#1f2937' },
  card: { backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' },
  cardHeader: { padding: '16px 20px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { margin: 0, fontSize: '16px', fontWeight: '600', color: '#374151' },
  invoiceBadge: { display: 'inline-block', background: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', marginTop: 5 },
  formContent: { padding: '20px' },
  gridThree: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
  label: { fontSize: '12px', fontWeight: 'bold', color: '#374151', textTransform: 'uppercase' },
  input: { padding: '8px 12px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '14px', outline: 'none', transition: 'border 0.2s', width: '100%', boxSizing: 'border-box' },
  inputBig: { padding: '10px 12px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '16px', fontWeight: '600', width: '100%', boxSizing: 'border-box' },
  divider: { margin: '24px 0', borderTop: '1px solid #e5e7eb' },
  itemEntryRow: { display: 'flex', gap: '15px', alignItems: 'flex-start' },
  searchWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
  searchIcon: { position: 'absolute', left: '12px', color: '#9ca3af' },
  searchInput: { padding: '8px 12px 8px 36px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '14px', width: '100%', boxSizing: 'border-box' },
  btnAdd: { padding: '8px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', height: '36px' },
  dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e5e7eb', borderRadius: '4px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', zIndex: 10, maxHeight: '200px', overflowY: 'auto', margin: '4px 0 0 0', padding: 0, listStyle: 'none' },
  ddItem: { padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#374151' },
  tableWrapper: { marginTop: '20px', border: '1px solid #e5e7eb', borderRadius: '4px', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '12px 16px', background: '#f9fafb', fontSize: '12px', color: '#4b5563', textTransform: 'uppercase', fontWeight: '600', borderBottom: '1px solid #e5e7eb' },
  thAction: { width: '50px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '12px 16px', borderBottom: '1px solid #e5e7eb', fontSize: '14px', color: '#1f2937' },
  tdAction: { padding: '12px 16px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' },
  emptyTd: { padding: '20px', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' },
  btnIconDanger: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', padding: '4px' },
  footerPanel: { marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e5e7eb' },
  financialRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
  totalsBlock: { textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '8px' },
  totalRow: { fontSize: '14px', color: '#4b5563', display: 'flex', justifyContent: 'flex-end', gap: '20px' },
  balanceRow: { fontSize: '18px', color: '#ef4444', display: 'flex', justifyContent: 'flex-end', gap: '20px' },
  btnPrimary: { width: '100%', padding: '12px', background: '#00A1FF', color: 'white', border: 'none', borderRadius: '4px', fontWeight: '600', fontSize: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', transition: 'background 0.2s' },
  btnDisabled: { width: '100%', padding: '12px', background: '#9ca3af', color: 'white', border: 'none', borderRadius: '4px', cursor: 'not-allowed' },
  listHeader: { padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  checkboxLabel: { fontSize: '13px', color: '#4b5563', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', textTransform: 'uppercase', fontWeight: '600' },
  ordersGrid: { padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' },
  orderCard: { background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' },
  orderCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderName: { display: 'block', fontWeight: '700', color: '#1f2937', fontSize: '15px' },
  orderNum: { fontSize: '12px', color: '#6b7280' },
  statusPending: { fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '12px', background: '#fff7ed', color: '#c2410c' },
  statusCompleted: { fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '12px', background: '#ecfdf5', color: '#047857' },
  orderMeta: { fontSize: '13px', color: '#4b5563', display: 'flex', flexDirection: 'column', gap: '4px' },
  metaRow: { display: 'flex', justifyContent: 'space-between' },
  orderActions: { display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #e5e7eb' },
  actionBtnSuccess: { flex: 1, padding: '6px', background: '#ecfdf5', color: '#10b981', border: '1px solid #a7f3d0', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', fontWeight: '600', fontSize: '13px' },
  actionBtnPrimary: { flex: 1, padding: '6px', background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'center', fontSize: '13px' },
  actionBtnDanger: { padding: '6px 10px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'center' },
  confirmOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 },
  confirmPopup: { backgroundColor: 'white', padding: '24px', borderRadius: '8px', textAlign: 'center', boxShadow: '0 10px 15px rgba(0,0,0,0.1)', width: 'auto', minWidth: '400px' },
  confirmButtons: { display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '20px' },
  confirmButton: { padding: '10px 24px', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', background: '#f9fafb', fontWeight: '600', flex: 1, color: '#374151' },
  confirmButtonActive: { padding: '10px 24px', border: '1px solid #3b82f6', borderRadius: '4px', cursor: 'pointer', background: '#3b82f6', color: 'white', fontWeight: '600', flex: 1 },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000, backdropFilter: 'blur(1px)' },
  modalContentWide: { background: 'white', borderRadius: '8px', width: '90%', maxWidth: '700px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', animation: 'fadeIn 0.2s ease', overflow: 'hidden' },
  modalHeader: { padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { margin: 0, fontSize: '18px', fontWeight: '600', color: '#1f2937' },
  modalBody: { padding: '20px' },
  closeIcon: { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9ca3af' },
  detailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', marginBottom: '20px' },
  detailItem: { display: 'flex', flexDirection: 'column', fontSize: '14px' },
  notesBox: { background: '#f9fafb', padding: '12px', borderRadius: '4px', marginBottom: '20px', fontSize: '14px', border: '1px solid #e5e7eb' },
  financialBox: { background: '#f0f9ff', padding: '16px', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', fontSize: '15px' },
  modalActionsRow: { display: 'flex', justifyContent: 'flex-end', gap: '10px' },
  btnSecondary: { padding: '8px 16px', background: 'white', border: '1px solid #d1d5db', color: '#374151', borderRadius: '4px', fontWeight: '600', cursor: 'pointer' },
  itemsTable: { width: '100%', borderCollapse: 'collapse' },
};

const customSelectStyles = {
  control: (provided) => ({
    ...provided,
    borderColor: '#d1d5db',
    borderRadius: '4px',
    padding: '2px',
    boxShadow: 'none',
    '&:hover': { borderColor: '#9ca3af' }
  }),
  option: (provided, state) => ({
    ...provided,
    backgroundColor: state.isSelected ? '#00A1FF' : state.isFocused ? '#e0f2fe' : 'white',
    color: state.isSelected ? 'white' : '#374151',
    cursor: 'pointer'
  })
};

export default Orders;
