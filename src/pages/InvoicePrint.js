/* global qz */
import React, { useEffect, useState, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import { getFunctions, httpsCallable } from "firebase/functions";
import "./Invoice.css"; // Ensure styles are applied

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

// 1. PrintableLayout
export const PrintableLayout = ({ invoice, companyInfo, onImageLoad, serviceJob, orderDetails }) => {
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
                
                {invoice.note && (
                    <p style={{ marginTop: '5px', fontWeight: 'bold', fontStyle: 'italic', background: '#f3f4f6', padding: '2px 5px' }}>
                        Note: {invoice.note}
                    </p>
                )}

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
export const BrowserPrintComponent = ({ invoice, companyInfo, onPrintFinished }) => {
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

// 3. QZPrintModal
export const QZPrintModal = ({ invoice, companyInfo, onClose, isQzReady }) => {
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