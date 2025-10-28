/* global qz */
import React, { useEffect, useState, useRef, useCallback } from "react";
// --- Corrected import path ---
import { auth, db } from "../../firebase"; // Adjust path if needed
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  runTransaction,
  orderBy, // Import orderBy
  onSnapshot // Import onSnapshot for real-time updates
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import Select from "react-select";
import { AiOutlineSearch, AiOutlineEye, AiOutlinePrinter, AiOutlineDelete } from 'react-icons/ai'; // Added icons

// PrintableLayout component - Modified for Orders with Advance Amount
const PrintableLayout = ({ order, companyInfo, onImageLoad }) => {
    if (!order || !Array.isArray(order.items)) return null;
    const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const total = order.total || subtotal; // Use saved total if available
    const advance = order.advanceAmount || 0;
    const balance = total - advance;
    const createdAtDate = order.createdAt instanceof Date ? order.createdAt : order.createdAt?.toDate();
    const deliveryDateTime = order.deliveryDateTime ? new Date(order.deliveryDateTime) : null;
  
    return (
      <div style={printStyles.invoiceBox}>
        {/* Company Logo - centered */}
        {companyInfo?.companyLogo && (
          <div style={printStyles.logoContainer}>
            <img 
              src={companyInfo.companyLogo} 
              style={printStyles.logo} 
              alt="Company Logo" 
              onLoad={onImageLoad} 
              onError={onImageLoad} 
            />
          </div>
        )}
        
        {/* Company Name */}
        <h1 style={printStyles.companyNameText}>{companyInfo?.companyName || "Your Company"}</h1>
        
        {/* Company Address */}
        <p style={printStyles.headerText}>{companyInfo?.companyAddress || "123 Main St, City"}</p>
        
        {/* Phone */}
        {companyInfo?.phone && <p style={printStyles.headerText}>{companyInfo.phone}</p>}
        
        {/* Order Meta Info */}
        <div style={printStyles.metaSection}>
          <p style={printStyles.metaText}><strong>Order #:</strong> {order.orderNumber}</p>
          <p style={printStyles.metaText}><strong>Date Placed:</strong> {createdAtDate?.toLocaleDateString()}</p>
           {/* Delivery Date/Time */}
           {deliveryDateTime && (
             <p style={printStyles.metaText}><strong>Delivery Date:</strong> {deliveryDateTime.toLocaleString()}</p>
           )}
          <p style={printStyles.metaText}><strong>Customer:</strong> {order.customerName}</p>
          {/* Customer Telephone */}
          {order.customerTelephone && (
             <p style={printStyles.metaText}><strong>Telephone:</strong> {order.customerTelephone}</p>
          )}
          <p style={printStyles.metaText}><strong>Placed By:</strong> {order.placedBy}</p>
        </div>

        {/* Remarks */}
        {order.remarks && (
          <div style={printStyles.remarksSection}>
             <p style={printStyles.remarksText}><strong>Remarks:</strong> {order.remarks}</p>
          </div>
        )}
        
        {/* Items Table */}
        <table style={printStyles.itemsTable}>
          <thead>
            <tr>
              <th style={{ ...printStyles.th, ...printStyles.thItem }}>Item</th>
              <th style={{ ...printStyles.th, ...printStyles.thQty }}>Qty</th>
              <th style={{ ...printStyles.th, ...printStyles.thRate }}>Rate</th>
              <th style={{ ...printStyles.th, ...printStyles.thTotal }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, index) => (
              <tr key={index}>
                <td style={printStyles.tdItem}>{item.itemName}</td>
                <td style={printStyles.tdQty}>{item.quantity}</td>
                <td style={printStyles.tdRate}>{item.price.toFixed(2)}</td>
                <td style={printStyles.tdTotal}>{(item.quantity * item.price).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {/* Totals Section with Advance */}
        <div style={printStyles.totalsSection}>
          <div style={printStyles.totalRow}>
            <span>Subtotal:</span>
            <span>Rs. {subtotal.toFixed(2)}</span>
          </div>
          
          <div style={printStyles.grandTotalRow}>
            <span>Grand Total:</span>
            <span>Rs. {total.toFixed(2)}</span>
          </div>

           <div style={printStyles.dashedLine}></div>

           <div style={printStyles.totalRow}>
            <span>Advance Paid:</span>
            <span>Rs. {advance.toFixed(2)}</span>
           </div>

           <div style={printStyles.balanceRow}> {/* Use balanceRow style */}
            <span>Balance Due:</span>
            <span>Rs. {balance.toFixed(2)}</span>
           </div>
        </div>
        
        <div style={printStyles.dashedLine}></div>
        
        {/* Footer */}
        <div style={printStyles.footer}>
          <p>Thank you for your order!</p>
        </div>
        
        {/* Credit Footer */}
        <div style={printStyles.creditFooter}>
          <p>Wayne Software Solutions | 078 722 3407</p>
        </div>
      </div>
    );
};

// BrowserPrintComponent (Adapts based on layout passed) - No change needed
const BrowserPrintComponent = ({ order, companyInfo, onPrintFinished }) => {
    // ... (Keep internal logic, but pass `order` to `PrintableLayout`) ...
    const [isImageLoaded, setIsImageLoaded] = useState(!companyInfo?.companyLogo);
    const isPrintReady = order && (isImageLoaded || !companyInfo?.companyLogo);

    useEffect(() => {
        document.body.classList.add('print-modal-active');
        return () => {
            document.body.classList.remove('print-modal-active');
        };
    }, []);

    useEffect(() => {
        const printStylesCSS = `
            @page { margin: 0; size: 80mm auto; }
            * { margin: 0 !important; padding: 0 !important; }
            @media print {
                body { background-color: #fff !important; margin: 0 !important; padding: 0 !important; }
                html { margin: 0 !important; padding: 0 !important; }
                body.print-modal-active > * { visibility: hidden !important; }
                body.print-modal-active .print-preview-overlay,
                body.print-modal-active .print-preview-overlay * { visibility: visible !important; }
                body.print-modal-active .print-preview-overlay {
                    position: fixed !important; left: 0 !important; top: 0 !important;
                    width: 100% !important; height: 100% !important; display: block !important;
                    margin: 0 !important; padding: 0 !important;
                }
                .print-area-container {
                    box-shadow: none !important; margin: 0 !important; padding: 0 !important;
                    width: 100% !important; transform: none !important;
                }
                .print-area { margin: 0 !important; padding: 0 !important; }
                .no-print { display: none !important; }
            }
        `;
        
        const styleElement = document.createElement('style');
        styleElement.id = 'browser-print-styles';
        styleElement.innerHTML = printStylesCSS;
        document.head.appendChild(styleElement);

        return () => {
            const style = document.getElementById('browser-print-styles');
            if (style && style.parentNode) {
                style.parentNode.removeChild(style);
            }
        };
    }, []);
    
    useEffect(() => {
        if (isPrintReady) {
            const timer = setTimeout(() => window.print(), 250);
            return () => clearTimeout(timer);
        }
    }, [isPrintReady]);

    useEffect(() => {
        const handleAfterPrint = () => onPrintFinished();
        const handleKeyDown = (e) => {
             if (e.key === 'Escape') {
                e.preventDefault();
                onPrintFinished();
            }
        };

        window.addEventListener('afterprint', handleAfterPrint);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('afterprint', handleAfterPrint);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onPrintFinished]);

    return (
        <div className="print-preview-overlay" style={styles.confirmOverlay}>
            <div className="print-area-container" style={{ width: '80mm', background: 'white', padding: '0', margin: '0' }}>
                <div className="no-print" style={{ textAlign: 'center', padding: '10px', background: '#eee', marginBottom: '10px', borderRadius: '4px' }}>
                    {isPrintReady ? 'Printing... (Press ESC to cancel)' : 'Loading preview...'}
                </div>
                <div className="print-area">
                    {order ? 
                        <PrintableLayout 
                            order={order} // Pass order here
                            companyInfo={companyInfo} 
                            onImageLoad={() => setIsImageLoaded(true)} 
                        /> 
                        : <p>Loading...</p>
                    }
                </div>
            </div>
        </div>
    );
};

// QZ Tray Print Modal (Adapts based on layout passed) - No change needed
const QZPrintModal = ({ order, companyInfo, onClose, isQzReady }) => {
    // ... (Keep internal logic, but pass `order` to `PrintableLayout`) ...
    const [status, setStatus] = useState('Initializing...');
    const [isConnecting, setIsConnecting] = useState(true);
    const [printers, setPrinters] = useState([]);
    const [selectedPrinter, setSelectedPrinter] = useState('');
    const [isPrinting, setIsPrinting] = useState(false);
    const [autoPrintingStatus, setAutoPrintingStatus] = useState('');
    const printableRef = useRef(null);

    const handlePrint = useCallback(async () => {
        if (typeof qz === 'undefined' || !qz.websocket || !qz.websocket.isActive()) {
            alert('QZ Tray is not connected.');
            return;
        }
        if (!selectedPrinter) {
            alert('Please select a printer.');
            return;
        }

        setIsPrinting(true);

        try {
            qz.security.setSignaturePromise(async (toSign) => {
                try {
                    console.log("Requesting signature for:", toSign);
                    const functions = getFunctions();
                    const getQzSignature = httpsCallable(functions, 'getQzSignature');
                    const result = await getQzSignature({ requestToSign: toSign });
                    console.log("Signature received from server.");
                    return result.data.signature;
                } catch (error) {
                    console.error("Signature promise error:", error);
                    alert("Failed to get print signature from the server.");
                    return null;
                }
            });

            const config = qz.configs.create(selectedPrinter, { units: 'mm', width: 80 });
            const printData = [{ type: 'html', format: 'plain', data: printableRef.current.innerHTML }];
            
            await qz.print(config, printData);
            alert('Print successful!'); 
            onClose();

        } catch (err) {
            console.error(err);
            alert('Printing failed: ' + err.toString());
            setAutoPrintingStatus('');
        } finally {
            setIsPrinting(false);
        }
    }, [selectedPrinter, onClose]);

    useEffect(() => {
        if (!isQzReady) {
            setStatus('Waiting for QZ Tray library...');
            return;
        }

        const findPrintersAndPrint = () => {
            qz.printers.find().then(foundPrinters => {
                setPrinters(foundPrinters);
                const savedPrinter = localStorage.getItem('selectedPrinter');

                if (savedPrinter && foundPrinters.includes(savedPrinter)) {
                    setAutoPrintingStatus(`Found saved printer: "${savedPrinter}". Printing automatically...`);
                    setSelectedPrinter(savedPrinter);
                } else {
                    setIsConnecting(false);
                    if (foundPrinters.length > 0) {
                        const defaultPrinter = foundPrinters.find(p => p.toLowerCase().includes('tm-t') || p.toLowerCase().includes('80mm')) || foundPrinters[0];
                        setSelectedPrinter(defaultPrinter);
                    }
                }
            }).catch(err => {
                console.error(err);
                setStatus('Error finding printers.');
                setIsConnecting(false);
            });
        };
        
        setStatus('Connecting to QZ Tray...');
        if (!qz.websocket.isActive()) {
            qz.websocket.connect().then(() => {
                setStatus('Connected to QZ Tray.');
                findPrintersAndPrint();
            }).catch(err => {
                console.error(err);
                setStatus('Connection Failed. Is QZ Tray running?');
                setIsConnecting(false);
            });
        } else {
            setStatus('Connected to QZ Tray.');
            findPrintersAndPrint();
        }

        qz.websocket.onClosed = () => setStatus('Connection Closed. Please ensure QZ Tray is running.');
        qz.websocket.onError = () => setStatus('Connection Error. Is QZ Tray running?');
        
        return () => {
             if (qz && qz.websocket) {
                qz.websocket.onClosed = null;
                qz.websocket.onError = null;
            }
        }
    }, [isQzReady]);

    useEffect(() => {
        if (autoPrintingStatus && selectedPrinter) {
            const timer = setTimeout(() => {
                handlePrint();
            }, 500); 
            return () => clearTimeout(timer);
        }
    }, [autoPrintingStatus, selectedPrinter, handlePrint]);

    useEffect(() => {
        if (selectedPrinter) {
            localStorage.setItem('selectedPrinter', selectedPrinter);
        }
    }, [selectedPrinter]);

    const showControls = !isConnecting && !autoPrintingStatus;

    return (
        <div style={styles.confirmOverlay}>
            <div style={{...styles.confirmPopup, minWidth: '450px'}}>
                <h4>Direct Print with QZ Tray</h4>
                <div style={styles.qzStatus}>
                    <strong>Status:</strong>
                    <span style={{ color: (isQzReady && qz.websocket && qz.websocket.isActive()) ? '#10b981' : '#ef4444', marginLeft: '8px' }}>
                         {autoPrintingStatus || status}
                    </span>
                </div>

                {showControls && (
                    <div style={styles.qzControls}>
                        <label style={styles.label} htmlFor="printer-select">Select a printer to save for next time</label>
                        <select
                            id="printer-select"
                            value={selectedPrinter}
                            onChange={e => setSelectedPrinter(e.target.value)}
                            style={{ ...styles.input, width: '100%', marginBottom: '20px' }}
                            disabled={printers.length === 0}
                        >
                            {printers.length === 0 ? <option>No printers found</option> : printers.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        
                        <button 
                            onClick={handlePrint} 
                            disabled={isPrinting || !selectedPrinter}
                            style={{...styles.saveButton, ...(isPrinting || !selectedPrinter ? styles.saveButtonDisabled : {})}}
                        >
                           {isPrinting ? 'Printing...' : 'Print Order'} 
                        </button>
                    </div>
                )}
                
                {autoPrintingStatus && (
                     <div style={styles.savingSpinner}></div>
                )}

                <button onClick={onClose} style={styles.closeButton}>Cancel</button>
                
                {/* Ensure PrintableLayout uses `order` prop */}
                <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }} ref={printableRef}>
                   {order && <PrintableLayout order={order} companyInfo={companyInfo} />} 
                </div>
            </div>
        </div>
    );
};

// Main Orders Component - Restructured
const Orders = ({ internalUser }) => {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [checkout, setCheckout] = useState([]);
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [itemInput, setItemInput] = useState("");
  const [qtyInput, setQtyInput] = useState(1);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [orderNumber, setOrderNumber] = useState(""); 
  const [showDropdown, setShowDropdown] = useState(false);
  // Removed isFullscreen state
  const [checkoutFocusMode, setCheckoutFocusMode] = useState(false);
  const [highlightedCheckoutIndex, setHighlightedCheckoutIndex] = useState(-1);
  const [settings, setSettings] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [shiftProductionEnabled, setShiftProductionEnabled] = useState(false);
  const [availableShifts, setAvailableShifts] = useState([]);
  const [selectedShift, setSelectedShift] = useState("");
  
  const [showQZPrintModal, setShowQZPrintModal] = useState(false);
  const [orderToPrint, setOrderToPrint] = useState(null); 
  const [isQzReady, setIsQzReady] = useState(false);
  
  const [isPrintingBrowser, setIsPrintingBrowser] = useState(false);

  // --- Order details states ---
  const [deliveryDateTime, setDeliveryDateTime] = useState('');
  const [customerTelephone, setCustomerTelephone] = useState('');
  const [remarks, setRemarks] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState(''); // New state for advance
  const [customerNameInput, setCustomerNameInput] = useState(''); // New state for manual customer name

  // --- Saved Orders state ---
  const [savedOrders, setSavedOrders] = useState([]);
  const [filteredSavedOrders, setFilteredSavedOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [viewOrderModalOpen, setViewOrderModalOpen] = useState(false);
  const [orderToView, setOrderToView] = useState(null);

  // Refs
  const itemInputRef = useRef(null);
  const qtyInputRef = useRef(null);
  const deliveryDateTimeRef = useRef(null); 
  const telephoneRef = useRef(null); 
  const remarksRef = useRef(null); 
  const advanceAmountRef = useRef(null); // Ref for advance amount
  const customerNameInputRef = useRef(null); // Ref for manual customer name
  
  // QZ Tray script loading (No change)
  useEffect(() => {
    const loadScript = (src, id) => {
      return new Promise((resolve, reject) => {
        if (document.getElementById(id)) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.id = id;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Script load error for ${src}`));
        document.head.appendChild(script);
      });
    };

    loadScript('https://cdn.jsdelivr.net/npm/qz-tray@2.2.3/qz-tray.js', 'qz-tray-lib')
      .then(() => {
        console.log('QZ Tray library loaded successfully.');
        setIsQzReady(true);
      })
      .catch(error => {
        console.error('Failed to load QZ Tray library:', error);
        setIsQzReady(false);
      });
  }, []);

  // Fetch Provisional Order Number (No change)
  const fetchProvisionalOrderNumber = async () => {
    const user = auth.currentUser;
    if (!user) {
        setOrderNumber("ORD-ERROR"); 
        return;
    }
    const today = new Date();
    const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const counterRef = doc(db, user.uid, "counters"); 
    try {
        const counterDoc = await getDoc(counterRef); 
        const dailyCounter = counterDoc.exists() ? counterDoc.data().orderCounters?.[datePrefix] || 0 : 0; 
        const nextSeq = dailyCounter + 1; 
        const provisionalOrdNum = `ORD-${datePrefix}-${String(nextSeq).padStart(4, "0")}`; 
        setOrderNumber(provisionalOrdNum); 
    } catch (err) {
        console.error("Error fetching provisional order number:", err);
        setOrderNumber(`ORD-${datePrefix}-ERR`);
    }
  };
  
  // useEffect on load (No change)
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid;
    const initialize = async () => {
      await fetchProvisionalOrderNumber(); 
      
      const customersColRef = collection(db, uid, "customers", "customer_list");
      const customerSnap = await getDocs(query(customersColRef));
      const customerOptions = customerSnap.docs.map(d => ({ value: d.id, label: d.data().name, ...d.data() }));
      setCustomers(customerOptions);
      
      const settingsSnap = await getDoc(doc(db, uid, "settings"));
      if (settingsSnap.exists()) {
        const settingsData = settingsSnap.data();
        setSettings(settingsData); 
        // Auto-select default customer removed for manual entry option
        // if (settingsData.defaultCustomerId) {
        //   const defaultCustomer = customerOptions.find(c => c.value === settingsData.defaultCustomerId);
        //   if (defaultCustomer) setSelectedCustomer(defaultCustomer);
        // }
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

   // Update Telephone when customer changes (No change)
   useEffect(() => {
     if (selectedCustomer && selectedCustomer.phone) {
       setCustomerTelephone(selectedCustomer.phone);
       setCustomerNameInput(selectedCustomer.label); // Also fill manual name input
     } else {
       // Don't clear telephone if manually entered
       // setCustomerTelephone(''); 
       // Don't clear name input if manually entered
       // setCustomerNameInput('');
     }
   }, [selectedCustomer]);
  
  // Other hooks (shift, item fetching, dropdown logic - No change)
  useEffect(() => {
    if (selectedShift) {
        localStorage.setItem('savedSelectedShift', selectedShift);
    }
  }, [selectedShift]);

  useEffect(() => {
    const fetchItemsForCustomer = async () => {
      const user = auth.currentUser;
      // Fetch items even if no customer is selected (using a default category or all items)
      if (!user) { 
        setItems([]); 
        return; 
      }
      
      let itemsQuery;
      const pricedItemsColRef = collection(db, user.uid, "price_categories", "priced_items");

      // Use selected customer's category if available, otherwise fetch all? (Needs decision)
      // For now, let's only fetch if a customer IS selected.
      if (selectedCustomer?.priceCategoryId) {
          itemsQuery = query(pricedItemsColRef, where("categoryId", "==", selectedCustomer.priceCategoryId));
          const itemsSnap = await getDocs(itemsQuery);
          setItems(itemsSnap.docs.map(d => ({ ...d.data(), id: d.id })));
      } else {
          // Maybe fetch from a 'standard' price category if no customer?
          // Or fetch *all* priced items? Be careful with performance.
          // For now, clear items if no customer is selected.
          setItems([]); 
      }
    };
    fetchItemsForCustomer();
  }, [selectedCustomer]);

  useEffect(() => {
    if (!itemInput.trim()) { 
      setFilteredItems([]); 
      setShowDropdown(false); 
      return; 
    }
    const filtered = items.filter(i => 
      i.itemName.toLowerCase().includes(itemInput.toLowerCase()) || 
      i.itemSKU?.toLowerCase().includes(itemInput.toLowerCase())
    );
    setFilteredItems(filtered);
    setSelectedIndex(0);
    setShowDropdown(filtered.length > 0);
  }, [itemInput, items]);

  // Fetch Saved Orders (New useEffect)
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid;
    const ordersColRef = collection(db, uid, "orders", "order_list");
    const q = query(ordersColRef, orderBy("createdAt", "desc")); // Order by newest first

    setOrdersLoading(true);
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const ordersData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setSavedOrders(ordersData);
        setFilteredSavedOrders(ordersData); // Initialize filtered list
        setOrdersLoading(false);
    }, (error) => {
        console.error("Error fetching saved orders:", error);
        setOrdersLoading(false);
        // Handle error display if needed
    });

    return () => unsubscribe(); // Cleanup listener on unmount
  }, []);

  // Filter Saved Orders (New useEffect)
  useEffect(() => {
      if (!orderSearchTerm) {
          setFilteredSavedOrders(savedOrders);
          return;
      }
      const lowerSearch = orderSearchTerm.toLowerCase();
      const filtered = savedOrders.filter(order => 
          order.customerName?.toLowerCase().includes(lowerSearch) ||
          order.orderNumber?.toLowerCase().includes(lowerSearch) ||
          order.customerTelephone?.includes(lowerSearch) ||
          order.remarks?.toLowerCase().includes(lowerSearch) ||
          order.items?.some(item => item.itemName.toLowerCase().includes(lowerSearch))
      );
      setFilteredSavedOrders(filtered);
  }, [orderSearchTerm, savedOrders]);

  
  // Updated Shortcuts - Added F6 (Advance), F7 (Name)
  useEffect(() => {
    const handleShortcuts = (e) => {
      if (isSaving || showQZPrintModal || isPrintingBrowser || viewOrderModalOpen) return; // Prevent during modals/saving
      
      if (e.altKey && e.key.toLowerCase() === "s") { 
        e.preventDefault(); 
        handleSaveOrder(); 
      }
       if (e.key === "F4") { // Delivery Date
          e.preventDefault(); 
          setCheckoutFocusMode(false); 
          telephoneRef.current?.blur(); 
          remarksRef.current?.blur();
          advanceAmountRef.current?.blur();
          customerNameInputRef.current?.blur();
          deliveryDateTimeRef.current?.focus(); 
      }
       if (e.key === "F5") { // Telephone
          e.preventDefault(); 
          setCheckoutFocusMode(false); 
          deliveryDateTimeRef.current?.blur();
          remarksRef.current?.blur();
          advanceAmountRef.current?.blur();
          customerNameInputRef.current?.blur();
          telephoneRef.current?.focus(); 
       }
        if (e.key === "F6") { // Advance Amount
          e.preventDefault(); 
          setCheckoutFocusMode(false); 
          deliveryDateTimeRef.current?.blur();
          telephoneRef.current?.blur(); 
          remarksRef.current?.blur();
          customerNameInputRef.current?.blur();
          advanceAmountRef.current?.focus(); 
      }
       if (e.key === "F7") { // Manual Customer Name
          e.preventDefault(); 
          setCheckoutFocusMode(false); 
          deliveryDateTimeRef.current?.blur();
          telephoneRef.current?.blur(); 
          remarksRef.current?.blur();
          advanceAmountRef.current?.blur();
          customerNameInputRef.current?.focus(); 
      }
      // F8 could be Remarks
      if (e.key === "F10") { // Checkout List
        e.preventDefault(); 
        deliveryDateTimeRef.current?.blur();
        telephoneRef.current?.blur();
        remarksRef.current?.blur();
        advanceAmountRef.current?.blur();
        customerNameInputRef.current?.blur();
        setCheckoutFocusMode(prev => !prev); 
      }
       if (e.key === 'Escape') { 
          e.preventDefault(); 
          // Close dropdown or exit focus mode
          if (showDropdown) {
              setShowDropdown(false);
          } else if (checkoutFocusMode) {
              setCheckoutFocusMode(false); 
          } else {
              // Optionally blur currently focused input
              if(document.activeElement instanceof HTMLElement) document.activeElement.blur();
          }
        }
    };
    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, [checkout, selectedCustomer, shiftProductionEnabled, selectedShift, isSaving, showQZPrintModal, isPrintingBrowser, checkoutFocusMode, showDropdown, viewOrderModalOpen]); 

  // Updated Focus Logic
  useEffect(() => {
    if (checkoutFocusMode) { 
      // Blur all other inputs when checkout is focused
      itemInputRef.current?.blur(); 
      qtyInputRef.current?.blur(); 
      deliveryDateTimeRef.current?.blur();
      telephoneRef.current?.blur();
      remarksRef.current?.blur();
      advanceAmountRef.current?.blur();
      customerNameInputRef.current?.blur();
      setHighlightedCheckoutIndex(checkout.length > 0 ? 0 : -1); 
    }
    else { 
      // Default back to item input unless a specific field was just focused
      const focusedElement = document.activeElement;
      const isOtherInputFocused = [
          deliveryDateTimeRef.current, 
          telephoneRef.current, 
          remarksRef.current,
          advanceAmountRef.current,
          customerNameInputRef.current
      ].includes(focusedElement);

      if (!isOtherInputFocused) {
         itemInputRef.current?.focus(); 
      }
      setHighlightedCheckoutIndex(-1); 
    }
  }, [checkoutFocusMode, checkout.length]);

  // Checkout Navigation (No changes needed)
  useEffect(() => {
    const handleCheckoutNav = (e) => {
        if (!checkoutFocusMode) return;
        if (e.key === 'ArrowDown') { 
          e.preventDefault(); 
          setHighlightedCheckoutIndex(prev => Math.min(prev + 1, checkout.length - 1)); 
        }
        if (e.key === 'ArrowUp') { 
          e.preventDefault(); 
          setHighlightedCheckoutIndex(prev => Math.max(prev - 1, 0)); 
        }
        if (e.key === 'Delete') {
            e.preventDefault();
            if (highlightedCheckoutIndex > -1) {
                removeCheckoutItem(highlightedCheckoutIndex);
                setHighlightedCheckoutIndex(prev => Math.max(0, Math.min(prev, checkout.length - 2)));
            }
        }
        // Escape is handled in the main shortcut listener now
    };
    window.addEventListener('keydown', handleCheckoutNav);
    return () => window.removeEventListener('keydown', handleCheckoutNav);
  }, [checkoutFocusMode, checkout, highlightedCheckoutIndex]);
  
  // Item/Qty handling functions (No changes needed)
  const handleItemKeyDown = (e) => {
    if (e.key === "ArrowDown") { 
      e.preventDefault(); 
      setSelectedIndex(prev => (prev + 1) % filteredItems.length); 
    }
    else if (e.key === "ArrowUp") { 
      e.preventDefault(); 
      setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length); 
    }
    else if (e.key === "Enter") { 
      e.preventDefault(); 
      if (filteredItems[selectedIndex]) handleItemSelect(filteredItems[selectedIndex]); 
    }
     // Escape is handled in the main shortcut listener
  };
  
  const handleItemSelect = (item) => {
    setItemInput(item.itemName);
    setShowDropdown(false);
    setTimeout(() => qtyInputRef.current?.focus(), 50);
  };
  
  const handleQtyKeyDown = (e) => { 
    if (e.key === "Enter") { 
      e.preventDefault(); 
      addItemToCheckout(); 
    } 
  };
  
  const handleQtyChange = (e) => {
    const value = e.target.value;
    if (value === "" || /^[0-9]*\.?[0-9]*$/.test(value)) { 
      setQtyInput(value); 
    }
  };
  
  const addItemToCheckout = () => {
    // Ensure an item is actually selected or found before adding
    let itemData = items.find(i => i.itemName.toLowerCase() === itemInput.toLowerCase());
     if (!itemData && filteredItems[selectedIndex]) { // Fallback to selected index if direct match fails
       itemData = filteredItems[selectedIndex];
     }
    if (!itemData) return alert("Item not found or ambiguous. Please select from the list.");
    if (!qtyInput || isNaN(qtyInput) || qtyInput <= 0) return alert("Please enter a valid quantity.");
   
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
    setSelectedIndex(-1); // Reset index
    itemInputRef.current?.focus();
  };
  
  const removeCheckoutItem = (index) => setCheckout(prev => prev.filter((_, i) => i !== index));

  // Reset Form - Updated for Orders
  const resetForm = async () => {
    await fetchProvisionalOrderNumber(); 
    setCheckout([]);
    setDeliveryDateTime(''); 
    setCustomerTelephone('');
    setRemarks('');
    setAdvanceAmount(''); // Reset advance amount
    setCustomerNameInput(''); // Reset manual name input
    setSelectedCustomer(null); // Clear selected customer from dropdown
    // Keep default customer logic removed for now
    setItemInput(''); // Clear item input as well
    setQtyInput(1);
    itemInputRef.current?.focus();
  };
  
  // Execute Save Order - Transactional save for orders
  const executeSaveOrder = async () => {
    const user = auth.currentUser;
    if (!user) return alert("You are not logged in.");
    
    // Use selectedCustomer's name if available, otherwise use manual input
    const finalCustomerName = selectedCustomer ? selectedCustomer.label : customerNameInput;
    if (!finalCustomerName) return alert("Please select or enter a customer name.");

    setIsSaving(true); 

    try {
      const counterRef = doc(db, user.uid, "counters");
      const ordersColRef = collection(db, user.uid, "orders", "order_list"); 
      const newOrderRef = doc(ordersColRef); 
      
      const finalOrderData = await runTransaction(db, async (transaction) => {
        const today = new Date();
        const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

        const counterDoc = await transaction.get(counterRef);
        const dailyCounter = counterDoc.exists() ? counterDoc.data().orderCounters?.[datePrefix] || 0 : 0; 
        const nextSeq = dailyCounter + 1;
        const newOrdNum = `ORD-${datePrefix}-${String(nextSeq).padStart(4, "0")}`; 

        transaction.set(counterRef, { orderCounters: { [datePrefix]: nextSeq } }, { merge: true }); 

        const orderDataForDb = {
          customerId: selectedCustomer ? selectedCustomer.value : null, // Store ID only if selected from list
          customerName: finalCustomerName, // Use the determined name
          items: checkout, 
          total: total, 
          createdAt: serverTimestamp(), 
          orderNumber: newOrdNum, 
          placedBy: internalUser?.username || "Admin", 
          shift: selectedShift || "",
          deliveryDateTime: deliveryDateTime || "", 
          customerTelephone: customerTelephone || "", 
          remarks: remarks || "", 
          advanceAmount: parseFloat(advanceAmount) || 0, // Save advance amount
          status: "Pending", 
        };
        transaction.set(newOrderRef, orderDataForDb);
        
        return {
           ...orderDataForDb,
           createdAt: new Date(), 
           orderNumber: newOrdNum 
        };
      });
      // --- End of transaction ---

       if (settings?.autoPrintInvoice === true) { 
        setOrderToPrint(finalOrderData); 

        if (settings?.openCashDrawerWithPrint === true) { 
            setShowQZPrintModal(true);
        } else {
            setIsPrintingBrowser(true);
        }
      } else {
        alert("Order saved successfully!");
        await resetForm();
      }

    } catch (error) {
      alert("Failed to save order: " + error.message);
    } finally {
      setIsSaving(false); 
    }
  };
  
  // Save Order handler (replaces handleSaveAttempt)
  const handleSaveOrder = () => {
    // Check manual name input if no customer is selected
    if (!selectedCustomer && !customerNameInput) {
       return alert("Please select or enter a customer name.");
    }
     if (checkout.length === 0) { 
      return alert("Please add items to the order."); 
    }
    if (shiftProductionEnabled && !selectedShift) {
        return alert("Please select a shift before saving the order.");
    }
    executeSaveOrder(); 
  };
  
  // Helper to format date/time
  const formatDateTime = (timestampOrString) => {
      if (!timestampOrString) return 'N/A';
      let date;
      if (timestampOrString.toDate) { // Firestore Timestamp
          date = timestampOrString.toDate();
      } else if (typeof timestampOrString === 'string') { // ISO String
          date = new Date(timestampOrString);
      } else {
          return 'Invalid Date';
      }
      return date.toLocaleString('en-US', { 
          year: 'numeric', month: 'short', day: 'numeric', 
          hour: '2-digit', minute: '2-digit' 
      });
  };

   // Open View Order Modal
   const openViewOrderModal = (order) => {
       setOrderToView(order);
       setViewOrderModalOpen(true);
   };

   // Close View Order Modal
   const closeViewOrderModal = () => {
       setViewOrderModalOpen(false);
       setOrderToView(null);
   };


  const subtotal = checkout.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = subtotal; 
  // Disable save if no customer (selected or manual) or no items
  const isSaveDisabled = (!selectedCustomer && !customerNameInput) || checkout.length === 0 || isSaving; 

  // --- RETURN JSX --- (Restructured)
  return (
    <div style={styles.container}>
      {isSaving && !showQZPrintModal && !isPrintingBrowser && (
        <div style={styles.savingOverlay}>
            <div style={styles.savingSpinner}></div>
            <p>Saving Order...</p> 
        </div>
      )}
      
      {showQZPrintModal && (
        <QZPrintModal 
            order={orderToPrint} 
            companyInfo={settings}
            isQzReady={isQzReady}
            onClose={async () => { 
                setShowQZPrintModal(false);
                setOrderToPrint(null);
                await resetForm(); 
            }}
        />
      )}
      
      {isPrintingBrowser && orderToPrint && (
        <BrowserPrintComponent
            order={orderToPrint} 
            companyInfo={settings}
            onPrintFinished={async () => { 
                setIsPrintingBrowser(false);
                setOrderToPrint(null);
                await resetForm(); 
            }}
        />
      )}

      {/* Removed Fullscreen Button */}
      
      {/* Order Creation Section */}
      <div style={styles.formSection}>
          <h2 style={styles.sectionTitle}>Create New Order</h2>
          <div style={styles.header}>
              {/* Order #, Shift, Placed By */}
             <div style={{textAlign: 'left'}}>
              <div style={styles.invoiceLabel}>ORDER #</div> 
              <div style={styles.invoiceNumber}>{orderNumber}</div> 
            </div>
            {shiftProductionEnabled && (
                <div style={{textAlign: 'center'}}>
                  <label style={styles.invoiceLabel}>SHIFT</label>
                  <select 
                    value={selectedShift} 
                    onChange={e => setSelectedShift(e.target.value)} 
                    style={styles.shiftSelect}
                  >
                    <option value="">Select Shift</option>
                    {availableShifts.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
            )}
            <div style={{textAlign: 'right'}}>
              <div style={styles.invoiceLabel}>PLACED BY</div> 
              <div style={styles.invoiceNumber}>{internalUser?.username || 'Admin'}</div>
            </div>
          </div>

          {/* Customer Details Grid */}
          <div style={styles.customerGrid}>
              {/* Select Customer */}
              <div>
                  <label style={styles.label}>SELECT CUSTOMER (Optional)</label>
                  <Select 
                    options={customers} 
                    value={selectedCustomer} 
                    onChange={setSelectedCustomer} 
                    placeholder="Select existing customer..."
                    isClearable 
                  />
              </div>
               {/* Manual Customer Name */}
               <div>
                  <label style={styles.label}>CUSTOMER NAME* (F7)</label>
                  <input 
                    ref={customerNameInputRef}
                    type="text" 
                    value={customerNameInput} 
                    onChange={e => setCustomerNameInput(e.target.value)} 
                    placeholder="Enter customer name" 
                    style={styles.input}
                    disabled={!!selectedCustomer} // Disable if selected from dropdown
                  />
              </div>
               {/* Telephone */}
               <div>
                  <label style={styles.label}>TELEPHONE (F5)</label>
                  <input 
                    ref={telephoneRef}
                    type="tel" 
                    value={customerTelephone} 
                    onChange={e => setCustomerTelephone(e.target.value)} 
                    placeholder="Customer phone..." 
                    style={styles.input}
                  />
              </div>
              {/* Delivery Date */}
              <div>
                 <label style={styles.label}>DELIVERY DATE/TIME (F4)</label>
                 <input
                     ref={deliveryDateTimeRef}
                     type="datetime-local"
                     value={deliveryDateTime}
                     onChange={e => setDeliveryDateTime(e.target.value)}
                     style={styles.input}
                 />
             </div>
             {/* Advance Amount */}
             <div>
                <label style={styles.label}>ADVANCE AMOUNT (Rs.) (F6)</label>
                <input 
                    ref={advanceAmountRef}
                    type="number"
                    step="0.01" 
                    value={advanceAmount} 
                    onChange={e => setAdvanceAmount(e.target.value)} 
                    placeholder="0.00" 
                    style={styles.input}
                />
            </div>
             {/* Remarks */}
             <div style={{gridColumn: 'span 2'}}> {/* Span 2 columns */}
                 <label style={styles.label}>REMARKS</label>
                 <input
                     ref={remarksRef}
                     type="text"
                     value={remarks}
                     onChange={e => setRemarks(e.target.value)}
                     placeholder="Any special instructions..."
                     style={styles.input}
                 />
             </div>
          </div>
          
          {/* Item Entry Section */}
           <div style={styles.itemEntrySection}>
            {/* ... (Item input, Qty, Add button) ... */}
            <div style={{position: 'relative', flex: 1}}>
            <label style={styles.label}>ADD ITEM</label>
            <input 
              ref={itemInputRef} 
              value={itemInput} 
              onChange={e => setItemInput(e.target.value)} 
              onKeyDown={handleItemKeyDown} 
              placeholder="Type item name, SKU, or scan barcode..." 
              style={styles.input}
            />
            {showDropdown && filteredItems.length > 0 && (
              <ul style={styles.dropdown}>
                {filteredItems.map((i, idx) => (
                  <li 
                    key={i.id} 
                    style={{
                      ...styles.dropdownItem, 
                      ...(idx === selectedIndex ? styles.dropdownItemSelected : {})
                    }} 
                    onClick={() => handleItemSelect(i)}
                  >
                    {i.itemName} 
                    <span style={styles.dropdownPrice}>Rs. {i.price.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div style={{width: '120px'}}>
            <label style={styles.label}>QTY</label>
            <input 
              ref={qtyInputRef} 
              value={qtyInput} 
              onChange={handleQtyChange} 
              onKeyDown={handleQtyKeyDown} 
              onFocus={(e) => e.target.select()} 
              type="text" 
              inputMode="decimal" 
              style={styles.input}
            />
          </div>
          <button onClick={addItemToCheckout} style={styles.addButton}>ADD</button>
          </div>

          {/* Checkout Summary */}
          <div style={styles.checkoutSummary}>
              <h3 style={styles.checkoutTitle}>ORDER SUMMARY (F10)</h3>
              <div style={styles.tableContainer}>
                 {/* ... (Checkout Table) ... */}
                 <table style={styles.table}>
                   <thead>
                    <tr>
                      <th style={styles.th}>ITEM</th>
                      <th style={styles.th}>QTY</th>
                      <th style={styles.th}>TOTAL</th>
                      <th style={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {checkout.length === 0 ? (
                      <tr>
                        <td colSpan="4" style={styles.emptyState}>No items added</td>
                      </tr>
                    ) : (
                      checkout.map((c, idx) => (
                        <tr key={idx} style={idx === highlightedCheckoutIndex ? styles.highlightedRow : {}}>
                          <td style={styles.td}>{c.itemName}</td>
                          <td style={styles.td}>{c.quantity}</td>
                          <td style={styles.td}>Rs. {(c.price * c.quantity).toFixed(2)}</td>
                          <td style={styles.td}>
                            <button onClick={() => removeCheckoutItem(idx)} style={styles.removeButton}>✕</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {/* Totals Section */}
               <div style={styles.totalsSection}>
                <div style={styles.totalRow}>
                  <span>Subtotal</span>
                  <span>Rs. {subtotal.toFixed(2)}</span>
                </div>
                <div style={styles.grandTotalRow}>
                  <span>TOTAL</span>
                  <span>Rs. {total.toFixed(2)}</span>
                </div>
              </div>
          </div>

          {/* Save Button */}
          <button 
              onClick={handleSaveOrder} 
              disabled={isSaveDisabled} 
              style={{
                ...styles.saveButton, 
                ...(isSaveDisabled ? styles.saveButtonDisabled : {}),
                marginTop: '20px' // Add margin to separate from summary
              }}
            >
              {isSaving ? 'SAVING ORDER...' : 'SAVE ORDER (ALT+S)'} 
          </button>
          
          {/* Shortcuts Help */}
           <div style={styles.shortcutsHelp}>
            <h4 style={styles.shortcutsTitle}>Keyboard Shortcuts</h4>
            <div style={styles.shortcutRow}>
                <div style={styles.shortcutItem}><b>F4:</b> Delivery Date</div>
                <div style={styles.shortcutItem}><b>F5:</b> Telephone</div>
                <div style={styles.shortcutItem}><b>F6:</b> Advance Amt</div>
            </div>
            <div style={styles.shortcutRow}>
                <div style={styles.shortcutItem}><b>F7:</b> Customer Name</div>
                <div style={styles.shortcutItem}><b>F10:</b> Item List Nav</div>
                <div style={styles.shortcutItem}><b>Alt+S:</b> Save</div>
            </div>
             <div style={styles.shortcutRow}>
                <div style={styles.shortcutItem}><b>Esc:</b> Exit Mode/Dropdown</div>
            </div>
           </div>
      </div>

      {/* Saved Orders Section */}
      <div style={styles.savedOrdersSection}>
          <h2 style={styles.sectionTitle}>Saved Orders</h2>
          <div style={styles.searchContainer}>
              <AiOutlineSearch style={styles.searchIcon} />
              <input 
                  type="text" 
                  placeholder="Search by Order #, Customer Name, Phone, Item..." 
                  value={orderSearchTerm}
                  onChange={e => setOrderSearchTerm(e.target.value)}
                  style={styles.searchInput} 
              />
          </div>

          <div style={styles.ordersTableContainer}>
              {ordersLoading ? (
                  <p style={styles.loadingText}>Loading orders...</p>
              ) : filteredSavedOrders.length === 0 ? (
                  <p style={styles.emptyState}>No orders found.</p>
              ) : (
                  <table style={styles.ordersTable}>
                      <thead>
                          <tr>
                              <th style={styles.ordersTh}>Order #</th>
                              <th style={styles.ordersTh}>Customer</th>
                              <th style={styles.ordersTh}>Phone</th>
                              <th style={styles.ordersTh}>Delivery Date</th>
                              <th style={styles.ordersTh}>Total</th>
                              <th style={styles.ordersTh}>Advance</th>
                              <th style={styles.ordersTh}>Balance</th>
                              <th style={styles.ordersTh}>Status</th>
                              <th style={styles.ordersTh}>Actions</th>
                          </tr>
                      </thead>
                      <tbody>
                          {filteredSavedOrders.map(order => (
                              <tr key={order.id}>
                                  <td style={styles.ordersTd}>{order.orderNumber}</td>
                                  <td style={styles.ordersTd}>{order.customerName}</td>
                                  <td style={styles.ordersTd}>{order.customerTelephone || '-'}</td>
                                  <td style={styles.ordersTd}>{formatDateTime(order.deliveryDateTime)}</td>
                                  <td style={styles.ordersTd}>{(order.total || 0).toFixed(2)}</td>
                                  <td style={styles.ordersTd}>{(order.advanceAmount || 0).toFixed(2)}</td>
                                  <td style={styles.ordersTd}>{((order.total || 0) - (order.advanceAmount || 0)).toFixed(2)}</td>
                                  <td style={styles.ordersTd}>
                                    <span style={{...styles.statusBadge, ...(order.status === 'Pending' ? styles.statusPending : styles.statusCompleted)}}>
                                        {order.status}
                                    </span>
                                  </td>
                                  <td style={styles.ordersTd}>
                                      <button onClick={() => openViewOrderModal(order)} style={styles.actionButton} title="View Details"><AiOutlineEye /></button>
                                      {/* Add Print/Delete buttons if needed */}
                                      {/* <button style={styles.actionButton} title="Print"><AiOutlinePrinter /></button> */}
                                      {/* <button style={{...styles.actionButton, ...styles.deleteAction}} title="Delete"><AiOutlineDelete /></button> */}
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              )}
          </div>
      </div>

       {/* View Order Modal */}
       {viewOrderModalOpen && orderToView && (
           <div style={styles.confirmOverlay} onClick={closeViewOrderModal}>
                <div style={{...styles.confirmPopup, width: '90%', maxWidth: '700px', textAlign: 'left'}} onClick={(e) => e.stopPropagation()}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
                        <h4 style={{margin: 0}}>Order Details: {orderToView.orderNumber}</h4>
                        <button onClick={closeViewOrderModal} style={styles.modalCloseButtonPlain}>&times;</button>
                    </div>
                    {/* Reuse PrintableLayout for content consistency */}
                    <div style={{ maxHeight: '60vh', overflowY: 'auto', border: '1px solid #eee', padding: '10px', borderRadius: '4px'}}>
                       <PrintableLayout order={orderToView} companyInfo={settings} />
                    </div>
                     <div style={{marginTop: '20px', textAlign: 'right'}}>
                        <button onClick={closeViewOrderModal} style={styles.closeButton}>Close</button>
                    </div>
                </div>
           </div>
       )}

    </div>
  );
};

// --- STYLES --- (Updated and Restructured)
const styles = {
    // Main container and layout
    container: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)', backgroundColor: '#f3f4f6', fontFamily: "'Inter', sans-serif", padding: '20px', gap: '20px', overflow: 'hidden' }, // Added overflow hidden
    formSection: { backgroundColor: 'white', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflowY: 'auto', flexShrink: 0 }, // Allow form to scroll if needed, prevent shrinking initially
    savedOrdersSection: { backgroundColor: 'white', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }, // Grow to fill space, hide overflow
    sectionTitle: { fontSize: '20px', fontWeight: '700', color: '#1f2937', marginBottom: '15px', borderBottom: '1px solid #eee', paddingBottom: '10px' },

    // Header within Form
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid #eee' },
    invoiceLabel: { fontSize: '12px', color: '#6b7280', fontWeight: '600' },
    invoiceNumber: { fontSize: '18px', fontWeight: '700', color: '#1f2937' },
    shiftSelect: { border: '1px solid #d1d5db', borderRadius: '6px', padding: '4px 8px', fontSize: '14px', fontWeight: '600' },
    
    // Customer Grid
    customerGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px 20px', marginBottom: '20px' },
    label: { display: 'block', fontSize: '12px', fontWeight: '600', color: '#4b5563', marginBottom: '6px' },
    input: { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' },

    // Item Entry
    itemEntrySection: { display: 'flex', gap: '10px', alignItems: 'flex-end', margin: '20px 0', paddingTop: '15px', borderTop: '1px solid #eee' },
    dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #d1d5db', borderRadius: '0 0 6px 6px', maxHeight: '150px', overflowY: 'auto', zIndex: 100, listStyle: 'none', margin: '2px 0 0 0', padding: 0, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' },
    dropdownItem: { padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', fontSize: '13px' },
    dropdownItemSelected: { backgroundColor: '#e0e7ff', color: '#3730a3' },
    dropdownPrice: { color: '#6b7280', fontSize: '11px' },
    addButton: { padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', height: '40px' }, // Match input height

    // Checkout Summary within Form
    checkoutSummary: { marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '15px' },
    checkoutTitle: { fontSize: '16px', fontWeight: '700', marginBottom: '10px', color: '#111827' },
    tableContainer: { maxHeight: '200px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px', marginBottom: '15px' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontSize: '11px', fontWeight: '600', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', position: 'sticky', top: 0 },
    td: { padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontSize: '13px' },
    highlightedRow: { backgroundColor: '#dbeafe' },
    emptyState: { textAlign: 'center', color: '#9ca3af', padding: '15px', fontSize: '13px' },
    removeButton: { background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px' },
    totalsSection: { padding: '10px 0 0 0' }, // Reduced padding
    totalRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '13px' },
    grandTotalRow: { display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '18px', color: '#16a34a', paddingTop: '6px', marginTop: '6px', borderTop: '1px solid #e5e7eb' },
    
    // Save Button
    saveButton: { width: '100%', padding: '12px', backgroundColor: '#2563eb', color: 'white', border: 'none', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '6px' },
    saveButtonDisabled: { backgroundColor: '#9ca3af', cursor: 'not-allowed' },

    // Shortcuts Help
    shortcutsHelp: { backgroundColor: '#f9fafb', padding: '12px', borderRadius: '6px', border: '1px solid #e5e7eb', marginTop: '20px', fontSize: '11px', color: '#4b5563' },
    shortcutsTitle: { fontWeight: 'bold', marginBottom: '6px', color: '#111827', fontSize: '12px' },
    shortcutRow: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px'},
    shortcutItem: { flexBasis: '30%' }, // Distribute items

    // Saved Orders Section Styles
    searchContainer: { position: 'relative', marginBottom: '15px' },
    searchIcon: { position: 'absolute', top: '50%', left: '12px', transform: 'translateY(-50%)', color: '#9ca3af' },
    searchInput: { width: '100%', padding: '10px 12px 10px 36px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' },
    ordersTableContainer: { flexGrow: 1, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px' }, // Allow table to scroll
    ordersTable: { width: '100%', borderCollapse: 'collapse' },
    ordersTh: { padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontSize: '11px', fontWeight: '600', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', position: 'sticky', top: 0 },
    ordersTd: { padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontSize: '13px', whiteSpace: 'nowrap' }, // Prevent wrap
    statusBadge: { fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '12px', textTransform: 'uppercase' },
    statusPending: { color: '#d97706', backgroundColor: '#fef3c7' }, // Amber
    statusCompleted: { color: '#059669', backgroundColor: '#d1fae5' }, // Green
    actionButton: { background: 'transparent', border: 'none', cursor: 'pointer', padding: '5px', margin: '0 3px', color: '#6b7280' },
    deleteAction: { color: '#ef4444' },
    loadingText: { textAlign: 'center', padding: '20px', color: '#6b7280' },

    // Modals (General)
    confirmOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 },
    confirmPopup: { backgroundColor: 'white', padding: '24px', borderRadius: '8px', textAlign: 'center', boxShadow: '0 5px 15px rgba(0,0,0,0.3)', width: 'auto', minWidth: '400px' },
    modalCloseButtonPlain: { background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#9ca3af'},


    // QZ Modal Specific
    qzStatus: { padding: '15px', margin: '15px 0', backgroundColor: '#f3f4f6', borderRadius: '6px', textAlign: 'left' },
    qzControls: { textAlign: 'left', marginTop: '10px' },
    closeButton: { marginTop: '15px', padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' },
    savingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 3000, color: '#1f2937', fontSize: '18px', fontWeight: '600' },
    savingSpinner: { border: '4px solid #f3f4f6', borderTop: '4px solid #3b82f6', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', marginBottom: '16px' },
    activeCard: { borderColor: '#3b82f6' }, // Added from invoice styles for consistency if needed
};

// printStyles (Mostly reused, added remarks and advance)
const printStyles = {
    invoiceBox: { padding: '3mm', color: '#000', boxSizing: 'border-box', fontFamily: "'Courier New', monospace'"}, 
    logoContainer: { textAlign: 'center', marginBottom: '5px'},
    logo: { maxWidth: '80px', maxHeight: '80px', display: 'inline-block' }, 
    companyNameText: { fontSize: '1.4em', margin: '5px 0 5px 0', fontWeight: 'bold', textAlign: 'center', lineHeight: '1.5' },
    headerText: { margin: '4px 0', fontSize: '0.9em', textAlign: 'center', lineHeight: '1.5' },
    metaSection: { borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '10px 0', margin: '15px 0' },
    metaText: { margin: '3px 0', fontSize: '0.9em', lineHeight: '1.4' },
    remarksSection: { marginTop: '10px', marginBottom: '10px'},
    remarksText: { margin: '3px 0', fontSize: '0.9em', lineHeight: '1.4' },
    itemsTable: { width: '100%', borderCollapse: 'collapse', marginTop: '10px' }, 
    th: { borderTop: '1px solid #000', borderBottom: '1px solid #000', padding: '6px 4px', fontSize: '0.9em', textAlign: 'right'},
    thItem: { textAlign: 'left', width: '45%' },
    thQty: { textAlign: 'center', width: '15%' },
    thRate: { textAlign: 'right', width: '20%' },
    thTotal: { textAlign: 'right', width: '20%' },
    td: { padding: '6px 4px', borderBottom: '1px dotted #ccc', fontSize: '0.9em', lineHeight: '1.4', verticalAlign: 'top' },
    tdItem: { textAlign: 'left' },
    tdQty: { textAlign: 'center' },
    tdRate: { textAlign: 'right' },
    tdTotal: { textAlign: 'right' },
    totalsSection: { marginTop: '15px', paddingTop: '10px', borderTop: '1px solid #000' },
    totalRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.95em', lineHeight: '1.5' },
    grandTotalRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '1.1em', fontWeight: 'bold', borderTop: '1px dashed #000', marginTop: '5px' },
    balanceRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '1em', fontWeight: 'bold'}, // Style for balance
    dashedLine: { borderTop: '1px dashed #000', margin: '10px 0' },
    footer: { textAlign: 'center', marginTop: '15px', paddingTop: '10px', borderTop: '1px solid #000', fontSize: '0.8em', lineHeight: '1.5' },
    creditFooter: { textAlign: 'center', marginTop: '10px', fontSize: '0.7em', color: '#777', lineHeight: '1.5' },
};

// Add animation keyframes
const styleSheet = document.createElement("style");
styleSheet.innerText = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
document.head.appendChild(styleSheet);


export default Orders;

