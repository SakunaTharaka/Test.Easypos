/* global qz */
import React, { useEffect, useState, useRef, useCallback } from "react";
import { auth, db } from "../firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  // addDoc has been removed as we now use transaction.set
  query,
  where,
  serverTimestamp,
  runTransaction
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import Select from "react-select";

// PrintableLayout component (No changes)
// PrintableLayout component - Unified for both print modes
const PrintableLayout = ({ invoice, companyInfo, onImageLoad }) => {
    if (!invoice || !Array.isArray(invoice.items)) return null;
    const subtotal = invoice.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalBeforeReceived = subtotal + (invoice.deliveryCharge || 0);
    const balanceToDisplay = invoice.received === 0 ? 0 : invoice.received - totalBeforeReceived;
    const createdAtDate = invoice.createdAt instanceof Date ? invoice.createdAt : invoice.createdAt?.toDate();
  
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
        
        {/* Invoice Meta Info */}
        <div style={printStyles.metaSection}>
          <p style={printStyles.metaText}><strong>Invoice #:</strong> {invoice.invoiceNumber}</p>
          <p style={printStyles.metaText}><strong>Date:</strong> {createdAtDate?.toLocaleDateString()}</p>
          <p style={printStyles.metaText}><strong>Customer:</strong> {invoice.customerName}</p>
          <p style={printStyles.metaText}><strong>Issued By:</strong> {invoice.issuedBy}</p>
        </div>
        
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
            {invoice.items.map((item, index) => (
              <tr key={index}>
                <td style={printStyles.tdItem}>{item.itemName}</td>
                <td style={printStyles.tdQty}>{item.quantity}</td>
                <td style={printStyles.tdRate}>{item.price.toFixed(2)}</td>
                <td style={printStyles.tdTotal}>{(item.quantity * item.price).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {/* Totals Section */}
        <div style={printStyles.totalsSection}>
          <div style={printStyles.totalRow}>
            <span>Subtotal:</span>
            <span>Rs. {subtotal.toFixed(2)}</span>
          </div>
          
          {invoice.deliveryCharge > 0 && (
            <div style={printStyles.totalRow}>
              <span>Delivery:</span>
              <span>Rs. {invoice.deliveryCharge.toFixed(2)}</span>
            </div>
          )}
          
          <div style={printStyles.grandTotalRow}>
            <span>Grand Total:</span>
            <span>Rs. {invoice.total.toFixed(2)}</span>
          </div>
          
          <div style={printStyles.dashedLine}></div>
          
          <div style={printStyles.totalRow}>
            <span>Amount Received:</span>
            <span>Rs. {invoice.received.toFixed(2)}</span>
          </div>
          
          <div style={printStyles.balanceRow}>
            <span>Balance:</span>
            <span>Rs. {balanceToDisplay.toFixed(2)}</span>
          </div>
        </div>
        
        <div style={printStyles.dashedLine}></div>
        
        {/* Footer */}
        <div style={printStyles.footer}>
          <p>Thank you for your business!</p>
        </div>
        
        {/* Credit Footer */}
        <div style={printStyles.creditFooter}>
          <p>Wayne Software Solutions | 078 722 3407</p>
        </div>
      </div>
    );
};

// BrowserPrintComponent (No changes)
const BrowserPrintComponent = ({ invoice, companyInfo, onPrintFinished }) => {
    const [isImageLoaded, setIsImageLoaded] = useState(!companyInfo?.companyLogo);
    const isPrintReady = invoice && (isImageLoaded || !companyInfo?.companyLogo);

    useEffect(() => {
        document.body.classList.add('print-modal-active');
        return () => {
            document.body.classList.remove('print-modal-active');
        };
    }, []);

    useEffect(() => {
        // --- THIS IS THE FIXED CSS ---
        const printStylesCSS = `
            @page {
                /* This removes the printer's default margin. */
                margin: 0;
                size: 80mm auto;
            }
            
            /* Force removal of all default margins everywhere */
            * {
                margin: 0 !important;
                padding: 0 !important;
            }
            
            @media print {
                /* Reset body styles for printing */
                body {
                    background-color: #fff !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                
                html {
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
                    position: fixed !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    display: block !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                
                /* Clean up the inner container styles */
                .print-area-container {
                    box-shadow: none !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    width: 100% !important;
                    transform: none !important;
                }
                
                .print-area {
                    margin: 0 !important;
                    padding: 0 !important;
                }
                .no-print {
                    display: none !important;
                }
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

    // --- THIS IS THE FIXED JSX (HTML) ---
    return (
        <div className="print-preview-overlay" style={styles.confirmOverlay}>
            {/* This structure matches the .txt file and removes padding */}
            <div className="print-area-container" style={{ width: '80mm', background: 'white', padding: '0', margin: '0' }}>
                <div className="no-print" style={{ textAlign: 'center', padding: '10px', background: '#eee', marginBottom: '10px', borderRadius: '4px' }}>
                    {isPrintReady ? 'Printing... (Press ESC to cancel)' : 'Loading preview...'}
                </div>
                <div className="print-area">
                    {invoice ? 
                        <PrintableLayout 
                            invoice={invoice} 
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

// QZ Tray Print Modal (No changes)
const QZPrintModal = ({ invoice, companyInfo, onClose, isQzReady }) => {
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

            const drawerCommand = '\x1B\x70\x00\x19\xFA'; 
            await qz.print(config, [drawerCommand]);

            alert('Print successful and drawer kicked!');
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
                           {isPrinting ? 'Printing...' : 'Print & Open Drawer'}
                        </button>
                    </div>
                )}
                
                {autoPrintingStatus && (
                     <div style={styles.savingSpinner}></div>
                )}

                <button onClick={onClose} style={styles.closeButton}>Cancel</button>
                
                <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }} ref={printableRef}>
                   {invoice && <PrintableLayout invoice={invoice} companyInfo={companyInfo} />}
                </div>
            </div>
        </div>
    );
};

// Main Invoice Component
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
  const [invoiceNumber, setInvoiceNumber] = useState(""); // This is now the PROVISIONAL number
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
  
  const [showQZPrintModal, setShowQZPrintModal] = useState(false);
  const [invoiceToPrint, setInvoiceToPrint] = useState(null);
  const [isQzReady, setIsQzReady] = useState(false);
  
  const [deliveryCharge, setDeliveryCharge] = useState("");
  const deliveryChargeRef = useRef(null);
  const [deliveryChargeMode, setDeliveryChargeMode] = useState(false);
  
  const [isPrintingBrowser, setIsPrintingBrowser] = useState(false);

  const containerRef = useRef(null);
  const itemInputRef = useRef(null);
  const qtyInputRef = useRef(null);
  const receivedAmountRef = useRef(null);
  
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

  // Fullscreen logic (No change)
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

  // --- *** FIXED LOGIC *** ---
  // New function to FETCH the next number for display, without writing.
  const fetchProvisionalInvoiceNumber = async () => {
    const user = auth.currentUser;
    if (!user) {
        setInvoiceNumber("INV-ERROR");
        return;
    }
    const today = new Date();
    const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const counterRef = doc(db, user.uid, "counters");
    try {
        // Just READ the doc, don't use a transaction
        const counterDoc = await getDoc(counterRef); 
        const dailyCounter = counterDoc.exists() ? counterDoc.data().invoiceCounters?.[datePrefix] || 0 : 0;
        const nextSeq = dailyCounter + 1; // This is the provisional next number
        const provisionalInvNum = `INV-${datePrefix}-${String(nextSeq).padStart(4, "0")}`;
        setInvoiceNumber(provisionalInvNum); // Set for display
    } catch (err) {
        console.error("Error fetching provisional invoice number:", err);
        setInvoiceNumber(`INV-${datePrefix}-ERR`);
    }
  };

  // Old `generateInvoiceNumber` function is REMOVED.
  
  // useEffect on load
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid;
    const initialize = async () => {
      // --- *** FIXED LOGIC *** ---
      // Fetch the provisional number for display
      await fetchProvisionalInvoiceNumber(); 
      
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
  
  // Other hooks (no changes)
  useEffect(() => {
    if (selectedShift) {
        localStorage.setItem('savedSelectedShift', selectedShift);
    }
  }, [selectedShift]);

  useEffect(() => {
    const fetchItemsForCustomer = async () => {
      const user = auth.currentUser;
      if (!selectedCustomer || !user) { 
        setItems([]); 
        return; 
      }
      const pricedItemsColRef = collection(db, user.uid, "price_categories", "priced_items");
      const q = query(pricedItemsColRef, where("categoryId", "==", selectedCustomer.priceCategoryId));
      const itemsSnap = await getDocs(q);
      setItems(itemsSnap.docs.map(d => ({ ...d.data(), id: d.id })));
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

  useEffect(() => {
    const handleShortcuts = (e) => {
      if (showPaymentConfirm || isSaving || showQZPrintModal || isPrintingBrowser) return;
      if (e.altKey && e.key.toLowerCase() === "s") { 
        e.preventDefault(); 
        handleSaveAttempt(); 
      }
      if (e.key === "F2") { 
        e.preventDefault(); 
        setCheckoutFocusMode(false); 
        setDeliveryChargeMode(false); 
        setAmountReceivedMode(prev => !prev); 
      }
      if (e.key === "F10") { 
        e.preventDefault(); 
        setAmountReceivedMode(false); 
        setDeliveryChargeMode(false); 
        setCheckoutFocusMode(prev => !prev); 
      }
      if (e.key === "F5") { 
          e.preventDefault(); 
          setCheckoutFocusMode(false); 
          setAmountReceivedMode(false); 
          setDeliveryChargeMode(prev => !prev); 
      }
    };
    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, [checkout, selectedCustomer, shiftProductionEnabled, selectedShift, showPaymentConfirm, isSaving, showQZPrintModal, isPrintingBrowser]);

  useEffect(() => {
    if (amountReceivedMode) { 
      receivedAmountRef.current?.focus(); 
      receivedAmountRef.current?.select(); 
    }
    else if (deliveryChargeMode) { 
      deliveryChargeRef.current?.focus(); 
      deliveryChargeRef.current?.select(); 
    }
    else if (checkoutFocusMode) { 
      itemInputRef.current?.blur(); 
      qtyInputRef.current?.blur(); 
      receivedAmountRef.current?.blur(); 
      setHighlightedCheckoutIndex(checkout.length > 0 ? 0 : -1); 
    }
    else { 
      itemInputRef.current?.focus(); 
      setHighlightedCheckoutIndex(-1); 
    }
  }, [amountReceivedMode, checkoutFocusMode, deliveryChargeMode, checkout.length]);

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
        if (e.key === 'Escape') { 
          e.preventDefault(); 
          setCheckoutFocusMode(false); 
        }
    };
    window.addEventListener('keydown', handleCheckoutNav);
    return () => window.removeEventListener('keydown', handleCheckoutNav);
  }, [checkoutFocusMode, checkout, highlightedCheckoutIndex]);
  
  // Item/Qty handling functions (No changes)
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

  // --- *** FIXED LOGIC *** ---
  // resetForm now calls the new read-only function
  const resetForm = async () => {
    await fetchProvisionalInvoiceNumber(); // Get next provisional number
    setCheckout([]);
    setReceivedAmount("");
    setDeliveryCharge(""); 
    itemInputRef.current?.focus();
  };
  
  // --- *** FIXED LOGIC *** ---
  // executeSaveInvoice is now a single atomic transaction
  const executeSaveInvoice = async (finalPaymentMethod) => {
    const user = auth.currentUser;
    if (!user) return alert("You are not logged in.");
    
    setIsSaving(true); 
    setShowPaymentConfirm(false);

    try {
      // --- This is the new transactional logic ---
      const counterRef = doc(db, user.uid, "counters");
      const invoicesColRef = collection(db, user.uid, "invoices", "invoice_list");
      const newInvoiceRef = doc(invoicesColRef); // Create a ref for the new invoice
      
      const finalInvoiceData = await runTransaction(db, async (transaction) => {
        const today = new Date();
        const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

        // 1. Read the counter
        const counterDoc = await transaction.get(counterRef);
        const dailyCounter = counterDoc.exists() ? counterDoc.data().invoiceCounters?.[datePrefix] || 0 : 0;
        const nextSeq = dailyCounter + 1;
        const newInvNum = `INV-${datePrefix}-${String(nextSeq).padStart(4, "0")}`;

        // 2. Write the new counter
        transaction.set(counterRef, { invoiceCounters: { [datePrefix]: nextSeq } }, { merge: true });

        // 3. Prepare and write the new invoice
        const invoiceDataForDb = {
          customerId: selectedCustomer.value, 
          customerName: selectedCustomer.label,
          items: checkout, 
          total: total, 
          deliveryCharge: Number(deliveryCharge) || 0,
          received: selectedCustomer.isCreditCustomer ? 0 : (Number(receivedAmount) || 0),
          balance: selectedCustomer.isCreditCustomer ? total : balance,
          createdAt: serverTimestamp(), // Use server timestamp for DB
          invoiceNumber: newInvNum, // <-- Use the new, guaranteed-unique number
          issuedBy: internalUser?.username || "Admin", 
          shift: selectedShift || "",
          paymentMethod: finalPaymentMethod,
        };
        transaction.set(newInvoiceRef, invoiceDataForDb);
        
        // Return the data needed for printing
        return {
           ...invoiceDataForDb,
           createdAt: new Date(), // Use client date for immediate printing
           invoiceNumber: newInvNum 
        };
      });
      // --- End of transaction ---

      if (settings?.autoPrintInvoice === true) {
        setInvoiceToPrint(finalInvoiceData); // Use the data returned from the transaction

        if (settings?.openCashDrawerWithPrint === true) {
            setShowQZPrintModal(true);
        } else {
            setIsPrintingBrowser(true);
        }
      } else {
        alert("Invoice saved successfully!");
        await resetForm();
      }
    } catch (error) {
      alert("Failed to save invoice: " + error.message);
      // Don't reset the form, so user can retry saving
    } finally {
      setIsSaving(false); 
    }
  };
  
  // handleSaveAttempt (no change)
  const handleSaveAttempt = () => {
    if (!selectedCustomer || checkout.length === 0) { 
      return alert("Please select a customer and add items."); 
    }
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

  // Payment confirm keydown (no change)
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
  }, [showPaymentConfirm, confirmPaymentMethod, executeSaveInvoice]); // Added executeSaveInvoice to dependency array

  const subtotal = checkout.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = subtotal + (Number(deliveryCharge) || 0);
  const balance = (Number(receivedAmount) || 0) - total; 
  const received = Number(receivedAmount) || 0;
  const displayBalance = received === 0 ? 0 : balance;
  const isSaveDisabled = !selectedCustomer || checkout.length === 0 || (balance < 0 && received > 0);

  // --- RETURN JSX (No changes in structure) ---
  return (
    <div ref={containerRef} style={styles.container}>
      {isSaving && !showQZPrintModal && !isPrintingBrowser && (
        <div style={styles.savingOverlay}>
            <div style={styles.savingSpinner}></div>
            <p>Saving...</p>
        </div>
      )}
      
      {showQZPrintModal && (
        <QZPrintModal 
            invoice={invoiceToPrint} 
            companyInfo={settings}
            isQzReady={isQzReady}
            onClose={() => {
                setShowQZPrintModal(false);
                setInvoiceToPrint(null);
                resetForm(); // Call async function
            }}
        />
      )}
      
      {isPrintingBrowser && invoiceToPrint && (
        <BrowserPrintComponent
            invoice={invoiceToPrint}
            companyInfo={settings}
            onPrintFinished={async () => {
                setIsPrintingBrowser(false);
                setInvoiceToPrint(null);
                await resetForm(); // Call async function
            }}
        />
      )}

      <button onClick={toggleFullscreen} style={styles.fullscreenButton}>
        {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
      </button>
      
      <div style={styles.leftPanel}>
        <div style={styles.header}>
            <div style={{textAlign: 'left'}}>
              <div style={styles.invoiceLabel}>INVOICE #</div>
              <div style={styles.invoiceNumber}>{invoiceNumber}</div>
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
              <div style={styles.invoiceLabel}>ISSUED BY</div>
              <div style={styles.invoiceNumber}>{internalUser?.username || 'Admin'}</div>
            </div>
        </div>
        
        <div style={styles.customerSection}>
          <label style={styles.label}>CUSTOMER</label>
          <Select 
            options={customers} 
            value={selectedCustomer} 
            onChange={setSelectedCustomer} 
            placeholder="Select a customer..."
          />
        </div>
        
        <div style={styles.itemEntrySection}>
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
        
        <div style={styles.shortcutsHelp}>
          <h4 style={styles.shortcutsTitle}>Keyboard Shortcuts</h4>
          <div style={styles.shortcutItem}><b>F2:</b> Focus 'Amount Received'</div>
          <div style={styles.shortcutItem}><b>F5:</b> Focus 'Delivery Charges'</div>
          <div style={styles.shortcutItem}><b>F10:</b> Activate Checkout List (use Arrows + Delete)</div>
          <div style={styles.shortcutItem}><b>Alt + S:</b> Save Invoice</div>
          <div style={styles.shortcutItem}><b>Esc:</b> Exit Modes / Popups</div>
        </div>
      </div>
      
      <div style={styles.rightPanel}>
        <div style={{...styles.checkoutCard, ...(checkoutFocusMode ? styles.activeCard : {})}}>
            <h3 style={styles.checkoutTitle}>CHECKOUT (F10)</h3>
            <div style={styles.tableContainer}>
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
            
            <div style={styles.totalsSection}>
                <div style={styles.totalRow}>
                  <span>Subtotal</span>
                  <span>Rs. {subtotal.toFixed(2)}</span>
                </div>
                {settings?.offerDelivery && (
                    <div style={styles.totalRow}>
                        <label htmlFor="deliveryCharge" style={{cursor: 'pointer'}}>Delivery (F5)</label>
                        <input
                            ref={deliveryChargeRef}
                            id="deliveryCharge"
                            type="number"
                            value={deliveryCharge}
                            onChange={e => setDeliveryCharge(e.target.value)}
                            style={{
                              ...styles.input, 
                              ...styles.deliveryInput, 
                              ...(deliveryChargeMode ? styles.activeInput : {})
                            }}
                            placeholder="0.00"
                        />
                    </div>
                )}
                <div style={styles.grandTotalRow}>
                  <span>TOTAL</span>
                  <span>Rs. {total.toFixed(2)}</span>
                </div>
            </div>
            
            <div style={styles.paymentSection}>
                <label style={styles.label}>AMOUNT RECEIVED (F2)</label>
                <input 
                  ref={receivedAmountRef} 
                  type="number" 
                  value={selectedCustomer?.isCreditCustomer ? '' : receivedAmount} 
                  onChange={e => setReceivedAmount(e.target.value)} 
                  placeholder={selectedCustomer?.isCreditCustomer ? 'CREDIT SALE' : '0.00'} 
                  style={{
                    ...styles.input, 
                    ...styles.amountInput, 
                    ...(amountReceivedMode ? styles.activeInput : {})
                  }} 
                  disabled={selectedCustomer?.isCreditCustomer} 
                />
            </div>
            
            <div style={styles.balanceRow}>
              <span>BALANCE</span>
              <span style={{color: displayBalance >= 0 ? '#10b981' : '#ef4444'}}>
                Rs. {displayBalance.toFixed(2)}
              </span>
            </div>
            
            <button 
              onClick={handleSaveAttempt} 
              disabled={isSaveDisabled || isSaving} 
              style={{
                ...styles.saveButton, 
                ...((isSaveDisabled || isSaving) ? styles.saveButtonDisabled : {})
              }}
            >
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

// Styles (No changes)
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
    qzStatus: { padding: '15px', margin: '15px 0', backgroundColor: '#f3f4f6', borderRadius: '6px', textAlign: 'left' },
    qzControls: { textAlign: 'left', marginTop: '10px' },
    closeButton: { marginTop: '15px', padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }
};

// printStyles (No changes)
const printStyles = {
    invoiceBox: { padding: '3mm', color: '#000', boxSizing: 'border-box', fontFamily: "'Courier New', monospace'"}, 
    logo: { maxWidth: '80px', maxHeight: '80px', marginBottom: '10px', display: 'block', marginLeft: 'auto', marginRight: 'auto' },
    companyNameText: { fontSize: '1.4em', margin: '5px 0 5px 0', fontWeight: 'bold', textAlign: 'center', lineHeight: '1.5' },
    headerText: { margin: '4px 0', fontSize: '0.9em', textAlign: 'center', lineHeight: '1.5' },
    itemsTable: { width: '100%', borderCollapse: 'collapse', marginTop: '20px' },
    th: { borderBottom: '1px solid #000', padding: '8px 6px', textAlign: 'right', background: '#f0f0f0' },
    thItem: { textAlign: 'left' },
    td: { padding: '8px 6px', borderBottom: '1px dotted #ccc', lineHeight: '1.5' },
    tdCenter: { textAlign: 'center' },
    tdRight: { textAlign: 'right' },
    totalsContainer: { width: '100%' },
    totals: { paddingTop: '10px' },
    totalRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '1em', lineHeight: '1.6' },
    hr: { border: 'none', borderTop: '1px dashed #000', margin: '8px 0' },
    footer: { textAlign: 'center', marginTop: '25px', paddingTop: '10px', borderTop: '1px solid #000', fontSize: '0.8em', lineHeight: '1.5' },
    creditFooter: { textAlign: 'center', marginTop: '10px', fontSize: '0.7em', color: '#777', lineHeight: '1.5' },
};

export default Invoice;