import React, { useEffect, useState, useRef } from "react";
import { auth, db } from "../firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  serverTimestamp,
  runTransaction
} from "firebase/firestore";
import Select from "react-select";

const PrintableLayout = ({ invoice, companyInfo, onImageLoad }) => {
    if (!invoice || !Array.isArray(invoice.items)) return null;
    const subtotal = invoice.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    // ✅ **FIX: Add delivery charges to subtotal for balance calculation if they exist**
    const totalBeforeReceived = subtotal + (invoice.deliveryCharge || 0);
    const balanceToDisplay = invoice.received === 0 ? 0 : invoice.received - totalBeforeReceived;
    const createdAtDate = invoice.createdAt instanceof Date ? invoice.createdAt : invoice.createdAt?.toDate();
  
    return (
      <div style={printStyles.invoiceBox}>
        <div className="invoice-header-section">
          <div className="company-details">
            {companyInfo?.companyLogo && (
              <img src={companyInfo.companyLogo} style={printStyles.logo} alt="Company Logo" onLoad={onImageLoad} onError={onImageLoad} />
            )}
            <h1 style={printStyles.companyNameText}>{companyInfo?.companyName || "Your Company"}</h1>
            <p style={printStyles.headerText}>{companyInfo?.companyAddress || "123 Main St, City"}</p>
            {companyInfo?.phone && <p style={printStyles.headerText}>{companyInfo.phone}</p>}
          </div>
          <div className="invoice-meta-details">
            <p><strong>Invoice #:</strong> {invoice.invoiceNumber}</p>
            <p><strong>Date:</strong> {createdAtDate?.toLocaleDateString()}</p>
            <p><strong>Customer:</strong> {invoice.customerName}</p>
            <p><strong>Issued By:</strong> {invoice.issuedBy}</p>
          </div>
        </div>
        <table style={printStyles.itemsTable}>
          <thead><tr><th style={{ ...printStyles.th, ...printStyles.thItem }}>Item</th><th style={printStyles.th}>Qty</th><th style={printStyles.th}>Rate</th><th style={printStyles.th}>Total</th></tr></thead>
          <tbody>
            {invoice.items.map((item, index) => (
              <tr key={index}><td style={printStyles.td}>{item.itemName}</td><td style={{ ...printStyles.td, ...printStyles.tdCenter }}>{item.quantity}</td><td style={{ ...printStyles.td, ...printStyles.tdRight }}>{item.price.toFixed(2)}</td><td style={{ ...printStyles.td, ...printStyles.tdRight }}>{(item.quantity * item.price).toFixed(2)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="invoice-footer-section">
          <div style={printStyles.totalsContainer}>
            <div style={printStyles.totals}>
                <div style={printStyles.totalRow}><strong>Subtotal:</strong><span>Rs. {subtotal.toFixed(2)}</span></div>
                {/* ✅ **FIX: Conditionally display delivery charges in print view** */}
                {invoice.deliveryCharge > 0 && (
                    <div style={printStyles.totalRow}><strong>Delivery:</strong><span>Rs. {invoice.deliveryCharge.toFixed(2)}</span></div>
                )}
                <div style={printStyles.totalRow}><strong>Grand Total:</strong><span>Rs. {invoice.total.toFixed(2)}</span></div>
                <hr style={printStyles.hr} />
                <div style={printStyles.totalRow}><strong>Amount Received:</strong><span>Rs. {invoice.received.toFixed(2)}</span></div>
                <div style={{ ...printStyles.totalRow, fontSize: '1.1em' }}><strong>Balance:</strong><span>Rs. {balanceToDisplay.toFixed(2)}</span></div>
            </div>
          </div>
        </div>
        <div style={printStyles.footer}><p>Thank you for your business!</p></div>
        <div style={printStyles.creditFooter}><p>Wayne Software Solutions | 078 722 3407</p></div>
      </div>
    );
};

const PrintPreviewModal = ({ invoice, companyInfo, onClose }) => {
    const [isImageLoaded, setIsImageLoaded] = useState(!companyInfo?.companyLogo);
    const isPrintReady = invoice && (isImageLoaded || !companyInfo?.companyLogo);

    // This adds a class to the <body> so our print styles only apply when the modal is open.
    useEffect(() => {
        document.body.classList.add('print-modal-active');
        return () => {
            document.body.classList.remove('print-modal-active');
        };
    }, []);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Enter' && isPrintReady) {
                e.preventDefault();
                window.print();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        const handleAfterPrint = () => onClose();
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('afterprint', handleAfterPrint);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('afterprint', handleAfterPrint);
        };
    }, [onClose, isPrintReady]);

    return (
        <>
            <style>{`
                @page {
                    /* This removes the printer's default margin. */
                    margin: 0;
                    size: 80mm auto;
                }
                
                @media print {
                    /* Reset body styles for printing */
                    body {
                        background-color: #fff !important;
                        /* ✅ FIX: Add margin and padding reset to the body to remove the top gap */
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    /* Hide everything except our modal */
                    body.print-modal-active > * {
                        visibility: hidden !important;
                    }
                    body.print-modal-active .print-preview-overlay,
                    body.print-modal-active .print-preview-overlay * {
                        visibility: visible !important;
                    }

                    /* Force the modal to the absolute top-left corner. */
                    body.print-modal-active .print-preview-overlay {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        display: block !important;
                    }
                    
                    /* Clean up the inner container styles */
                    .print-area-container {
                        box-shadow: none !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        transform: none !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            `}</style>
            
            <div className="print-preview-overlay" style={styles.confirmOverlay}>
                <div className="print-area-container" style={{ width: '80mm', background: 'white', padding: '10px', transformOrigin: 'top center' }}>
                    <div className="no-print" style={{ textAlign: 'center', padding: '10px', background: '#eee', marginBottom: '10px', borderRadius: '4px' }}>
                        {isPrintReady ? 'Press ENTER to Print or ESC to Close' : 'Loading preview...'}
                    </div>
                    <div className="print-area">
                        {invoice ? <PrintableLayout invoice={invoice} companyInfo={companyInfo} onImageLoad={() => setIsImageLoaded(true)} /> : <p>Loading...</p>}
                    </div>
                </div>
            </div>
        </>
    );
};


const Invoice = ({ internalUser }) => {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [checkout, setCheckout] = useState([]);
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [itemInput, setItemInput] = useState("");
  const [qtyInput, setQtyInput] = useState(1);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [receivedAmount, setReceivedAmount] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [amountReceivedMode, setAmountReceivedMode] = useState(false);
  const [checkoutFocusMode, setCheckoutFocusMode] = useState(false);
  const [highlightedCheckoutIndex, setHighlightedCheckoutIndex] = useState(-1);
  const [settings, setSettings] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [shiftProductionEnabled, setShiftProductionEnabled] = useState(false);
  const [availableShifts, setAvailableShifts] = useState([]);
  const [selectedShift, setSelectedShift] = useState("");
  const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
  const [confirmPaymentMethod, setConfirmPaymentMethod] = useState('Cash');
  const paymentOptions = ['Cash', 'Card', 'Online'];
  
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [invoiceToPrint, setInvoiceToPrint] = useState(null);
  
  // ✅ **1. New state and ref for delivery charges**
  const [deliveryCharge, setDeliveryCharge] = useState("");
  const deliveryChargeRef = useRef(null);
  const [deliveryChargeMode, setDeliveryChargeMode] = useState(false);


  const containerRef = useRef(null);
  const itemInputRef = useRef(null);
  const qtyInputRef = useRef(null);
  const receivedAmountRef = useRef(null);

    const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => alert(`Error: ${err.message}`));
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const generateInvoiceNumber = async () => {
    const user = auth.currentUser;
    if (!user) return "";
    const today = new Date();
    const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const counterRef = doc(db, user.uid, "counters");
    try {
        const newSeq = await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            const dailyCounter = counterDoc.exists() ? counterDoc.data().invoiceCounters?.[datePrefix] || 0 : 0;
            const nextSeq = dailyCounter + 1;
            transaction.set(counterRef, { invoiceCounters: { [datePrefix]: nextSeq } }, { merge: true });
            return nextSeq;
        });
        return `INV-${datePrefix}-${String(newSeq).padStart(4, "0")}`;
    } catch (err) {
        console.error("Error generating invoice number:", err);
        return `INV-${datePrefix}-ERR`;
    }
  };

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid;
    const initialize = async () => {
      let currentInvNum = sessionStorage.getItem('currentInvoiceNumber');
      if (!currentInvNum) {
        currentInvNum = await generateInvoiceNumber();
        sessionStorage.setItem('currentInvoiceNumber', currentInvNum);
      }
      setInvoiceNumber(currentInvNum);
      
      const customersColRef = collection(db, uid, "customers", "customer_list");
      const customerSnap = await getDocs(query(customersColRef));
      const customerOptions = customerSnap.docs.map(d => ({ value: d.id, label: d.data().name, ...d.data() }));
      setCustomers(customerOptions);
      
      const settingsSnap = await getDoc(doc(db, uid, "settings"));
      if (settingsSnap.exists()) {
        const settingsData = settingsSnap.data();
        setSettings(settingsData); 
        if (settingsData.defaultCustomerId) {
          const defaultCustomer = customerOptions.find(c => c.value === settingsData.defaultCustomerId);
          if (defaultCustomer) setSelectedCustomer(defaultCustomer);
        }
        if (settingsData.useShiftProduction === true) {
          setShiftProductionEnabled(true);
          const shifts = settingsData.productionShifts || [];
          setAvailableShifts(shifts);
          const savedShift = localStorage.getItem('savedSelectedShift');
          if (savedShift && shifts.includes(savedShift)) {
            setSelectedShift(savedShift);
          }
        }
      }
    };
    initialize();
  }, []);
  
    useEffect(() => {
    if (selectedShift) {
        localStorage.setItem('savedSelectedShift', selectedShift);
    }
  }, [selectedShift]);


  useEffect(() => {
    const fetchItemsForCustomer = async () => {
      const user = auth.currentUser;
      if (!selectedCustomer || !user) { setItems([]); return; }
      const pricedItemsColRef = collection(db, user.uid, "price_categories", "priced_items");
      const q = query(pricedItemsColRef, where("categoryId", "==", selectedCustomer.priceCategoryId));
      const itemsSnap = await getDocs(q);
      setItems(itemsSnap.docs.map(d => ({ ...d.data(), id: d.id })));
    };
    fetchItemsForCustomer();
  }, [selectedCustomer]);

  useEffect(() => {
    if (!itemInput.trim()) { setFilteredItems([]); setShowDropdown(false); return; }
    const filtered = items.filter(i => i.itemName.toLowerCase().includes(itemInput.toLowerCase()) || i.itemSKU?.toLowerCase().includes(itemInput.toLowerCase()));
    setFilteredItems(filtered);
    setSelectedIndex(0);
    setShowDropdown(filtered.length > 0);
  }, [itemInput, items]);

  useEffect(() => {
    const handleShortcuts = (e) => {
      if (showPaymentConfirm || isSaving || showPrintPreview) return;
      if (e.altKey && e.key.toLowerCase() === "s") { e.preventDefault(); handleSaveAttempt(); }
      if (e.key === "F2") { e.preventDefault(); setCheckoutFocusMode(false); setDeliveryChargeMode(false); setAmountReceivedMode(prev => !prev); }
      if (e.key === "F10") { e.preventDefault(); setAmountReceivedMode(false); setDeliveryChargeMode(false); setCheckoutFocusMode(prev => !prev); }
      // ✅ **2. New F5 shortcut for delivery charge**
      if (e.key === "F5") { 
          e.preventDefault(); 
          setCheckoutFocusMode(false); 
          setAmountReceivedMode(false); 
          setDeliveryChargeMode(prev => !prev); 
      }
    };
    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, [checkout, selectedCustomer, shiftProductionEnabled, selectedShift, showPaymentConfirm, isSaving, showPrintPreview]);

  useEffect(() => {
    if (amountReceivedMode) { receivedAmountRef.current?.focus(); receivedAmountRef.current?.select(); }
    else if (deliveryChargeMode) { deliveryChargeRef.current?.focus(); deliveryChargeRef.current?.select(); }
    else if (checkoutFocusMode) { itemInputRef.current?.blur(); qtyInputRef.current?.blur(); receivedAmountRef.current?.blur(); setHighlightedCheckoutIndex(checkout.length > 0 ? 0 : -1); }
    else { itemInputRef.current?.focus(); setHighlightedCheckoutIndex(-1); }
  }, [amountReceivedMode, checkoutFocusMode, deliveryChargeMode, checkout.length]);

  useEffect(() => {
    const handleCheckoutNav = (e) => {
        if (!checkoutFocusMode) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedCheckoutIndex(prev => Math.min(prev + 1, checkout.length - 1)); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedCheckoutIndex(prev => Math.max(prev - 1, 0)); }
        if (e.key === 'Delete') {
            e.preventDefault();
            if (highlightedCheckoutIndex > -1) {
                removeCheckoutItem(highlightedCheckoutIndex);
                setHighlightedCheckoutIndex(prev => Math.max(0, Math.min(prev, checkout.length - 2)));
            }
        }
        if (e.key === 'Escape') { e.preventDefault(); setCheckoutFocusMode(false); }
    };
    window.addEventListener('keydown', handleCheckoutNav);
    return () => window.removeEventListener('keydown', handleCheckoutNav);
  }, [checkoutFocusMode, checkout, highlightedCheckoutIndex]);
  
  const handleItemKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(prev => (prev + 1) % filteredItems.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length); }
    else if (e.key === "Enter") { e.preventDefault(); if (filteredItems[selectedIndex]) handleItemSelect(filteredItems[selectedIndex]); }
  };
  
  const handleItemSelect = (item) => {
    setItemInput(item.itemName);
    setShowDropdown(false);
    setTimeout(() => qtyInputRef.current?.focus(), 50);
  };
  
  const handleQtyKeyDown = (e) => { if (e.key === "Enter") { e.preventDefault(); addItemToCheckout(); } };
  const handleQtyChange = (e) => {
    const value = e.target.value;
    if (value === "" || /^[0-9]*\.?[0-9]*$/.test(value)) { setQtyInput(value); }
  };
  const addItemToCheckout = () => {
    if (!itemInput || !qtyInput || isNaN(qtyInput) || qtyInput <= 0) return;
    const itemData = items.find(i => i.itemName === itemInput);
    if (!itemData) return alert("Item not found. Please select from the list.");
    const existingItemIndex = checkout.findIndex(item => item.itemId === itemData.itemId);
    if (existingItemIndex > -1) {
        const updatedCheckout = [...checkout];
        updatedCheckout[existingItemIndex].quantity += Number(qtyInput);
        setCheckout(updatedCheckout);
    } else {
        setCheckout(prev => [...prev, { ...itemData, quantity: Number(qtyInput) }]);
    }
    setItemInput("");
    setQtyInput(1);
    setShowDropdown(false);
    itemInputRef.current?.focus();
  };
  const removeCheckoutItem = (index) => setCheckout(prev => prev.filter((_, i) => i !== index));

  const resetForm = async () => {
    const newInvNum = await generateInvoiceNumber();
    sessionStorage.setItem('currentInvoiceNumber', newInvNum);
    setInvoiceNumber(newInvNum);
    setCheckout([]);
    setReceivedAmount("");
    setDeliveryCharge(""); // Reset delivery charge
    itemInputRef.current?.focus();
  };
  
  const executeSaveInvoice = async (finalPaymentMethod) => {
    const user = auth.currentUser;
    if (!user) return alert("You are not logged in.");
    
    setIsSaving(true); 
    setShowPaymentConfirm(false);

    try {
      const invoicesColRef = collection(db, user.uid, "invoices", "invoice_list");
      const invoiceDataForDb = {
        customerId: selectedCustomer.value, customerName: selectedCustomer.label,
        items: checkout, 
        total: total, // Use the new grand total
        deliveryCharge: Number(deliveryCharge) || 0, // Save delivery charge
        received: selectedCustomer.isCreditCustomer ? 0 : (Number(receivedAmount) || 0),
        balance: selectedCustomer.isCreditCustomer ? total : balance,
        createdAt: serverTimestamp(), invoiceNumber: invoiceNumber,
        issuedBy: internalUser?.username || "Admin", shift: selectedShift || "",
        paymentMethod: finalPaymentMethod,
      };

      await addDoc(invoicesColRef, invoiceDataForDb);
      
      if (settings?.autoPrintInvoice === true) {
        const invoiceDataForPrint = { ...invoiceDataForDb, createdAt: new Date() };
        setInvoiceToPrint(invoiceDataForPrint);
        setShowPrintPreview(true);
      } else {
        alert("Invoice saved successfully!");
        await resetForm();
      }
    } catch (error) {
      alert("Failed to save invoice: " + error.message);
    } finally {
      setIsSaving(false); 
    }
  };
  
  const handleSaveAttempt = () => {
    if (!selectedCustomer || checkout.length === 0) { return alert("Please select a customer and add items."); }
    if (shiftProductionEnabled && !selectedShift) {
        return alert("Please select a shift before saving the invoice.");
    }
    
    if (selectedCustomer.isCreditCustomer) {
        executeSaveInvoice('Credit');
    } else {
        setConfirmPaymentMethod('Cash');
        setShowPaymentConfirm(true);
    }
  };

    useEffect(() => {
    const handlePaymentConfirmKeyDown = (e) => {
        if (!showPaymentConfirm) return;
        const currentIndex = paymentOptions.indexOf(confirmPaymentMethod);
        if (e.key === 'ArrowRight') {
            const nextIndex = (currentIndex + 1) % paymentOptions.length;
            setConfirmPaymentMethod(paymentOptions[nextIndex]);
        }
        if (e.key === 'ArrowLeft') {
            const prevIndex = (currentIndex - 1 + paymentOptions.length) % paymentOptions.length;
            setConfirmPaymentMethod(paymentOptions[prevIndex]);
        }
        if (e.key === 'Enter') {
            executeSaveInvoice(confirmPaymentMethod);
        }
        if (e.key === 'Escape') {
            setShowPaymentConfirm(false);
        }
    };
    window.addEventListener('keydown', handlePaymentConfirmKeyDown);
    return () => window.removeEventListener('keydown', handlePaymentConfirmKeyDown);
  }, [showPaymentConfirm, confirmPaymentMethod, checkout, receivedAmount, settings, selectedCustomer]);

  
  const subtotal = checkout.reduce((sum, item) => sum + item.price * item.quantity, 0);
  // ✅ **3. Calculate new grand total and balance with delivery charge**
  const total = subtotal + (Number(deliveryCharge) || 0);
  const balance = (Number(receivedAmount) || 0) - total; 
  const received = Number(receivedAmount) || 0;
  const displayBalance = received === 0 ? 0 : balance;
  const isSaveDisabled = !selectedCustomer || checkout.length === 0 || (balance < 0 && received > 0);

  return (
    <div ref={containerRef} style={styles.container}>
      {isSaving && !showPrintPreview && (
        <div style={styles.savingOverlay}>
            <div style={styles.savingSpinner}></div>
            <p>Saving...</p>
        </div>
      )}
      
      {showPrintPreview && (
        <PrintPreviewModal 
            invoice={invoiceToPrint} 
            companyInfo={settings}
            onClose={() => {
                setShowPrintPreview(false);
                setInvoiceToPrint(null);
                resetForm();
            }}
        />
      )}

      <button onClick={toggleFullscreen} style={styles.fullscreenButton}>{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}</button>
      <div style={styles.leftPanel}>
        <div style={styles.header}>
            <div style={{textAlign: 'left'}}><div style={styles.invoiceLabel}>INVOICE #</div><div style={styles.invoiceNumber}>{invoiceNumber}</div></div>
            {shiftProductionEnabled && (
                <div style={{textAlign: 'center'}}><label style={styles.invoiceLabel}>SHIFT</label><select value={selectedShift} onChange={e => setSelectedShift(e.target.value)} style={styles.shiftSelect}><option value="">Select Shift</option>{availableShifts.map(s => (<option key={s} value={s}>{s}</option>))}</select></div>
            )}
            <div style={{textAlign: 'right'}}><div style={styles.invoiceLabel}>ISSUED BY</div><div style={styles.invoiceNumber}>{internalUser?.username || 'Admin'}</div></div>
        </div>
        <div style={styles.customerSection}><label style={styles.label}>CUSTOMER</label><Select options={customers} value={selectedCustomer} onChange={setSelectedCustomer} placeholder="Select a customer..."/></div>
        <div style={styles.itemEntrySection}><div style={{position: 'relative', flex: 1}}><label style={styles.label}>ADD ITEM</label><input ref={itemInputRef} value={itemInput} onChange={e => setItemInput(e.target.value)} onKeyDown={handleItemKeyDown} placeholder="Type item name, SKU, or scan barcode..." style={styles.input}/>{showDropdown && filteredItems.length > 0 && (<ul style={styles.dropdown}>{filteredItems.map((i, idx) => (<li key={i.id} style={{...styles.dropdownItem, ...(idx === selectedIndex ? styles.dropdownItemSelected : {})}} onClick={() => handleItemSelect(i)}>{i.itemName} <span style={styles.dropdownPrice}>Rs. {i.price.toFixed(2)}</span></li>))}</ul>)}</div><div style={{width: '120px'}}><label style={styles.label}>QTY</label><input ref={qtyInputRef} value={qtyInput} onChange={handleQtyChange} onKeyDown={handleQtyKeyDown} onFocus={(e) => e.target.select()} type="text" inputMode="decimal" style={styles.input}/></div><button onClick={addItemToCheckout} style={styles.addButton}>ADD</button></div>
        <div style={styles.shortcutsHelp}><h4 style={styles.shortcutsTitle}>Keyboard Shortcuts</h4><div style={styles.shortcutItem}><b>F2:</b> Focus 'Amount Received'</div><div style={styles.shortcutItem}><b>F5:</b> Focus 'Delivery Charges'</div><div style={styles.shortcutItem}><b>F10:</b> Activate Checkout List (use Arrows + Delete)</div><div style={styles.shortcutItem}><b>Alt + S:</b> Save Invoice</div><div style={styles.shortcutItem}><b>Esc:</b> Exit Modes / Popups</div></div>
      </div>
      <div style={styles.rightPanel}>
        <div style={{...styles.checkoutCard, ...(checkoutFocusMode ? styles.activeCard : {})}}>
            <h3 style={styles.checkoutTitle}>CHECKOUT (F10)</h3>
            <div style={styles.tableContainer}>
                <table style={styles.table}><thead><tr><th style={styles.th}>ITEM</th><th style={styles.th}>QTY</th><th style={styles.th}>TOTAL</th><th style={styles.th}></th></tr></thead><tbody>{checkout.length === 0 ? (<tr><td colSpan="4" style={styles.emptyState}>No items added</td></tr>) : (checkout.map((c, idx) => (<tr key={idx} style={idx === highlightedCheckoutIndex ? styles.highlightedRow : {}}><td style={styles.td}>{c.itemName}</td><td style={styles.td}>{c.quantity}</td><td style={styles.td}>Rs. {(c.price * c.quantity).toFixed(2)}</td><td style={styles.td}><button onClick={() => removeCheckoutItem(idx)} style={styles.removeButton}>✕</button></td></tr>)))}</tbody></table>
            </div>
            {/* ✅ **4. Conditionally render delivery charges and update totals** */}
            <div style={styles.totalsSection}>
                <div style={styles.totalRow}><span>Subtotal</span><span>Rs. {subtotal.toFixed(2)}</span></div>
                {settings?.offerDelivery && (
                    <div style={styles.totalRow}>
                        <label htmlFor="deliveryCharge" style={{cursor: 'pointer'}}>Delivery (F5)</label>
                        <input
                            ref={deliveryChargeRef}
                            id="deliveryCharge"
                            type="number"
                            value={deliveryCharge}
                            onChange={e => setDeliveryCharge(e.target.value)}
                            style={{...styles.input, ...styles.deliveryInput, ...(deliveryChargeMode ? styles.activeInput : {})}}
                            placeholder="0.00"
                        />
                    </div>
                )}
                <div style={styles.grandTotalRow}><span>TOTAL</span><span>Rs. {total.toFixed(2)}</span></div>
            </div>
            
            <div style={styles.paymentSection}>
                <label style={styles.label}>AMOUNT RECEIVED (F2)</label>
                <input ref={receivedAmountRef} type="number" value={selectedCustomer?.isCreditCustomer ? '' : receivedAmount} onChange={e => setReceivedAmount(e.target.value)} placeholder={selectedCustomer?.isCreditCustomer ? 'CREDIT SALE' : '0.00'} style={{...styles.input, ...styles.amountInput, ...(amountReceivedMode ? styles.activeInput : {})}} disabled={selectedCustomer?.isCreditCustomer} />
            </div>
            <div style={styles.balanceRow}>
              <span>BALANCE</span>
              <span style={{color: displayBalance >= 0 ? '#10b981' : '#ef4444'}}>
                Rs. {displayBalance.toFixed(2)}
              </span>
            </div>
            <button onClick={handleSaveAttempt} disabled={isSaveDisabled || isSaving} style={{...styles.saveButton, ...((isSaveDisabled || isSaving) ? styles.saveButtonDisabled : {})}}>
              {isSaving ? 'SAVING...' : 'SAVE INVOICE (ALT+S)'}
            </button>
        </div>
      </div>
      {showPaymentConfirm && (
        <div style={styles.confirmOverlay}>
          <div style={styles.confirmPopup}>
            <h4>Select Payment Method</h4>
            <p>Use ← → arrow keys and press Enter to confirm.</p>
            <div style={styles.confirmButtons}>
                {paymentOptions.map(method => (
                    <button 
                        key={method}
                        onClick={() => executeSaveInvoice(method)} 
                        style={confirmPaymentMethod === method ? styles.confirmButtonActive : styles.confirmButton}
                    >
                        {method === 'Online' ? 'Online Transfer' : `${method} Payment`}
                    </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
    container: { display: 'flex', height: 'calc(100vh - 180px)', backgroundColor: '#f3f4f6', fontFamily: "'Inter', sans-serif", gap: '20px', padding: '20px', position: 'relative' },
    leftPanel: { flex: 3, display: 'flex', flexDirection: 'column', gap: '20px' },
    rightPanel: { flex: 2, display: 'flex', flexDirection: 'column' },
    fullscreenButton: { position: 'absolute', top: '10px', right: '10px', zIndex: 100, padding: '8px 12px', cursor: 'pointer', background: 'rgba(255,255,255,0.8)', border: '1px solid #ccc', borderRadius: '6px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    invoiceLabel: { fontSize: '12px', color: '#6b7280', fontWeight: '600' },
    invoiceNumber: { fontSize: '18px', fontWeight: '700', color: '#1f2937' },
    shiftSelect: { border: '1px solid #d1d5db', borderRadius: '6px', padding: '4px 8px', fontSize: '14px', fontWeight: '600' },
    customerSection: { backgroundColor: 'white', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    label: { display: 'block', fontSize: '12px', fontWeight: '600', color: '#4b5563', marginBottom: '8px' },
    itemEntrySection: { display: 'flex', gap: '10px', alignItems: 'flex-end', backgroundColor: 'white', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    input: { width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' },
    activeInput: { borderColor: '#f59e0b', boxShadow: '0 0 0 2px rgba(245, 158, 11, 0.3)' },
    dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #d1d5db', borderRadius: '0 0 6px 6px', maxHeight: '200px', overflowY: 'auto', zIndex: 100, listStyle: 'none', margin: 0, padding: 0 },
    dropdownItem: { padding: '10px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between' },
    dropdownItemSelected: { backgroundColor: '#e0e7ff', color: '#3730a3' },
    dropdownPrice: { color: '#6b7280', fontSize: '12px' },
    addButton: { padding: '12px 24px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' },
    checkoutCard: { backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', flex: 1, display: 'flex', flexDirection: 'column', border: '2px solid transparent', transition: 'border-color 0.3s ease' },
    activeCard: { borderColor: '#3b82f6' },
    checkoutTitle: { textAlign: 'center', fontSize: '18px', fontWeight: '700', padding: '16px', borderBottom: '1px solid #e5e7eb', color: '#111827' },
    tableContainer: { flex: 1, overflowY: 'auto', padding: '0 8px 8px 8px' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { padding: '10px', textAlign: 'left', color: '#6b7280', fontSize: '12px', fontWeight: '600', borderBottom: '1px solid #e5e7eb' },
    td: { padding: '10px', borderBottom: '1px solid #e5e7eb' },
    highlightedRow: { backgroundColor: '#dbeafe' },
    emptyState: { textAlign: 'center', color: '#9ca3af', padding: '20px' },
    removeButton: { background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' },
    totalsSection: { padding: '16px', borderTop: '1px solid #e5e7eb' },
    totalRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '14px' },
    grandTotalRow: { display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '20px', color: '#16a34a', paddingTop: '8px', borderTop: '2px solid #e5e7eb' },
    deliveryInput: { width: '120px', padding: '8px', textAlign: 'right' },
    paymentSection: { padding: '16px' },
    amountInput: { fontSize: '18px', fontWeight: 'bold', textAlign: 'right' },
    balanceRow: { display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '20px', padding: '16px', borderTop: '1px solid #e5e7eb' },
    saveButton: { width: '100%', padding: '16px', backgroundColor: '#2563eb', color: 'white', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginTop: 'auto' },
    saveButtonDisabled: { backgroundColor: '#9ca3af', cursor: 'not-allowed' },
    confirmOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 },
    confirmPopup: { backgroundColor: 'white', padding: '24px', borderRadius: '8px', textAlign: 'center', boxShadow: '0 5px 15px rgba(0,0,0,0.3)', width: 'auto', minWidth: '400px' },
    confirmButtons: { display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '20px' },
    confirmButton: { padding: '10px 24px', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer', background: '#f8f8f8', fontWeight: '600', flex: 1 },
    confirmButtonActive: { padding: '10px 24px', border: '1px solid #3b82f6', borderRadius: '6px', cursor: 'pointer', background: '#3b82f6', color: 'white', fontWeight: '600', flex: 1, boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.4)' },
    shortcutsHelp: { backgroundColor: 'white', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginTop: 'auto', fontSize: '12px', color: '#4b5563' },
    shortcutsTitle: { fontWeight: 'bold', marginBottom: '8px', color: '#111827' },
    shortcutItem: { marginBottom: '4px' },
    savingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 3000, color: '#1f2937', fontSize: '18px', fontWeight: '600' },
    savingSpinner: { border: '4px solid #f3f4f6', borderTop: '4px solid #3b82f6', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', marginBottom: '16px' },
};
const printStyles = {
    invoiceBox: { padding: '5px', color: '#000', boxSizing: 'border-box', fontFamily: "'Courier New', monospace" },
    logo: { maxWidth: '80px', maxHeight: '80px', marginBottom: '10px', display: 'block', marginLeft: 'auto', marginRight: 'auto' },
    companyNameText: { fontSize: '1.4em', margin: '0 0 5px 0', fontWeight: 'bold', textAlign: 'center' },
    headerText: { margin: '2px 0', fontSize: '0.9em', textAlign: 'center' },
    itemsTable: { width: '100%', borderCollapse: 'collapse', marginTop: '20px' },
    th: { borderBottom: '1px solid #000', padding: '8px', textAlign: 'right', background: '#f0f0f0' },
    thItem: { textAlign: 'left' },
    td: { padding: '8px', borderBottom: '1px dotted #ccc' },
    tdCenter: { textAlign: 'center' },
    tdRight: { textAlign: 'right' },
    totalsContainer: { width: '100%' },
    totals: { paddingTop: '10px' },
    totalRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '1em' },
    hr: { border: 'none', borderTop: '1px dashed #000' },
    footer: { textAlign: 'center', marginTop: '20px', paddingTop: '10px', borderTop: '1px solid #000', fontSize: '0.8em' },
    creditFooter: { textAlign: 'center', marginTop: '10px', fontSize: '0.7em', color: '#777' },
};

export default Invoice;

