/* global qz */
import React, { useEffect, useState, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import { auth, db } from "../firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  runTransaction
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import Select from "react-select";
import "./Invoice.css"; 

// --- CRITICAL PRINT STYLES ---
const printStyles = {
    invoiceBox: { padding: '5px', color: '#000', boxSizing: 'border-box' },
    logo: { maxWidth: '80px', maxHeight: '80px', marginBottom: '10px' },
    companyNameText: { fontSize: '1.4em', margin: '0 0 5px 0', fontWeight: 'bold' },
    headerText: { margin: '2px 0', fontSize: '0.9em' },
    itemsTable: { width: '100%', borderCollapse: 'collapse', marginTop: '20px' },
    totalsContainer: { width: '100%' },
    totals: { paddingTop: '10px' },
    totalRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '1em' },
    hr: { border: 'none', borderTop: '1px dashed #000' },
    footer: { textAlign: 'center', marginTop: '20px', paddingTop: '10px', borderTop: '1px solid #000', fontSize: '0.8em' },
    creditFooter: { textAlign: 'center', marginTop: '10px', fontSize: '0.7em', color: '#777' },
    printTh: { borderBottom: '1px solid #000', padding: '8px', textAlign: 'right', background: '#f0f0f0' },
    thItem: { textAlign: 'left' },
    printTd: { padding: '8px', borderBottom: '1px dotted #ccc' },
    tdCenter: { textAlign: 'center' },
    tdRight: { textAlign: 'right' },
};

const paymentOptions = ['Cash', 'Card', 'Online'];

// 1. PrintableLayout
const PrintableLayout = ({ invoice, companyInfo, onImageLoad, serviceJob, orderDetails }) => {
  if (!invoice || (!Array.isArray(invoice.items) && !serviceJob && !orderDetails)) {
    return null;
  }

  const isSinhala = companyInfo?.useSinhalaInvoice || false;
  const isDoubleLine = companyInfo?.doubleLineInvoiceItem || false; 
  
  const isServiceOrder = invoice.invoiceNumber?.startsWith('SRV');
  const isOrder = invoice.invoiceNumber?.startsWith('ORD');

  const invSubtotal = invoice.items ? invoice.items.reduce((sum, item) => sum + item.price * item.quantity, 0) : 0;
  const deliveryCharge = Number(invoice.deliveryCharge) || 0;
  const serviceCharge = Number(invoice.serviceCharge) || 0;
  const invTotal = invSubtotal + deliveryCharge + serviceCharge;
  
  const dateObj = invoice.createdAt?.toDate ? invoice.createdAt.toDate() : (invoice.createdAt instanceof Date ? invoice.createdAt : new Date());

  const invReceived = invoice.received !== undefined ? Number(invoice.received) : (Number(invoice.advanceAmount) || 0);
  const invBalance = invReceived === 0 ? 0 : (invTotal - invReceived);

  const jobTotal = serviceJob ? Number(serviceJob.totalCharge || 0) : invTotal;
  const jobAdvance = serviceJob ? Number(serviceJob.advanceAmount || 0) : invReceived;
  const jobBalance = jobAdvance === 0 ? 0 : (jobTotal - jobAdvance);

  const orderTotal = orderDetails ? Number(orderDetails.totalAmount || 0) : invTotal;
  const orderAdvance = orderDetails ? Number(orderDetails.advanceAmount || 0) : invReceived;
  const orderBalance = orderAdvance === 0 ? 0 : (orderTotal - orderAdvance);

  const totalSave = invoice.items ? invoice.items.reduce((sum, item) => {
    if(item.isFreeIssue) return sum; 
    const orig = item.originalPrice || item.price;
    return sum + (orig - item.price) * item.quantity;
  }, 0) : 0;

  const formatDate = (dateVal) => {
      if (!dateVal) return 'N/A';
      if (dateVal.toDate) return dateVal.toDate().toLocaleDateString(); 
      return new Date(dateVal).toLocaleDateString();
  };

  const getColumnCount = () => {
      let count = 2; // Qty + Total
      if (invoice.isDiscountable) count += 1; // Original Price
      count += 1; // Rate
      return count; 
  };

  return (
    <div style={printStyles.invoiceBox}>
      <div className="invoice-header-section" style={{ textAlign: 'center' }}>
        <div className="company-details" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {companyInfo?.companyLogo && (
            <img 
                src={companyInfo.companyLogo} 
                style={{ ...printStyles.logo, display: 'block', margin: '0 auto 10px auto' }} 
                alt="Company Logo" 
                onLoad={onImageLoad}
                onError={onImageLoad} 
            />
            )}
            <h1 style={{ ...printStyles.companyNameText, textAlign: 'center', width: '100%' }}>{companyInfo?.companyName || "Your Company"}</h1>
            <p style={{ ...printStyles.headerText, textAlign: 'center', width: '100%' }}>{companyInfo?.companyAddress || "123 Main St, City"}</p>
            {companyInfo?.phone && <p style={{ ...printStyles.headerText, textAlign: 'center', width: '100%' }}>{companyInfo.phone}</p>}
        </div>
        
        <div className="invoice-meta-details" style={{ textAlign: 'center', marginTop: '10px' }}>
            <h3 style={{ marginTop: 0, borderBottom: '2px solid #000', paddingBottom: 5, textAlign: 'center' }}>
                {isServiceOrder ? "SERVICE ORDER" : isOrder ? "CUSTOMER ORDER" : "INVOICE"}
            </h3>
            <div style={{ textAlign: 'left', display: 'inline-block', width: 'auto', minWidth: '200px' }}>
                <p><strong>{isServiceOrder || isOrder ? "Order #:" : "Invoice #:"}</strong> {invoice.invoiceNumber}</p>
                <p><strong>Date:</strong> {dateObj.toLocaleDateString()}</p>
                <p><strong>Customer:</strong> {invoice.customerName}</p>
                {invoice.customerTelephone && <p><strong>Tel:</strong> {invoice.customerTelephone}</p>}
                
                {invoice.paymentMethod === "Dine-in" && <p><strong>Order Type:</strong> Dine-in</p>}

                {isOrder && orderDetails && orderDetails.deliveryDate && (
                    <p style={{marginTop: 5, fontWeight: 'bold'}}>
                        <strong>Delivery Date:</strong> {formatDate(orderDetails.deliveryDate)}
                    </p>
                )}
                {isServiceOrder && serviceJob && (
                    <div style={{marginTop: 10, padding: 8, background: '#f9f9f9', border: '1px dashed #ccc', textAlign: 'left'}}>
                        <p style={{fontSize: '1.1em'}}><strong>Type:</strong> {serviceJob.jobType}</p>
                        <p><strong>Est. Date:</strong> {formatDate(serviceJob.jobCompleteDate)}</p>
                        {serviceJob.generalInfo && (
                            <p style={{marginTop: 5, whiteSpace: 'pre-wrap', fontSize: '0.9em'}}>
                                <strong>Notes:</strong> {serviceJob.generalInfo}
                            </p>
                        )}
                    </div>
                )}
                <p style={{marginTop: 5, fontSize: '0.85em', color: '#555'}}><strong>Issued By:</strong> {invoice.issuedBy}</p>
            </div>
        </div>
      </div>
      
      <div className={isServiceOrder ? "no-print" : ""}>
          {isServiceOrder && <h4 style={{marginTop: 20, marginBottom: 5, color: '#444'}}>Billing Details (Office View)</h4>}
          <table style={printStyles.itemsTable}>
            <thead>
              <tr>
                <th style={{ ...printStyles.printTh, ...printStyles.thItem }}>
                    {isDoubleLine 
                        ? (isSinhala ? "අයිතමය / ප්‍රමාණය" : "Item / Qty") 
                        : (isSinhala ? "අයිතමය" : "Item / Service")
                    }
                </th>
                
                {!isDoubleLine && <th style={printStyles.printTh}>Qty</th>}

                {invoice.isDiscountable && (
                    <th style={printStyles.printTh}>{isSinhala ? "මිල" : "Orig. Price"}</th>
                )}
                <th style={printStyles.printTh}>
                    {invoice.isDiscountable 
                        ? (isSinhala ? "අපේ මිල" : "Our Price") 
                        : (isSinhala ? "මිල" : "Rate")
                    }
                </th>
                <th style={printStyles.printTh}>{isSinhala ? "එකතුව" : "Total"}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items && invoice.items.map((item, index) => (
                <React.Fragment key={index}>
                    {isDoubleLine ? (
                        <>
                            <tr>
                                <td colSpan={getColumnCount()} style={{ ...printStyles.printTd, borderBottom: 'none', paddingBottom: '2px', fontWeight: '500' }}>
                                    {item.itemName}
                                    {item.isFreeIssue && (
                                        <span style={{fontSize: '0.8em', fontStyle: 'italic', fontWeight: 'bold', marginLeft: '5px'}}>
                                            {item.buyQty && item.getQty ? `(Buy ${item.buyQty} Get ${item.getQty} Offer)` : '(Free Issue)'}
                                        </span>
                                    )}
                                </td>
                            </tr>
                            <tr>
                                <td style={{ ...printStyles.printTd, paddingTop: '0px' }}>
                                   <span style={{color: '#555', fontSize: '0.9em'}}>x </span>{item.quantity}
                                </td>

                                {invoice.isDiscountable && (
                                    <td style={{ ...printStyles.printTd, ...printStyles.tdRight, paddingTop: '0px' }}>{(item.originalPrice || item.price).toFixed(2)}</td>
                                )}

                                <td style={{ ...printStyles.printTd, ...printStyles.tdRight, paddingTop: '0px' }}>{item.price.toFixed(2)}</td>
                                <td style={{ ...printStyles.printTd, ...printStyles.tdRight, paddingTop: '0px', fontWeight: 'bold' }}>{(item.quantity * item.price).toFixed(2)}</td>
                            </tr>
                        </>
                    ) : (
                        <tr>
                            <td style={printStyles.printTd}>
                                {item.itemName}
                                {item.isFreeIssue && (
                                    <div style={{fontSize: '0.8em', fontStyle: 'italic', fontWeight: 'bold'}}>
                                        {item.buyQty && item.getQty ? `(Buy ${item.buyQty} Get ${item.getQty} Offer)` : '(Free Issue)'}
                                    </div>
                                )}
                            </td>
                            <td style={{ ...printStyles.printTd, ...printStyles.tdCenter }}>{item.quantity}</td>
                            
                            {invoice.isDiscountable && (
                                <td style={{ ...printStyles.printTd, ...printStyles.tdRight }}>{(item.originalPrice || item.price).toFixed(2)}</td>
                            )}

                            <td style={{ ...printStyles.printTd, ...printStyles.tdRight }}>{item.price.toFixed(2)}</td>
                            <td style={{ ...printStyles.printTd, ...printStyles.tdRight }}>{(item.quantity * item.price).toFixed(2)}</td>
                        </tr>
                    )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
      </div>

      <div className="invoice-footer-section">
        <div style={printStyles.totalsContainer}>
            <div style={printStyles.totals}>
                {isServiceOrder ? (
                    <div style={{border: '2px solid #000', padding: '10px', marginTop: '15px', borderRadius: '4px'}}>
                        <div style={printStyles.totalRow}><strong>Total Job Amount:</strong><span>Rs. {jobTotal.toFixed(2)}</span></div>
                        <div style={printStyles.totalRow}><strong>Advance Paid:</strong><span>Rs. {jobAdvance.toFixed(2)}</span></div>
                        <hr style={printStyles.hr} />
                        <div style={{ ...printStyles.totalRow, fontSize: '1.2em', marginTop: '5px' }}><strong>Balance Due:</strong><span>Rs. {jobBalance.toFixed(2)}</span></div>
                    </div>
                ) : isOrder ? (
                     <div style={{border: '1px dashed #000', padding: '10px', marginTop: '15px'}}>
                        <div style={printStyles.totalRow}><strong>Subtotal:</strong><span>Rs. {invSubtotal.toFixed(2)}</span></div>
                        {deliveryCharge > 0 && <div style={printStyles.totalRow}><strong>Delivery Charge:</strong><span>Rs. {deliveryCharge.toFixed(2)}</span></div>}
                        <div style={printStyles.totalRow}><strong>Grand Total:</strong><span>Rs. {orderTotal.toFixed(2)}</span></div>
                        <hr style={printStyles.hr} />
                        <div style={printStyles.totalRow}><strong>Advance Paid:</strong><span>Rs. {orderAdvance.toFixed(2)}</span></div>
                        <div style={{ ...printStyles.totalRow, fontSize: '1.2em', marginTop: '5px' }}><strong>Balance Due:</strong><span>Rs. {orderBalance.toFixed(2)}</span></div>
                     </div>
                ) : (
                    <>
                        <div style={printStyles.totalRow}><strong>{isSinhala ? "එකතුව" : "Subtotal"}:</strong><span>Rs. {invSubtotal.toFixed(2)}</span></div>
                        {invoice.isDiscountable && totalSave > 0 && (
                            <div style={printStyles.totalRow}><span>{isSinhala ? "ඔබේ ඉතිරිය" : "Your Total Save"}:</span><span style={{ fontWeight: 'bold' }}>Rs. {totalSave.toFixed(2)}</span></div>
                        )}
                        {deliveryCharge > 0 && <div style={printStyles.totalRow}><strong>Delivery:</strong><span>Rs. {deliveryCharge.toFixed(2)}</span></div>}
                        {serviceCharge > 0 && <div style={printStyles.totalRow}><strong>Service Charge:</strong><span>Rs. {serviceCharge.toFixed(2)}</span></div>}
                        <div style={printStyles.totalRow}><strong>{isSinhala ? "මුළු මුදල" : "Grand Total"}:</strong><span>Rs. {invTotal.toFixed(2)}</span></div>
                        <hr style={printStyles.hr} />
                        <div style={printStyles.totalRow}><strong>{isSinhala ? "ලැබුණු මුදල" : "Amount Received"}:</strong><span>Rs. {invReceived.toFixed(2)}</span></div>
                        <div style={{ ...printStyles.totalRow, fontSize: '1.1em' }}><strong>{isSinhala ? "ඉතිරි මුදල" : "Balance"}:</strong><span>Rs. {invBalance.toFixed(2)}</span></div>
                    </>
                )}
            </div>
        </div>
      </div>
      
      {companyInfo?.showOrderNo && invoice.dailyOrderNumber && (
        <div style={{textAlign: 'center', marginTop: '15px', borderTop: '2px solid #000', paddingTop: '5px'}}>
            <span style={{fontSize: '1.2em', fontWeight: 'bold'}}>ORDER NO</span>
            <div style={{fontSize: '3em', fontWeight: '900', lineHeight: '1'}}>
                {String(invoice.dailyOrderNumber).padStart(2, '0')}
            </div>
        </div>
      )}

      {/* ✅ CUSTOM RETURN POLICY (Shows on all invoices if set) */}
      {companyInfo?.returnPolicy && (
        <div style={{marginTop: 20, borderTop: '1px dotted #ccc', paddingTop: 10, fontSize: '0.8em', textAlign: 'center', color: '#444'}}>
            <strong style={{textTransform: 'uppercase', fontSize: '0.9em'}}>Return Policy</strong>
            <p style={{marginTop: 3, whiteSpace: 'pre-wrap', lineHeight: '1.4'}}>{companyInfo.returnPolicy}</p>
        </div>
      )}

      {isServiceOrder ? (
          <div style={{marginTop: 30, borderTop: '1px solid #000', paddingTop: 10, fontSize: '0.8em'}}>
            <p><strong>Terms:</strong> Please bring this receipt when collecting your item. Items not collected within 30 days may be disposed of.</p>
          </div>
      ) : (
          <div style={printStyles.footer}><p>Thank you for your business!</p></div>
      )}
      <div style={printStyles.creditFooter}><p>Wayne Software Solutions | 078 722 3407</p></div>
    </div>
  );
};

// 2. BrowserPrintComponent
const BrowserPrintComponent = ({ invoice, companyInfo, onPrintFinished }) => {
    const [mountNode, setMountNode] = useState(null);
    const iframeRef = useRef(null);
    const [isImageLoaded, setIsImageLoaded] = useState(!companyInfo?.companyLogo);

    useEffect(() => {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.top = '-10000px'; 
        iframe.style.left = '-10000px';
        iframe.style.width = '1px';
        iframe.style.height = '1px';
        document.body.appendChild(iframe);
        iframeRef.current = iframe;

        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write('<html><head><title>Print Invoice</title></head><body><div id="print-mount"></div></body></html>');
        doc.close();

        const style = doc.createElement('style');
        style.textContent = `
            @page { size: auto; margin: 5mm; } 
            body { margin: 0; padding: 0; font-family: sans-serif; background: white; }
            #print-mount { width: 100%; overflow: visible; }
        `;
        doc.head.appendChild(style);

        setMountNode(doc.getElementById('print-mount'));

        return () => {
            if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
            }
        };
    }, []);

    useEffect(() => {
        if (mountNode && isImageLoaded && iframeRef.current) {
            const timer = setTimeout(() => {
                const win = iframeRef.current.contentWindow;
                if (win) {
                    win.focus();
                    win.print();
                }
            }, 600); 
            return () => clearTimeout(timer);
        }
    }, [mountNode, isImageLoaded]);

    useEffect(() => {
        if (!iframeRef.current) return;
        const win = iframeRef.current.contentWindow;
        
        const handleAfterPrint = () => {
            onPrintFinished();
        };
        
        win.addEventListener('afterprint', handleAfterPrint);
        return () => win.removeEventListener('afterprint', handleAfterPrint);
    }, [mountNode, onPrintFinished]);

    return (
        <>
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.7)', zIndex: 99999,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontFamily: 'sans-serif'
            }}>
                <div style={{ marginBottom: '20px', fontSize: '18px', fontWeight: 'bold' }}>Preparing Print Preview...</div>
                <div style={{ fontSize: '14px', marginBottom: '20px', color: '#ccc' }}>If the print dialog doesn't appear, check your popup blocker.</div>
                <button 
                    onClick={onPrintFinished}
                    style={{
                        padding: '10px 20px', background: '#e74c3c', color: 'white', 
                        border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold'
                    }}
                >
                    Close
                </button>
            </div>

            {mountNode && ReactDOM.createPortal(
                <PrintableLayout 
                    invoice={invoice} 
                    companyInfo={companyInfo} 
                    onImageLoad={() => setIsImageLoaded(true)}
                />,
                mountNode
            )}
        </>
    );
};

// --- QZ PRINT MODAL ---
const QZPrintModal = ({ invoice, companyInfo, onClose, isQzReady }) => {
    const [status, setStatus] = useState('Initializing...');
    const [isConnecting, setIsConnecting] = useState(true);
    const [printers, setPrinters] = useState([]);
    const [selectedPrinter, setSelectedPrinter] = useState('');
    const [isPrinting, setIsPrinting] = useState(false);
    const [autoPrintingStatus, setAutoPrintingStatus] = useState('');
    const printableRef = useRef(null);

    const handlePrint = useCallback(async () => {
        if (typeof qz === 'undefined' || !qz.websocket || !qz.websocket.isActive()) { alert('QZ Tray is not connected.'); return; }
        if (!selectedPrinter) { alert('Please select a printer.'); return; }
        setIsPrinting(true);
        try {
            qz.security.setSignaturePromise(async (toSign) => {
                const functions = getFunctions();
                const getQzSignature = httpsCallable(functions, 'getQzSignature');
                const result = await getQzSignature({ requestToSign: toSign });
                return result.data.signature;
            });
            const config = qz.configs.create(selectedPrinter, { units: 'mm', width: 80 });
            const printData = [{ type: 'html', format: 'plain', data: printableRef.current.innerHTML }];
            await qz.print(config, printData);
            const drawerCommand = '\x1B\x70\x00\x19\xFA'; 
            await qz.print(config, [drawerCommand]);
            alert('Print successful!');
            onClose();
        } catch (err) { console.error(err); alert('Printing failed: ' + err.toString()); setAutoPrintingStatus(''); } finally { setIsPrinting(false); }
    }, [selectedPrinter, onClose]);

    useEffect(() => {
        if (!isQzReady) { setStatus('Waiting for QZ Tray...'); return; }
        const findPrintersAndPrint = () => {
            qz.printers.find().then(foundPrinters => {
                setPrinters(foundPrinters);
                const savedPrinter = localStorage.getItem('selectedPrinter');
                if (savedPrinter && foundPrinters.includes(savedPrinter)) { setAutoPrintingStatus(`Found saved: "${savedPrinter}". Printing...`); setSelectedPrinter(savedPrinter); }
                else { setIsConnecting(false); if (foundPrinters.length > 0) setSelectedPrinter(foundPrinters[0]); }
            }).catch(err => { console.error(err); setStatus('Error finding printers.'); setIsConnecting(false); });
        };
        if (!qz.websocket.isActive()) { qz.websocket.connect().then(() => { setStatus('Connected.'); findPrintersAndPrint(); }).catch(err => { setStatus('Connection Failed.'); setIsConnecting(false); }); } else { setStatus('Connected.'); findPrintersAndPrint(); }
    }, [isQzReady]);

    useEffect(() => {
        if (autoPrintingStatus && selectedPrinter) { const timer = setTimeout(() => { handlePrint(); }, 500); return () => clearTimeout(timer); }
    }, [autoPrintingStatus, selectedPrinter, handlePrint]);

    useEffect(() => { if (selectedPrinter) localStorage.setItem('selectedPrinter', selectedPrinter); }, [selectedPrinter]);

    return (
        <div className="confirm-overlay">
            <div className="confirm-popup" style={{ minWidth: '450px' }}>
                <h4>Direct Print with QZ Tray</h4>
                <div className="qz-status"><strong>Status:</strong><span style={{color: '#10b981', marginLeft: '8px'}}>{autoPrintingStatus || status}</span></div>
                {!isConnecting && !autoPrintingStatus && (
                    <div className="qz-controls">
                        <label className="section-label">Select Printer</label>
                        <select value={selectedPrinter} onChange={e => setSelectedPrinter(e.target.value)} className="invoice-input" style={{ marginBottom: '20px' }}>{printers.map(p => <option key={p} value={p}>{p}</option>)}</select>
                        <button onClick={handlePrint} disabled={isPrinting} className="invoice-btn-save">{isPrinting ? 'Printing...' : 'Print'}</button>
                    </div>
                )}
                <button onClick={onClose} className="close-btn">Cancel</button>
                <div style={{ position: 'absolute', left: '-9999px' }} ref={printableRef}>{invoice && <PrintableLayout invoice={invoice} companyInfo={companyInfo} />}</div>
            </div>
        </div>
    );
};

// --- MAIN INVOICE COMPONENT ---
const Invoice = ({ internalUser }) => {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [checkout, setCheckout] = useState([]);
  
  // ✅ CACHING STATE
  const [items, setItems] = useState([]); 
  const [currentCategoryId, setCurrentCategoryId] = useState(null); 
  const [filteredItems, setFilteredItems] = useState([]);
  const [selectedDbItem, setSelectedDbItem] = useState(null); 

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
  
  // Payment & Offer Popups
  const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
  const [showFreeIssuePopup, setShowFreeIssuePopup] = useState(false); 
  const [calculatedFreeItems, setCalculatedFreeItems] = useState([]); 
  
  const [confirmPaymentMethod, setConfirmPaymentMethod] = useState('Cash');
  
  const [showQZPrintModal, setShowQZPrintModal] = useState(false);
  const [invoiceToPrint, setInvoiceToPrint] = useState(null);
  const [isQzReady, setIsQzReady] = useState(false);
  const [deliveryCharge, setDeliveryCharge] = useState("");
  const deliveryChargeRef = useRef(null);
  const [deliveryChargeMode, setDeliveryChargeMode] = useState(false);
  const [isPrintingBrowser, setIsPrintingBrowser] = useState(false);
  const [isCustomerDiscountable, setIsCustomerDiscountable] = useState(false);

  // ✅ DINE-IN LOGIC
  const [dineInAvailable, setDineInAvailable] = useState(false);
  const [orderType, setOrderType] = useState("Take Away"); 
  const [serviceChargeRate, setServiceChargeRate] = useState(0);

  // ✅ SMS STATE
  const [showSmsPopup, setShowSmsPopup] = useState(false);
  const [smsMobileNumber, setSmsMobileNumber] = useState("");
  const [lastSavedInvoice, setLastSavedInvoice] = useState(null);
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsMessagePreview, setSmsMessagePreview] = useState("");
  const [smsCreditsEstimate, setSmsCreditsEstimate] = useState(1);
  const smsInputRef = useRef(null); // ✅ REF for Auto-Focus

  const containerRef = useRef(null);
  const itemInputRef = useRef(null);
  const qtyInputRef = useRef(null);
  const receivedAmountRef = useRef(null);

  const getSriLankaDate = () => {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
  };

  useEffect(() => {
    const loadScript = (src, id) => {
      return new Promise((resolve, reject) => {
        if (document.getElementById(id)) { resolve(); return; }
        const script = document.createElement('script'); script.src = src; script.id = id;
        script.onload = () => resolve(); script.onerror = () => reject(new Error(`Script load error for ${src}`));
        document.head.appendChild(script);
      });
    };
    loadScript('https://cdn.jsdelivr.net/npm/qz-tray@2.2.3/qz-tray.js', 'qz-tray-lib')
      .then(() => setIsQzReady(true)).catch(e => setIsQzReady(false));
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  };
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const fetchProvisionalInvoiceNumber = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) { setInvoiceNumber("INV-ERROR"); return; }
    const today = new Date();
    const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const counterRef = doc(db, user.uid, "counters");
    try {
        const counterDoc = await getDoc(counterRef); 
        const nextSeq = (counterDoc.exists() ? counterDoc.data().invoiceCounters?.[datePrefix] || 0 : 0) + 1;
        setInvoiceNumber(`INV-${datePrefix}-${String(nextSeq).padStart(4, "0")}`);
    } catch (err) { setInvoiceNumber(`INV-${datePrefix}-ERR`); }
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const initialize = async () => {
      await fetchProvisionalInvoiceNumber(); 
      const customersColRef = collection(db, user.uid, "customers", "customer_list");
      const customerSnap = await getDocs(query(customersColRef));
      const customerOptions = customerSnap.docs.map(d => ({ value: d.id, label: d.data().name, ...d.data() }));
      setCustomers(customerOptions);
      const settingsSnap = await getDoc(doc(db, user.uid, "settings"));
      if (settingsSnap.exists()) {
        const sData = settingsSnap.data();
        setSettings(sData); 
        if (sData.defaultCustomerId) {
          const defCus = customerOptions.find(c => c.value === sData.defaultCustomerId);
          if (defCus) setSelectedCustomer(defCus);
        }
        if (sData.useShiftProduction) {
          setShiftProductionEnabled(true);
          setAvailableShifts(sData.productionShifts || []);
          const savedShift = localStorage.getItem('savedSelectedShift');
          if (savedShift && sData.productionShifts?.includes(savedShift)) setSelectedShift(savedShift);
        }
        if (sData.dineInAvailable) {
            setDineInAvailable(true);
            setServiceChargeRate(Number(sData.serviceCharge) || 0);
        }
      }
    };
    initialize();
  }, [fetchProvisionalInvoiceNumber]); 
  
  useEffect(() => { if (selectedShift) localStorage.setItem('savedSelectedShift', selectedShift); }, [selectedShift]);

  // ✅ SMART CACHING - FIXED INFINITE LOOP
  useEffect(() => {
    const fetchCustomerData = async () => {
      setItemInput("");
      setFilteredItems([]);
      setSelectedDbItem(null); 
      
      if (!selectedCustomer || !auth.currentUser) { 
          setIsCustomerDiscountable(false); 
          setItems([]);
          setCurrentCategoryId(null);
          return; 
      }

      if (selectedCustomer.priceCategoryId === currentCategoryId) {
          // If we already loaded this category, don't re-fetch
          return; 
      }

      setItems([]);

      try {
        if(selectedCustomer.priceCategoryId) {
           const catRef = doc(db, auth.currentUser.uid, "price_categories", "categories", selectedCustomer.priceCategoryId);
           getDoc(catRef).then(catSnap => setIsCustomerDiscountable(catSnap.exists() && catSnap.data().isDiscountable));
        } else { 
          setIsCustomerDiscountable(false); 
        }

        const pricedItemsColRef = collection(db, auth.currentUser.uid, "price_categories", "priced_items");
        const q = query(pricedItemsColRef, where("categoryId", "==", selectedCustomer.priceCategoryId));
        
        const snapshot = await getDocs(q);
        const allItems = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
        
        setItems(allItems); 
        setCurrentCategoryId(selectedCustomer.priceCategoryId); 
      } catch (error) {
        console.error("Error fetching items:", error);
      }
    };
    fetchCustomerData();
  }, [selectedCustomer, currentCategoryId]); 

  // ✅ Client-Side Search
  useEffect(() => {
    if (!itemInput.trim()) {
      setFilteredItems([]);
      setShowDropdown(false);
      return;
    }

    const lowerTerm = itemInput.toLowerCase();
    
    const results = items.filter(item => 
      (item.itemName && item.itemName.toLowerCase().includes(lowerTerm)) ||
      (item.itemSKU && item.itemSKU.toLowerCase().includes(lowerTerm)) || 
      (item.pid && String(item.pid).toLowerCase().includes(lowerTerm))
    );
    
    setFilteredItems(results);
    setShowDropdown(results.length > 0);
    setSelectedIndex(0);
  }, [itemInput, items]);

  const handleItemKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(p => (p + 1) % filteredItems.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(p => (p - 1 + filteredItems.length) % filteredItems.length); }
    else if (e.key === "Enter") { e.preventDefault(); if (filteredItems[selectedIndex]) handleItemSelect(filteredItems[selectedIndex]); }
  };

  const handleItemSelect = (item) => { 
      setItemInput(item.itemName); 
      setSelectedDbItem(item); 
      setShowDropdown(false); 
      setTimeout(() => qtyInputRef.current?.focus(), 50); 
  };

  const handleQtyKeyDown = (e) => { if (e.key === "Enter") { e.preventDefault(); addItemToCheckout(); } };
  const handleQtyChange = (e) => { const v = e.target.value; if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) setQtyInput(v); };
  
  const addItemToCheckout = () => {
    if (!itemInput || !qtyInput || isNaN(qtyInput) || qtyInput <= 0) return;
    
    let itemData = selectedDbItem; 

    if (!itemData) {
        itemData = items.find(i => i.itemName.toLowerCase() === itemInput.toLowerCase());
    }

    if (!itemData) {
        return alert("Please select a valid item from the list.");
    }

    const existingIdx = checkout.findIndex(i => i.itemId === itemData.itemId);
    if (existingIdx > -1) {
        const newCheckout = [...checkout]; 
        newCheckout[existingIdx].quantity += Number(qtyInput); 
        setCheckout(newCheckout);
    } else {
        setCheckout(p => [...p, { ...itemData, quantity: Number(qtyInput) }]);
    }

    setItemInput(""); 
    setQtyInput(1); 
    setSelectedDbItem(null); 
    setShowDropdown(false); 
    itemInputRef.current?.focus();
  };

  const removeCheckoutItem = (idx) => setCheckout(p => p.filter((_, i) => i !== idx));
  
  const resetForm = useCallback(async () => { 
      await fetchProvisionalInvoiceNumber(); 
      setCheckout([]); 
      setReceivedAmount(""); 
      setDeliveryCharge(""); 
      setCalculatedFreeItems([]); 
      setOrderType("Take Away");
      itemInputRef.current?.focus(); 
  }, [fetchProvisionalInvoiceNumber]);
  
  const handleSaveAttempt = useCallback(() => {
    if (!selectedCustomer || checkout.length === 0) return alert("Select customer and add items.");
    if (shiftProductionEnabled && !selectedShift) return alert("Select shift.");

    const freeItems = [];

    checkout.forEach(item => {
        if (item.buyQty && item.getQty && Number(item.buyQty) > 0) {
            const billedQty = Number(item.quantity);
            const sets = Math.floor(billedQty / Number(item.buyQty));
            if (sets > 0) {
                const freeQty = sets * Number(item.getQty);
                freeItems.push({
                    ...item,
                    freeQty: freeQty, 
                    isFreeIssue: true 
                });
            }
        }
    });

    setCalculatedFreeItems(freeItems);

    if (freeItems.length > 0) {
        setShowFreeIssuePopup(true);
    } else {
        setConfirmPaymentMethod('Cash'); 
        setShowPaymentConfirm(true);
    }
  }, [selectedCustomer, checkout, shiftProductionEnabled, selectedShift]);

  useEffect(() => {
    const handleShortcuts = (e) => {
      if (showPaymentConfirm || showFreeIssuePopup || isSaving || showQZPrintModal || isPrintingBrowser) return;
      if (e.altKey && e.key.toLowerCase() === "s") { e.preventDefault(); handleSaveAttempt(); }
      if (e.key === "F2") { e.preventDefault(); setCheckoutFocusMode(false); setDeliveryChargeMode(false); setAmountReceivedMode(p => !p); }
      if (e.key === "F10") { e.preventDefault(); setAmountReceivedMode(false); setDeliveryChargeMode(false); setCheckoutFocusMode(p => !p); }
      if (e.key === "F5") { e.preventDefault(); setCheckoutFocusMode(false); setAmountReceivedMode(false); setDeliveryChargeMode(p => !p); }
      
      if (e.key === "F8") {
          e.preventDefault();
          if (dineInAvailable) {
              setOrderType(prev => prev === "Take Away" ? "Dine-in" : "Take Away");
          }
      }
    };
    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, [checkout, selectedCustomer, selectedShift, showPaymentConfirm, showFreeIssuePopup, isSaving, showQZPrintModal, isPrintingBrowser, handleSaveAttempt, dineInAvailable]);

  useEffect(() => {
    if (amountReceivedMode) receivedAmountRef.current?.focus();
    else if (deliveryChargeMode) deliveryChargeRef.current?.focus();
    else if (checkoutFocusMode) { itemInputRef.current?.blur(); qtyInputRef.current?.blur(); receivedAmountRef.current?.blur(); setHighlightedCheckoutIndex(checkout.length > 0 ? 0 : -1); }
    else { itemInputRef.current?.focus(); setHighlightedCheckoutIndex(-1); }
  }, [amountReceivedMode, checkoutFocusMode, deliveryChargeMode, checkout.length]);

  useEffect(() => {
    const handleCheckoutNav = (e) => {
        if (!checkoutFocusMode) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedCheckoutIndex(p => Math.min(p + 1, checkout.length - 1)); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedCheckoutIndex(p => Math.max(p - 1, 0)); }
        if (e.key === 'Delete' && highlightedCheckoutIndex > -1) { e.preventDefault(); removeCheckoutItem(highlightedCheckoutIndex); setHighlightedCheckoutIndex(p => Math.max(0, Math.min(p, checkout.length - 2))); }
        if (e.key === 'Escape') { e.preventDefault(); setCheckoutFocusMode(false); }
    };
    window.addEventListener('keydown', handleCheckoutNav);
    return () => window.removeEventListener('keydown', handleCheckoutNav);
  }, [checkoutFocusMode, checkout, highlightedCheckoutIndex]);
  
  const handleFreeIssueConfirm = () => {
      setShowFreeIssuePopup(false);
      setConfirmPaymentMethod('Cash'); 
      setShowPaymentConfirm(true);
  };
  
  const executeSaveInvoice = useCallback(async (method) => {
    const user = auth.currentUser;
    if (!user) return alert("Not logged in.");
    setIsSaving(true); setShowPaymentConfirm(false);
    
    const currentSubtotal = checkout.reduce((s, i) => s + i.price * i.quantity, 0);
    
    const currentServiceCharge = (orderType === "Dine-in") 
        ? (currentSubtotal * (serviceChargeRate / 100)) 
        : 0;

    const currentTotal = currentSubtotal + (Number(deliveryCharge) || 0) + currentServiceCharge;
    const currentBalance = (Number(receivedAmount) || 0) - currentTotal;

    try {
      const today = new Date();
      const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
      
      const counterRef = doc(db, user.uid, "counters");
      
      let walletDocId = null;
      let salesMethodField = null;

      if (method === 'Cash') { walletDocId = 'cash'; salesMethodField = 'totalSales_cash'; }
      else if (method === 'Card') { walletDocId = 'card'; salesMethodField = 'totalSales_card'; }
      else if (method === 'Online') { walletDocId = 'online'; salesMethodField = 'totalSales_online'; }
      
      const walletRef = walletDocId ? doc(db, user.uid, "wallet", "accounts", walletDocId) : null;

      const dailyDateString = getSriLankaDate(); 
      const dailyStatsRef = doc(db, user.uid, "daily_stats", "entries", dailyDateString);

      const finalInvoiceData = await runTransaction(db, async (t) => {
        
        let itemsToSave = [...checkout];
        
        calculatedFreeItems.forEach(freeItem => {
            itemsToSave.push({
                ...freeItem,
                quantity: freeItem.freeQty,
                price: 0,
                originalPrice: 0,
                isFreeIssue: true,
                buyQty: freeItem.buyQty,
                getQty: freeItem.getQty,
                itemName: freeItem.itemName 
            });
        });

        let invoiceTotalCOGS = 0;
        for (const item of itemsToSave) {
             if (item.itemId) {
                 const itemMasterRef = doc(db, user.uid, "items", "item_list", item.itemId);
                 const itemSnap = await t.get(itemMasterRef);
                 if (itemSnap.exists()) {
                     const avgCost = Number(itemSnap.data().averageCost) || 0;
                     const qty = Number(item.quantity) || 0;
                     invoiceTotalCOGS += (avgCost * qty);
                 }
             }
        }

        const dailyStatsSnap = await t.get(dailyStatsRef);
        const currentDailyCOGS = dailyStatsSnap.exists() ? (Number(dailyStatsSnap.data().totalCOGS) || 0) : 0;
        const currentDailySales = dailyStatsSnap.exists() ? (Number(dailyStatsSnap.data().totalSales) || 0) : 0;
        const currentMethodSales = (dailyStatsSnap.exists() && salesMethodField) ? (Number(dailyStatsSnap.data()[salesMethodField]) || 0) : 0;
        const currentInvoiceCount = dailyStatsSnap.exists() ? (Number(dailyStatsSnap.data().invoiceCount) || 0) : 0;

        const cDoc = await t.get(counterRef);
        const nextSeq = (cDoc.exists() ? cDoc.data().invoiceCounters?.[datePrefix] || 0 : 0) + 1;
        
        const currentDailyOrderSeq = (cDoc.exists() ? cDoc.data().dailyOrderCounters?.[datePrefix] || 0 : 0);
        const nextDailyOrderSeq = currentDailyOrderSeq + 1;
        
        let currentWalletBalance = 0;
        if (walletRef) {
            const wDoc = await t.get(walletRef);
            if (wDoc.exists()) {
                currentWalletBalance = Number(wDoc.data().balance) || 0;
            }
        }

        const newDailyCOGS = currentDailyCOGS + invoiceTotalCOGS;
        const newDailySales = currentDailySales + currentTotal; 
        
        const statsUpdate = {
            totalCOGS: newDailyCOGS,
            totalSales: newDailySales,
            invoiceCount: currentInvoiceCount + 1,
            date: dailyDateString,
            lastUpdated: serverTimestamp()
        };

        if (salesMethodField) {
            statsUpdate[salesMethodField] = currentMethodSales + currentTotal;
        }

        t.set(dailyStatsRef, statsUpdate, { merge: true });

        t.set(counterRef, { 
            invoiceCounters: { [datePrefix]: nextSeq },
            dailyOrderCounters: { [datePrefix]: nextDailyOrderSeq }
        }, { merge: true });
        
        const newInvNum = `INV-${datePrefix}-${String(nextSeq).padStart(4, "0")}`;
        const invData = {
          customerId: selectedCustomer.value, customerName: selectedCustomer.label, 
          items: itemsToSave,
          total: currentTotal, 
          deliveryCharge: Number(deliveryCharge) || 0,
          serviceCharge: currentServiceCharge,
          received: Number(receivedAmount) || 0,
          balance: currentBalance,
          createdAt: serverTimestamp(), invoiceNumber: newInvNum, issuedBy: internalUser?.username || "Admin", 
          shift: selectedShift || "", paymentMethod: method, isDiscountable: isCustomerDiscountable,
          totalCOGS: invoiceTotalCOGS,
          dailyOrderNumber: nextDailyOrderSeq,
          orderType: orderType 
        };
        const newRef = doc(collection(db, user.uid, "invoices", "invoice_list"));
        t.set(newRef, invData);

        const kotItems = itemsToSave.filter(item => 
            (item.type === "ourProduct" || item.itemType === "ourProduct")
        );
        
        if (kotItems.length > 0) {
            const kotDocRef = doc(collection(db, user.uid, "kot", dailyDateString));
            const kotData = {
                invoiceNumber: newInvNum,
                orderNumber: nextDailyOrderSeq,
                date: dailyDateString,
                createdAt: serverTimestamp(),
                items: kotItems.map(item => ({
                    itemName: item.itemName || item.name || "Unknown Item",
                    quantity: item.quantity,
                    variant: item.variant || "", 
                })),
                status: "Pending",
                shift: selectedShift || "",
                type: orderType 
            };
            t.set(kotDocRef, kotData);
        }

        if (walletRef) {
            const newBalance = currentWalletBalance + invData.total;
            t.set(walletRef, { 
                balance: newBalance,
                lastUpdated: serverTimestamp() 
            }, { merge: true });
        }
        
        return { ...invData, createdAt: new Date(), invoiceNumber: newInvNum };
      });

      // ✅ SMS TRIGGER LOGIC (Updated)
      if (settings?.sendInvoiceSms) {
          setSmsMobileNumber(selectedCustomer?.phone || "");
          setLastSavedInvoice(finalInvoiceData);
          
          // Generate Preview & Estimate Costs
          const msg = generateSmsPreview(finalInvoiceData, settings);
          setSmsMessagePreview(msg);
          
          // ✅ CORRECT CREDIT LOGIC: 1 Credit per 160 chars
          const estimatedCost = Math.ceil(msg.length / 160);
          setSmsCreditsEstimate(estimatedCost);

          setShowSmsPopup(true);
      }

      if (settings?.autoPrintInvoice) {
        setInvoiceToPrint(finalInvoiceData); 
        if (settings?.openCashDrawerWithPrint) setShowQZPrintModal(true);
        else setIsPrintingBrowser(true);
      } else { 
          if(!settings?.sendInvoiceSms) {
              alert("Saved!"); 
              await resetForm(); 
          }
      }
    } catch (e) { console.error(e); alert("Save failed: " + e.message); } finally { setIsSaving(false); }
  }, [checkout, deliveryCharge, receivedAmount, selectedCustomer, selectedShift, calculatedFreeItems, isCustomerDiscountable, internalUser, settings, resetForm, orderType, serviceChargeRate]);

  // ✅ GENERATE SMS PREVIEW FUNCTION (Updated to allow long messages for accurate billing)
  const generateSmsPreview = (invoice, appSettings) => {
      // 1. Company Name (Top)
      const company = (appSettings?.companyName || "Store").substring(0, 25); 
      
      // 2. Invoice Number
      const invNo = invoice.invoiceNumber;
      
      // 3. Total
      const total = invoice.total.toFixed(2);
      
      // 4. Items List 
      // We removed the aggressive truncation logic here to allow accurate charging.
      // If the message is long (e.g., 200 chars), it will simply cost 2 credits.
      let itemsStr = invoice.items
          .filter(i => !i.isFreeIssue) 
          .map(i => `${i.itemName} x${i.quantity}`)
          .join(", ");
      
      // Safety Cap: Only truncate if it gets excessively expensive (e.g. > 4 credits / ~600 chars)
      // This prevents accidental massive bills while allowing 2-3 credit messages.
      if (itemsStr.length > 600) {
          itemsStr = itemsStr.substring(0, 597) + "...";
      }

      // Construct Message
      return `${company}\nInv:${invNo}\nItems:${itemsStr}\nTotal:${total}\nThank you!`;
  };

  // ✅ HANDLE SEND SMS (Updated with Guard Clause & Flag)
  const handleSendSms = async () => {
      // 🛑 GUARD CLAUSE: Prevent multiple triggers if already sending
      if (isSendingSms) return; 

      if (!smsMobileNumber || smsMobileNumber.length < 9) {
          alert("Please enter a valid mobile number.");
          return;
      }
      
      setIsSendingSms(true); // Lock the process
      const functions = getFunctions();
      const sendInvoiceSmsFn = httpsCallable(functions, 'sendInvoiceSms');
      
      try {
          const dateStr = lastSavedInvoice.createdAt?.toDate ? lastSavedInvoice.createdAt.toDate().toLocaleDateString() : new Date().toLocaleDateString();
          
          await sendInvoiceSmsFn({
              mobile: smsMobileNumber,
              invoiceNo: lastSavedInvoice.invoiceNumber,
              customerName: lastSavedInvoice.customerName,
              amount: lastSavedInvoice.total,
              date: dateStr,
              // ✅ PASS CUSTOM MESSAGE & CREDITS
              customMessage: smsMessagePreview,
              creditsToDeduct: smsCreditsEstimate
          });
          
          alert("SMS Sent Successfully!");
          setShowSmsPopup(false);
          setSmsMobileNumber("");
          await resetForm(); // Reset form after SMS is handled
      } catch (error) {
          console.error(error);
          alert("Failed to send SMS: " + error.message);
      } finally {
          setIsSendingSms(false); // Unlock only when done/failed
      }
  };

  useEffect(() => {
    const handleKey = (e) => {
        if (showFreeIssuePopup) {
            if (e.key === 'Enter') handleFreeIssueConfirm();
            return;
        }
        if (!showPaymentConfirm) return;
        const idx = paymentOptions.indexOf(confirmPaymentMethod);
        if (e.key === 'ArrowRight') setConfirmPaymentMethod(paymentOptions[(idx + 1) % 3]);
        if (e.key === 'ArrowLeft') setConfirmPaymentMethod(paymentOptions[(idx - 1 + 3) % 3]);
        if (e.key === 'Enter') executeSaveInvoice(confirmPaymentMethod);
        if (e.key === 'Escape') setShowPaymentConfirm(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showPaymentConfirm, showFreeIssuePopup, confirmPaymentMethod, executeSaveInvoice]);

  // ✅ Auto-focus SMS Input
  useEffect(() => {
      if (showSmsPopup) {
          setTimeout(() => smsInputRef.current?.focus(), 50);
      }
  }, [showSmsPopup]);

  const subtotal = checkout.reduce((s, i) => s + i.price * i.quantity, 0);
  
  const currentServiceCharge = (orderType === "Dine-in") 
      ? (subtotal * (serviceChargeRate / 100)) 
      : 0;

  const total = subtotal + (Number(deliveryCharge) || 0) + currentServiceCharge;
  const balance = (Number(receivedAmount) || 0) - total; 
  const displayBalance = (Number(receivedAmount) || 0) === 0 ? 0 : balance;
  const isSaveDisabled = !selectedCustomer || checkout.length === 0 || (balance < 0 && (Number(receivedAmount) || 0) > 0);

  return (
    <div ref={containerRef} className="invoice-container">
      {isSaving && !showQZPrintModal && !isPrintingBrowser && ( <div className="saving-overlay"><div className="saving-spinner"></div><p>Saving...</p></div> )}
      {showQZPrintModal && ( <QZPrintModal invoice={invoiceToPrint} companyInfo={settings} isQzReady={isQzReady} onClose={() => { setShowQZPrintModal(false); setInvoiceToPrint(null); resetForm(); }} /> )}
      {isPrintingBrowser && invoiceToPrint && ( <BrowserPrintComponent invoice={invoiceToPrint} companyInfo={settings} onPrintFinished={async () => { setIsPrintingBrowser(false); setInvoiceToPrint(null); await resetForm(); }} /> )}

      <button onClick={toggleFullscreen} className="fullscreen-button">{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}</button>
      
      <div className="left-panel">
        <div className="invoice-header">
            <div style={{textAlign: 'left'}}><div className="header-label">INVOICE #</div><div className="header-value">{invoiceNumber}</div></div>
            
            {/* ✅ DINE-IN TOGGLE UI */}
            {dineInAvailable && (
                <div className="toggle-wrapper">
                    <div 
                        className={`toggle-option ${orderType === "Take Away" ? 'active' : ''}`}
                        onClick={() => setOrderType("Take Away")}
                    >
                        Take Away
                    </div>
                    <div 
                        className={`toggle-option ${orderType === "Dine-in" ? 'active' : ''}`}
                        onClick={() => setOrderType("Dine-in")}
                    >
                        Dine-in (F8)
                    </div>
                </div>
            )}

            {shiftProductionEnabled && ( <div style={{textAlign: 'center'}}><label className="header-label">SHIFT</label><select value={selectedShift} onChange={e => setSelectedShift(e.target.value)} className="shift-select"><option value="">Select Shift</option>{availableShifts.map(s => <option key={s} value={s}>{s}</option>)}</select></div> )}
            <div style={{textAlign: 'right'}}><div className="header-label">ISSUED BY</div><div className="header-value">{internalUser?.username || 'Admin'}</div></div>
        </div>
        <div className="customer-section"><label className="section-label">CUSTOMER</label><Select options={customers} value={selectedCustomer} onChange={setSelectedCustomer} placeholder="Select a customer..." /></div>
        <div className="item-entry-section">
          <div style={{position: 'relative', flex: 1}}>
            <label className="section-label">ADD ITEM</label>
            <input ref={itemInputRef} value={itemInput} onChange={e => setItemInput(e.target.value)} onKeyDown={handleItemKeyDown} placeholder="Type item name..." className="invoice-input" />
            {showDropdown && filteredItems.length > 0 && ( <ul className="dropdown-list">{filteredItems.map((i, idx) => ( <li key={i.id} className={`dropdown-item ${idx === selectedIndex ? 'selected' : ''}`} onClick={() => handleItemSelect(i)}>{i.itemName}<span className="dropdown-price">Rs. {i.price.toFixed(2)}</span></li> ))}</ul> )}
          </div>
          <div style={{width: '120px'}}><label className="section-label">QTY</label><input ref={qtyInputRef} value={qtyInput} onChange={handleQtyChange} onKeyDown={handleQtyKeyDown} onFocus={(e) => e.target.select()} type="text" inputMode="decimal" className="invoice-input" /></div>
          <button onClick={addItemToCheckout} className="invoice-btn-primary">ADD</button>
        </div>
        <div className="shortcuts-help">
          <h4 className="shortcuts-title">Keyboard Shortcuts</h4>
          <div className="shortcut-item"><b>F2:</b> Focus 'Amount Received'</div>
          <div className="shortcut-item"><b>F5:</b> Focus 'Delivery Charges'</div>
          {dineInAvailable && <div className="shortcut-item"><b>F8:</b> Toggle Dine-in / Take Away</div>}
          <div className="shortcut-item"><b>F10:</b> Activate Checkout List</div>
          <div className="shortcut-item"><b>Alt + S:</b> Save Invoice</div>
          <div className="shortcut-item"><b>Esc:</b> Exit</div>
        </div>
      </div>
      
      <div className="right-panel">
        <div className={`checkout-card ${checkoutFocusMode ? 'active' : ''}`}>
            <h3 className="checkout-title">CHECKOUT (F10)</h3>
            <div className="table-container">
                <table className="invoice-table">
                  <thead><tr><th className="invoice-th">ITEM</th><th className="invoice-th">QTY</th><th className="invoice-th">TOTAL</th><th className="invoice-th"></th></tr></thead>
                  <tbody>{checkout.length === 0 ? ( <tr><td colSpan="4" className="empty-state">No items added</td></tr> ) : ( checkout.map((c, idx) => ( <tr key={idx} className={idx === highlightedCheckoutIndex ? 'row-highlight' : ''}><td className="invoice-td">{c.itemName}</td><td className="invoice-td">{c.quantity}</td><td className="invoice-td">Rs. {(c.price * c.quantity).toFixed(2)}</td><td className="invoice-td"><button onClick={() => removeCheckoutItem(idx)} className="remove-button">✕</button></td></tr> )) )}</tbody>
                </table>
            </div>
            <div className="totals-section">
                <div className="total-row"><span>Subtotal</span><span>Rs. {subtotal.toFixed(2)}</span></div>
                {settings?.offerDelivery && ( <div className="total-row"><label htmlFor="deliveryCharge" style={{cursor: 'pointer'}}>Delivery (F5)</label><input ref={deliveryChargeRef} id="deliveryCharge" type="number" value={deliveryCharge} onChange={e => setDeliveryCharge(e.target.value)} className={`invoice-input delivery-input ${deliveryChargeMode ? 'active' : ''}`} placeholder="0.00" /></div> )}
                
                {/* ✅ DISPLAY SERVICE CHARGE */}
                {dineInAvailable && orderType === "Dine-in" && (
                    <div className="total-row">
                        <span>Service Charge ({serviceChargeRate}%)</span>
                        <span>Rs. {currentServiceCharge.toFixed(2)}</span>
                    </div>
                )}

                <div className="grand-total-row"><span>TOTAL</span><span>Rs. {total.toFixed(2)}</span></div>
            </div>
            <div className="payment-section">
                <label className="section-label">AMOUNT RECEIVED (F2)</label>
                <input ref={receivedAmountRef} type="number" value={receivedAmount} onChange={e => setReceivedAmount(e.target.value)} placeholder="0.00" className={`invoice-input amount-input ${amountReceivedMode ? 'active' : ''}`} />
            </div>
            <div className="balance-row"><span>BALANCE</span><span style={{color: displayBalance >= 0 ? '#10b981' : '#ef4444'}}>Rs. {displayBalance.toFixed(2)}</span></div>
            <button onClick={handleSaveAttempt} disabled={isSaveDisabled || isSaving} className="invoice-btn-save">{isSaving ? 'SAVING...' : 'SAVE INVOICE (ALT+S)'}</button>
        </div>
      </div>
      
      {showFreeIssuePopup && (
        <div className="confirm-overlay">
          <div className="confirm-popup">
            <h3 style={{color: '#e67e22', marginBottom: '10px'}}>🎉 Free Issues Available!</h3>
            <p style={{marginBottom: '15px'}}>Based on "Buy X Get Y" offers, you get the following items for free:</p>
            <div style={{maxHeight: '200px', overflowY: 'auto', textAlign: 'left', marginBottom: '20px', border: '1px solid #eee', borderRadius: '6px', padding: '10px'}}>
                {calculatedFreeItems.map((item, index) => (
                    <div key={index} style={{display: 'flex', justifyContent: 'space-between', padding: '8px', borderBottom: '1px solid #f9f9f9'}}>
                        <span>{item.itemName} <span style={{fontSize: '0.9em', color: '#666'}}>(Buy {item.buyQty} Get {item.getQty})</span></span>
                        <span style={{fontWeight: 'bold', color: '#27ae60'}}>+ {item.freeQty} Free</span>
                    </div>
                ))}
            </div>
            <button 
                onClick={handleFreeIssueConfirm}
                style={{
                    padding: '12px 30px', 
                    background: '#e67e22', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '6px', 
                    fontSize: '16px', 
                    fontWeight: 'bold', 
                    cursor: 'pointer'
                }}
            >
                OK
            </button>
          </div>
        </div>
      )}

      {showPaymentConfirm && (
        <div className="confirm-overlay">
          <div className="confirm-popup">
            <h4>Select Payment Method</h4>
            <p>Use ← → arrow keys and press Enter to confirm.</p>
            <div className="confirm-buttons">
                {paymentOptions.map(m => ( <button key={m} onClick={() => executeSaveInvoice(m)} className={`confirm-btn ${confirmPaymentMethod === m ? 'active' : ''}`}>{m === 'Online' ? 'Online Transfer' : `${m} Payment`}</button> ))}\r\n            </div>
          </div>
        </div>
      )}

      {/* ✅ SMS POPUP MODAL (REDESIGNED & PROTECTED) */}
      {showSmsPopup && (
        <div className="confirm-overlay">
          <div 
            className="confirm-popup" 
            style={{ 
                width: '420px', 
                padding: '0', 
                borderRadius: '12px', 
                overflow: 'hidden', 
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                fontFamily: "'Inter', sans-serif"
            }}
          >
            {/* Header */}
            <div style={{background: 'linear-gradient(135deg, #00A1FF 0%, #0077FF 100%)', padding: '20px', textAlign: 'center'}}>
                <h3 style={{ margin: 0, color: 'white', fontSize: '18px', fontWeight: '600' }}>Send Invoice SMS</h3>
            </div>

            <div style={{padding: '24px'}}>
                <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#4b5563', lineHeight: '1.5' }}>
                    Enter the customer's mobile number below to send the invoice details instantly.
                </p>
                
                {/* Credit Info (Updated to show Chars & Credits) */}
                <div style={{
                    background: '#eff6ff', 
                    padding: '12px 16px', 
                    borderRadius: '8px', 
                    marginBottom: '24px', 
                    fontSize: '14px', 
                    color: '#1e40af', 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '1px solid #bfdbfe'
                }}>
                    <span style={{fontWeight: '500'}}>Estimated Cost:</span>
                    <strong style={{fontSize: '16px'}}>
                        {smsMessagePreview.length} chars ({smsCreditsEstimate} Credits)
                    </strong>
                </div>

                {/* Input Field */}
                <div style={{marginBottom: '24px'}}>
                    <label style={{display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 'bold', color: '#374151', textTransform: 'uppercase'}}>
                        Mobile Number
                    </label>
                    <input 
                        ref={smsInputRef} // ✅ Auto-Focus Ref
                        type="text" 
                        value={smsMobileNumber}
                        disabled={isSendingSms} // ✅ LOCKED while sending
                        onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            if (val.length <= 10) setSmsMobileNumber(val);
                        }}
                        onKeyDown={(e) => { // ✅ Strict Keyboard Handlers
                            if (isSendingSms) return; // Ignore keys if processing
                            if (e.key === 'Enter') handleSendSms();
                            if (e.key === 'Escape') { setShowSmsPopup(false); resetForm(); }
                        }}
                        placeholder="07XXXXXXXX"
                        maxLength="10"
                        style={{
                            width: '100%', 
                            padding: '14px', 
                            fontSize: '18px', 
                            border: '2px solid #e5e7eb', 
                            borderRadius: '8px', 
                            textAlign: 'center',
                            letterSpacing: '1.5px',
                            fontWeight: '600',
                            color: isSendingSms ? '#9ca3af' : '#1f2937',
                            backgroundColor: isSendingSms ? '#f3f4f6' : 'white',
                            outline: 'none',
                            boxSizing: 'border-box',
                            cursor: isSendingSms ? 'not-allowed' : 'text'
                        }}
                        onFocus={(e) => !isSendingSms && (e.target.style.borderColor = '#00A1FF')}
                        onBlur={(e) => !isSendingSms && (e.target.style.borderColor = '#e5e7eb')}
                    />
                </div>
                
                {/* Preview */}
                <div style={{textAlign: 'left', marginBottom: '24px'}}>
                    <label style={{display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase'}}>
                        Message Preview
                    </label>
                    <div style={{
                        fontSize: '12px', 
                        color: '#4b5563', 
                        border: '1px solid #e5e7eb', 
                        borderRadius: '8px', 
                        padding: '12px', 
                        background: '#f9fafb', 
                        whiteSpace: 'pre-wrap', 
                        maxHeight: '120px', 
                        overflowY: 'auto',
                        lineHeight: '1.4'
                    }}>
                        {smsMessagePreview}
                    </div>
                </div>

                <div className="confirm-buttons" style={{gap: '12px'}}>
                    <button 
                        onClick={() => { if (!isSendingSms) { setShowSmsPopup(false); resetForm(); }}} 
                        style={{ 
                            padding: '14px 20px', 
                            background: 'white', 
                            color: isSendingSms ? '#9ca3af' : '#374151', 
                            border: '1px solid #d1d5db',
                            borderRadius: '8px', 
                            cursor: isSendingSms ? 'not-allowed' : 'pointer',
                            fontWeight: '600',
                            fontSize: '14px',
                            flex: 1,
                            transition: 'background 0.2s'
                        }}
                        disabled={isSendingSms}
                    >
                        Cancel (Esc)
                    </button>
                    <button 
                        onClick={handleSendSms} 
                        style={{ 
                            padding: '14px 20px', 
                            background: isSendingSms ? '#93c5fd' : '#00A1FF', 
                            color: 'white', 
                            border: 'none',
                            borderRadius: '8px', 
                            cursor: isSendingSms ? 'wait' : 'pointer',
                            fontWeight: '600',
                            fontSize: '14px',
                            flex: 1,
                            boxShadow: isSendingSms ? 'none' : '0 4px 6px -1px rgba(0, 161, 255, 0.3)',
                            transition: 'all 0.2s',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                        disabled={isSendingSms}
                    >
                        {isSendingSms ? (
                            <>Sending...</>
                        ) : (
                            "Send SMS (Enter)"
                        )}
                    </button>
                </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Invoice;