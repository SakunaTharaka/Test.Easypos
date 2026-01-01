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

// --- STYLES FROM INVOICE VIEWER ---

const styles = {
    // --- Layout Styles (Screen) ---
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
    grandTotalRowScreen: { display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '20px', color: '#16a34a', paddingTop: '8px', borderTop: '2px solid #e5e7eb' }, 
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
    closeButton: { marginTop: '15px', padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' },

    // --- PRINT / VIEWER STYLES ---
    invoiceBox: { padding: '5px', color: '#000', boxSizing: 'border-box' },
    logo: { maxWidth: '80px', maxHeight: '80px', marginBottom: '10px' },
    companyNameText: { fontSize: '1.4em', margin: '0 0 5px 0', fontWeight: 'bold' },
    headerText: { margin: '2px 0', fontSize: '0.9em' },
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

// --- COMPONENTS ---

const PrintableLayout = ({ invoice, companyInfo, onImageLoad, serviceJob, orderDetails }) => {
  if (!invoice || (!Array.isArray(invoice.items) && !serviceJob && !orderDetails)) {
    return null;
  }

  const isSinhala = companyInfo?.useSinhalaInvoice || false;
  const isServiceOrder = invoice.invoiceNumber?.startsWith('SRV');
  const isOrder = invoice.invoiceNumber?.startsWith('ORD');

  const invSubtotal = invoice.items ? invoice.items.reduce((sum, item) => sum + item.price * item.quantity, 0) : 0;
  const deliveryCharge = Number(invoice.deliveryCharge) || 0;
  const invTotal = invSubtotal + deliveryCharge;
  
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
    const orig = item.originalPrice || item.price;
    return sum + (orig - item.price) * item.quantity;
  }, 0) : 0;

  const formatDate = (dateVal) => {
      if (!dateVal) return 'N/A';
      if (dateVal.toDate) return dateVal.toDate().toLocaleDateString(); 
      return new Date(dateVal).toLocaleDateString();
  };

  return (
    <div style={styles.invoiceBox}>
      <div className="invoice-header-section">
        <div className="company-details">
            {companyInfo?.companyLogo && (
            <img 
                src={companyInfo.companyLogo} 
                style={styles.logo} 
                alt="Company Logo" 
                onLoad={onImageLoad}
                onError={onImageLoad}
            />
            )}
            <h1 style={styles.companyNameText}>{companyInfo?.companyName || "Your Company"}</h1>
            <p style={styles.headerText}>{companyInfo?.companyAddress || "123 Main St, City"}</p>
            {companyInfo?.phone && <p style={styles.headerText}>{companyInfo.phone}</p>}
        </div>
        
        <div className="invoice-meta-details">
            <h3 style={{marginTop:0, borderBottom: '2px solid #000', paddingBottom: 5}}>
                {isServiceOrder ? "SERVICE ORDER" : isOrder ? "CUSTOMER ORDER" : "INVOICE"}
            </h3>
            <p><strong>{isServiceOrder || isOrder ? "Order #:" : "Invoice #:"}</strong> {invoice.invoiceNumber}</p>
            <p><strong>Date:</strong> {dateObj.toLocaleDateString()}</p>
            <p><strong>Customer:</strong> {invoice.customerName}</p>
            {invoice.customerTelephone && <p><strong>Tel:</strong> {invoice.customerTelephone}</p>}
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
      
      <div className={isServiceOrder ? "no-print" : ""}>
          {isServiceOrder && <h4 style={{marginTop: 20, marginBottom: 5, color: '#444'}}>Billing Details (Office View)</h4>}
          <table style={styles.itemsTable}>
            <thead>
              <tr>
                <th style={{ ...styles.th, ...styles.thItem }}>
                    {isSinhala ? "අයිතමය" : "Item / Service"}
                </th>
                <th style={styles.th}>Qty</th>
                {invoice.isDiscountable && (
                    <th style={styles.th}>{isSinhala ? "මිල" : "Orig. Price"}</th>
                )}
                <th style={styles.th}>
                    {invoice.isDiscountable 
                        ? (isSinhala ? "අපේ මිල" : "Our Price") 
                        : (isSinhala ? "මිල" : "Rate")
                    }
                </th>
                <th style={styles.th}>{isSinhala ? "එකතුව" : "Total"}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items && invoice.items.map((item, index) => (
                <tr key={index}>
                  <td style={styles.td}>{item.itemName}</td>
                  <td style={{ ...styles.td, ...styles.tdCenter }}>{item.quantity}</td>
                  {invoice.isDiscountable && (
                      <td style={{ ...styles.td, ...styles.tdRight }}>{(item.originalPrice || item.price).toFixed(2)}</td>
                  )}
                  <td style={{ ...styles.td, ...styles.tdRight }}>{item.price.toFixed(2)}</td>
                  <td style={{ ...styles.td, ...styles.tdRight }}>{(item.quantity * item.price).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>

      <div className="invoice-footer-section">
        <div style={styles.totalsContainer}>
            <div style={styles.totals}>
                {isServiceOrder ? (
                    <div style={{border: '2px solid #000', padding: '10px', marginTop: '15px', borderRadius: '4px'}}>
                        <div style={styles.totalRow}><strong>Total Job Amount:</strong><span>Rs. {jobTotal.toFixed(2)}</span></div>
                        <div style={styles.totalRow}><strong>Advance Paid:</strong><span>Rs. {jobAdvance.toFixed(2)}</span></div>
                        <hr style={styles.hr} />
                        <div style={{ ...styles.totalRow, fontSize: '1.2em', marginTop: '5px' }}><strong>Balance Due:</strong><span>Rs. {jobBalance.toFixed(2)}</span></div>
                    </div>
                ) : isOrder ? (
                     <div style={{border: '1px dashed #000', padding: '10px', marginTop: '15px'}}>
                        <div style={styles.totalRow}><strong>Subtotal:</strong><span>Rs. {invSubtotal.toFixed(2)}</span></div>
                        {deliveryCharge > 0 && <div style={styles.totalRow}><strong>Delivery Charge:</strong><span>Rs. {deliveryCharge.toFixed(2)}</span></div>}
                        <div style={styles.totalRow}><strong>Grand Total:</strong><span>Rs. {orderTotal.toFixed(2)}</span></div>
                        <hr style={styles.hr} />
                        <div style={styles.totalRow}><strong>Advance Paid:</strong><span>Rs. {orderAdvance.toFixed(2)}</span></div>
                        <div style={{ ...styles.totalRow, fontSize: '1.2em', marginTop: '5px' }}><strong>Balance Due:</strong><span>Rs. {orderBalance.toFixed(2)}</span></div>
                     </div>
                ) : (
                    <>
                        <div style={styles.totalRow}><strong>{isSinhala ? "එකතුව" : "Subtotal"}:</strong><span>Rs. {invSubtotal.toFixed(2)}</span></div>
                        {invoice.isDiscountable && totalSave > 0 && (
                            <div style={styles.totalRow}><span>{isSinhala ? "ඔබේ ඉතිරිය" : "Your Total Save"}:</span><span style={{ fontWeight: 'bold' }}>Rs. {totalSave.toFixed(2)}</span></div>
                        )}
                        {deliveryCharge > 0 && <div style={styles.totalRow}><strong>Delivery:</strong><span>Rs. {deliveryCharge.toFixed(2)}</span></div>}
                        <div style={styles.totalRow}><strong>{isSinhala ? "මුළු මුදල" : "Grand Total"}:</strong><span>Rs. {invTotal.toFixed(2)}</span></div>
                        <hr style={styles.hr} />
                        <div style={styles.totalRow}><strong>{isSinhala ? "ලැබුණු මුදල" : "Amount Received"}:</strong><span>Rs. {invReceived.toFixed(2)}</span></div>
                        <div style={{ ...styles.totalRow, fontSize: '1.1em' }}><strong>{isSinhala ? "ඉතිරි මුදල" : "Balance"}:</strong><span>Rs. {invBalance.toFixed(2)}</span></div>
                    </>
                )}
            </div>
        </div>
      </div>
      
      {isServiceOrder ? (
          <div style={{marginTop: 30, borderTop: '1px solid #000', paddingTop: 10, fontSize: '0.8em'}}>
            <p><strong>Terms:</strong> Please bring this receipt when collecting your item. Items not collected within 30 days may be disposed of.</p>
          </div>
      ) : (
          <div style={styles.footer}><p>Thank you for your business!</p></div>
      )}
      <div style={styles.creditFooter}><p>Wayne Software Solutions | 078 722 3407</p></div>
    </div>
  );
};

// 2. BrowserPrintComponent
const BrowserPrintComponent = ({ invoice, companyInfo, onPrintFinished }) => {
    const [isImageLoaded, setIsImageLoaded] = useState(!companyInfo?.companyLogo);
    const isPrintReady = invoice && (isImageLoaded || !companyInfo?.companyLogo);
    const [portalNode, setPortalNode] = useState(null);

    useEffect(() => {
        const node = document.createElement('div');
        node.className = 'print-portal-root';
        document.body.appendChild(node);
        setPortalNode(node);
        return () => { if (document.body.contains(node)) document.body.removeChild(node); }
    }, []);

    useEffect(() => {
        if (!portalNode) return;
        const style = document.createElement('style');
        style.innerHTML = `
            .print-portal-root { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0,0,0,0.6); z-index: 99999; display: flex; align-items: center; justify-content: center; }
            .print-area-wrapper-screen { background: white; width: 80mm; max-height: 90vh; overflow-y: auto; box-shadow: 0 0 20px rgba(0,0,0,0.5); font-family: 'Inter', sans-serif; }
            .invoice-header-section { text-align: center; }
            .invoice-meta-details { text-align: center; margin-top: 10px; }
            .company-details { text-align: center; }
            .totalsContainer { width: 100%; }
            .totals { padding-top: 10px; }
            @media print {
                body > *:not(.print-portal-root) { display: none !important; }
                html, body { margin: 0 !important; padding: 0 !important; height: 100% !important; overflow: visible !important; background: #fff !important; }
                .print-portal-root { position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; height: auto !important; background: white !important; display: block !important; margin: 0 !important; padding: 0 !important; z-index: 99999 !important; visibility: visible !important; }
                .print-area-wrapper-screen { width: 100% !important; box-shadow: none !important; max-height: none !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; background: white !important; display: block !important; }
                .no-print { display: none !important; }
                @page { size: auto; margin: 0mm; }
                table { width: 100%; border-collapse: collapse; }
                .invoice-header-section, .company-details, .invoice-meta-details { text-align: center; }
                .invoice-footer-section { margin-top: 20px;}
            }
        `;
        document.head.appendChild(style);
        return () => document.head.removeChild(style);
    }, [portalNode]);

    useEffect(() => {
        if (isPrintReady && portalNode) {
            const timer = setTimeout(() => window.print(), 800);
            return () => clearTimeout(timer);
        }
    }, [isPrintReady, portalNode]);

    useEffect(() => {
        const handleAfterPrint = () => onPrintFinished();
        const handleKeyDown = (e) => { if (e.key === 'Escape') { e.preventDefault(); onPrintFinished(); } };
        window.addEventListener('afterprint', handleAfterPrint);
        window.addEventListener('keydown', handleKeyDown);
        return () => { window.removeEventListener('afterprint', handleAfterPrint); window.removeEventListener('keydown', handleKeyDown); };
    }, [onPrintFinished]);

    if (!portalNode) return null;

    return ReactDOM.createPortal(
        <div className="print-area-wrapper-screen">
             <div className="no-print" style={{ textAlign: 'center', padding: '10px', background: '#333', color: '#fff', fontSize: '12px' }}>{isPrintReady ? 'Printing... (Press ESC to close)' : 'Loading preview...'}</div>
            {invoice ? <PrintableLayout invoice={invoice} companyInfo={companyInfo} onImageLoad={() => setIsImageLoaded(true)} /> : <p>Loading...</p>}
        </div>, portalNode
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
        <div style={styles.confirmOverlay}>
            <div style={{...styles.confirmPopup, minWidth: '450px'}}>
                <h4>Direct Print with QZ Tray</h4>
                <div style={styles.qzStatus}><strong>Status:</strong><span style={{color: '#10b981', marginLeft: '8px'}}>{autoPrintingStatus || status}</span></div>
                {!isConnecting && !autoPrintingStatus && (
                    <div style={styles.qzControls}>
                        <label style={styles.label}>Select Printer</label>
                        <select value={selectedPrinter} onChange={e => setSelectedPrinter(e.target.value)} style={{...styles.input, marginBottom: '20px'}}>{printers.map(p => <option key={p} value={p}>{p}</option>)}</select>
                        <button onClick={handlePrint} disabled={isPrinting} style={styles.saveButton}>{isPrinting ? 'Printing...' : 'Print'}</button>
                    </div>
                )}
                <button onClick={onClose} style={styles.closeButton}>Cancel</button>
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
  
  const [showQZPrintModal, setShowQZPrintModal] = useState(false);
  const [invoiceToPrint, setInvoiceToPrint] = useState(null);
  const [isQzReady, setIsQzReady] = useState(false);
  const [deliveryCharge, setDeliveryCharge] = useState("");
  const deliveryChargeRef = useRef(null);
  const [deliveryChargeMode, setDeliveryChargeMode] = useState(false);
  const [isPrintingBrowser, setIsPrintingBrowser] = useState(false);
  const [isCustomerDiscountable, setIsCustomerDiscountable] = useState(false);

  const containerRef = useRef(null);
  const itemInputRef = useRef(null);
  const qtyInputRef = useRef(null);
  const receivedAmountRef = useRef(null);

  // Helper: Get Date in Sri Lanka Time
  const getSriLankaDate = () => {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' }); // YYYY-MM-DD
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

  const fetchProvisionalInvoiceNumber = async () => {
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
  };

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
      }
    };
    initialize();
  }, []);
  
  useEffect(() => { if (selectedShift) localStorage.setItem('savedSelectedShift', selectedShift); }, [selectedShift]);

  useEffect(() => {
    const fetchCustomerData = async () => {
      if (!selectedCustomer || !auth.currentUser) { setItems([]); setIsCustomerDiscountable(false); return; }
      const pricedItemsColRef = collection(db, auth.currentUser.uid, "price_categories", "priced_items");
      const q = query(pricedItemsColRef, where("categoryId", "==", selectedCustomer.priceCategoryId));
      const itemsSnap = await getDocs(q);
      setItems(itemsSnap.docs.map(d => ({ ...d.data(), id: d.id })));

      if(selectedCustomer.priceCategoryId) {
         const catRef = doc(db, auth.currentUser.uid, "price_categories", "categories", selectedCustomer.priceCategoryId);
         getDoc(catRef).then(catSnap => setIsCustomerDiscountable(catSnap.exists() && catSnap.data().isDiscountable));
      } else { setIsCustomerDiscountable(false); }
    };
    fetchCustomerData();
  }, [selectedCustomer]);

  useEffect(() => {
    if (!itemInput.trim()) { setFilteredItems([]); setShowDropdown(false); return; }
    const term = itemInput.toLowerCase();
    const filtered = items.filter(i => i.itemName.toLowerCase().includes(term) || (i.itemSKU && i.itemSKU.toLowerCase().includes(term)) || (i.pid && String(i.pid).toLowerCase().includes(term)));
    setFilteredItems(filtered); setSelectedIndex(0); setShowDropdown(filtered.length > 0);
  }, [itemInput, items]);

  useEffect(() => {
    const handleShortcuts = (e) => {
      if (showPaymentConfirm || isSaving || showQZPrintModal || isPrintingBrowser) return;
      if (e.altKey && e.key.toLowerCase() === "s") { e.preventDefault(); handleSaveAttempt(); }
      if (e.key === "F2") { e.preventDefault(); setCheckoutFocusMode(false); setDeliveryChargeMode(false); setAmountReceivedMode(p => !p); }
      if (e.key === "F10") { e.preventDefault(); setAmountReceivedMode(false); setDeliveryChargeMode(false); setCheckoutFocusMode(p => !p); }
      if (e.key === "F5") { e.preventDefault(); setCheckoutFocusMode(false); setAmountReceivedMode(false); setDeliveryChargeMode(p => !p); }
    };
    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, [checkout, selectedCustomer, selectedShift, showPaymentConfirm, isSaving, showQZPrintModal, isPrintingBrowser]);

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
  
  const handleItemKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(p => (p + 1) % filteredItems.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(p => (p - 1 + filteredItems.length) % filteredItems.length); }
    else if (e.key === "Enter") { e.preventDefault(); if (filteredItems[selectedIndex]) handleItemSelect(filteredItems[selectedIndex]); }
  };
  const handleItemSelect = (item) => { setItemInput(item.itemName); setShowDropdown(false); setTimeout(() => qtyInputRef.current?.focus(), 50); };
  const handleQtyKeyDown = (e) => { if (e.key === "Enter") { e.preventDefault(); addItemToCheckout(); } };
  const handleQtyChange = (e) => { const v = e.target.value; if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) setQtyInput(v); };
  
  const addItemToCheckout = () => {
    if (!itemInput || !qtyInput || isNaN(qtyInput) || qtyInput <= 0) return;
    const itemData = items.find(i => i.itemName === itemInput);
    if (!itemData) return alert("Item not found.");
    const existingIdx = checkout.findIndex(i => i.itemId === itemData.itemId);
    if (existingIdx > -1) {
        const newCheckout = [...checkout]; newCheckout[existingIdx].quantity += Number(qtyInput); setCheckout(newCheckout);
    } else setCheckout(p => [...p, { ...itemData, quantity: Number(qtyInput) }]);
    setItemInput(""); setQtyInput(1); setShowDropdown(false); itemInputRef.current?.focus();
  };
  const removeCheckoutItem = (idx) => setCheckout(p => p.filter((_, i) => i !== idx));
  const resetForm = async () => { await fetchProvisionalInvoiceNumber(); setCheckout([]); setReceivedAmount(""); setDeliveryCharge(""); itemInputRef.current?.focus(); };
  
  // --- UPDATED SAVE FUNCTION WITH ALL READS BEFORE WRITES ---
  const executeSaveInvoice = async (method) => {
    const user = auth.currentUser;
    if (!user) return alert("Not logged in.");
    setIsSaving(true); setShowPaymentConfirm(false);
    
    try {
      const today = new Date();
      const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
      
      const counterRef = doc(db, user.uid, "counters");
      
      let walletDocId = null;
      if (method === 'Cash') walletDocId = 'cash';
      else if (method === 'Card') walletDocId = 'card';
      else if (method === 'Online') walletDocId = 'online';
      
      const walletRef = walletDocId ? doc(db, user.uid, "wallet", "accounts", walletDocId) : null;

      // 1. Prepare Daily Stats Ref (Daily Sales + COGS)
      const dailyDateString = getSriLankaDate(); 
      const dailyStatsRef = doc(db, user.uid, "daily_stats", "entries", dailyDateString);

      const finalInvoiceData = await runTransaction(db, async (t) => {
        // --- ALL READS FIRST ---

        // 1. Read Item Costs for COGS
        let invoiceTotalCOGS = 0;
        for (const item of checkout) {
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

        // 2. Read Daily Stats (COGS & Sales)
        const dailyStatsSnap = await t.get(dailyStatsRef);
        const currentDailyCOGS = dailyStatsSnap.exists() ? (Number(dailyStatsSnap.data().totalCOGS) || 0) : 0;
        const currentDailySales = dailyStatsSnap.exists() ? (Number(dailyStatsSnap.data().totalSales) || 0) : 0;
        
        // 3. Read Counter
        const cDoc = await t.get(counterRef);
        const nextSeq = (cDoc.exists() ? cDoc.data().invoiceCounters?.[datePrefix] || 0 : 0) + 1;
        
        // 4. Read Wallet
        let currentWalletBalance = 0;
        if (walletRef) {
            const wDoc = await t.get(walletRef);
            if (wDoc.exists()) {
                currentWalletBalance = Number(wDoc.data().balance) || 0;
            }
        }

        // --- ALL WRITES AFTER ---
        
        // 1. Update Daily Stats (Sales & COGS)
        const newDailyCOGS = currentDailyCOGS + invoiceTotalCOGS;
        const newDailySales = currentDailySales + total; // Add current invoice total to daily sales

        t.set(dailyStatsRef, { 
            totalCOGS: newDailyCOGS,
            totalSales: newDailySales,
            date: dailyDateString,
            lastUpdated: serverTimestamp()
        }, { merge: true });

        // 2. Update Counter
        t.set(counterRef, { invoiceCounters: { [datePrefix]: nextSeq } }, { merge: true });
        
        // 3. Create Invoice
        const newInvNum = `INV-${datePrefix}-${String(nextSeq).padStart(4, "0")}`;
        const invData = {
          customerId: selectedCustomer.value, customerName: selectedCustomer.label, items: checkout, 
          total, deliveryCharge: Number(deliveryCharge) || 0,
          received: selectedCustomer.isCreditCustomer ? 0 : (Number(receivedAmount) || 0),
          balance: selectedCustomer.isCreditCustomer ? total : balance,
          createdAt: serverTimestamp(), invoiceNumber: newInvNum, issuedBy: internalUser?.username || "Admin", 
          shift: selectedShift || "", paymentMethod: method, isDiscountable: isCustomerDiscountable,
          totalCOGS: invoiceTotalCOGS // Save COGS to invoice for future deletion logic
        };
        const newRef = doc(collection(db, user.uid, "invoices", "invoice_list"));
        t.set(newRef, invData);

        // 4. Update Wallet
        if (walletRef) {
            const newBalance = currentWalletBalance + invData.total;
            t.set(walletRef, { 
                balance: newBalance,
                lastUpdated: serverTimestamp() 
            }, { merge: true });
        }
        
        return { ...invData, createdAt: new Date(), invoiceNumber: newInvNum };
      });

      if (settings?.autoPrintInvoice) {
        setInvoiceToPrint(finalInvoiceData); 
        if (settings?.openCashDrawerWithPrint) setShowQZPrintModal(true);
        else setIsPrintingBrowser(true);
      } else { alert("Saved!"); await resetForm(); }
    } catch (e) { console.error(e); alert("Save failed: " + e.message); } finally { setIsSaving(false); }
  };
  
  const handleSaveAttempt = () => {
    if (!selectedCustomer || checkout.length === 0) return alert("Select customer and add items.");
    if (shiftProductionEnabled && !selectedShift) return alert("Select shift.");
    if (selectedCustomer.isCreditCustomer) executeSaveInvoice('Credit');
    else { setConfirmPaymentMethod('Cash'); setShowPaymentConfirm(true); }
  };

  useEffect(() => {
    const handleKey = (e) => {
        if (!showPaymentConfirm) return;
        const idx = paymentOptions.indexOf(confirmPaymentMethod);
        if (e.key === 'ArrowRight') setConfirmPaymentMethod(paymentOptions[(idx + 1) % 3]);
        if (e.key === 'ArrowLeft') setConfirmPaymentMethod(paymentOptions[(idx - 1 + 3) % 3]);
        if (e.key === 'Enter') executeSaveInvoice(confirmPaymentMethod);
        if (e.key === 'Escape') setShowPaymentConfirm(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showPaymentConfirm, confirmPaymentMethod, executeSaveInvoice]); 

  const subtotal = checkout.reduce((s, i) => s + i.price * i.quantity, 0);
  const total = subtotal + (Number(deliveryCharge) || 0);
  const balance = (Number(receivedAmount) || 0) - total; 
  const displayBalance = (Number(receivedAmount) || 0) === 0 ? 0 : balance;
  const isSaveDisabled = !selectedCustomer || checkout.length === 0 || (balance < 0 && (Number(receivedAmount) || 0) > 0);

  return (
    <div ref={containerRef} style={styles.container}>
      {isSaving && !showQZPrintModal && !isPrintingBrowser && ( <div style={styles.savingOverlay}><div style={styles.savingSpinner}></div><p>Saving...</p></div> )}
      {showQZPrintModal && ( <QZPrintModal invoice={invoiceToPrint} companyInfo={settings} isQzReady={isQzReady} onClose={() => { setShowQZPrintModal(false); setInvoiceToPrint(null); resetForm(); }} /> )}
      {isPrintingBrowser && invoiceToPrint && ( <BrowserPrintComponent invoice={invoiceToPrint} companyInfo={settings} onPrintFinished={async () => { setIsPrintingBrowser(false); setInvoiceToPrint(null); await resetForm(); }} /> )}

      <button onClick={toggleFullscreen} style={styles.fullscreenButton}>{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}</button>
      
      <div style={styles.leftPanel}>
        <div style={styles.header}>
            <div style={{textAlign: 'left'}}><div style={styles.invoiceLabel}>INVOICE #</div><div style={styles.invoiceNumber}>{invoiceNumber}</div></div>
            {shiftProductionEnabled && ( <div style={{textAlign: 'center'}}><label style={styles.invoiceLabel}>SHIFT</label><select value={selectedShift} onChange={e => setSelectedShift(e.target.value)} style={styles.shiftSelect}><option value="">Select Shift</option>{availableShifts.map(s => <option key={s} value={s}>{s}</option>)}</select></div> )}
            <div style={{textAlign: 'right'}}><div style={styles.invoiceLabel}>ISSUED BY</div><div style={styles.invoiceNumber}>{internalUser?.username || 'Admin'}</div></div>
        </div>
        <div style={styles.customerSection}><label style={styles.label}>CUSTOMER</label><Select options={customers} value={selectedCustomer} onChange={setSelectedCustomer} placeholder="Select a customer..." /></div>
        <div style={styles.itemEntrySection}>
          <div style={{position: 'relative', flex: 1}}>
            <label style={styles.label}>ADD ITEM</label>
            <input ref={itemInputRef} value={itemInput} onChange={e => setItemInput(e.target.value)} onKeyDown={handleItemKeyDown} placeholder="Type item name, SKU, or PID..." style={styles.input} />
            {showDropdown && filteredItems.length > 0 && ( <ul style={styles.dropdown}>{filteredItems.map((i, idx) => ( <li key={i.id} style={{...styles.dropdownItem, ...(idx === selectedIndex ? styles.dropdownItemSelected : {})}} onClick={() => handleItemSelect(i)}>{i.itemName}<span style={styles.dropdownPrice}>Rs. {i.price.toFixed(2)}</span></li> ))}</ul> )}
          </div>
          <div style={{width: '120px'}}><label style={styles.label}>QTY</label><input ref={qtyInputRef} value={qtyInput} onChange={handleQtyChange} onKeyDown={handleQtyKeyDown} onFocus={(e) => e.target.select()} type="text" inputMode="decimal" style={styles.input} /></div>
          <button onClick={addItemToCheckout} style={styles.addButton}>ADD</button>
        </div>
        <div style={styles.shortcutsHelp}>
          <h4 style={styles.shortcutsTitle}>Keyboard Shortcuts</h4>
          <div style={styles.shortcutItem}><b>F2:</b> Focus 'Amount Received'</div>
          <div style={styles.shortcutItem}><b>F5:</b> Focus 'Delivery Charges'</div>
          <div style={styles.shortcutItem}><b>F10:</b> Activate Checkout List</div>
          <div style={styles.shortcutItem}><b>Alt + S:</b> Save Invoice</div>
          <div style={styles.shortcutItem}><b>Esc:</b> Exit</div>
        </div>
      </div>
      
      <div style={styles.rightPanel}>
        <div style={{...styles.checkoutCard, ...(checkoutFocusMode ? styles.activeCard : {})}}>
            <h3 style={styles.checkoutTitle}>CHECKOUT (F10)</h3>
            <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>ITEM</th><th style={styles.th}>QTY</th><th style={styles.th}>TOTAL</th><th style={styles.th}></th></tr></thead>
                  <tbody>{checkout.length === 0 ? ( <tr><td colSpan="4" style={styles.emptyState}>No items added</td></tr> ) : ( checkout.map((c, idx) => ( <tr key={idx} style={idx === highlightedCheckoutIndex ? styles.highlightedRow : {}}><td style={styles.td}>{c.itemName}</td><td style={styles.td}>{c.quantity}</td><td style={styles.td}>Rs. {(c.price * c.quantity).toFixed(2)}</td><td style={styles.td}><button onClick={() => removeCheckoutItem(idx)} style={styles.removeButton}>✕</button></td></tr> )) )}</tbody>
                </table>
            </div>
            <div style={styles.totalsSection}>
                <div style={styles.totalRow}><span>Subtotal</span><span>Rs. {subtotal.toFixed(2)}</span></div>
                {settings?.offerDelivery && ( <div style={styles.totalRow}><label htmlFor="deliveryCharge" style={{cursor: 'pointer'}}>Delivery (F5)</label><input ref={deliveryChargeRef} id="deliveryCharge" type="number" value={deliveryCharge} onChange={e => setDeliveryCharge(e.target.value)} style={{...styles.input, ...styles.deliveryInput, ...(deliveryChargeMode ? styles.activeInput : {})}} placeholder="0.00" /></div> )}
                <div style={styles.grandTotalRowScreen}><span>TOTAL</span><span>Rs. {total.toFixed(2)}</span></div>
            </div>
            <div style={styles.paymentSection}>
                <label style={styles.label}>AMOUNT RECEIVED (F2)</label>
                <input ref={receivedAmountRef} type="number" value={selectedCustomer?.isCreditCustomer ? '' : receivedAmount} onChange={e => setReceivedAmount(e.target.value)} placeholder={selectedCustomer?.isCreditCustomer ? 'CREDIT SALE' : '0.00'} style={{...styles.input, ...styles.amountInput, ...(amountReceivedMode ? styles.activeInput : {})}} disabled={selectedCustomer?.isCreditCustomer} />
            </div>
            <div style={styles.balanceRow}><span>BALANCE</span><span style={{color: displayBalance >= 0 ? '#10b981' : '#ef4444'}}>Rs. {displayBalance.toFixed(2)}</span></div>
            <button onClick={handleSaveAttempt} disabled={isSaveDisabled || isSaving} style={{...styles.saveButton, ...((isSaveDisabled || isSaving) ? styles.saveButtonDisabled : {})}}>{isSaving ? 'SAVING...' : 'SAVE INVOICE (ALT+S)'}</button>
        </div>
      </div>
      
      {showPaymentConfirm && (
        <div style={styles.confirmOverlay}>
          <div style={styles.confirmPopup}>
            <h4>Select Payment Method</h4>
            <p>Use ← → arrow keys and press Enter to confirm.</p>
            <div style={styles.confirmButtons}>
                {paymentOptions.map(m => ( <button key={m} onClick={() => executeSaveInvoice(m)} style={confirmPaymentMethod === m ? styles.confirmButtonActive : styles.confirmButton}>{m === 'Online' ? 'Online Transfer' : `${m} Payment`}</button> ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Invoice;