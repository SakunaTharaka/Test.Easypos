import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db, auth } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const InvoiceHeader = ({ companyInfo, onPrint, isPrintReady, isServiceOrder }) => {
    return (
        <div style={styles.topBar}>
            <div style={styles.headerLeft}>
                <div style={styles.logoPlaceholder}>
                    {companyInfo?.companyLogo ? (
                        <img src={companyInfo.companyLogo} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }}/>
                    ) : (
                        companyInfo?.companyName?.charAt(0) || "B"
                    )}
                </div>
                <div style={styles.topInfo}>
                    <h2 style={styles.companyName}>{companyInfo?.companyName || "Business"}</h2>
                    <p style={styles.wayneSystems}>
                        {isServiceOrder ? "Service Management System" : "Wayne Systems"}
                    </p> 
                </div>
            </div>
            
            <div style={styles.headerRight}>
                <div style={styles.printButtonsContainer}>
                    <button onClick={() => onPrint('80mm')} disabled={!isPrintReady} style={isPrintReady ? styles.headerPrintBtn : styles.headerPrintBtnDisabled}>
                        Print 80mm
                    </button>
                    <button onClick={() => onPrint('A5')} disabled={!isPrintReady} style={isPrintReady ? styles.headerPrintBtn : styles.headerPrintBtnDisabled}>
                        Print A5
                    </button>
                </div>
            </div>
        </div>
    );
};

const PrintableLayout = ({ invoice, companyInfo, onImageLoad, serviceJob, orderDetails }) => {
  if (!invoice || (!Array.isArray(invoice.items) && !serviceJob && !orderDetails)) {
    return null;
  }

  // ✅ Check Language Setting
  const isSinhala = companyInfo?.useSinhalaInvoice || false;

  const isServiceOrder = invoice.invoiceNumber?.startsWith('SRV');
  const isOrder = invoice.invoiceNumber?.startsWith('ORD');

  // --- Calculations ---
  const invSubtotal = invoice.items ? invoice.items.reduce((sum, item) => sum + item.price * item.quantity, 0) : 0;
  const deliveryCharge = Number(invoice.deliveryCharge) || 0;
  const invTotal = invSubtotal + deliveryCharge;
  const invReceived = invoice.received !== undefined ? Number(invoice.received) : (Number(invoice.advanceAmount) || 0);
  
  // ✅ LOGIC UPDATE: If received is 0, Balance is 0
  const invBalance = invReceived === 0 ? 0 : (invTotal - invReceived);

  // Service Job Specific Calculations
  const jobTotal = serviceJob ? Number(serviceJob.totalCharge || 0) : invTotal;
  const jobAdvance = serviceJob ? Number(serviceJob.advanceAmount || 0) : invReceived;
  
  // ✅ LOGIC UPDATE: If advance is 0, Balance is 0
  const jobBalance = jobAdvance === 0 ? 0 : (jobTotal - jobAdvance);

  // Order Specific Calculations
  const orderTotal = orderDetails ? Number(orderDetails.totalAmount || 0) : invTotal;
  const orderAdvance = orderDetails ? Number(orderDetails.advanceAmount || 0) : invReceived;
  
  // ✅ LOGIC UPDATE: If advance is 0, Balance is 0
  const orderBalance = orderAdvance === 0 ? 0 : (orderTotal - orderAdvance);

  // Calculate Total Savings if discountable
  const totalSave = invoice.items ? invoice.items.reduce((sum, item) => {
    const orig = item.originalPrice || item.price;
    return sum + (orig - item.price) * item.quantity;
  }, 0) : 0;

  // Format Date Helper
  const formatDate = (dateVal) => {
      if (!dateVal) return 'N/A';
      if (dateVal.toDate) return dateVal.toDate().toLocaleDateString(); 
      return new Date(dateVal).toLocaleDateString();
  };

  return (
    <div style={styles.invoiceBox}>
      {/* --- HEADER SECTION --- */}
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
            <p><strong>Date:</strong> {invoice.createdAt?.toDate().toLocaleDateString()}</p>
            <p><strong>Customer:</strong> {invoice.customerName}</p>
            {invoice.customerTelephone && <p><strong>Tel:</strong> {invoice.customerTelephone}</p>}
            
            {/* SHOW DELIVERY DATE FOR ORDERS */}
            {isOrder && orderDetails && orderDetails.deliveryDate && (
                 <p style={{marginTop: 5, fontWeight: 'bold'}}>
                    <strong>Delivery Date:</strong> {formatDate(orderDetails.deliveryDate)}
                 </p>
            )}

            {/* SERVICE DETAILS */}
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
      
      {/* --- ITEMS TABLE (Hidden in Print for Service Orders only) --- */}
      <div className={isServiceOrder ? "no-print" : ""}>
          {isServiceOrder && <h4 style={{marginTop: 20, marginBottom: 5, color: '#444'}}>Billing Details (Office View)</h4>}
          
          <table style={styles.itemsTable}>
            <thead>
              <tr>
                {/* ✅ TRANSLATION: Item / Service */}
                <th style={{ ...styles.th, ...styles.thItem }}>
                    {isSinhala ? "අයිතමය" : "Item / Service"}
                </th>
                <th style={styles.th}>Qty</th>
                
                {/* Conditional Columns for Discountable Categories */}
                {invoice.isDiscountable && (
                    /* ✅ TRANSLATION: Orig. Price */
                    <th style={styles.th}>{isSinhala ? "මිල" : "Orig. Price"}</th>
                )}

                <th style={styles.th}>
                    {/* ✅ TRANSLATION: Our Price (Also handles 'Rate') */}
                    {invoice.isDiscountable 
                        ? (isSinhala ? "අපේ මිල" : "Our Price") 
                        : (isSinhala ? "මිල" : "Rate")
                    }
                </th>

                {/* ✅ TRANSLATION: Total */}
                <th style={styles.th}>{isSinhala ? "එකතුව" : "Total"}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items && invoice.items.map((item, index) => (
                <tr key={index}>
                  <td style={styles.td}>{item.itemName}</td>
                  <td style={{ ...styles.td, ...styles.tdCenter }}>{item.quantity}</td>
                  
                  {/* Conditional Cells for Discountable Categories */}
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

      {/* --- TOTALS / FINANCIALS --- */}
      <div className="invoice-footer-section">
        <div style={styles.totalsContainer}>
            <div style={styles.totals}>
                
                {/* 1. SERVICE ORDER TOTALS */}
                {isServiceOrder ? (
                    <div style={{border: '2px solid #000', padding: '10px', marginTop: '15px', borderRadius: '4px'}}>
                        <div style={styles.totalRow}>
                            <strong>Total Job Amount:</strong>
                            <span>Rs. {jobTotal.toFixed(2)}</span>
                        </div>
                        <div style={styles.totalRow}>
                            <strong>Advance Paid:</strong>
                            <span>Rs. {jobAdvance.toFixed(2)}</span>
                        </div>
                        <hr style={styles.hr} />
                        <div style={{ ...styles.totalRow, fontSize: '1.2em', marginTop: '5px' }}>
                            <strong>Balance Due:</strong>
                            <span>Rs. {jobBalance.toFixed(2)}</span>
                        </div>
                    </div>
                ) : isOrder ? (
                    /* 2. ORDER TOTALS */
                     <div style={{border: '1px dashed #000', padding: '10px', marginTop: '15px'}}>
                        <div style={styles.totalRow}><strong>Subtotal:</strong><span>Rs. {invSubtotal.toFixed(2)}</span></div>
                        {deliveryCharge > 0 && (
                            <div style={styles.totalRow}><strong>Delivery Charge:</strong><span>Rs. {deliveryCharge.toFixed(2)}</span></div>
                        )}
                        <div style={styles.totalRow}><strong>Grand Total:</strong><span>Rs. {orderTotal.toFixed(2)}</span></div>
                        <hr style={styles.hr} />
                        <div style={styles.totalRow}>
                            <strong>Advance Paid:</strong>
                            <span>Rs. {orderAdvance.toFixed(2)}</span>
                        </div>
                        <div style={{ ...styles.totalRow, fontSize: '1.2em', marginTop: '5px' }}>
                            <strong>Balance Due:</strong>
                            <span>Rs. {orderBalance.toFixed(2)}</span>
                        </div>
                     </div>
                ) : (
                    /* 3. STANDARD INVOICE TOTALS (Translating this section) */
                    <>
                        <div style={styles.totalRow}>
                            {/* ✅ TRANSLATION: Subtotal */}
                            <strong>{isSinhala ? "එකතුව" : "Subtotal"}:</strong>
                            <span>Rs. {invSubtotal.toFixed(2)}</span>
                        </div>
                        
                        {/* Show Total Save */}
                        {invoice.isDiscountable && totalSave > 0 && (
                            <div style={styles.totalRow}>
                                {/* ✅ TRANSLATION: Your Total Save */}
                                <span>{isSinhala ? "ඔබේ ඉතිරිය" : "Your Total Save"}:</span>
                                <span style={{ fontWeight: 'bold' }}>Rs. {totalSave.toFixed(2)}</span>
                            </div>
                        )}

                        {deliveryCharge > 0 && (
                            <div style={styles.totalRow}><strong>Delivery:</strong><span>Rs. {deliveryCharge.toFixed(2)}</span></div>
                        )}
                        <div style={styles.totalRow}>
                            {/* ✅ TRANSLATION: Grand Total */}
                            <strong>{isSinhala ? "මුළු මුදල" : "Grand Total"}:</strong>
                            <span>Rs. {invTotal.toFixed(2)}</span>
                        </div>
                        <hr style={styles.hr} />
                        <div style={styles.totalRow}>
                            {/* ✅ TRANSLATION: Amount Received */}
                            <strong>{isSinhala ? "ලැබුණු මුදල" : "Amount Received"}:</strong>
                            <span>Rs. {invReceived.toFixed(2)}</span>
                        </div>
                        <div style={{ ...styles.totalRow, fontSize: '1.1em' }}>
                            {/* ✅ TRANSLATION: Balance */}
                            <strong>{isSinhala ? "ඉතිරි මුදල" : "Balance"}:</strong>
                            <span>Rs. {invBalance.toFixed(2)}</span>
                        </div>
                    </>
                )}
            </div>
        </div>
      </div>
      
      {/* ✅ ADDED ORDER NUMBER DISPLAY (CONDITIONAL) */}
      {companyInfo?.showOrderNo && invoice.dailyOrderNumber && (
        <div style={{textAlign: 'center', marginTop: '15px', borderTop: '2px solid #000', paddingTop: '5px'}}>
            <span style={{fontSize: '1.2em', fontWeight: 'bold'}}>ORDER NO</span>
            <div style={{fontSize: '3em', fontWeight: '900', lineHeight: '1'}}>
                {String(invoice.dailyOrderNumber).padStart(2, '0')}
            </div>
        </div>
      )}

      {/* Footer Disclaimer */}
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

const InvoiceViewer = () => {
  const { invoiceId } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [serviceJob, setServiceJob] = useState(null);
  const [orderDetails, setOrderDetails] = useState(null); 
  const [companyInfo, setCompanyInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [printFormat, setPrintFormat] = useState('80mm');

  const handlePrint = (format) => {
    setPrintFormat(format);
    setTimeout(() => {
        window.print();
    }, 50);
  };

  useEffect(() => {
    const fetchInvoiceData = async (user) => {
      if (!user || !invoiceId) { setLoading(false); return; }
      try {
        const invoiceRef = doc(db, user.uid, "invoices", "invoice_list", invoiceId);
        const settingsRef = doc(db, user.uid, "settings");
        
        const [invoiceSnap, settingsSnap] = await Promise.all([ getDoc(invoiceRef), getDoc(settingsRef) ]);

        if (invoiceSnap.exists()) { 
            const invData = invoiceSnap.data();
            setInvoice(invData); 
            
            // Check for Service Order 
            if (invData.invoiceNumber?.startsWith('SRV') && invData.relatedJobId) {
                const jobRef = doc(db, user.uid, 'data', 'service_jobs', invData.relatedJobId);
                const jobSnap = await getDoc(jobRef);
                if (jobSnap.exists()) setServiceJob(jobSnap.data());
            }

            // Check for Customer Order (ORD)
            if (invData.invoiceNumber?.startsWith('ORD') && invData.relatedOrderId) {
                const orderRef = doc(db, user.uid, 'data', 'orders', invData.relatedOrderId);
                const orderSnap = await getDoc(orderRef);
                if (orderSnap.exists()) setOrderDetails(orderSnap.data());
            }
        }
        
        if (settingsSnap.exists()) {
          const settingsData = settingsSnap.data();
          setCompanyInfo(settingsData);
          if (!settingsData.companyLogo) { setIsImageLoaded(true); }
        } else {
            setIsImageLoaded(true);
        }
        setIsDataLoaded(true);
      } catch (error) {
        console.error("Error fetching document:", error);
      } finally {
        setLoading(false);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => { fetchInvoiceData(user); });
    return () => unsubscribe();
  }, [invoiceId]);

  if (loading) return <p style={{ textAlign: 'center', marginTop: '50px' }}>Loading Document...</p>;
  if (!invoice) return <p style={{ textAlign: 'center', marginTop: '50px' }}>Document not found.</p>;
  
  const isPrintReady = isDataLoaded && isImageLoaded;
  const isServiceOrder = invoice?.invoiceNumber?.startsWith('SRV');

  return (
    <>
      <style>{`
        body {
          background-color: #f0f0f0;
          margin: 0;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        
        @page thermal { size: 80mm auto; margin: 3mm; }
        @page a5sheet { size: A5; margin: 15mm; }

        .print-area-container {
          background: white;
          box-shadow: 0 0 15px rgba(0,0,0,0.15);
          margin: 110px auto 40px auto; 
          transition: all 0.3s ease-in-out;
          transform-origin: top center;
        }
        
        .format-80mm { width: 80mm; transform: scale(1.1); }
        .format-a5 { width: 148mm; transform: scale(1.0); }
        
        /* ✅ SCREEN-ONLY CSS TO FIX PREVIEW OVERFLOW 
           This compacts the table padding ONLY on screen so it fits 80mm. 
           Physical print ignores this and uses the standard inline styles. */
        @media screen {
            .format-80mm .print-area table th, 
            .format-80mm .print-area table td {
                padding: 4px 2px !important;
                font-size: 0.9em !important;
            }
        }
        
        @media print {
          body { background-color: #fff; margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .print-area-container { box-shadow: none; margin: 0; padding: 0; width: 100%; transform: none; }
          .format-80mm .print-area { page: thermal; font-family: 'Courier New', monospace; }
          .format-a5 .print-area { page: a5sheet; font-family: 'Inter', sans-serif; }
          .format-a5 .invoice-header-section { display: flex; justify-content: space-between; align-items: flex-start; }
          .format-a5 .company-details { text-align: left; }
          .format-a5 .invoice-meta-details { text-align: right; }
          .format-a5 .invoice-footer-section { display: flex; justify-content: flex-end; margin-top: 20px;}
          .format-a5 .totalsContainer { width: 50%; }
          .format-80mm .invoice-header-section,
          .format-80mm .company-details,
          .format-80mm .invoice-meta-details { text-align: center; }
        }
      `}</style>

      <div className="no-print">
        <InvoiceHeader 
            companyInfo={companyInfo} 
            onPrint={handlePrint} 
            isPrintReady={isPrintReady}
            isServiceOrder={isServiceOrder}
        />
      </div>

      <div className={`print-area-container format-${printFormat}`}>
        <div className="print-area">
            <PrintableLayout 
            invoice={invoice} 
            companyInfo={companyInfo} 
            onImageLoad={() => setIsImageLoaded(true)} 
            serviceJob={serviceJob}
            orderDetails={orderDetails}
            />
        </div>
      </div>
    </>
  );
};

const themeColors = {
  primary: '#00A1FF',
  secondary: '#F089D7',
};

const styles = {
  // TopBar Container
  topBar: { 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between', 
      height: '80px', 
      padding: '0 32px', 
      background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.85) 0%, rgba(118, 75, 162, 0.85) 100%)', 
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)', 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      right: 0, 
      zIndex: 1000, 
      backdropFilter: 'blur(10px)', 
  },
  
  headerLeft: { display: 'flex', alignItems: 'center', flex: 1, },
  headerRight: { display: 'flex', alignItems: 'center', gap: '16px', flex: 1, justifyContent: 'flex-end', },
  
  logoPlaceholder: { 
    width: "52px", 
    height: "52px", 
    borderRadius: "12px", 
    background: `linear-gradient(135deg, ${themeColors.primary}, ${themeColors.secondary})`, 
    display: "flex", 
    alignItems: "center", 
    justifyContent: "center", 
    color: "white", 
    fontSize: "22px", 
    fontWeight: "bold", 
    marginRight: "16px",
    flexShrink: 0, 
    boxShadow: '0 4px 12px rgba(0, 161, 255, 0.3)',
  },
  
  topInfo: { display: "flex", flexDirection: "column", alignItems: "flex-start" },
  companyName: { 
    margin: "0", 
    fontSize: "22px", 
    fontWeight: "700", 
    color: '#fff', 
    letterSpacing: '-0.5px', 
  },
  wayneSystems: { 
    fontSize: '12px', 
    color: 'rgba(255, 255, 255, 0.7)', 
    margin: '4px 0 0 0', 
    fontStyle: 'italic', 
    fontWeight: '400', 
  },
  
  printButtonsContainer: { display: 'flex', gap: '10px' },
  headerPrintBtn: { 
    padding: "10px 18px", 
    border: "1px solid rgba(255, 255, 255, 0.3)",
    borderRadius: "8px", 
    background: "rgba(255, 255, 255, 0.2)",
    color: "#fff", 
    cursor: "pointer", 
    fontWeight: "600", 
    fontSize: "14px", 
    fontFamily: "'Inter', sans-serif",
    backdropFilter: 'blur(10px)',
    transition: 'all 0.3s ease',
  },
  headerPrintBtnDisabled: { 
    padding: "10px 18px", 
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px", 
    background: "rgba(255, 255, 255, 0.1)",
    color: "rgba(255, 255, 255, 0.5)",
    cursor: "not-allowed", 
    fontWeight: "600", 
    fontSize: "14px", 
    fontFamily: "'Inter', sans-serif" 
  },

  // --- Invoice Body Styles ---
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

export default InvoiceViewer;