import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db, auth } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const InvoiceHeader = ({ companyInfo, onPrint, isPrintReady }) => {
    return (
        <div style={styles.navbar}>
            <div style={styles.logoContainer}>
                <div style={styles.logoPlaceholder}>
                    {companyInfo?.companyLogo ? (
                        <img src={companyInfo.companyLogo} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }}/>
                    ) : (
                        companyInfo?.companyName?.charAt(0) || "B"
                    )}
                </div>
                <div style={styles.topInfo}>
                    <h2 style={styles.companyName}>{companyInfo?.companyName || "Business"}</h2>
                    <p style={styles.wayneSystems}>Wayne Systems</p> 
                </div>
            </div>
            <div style={styles.printButtonsContainer}>
                <button onClick={() => onPrint('80mm')} disabled={!isPrintReady} style={isPrintReady ? styles.headerPrintBtn : styles.headerPrintBtnDisabled}>
                    Print 80mm Receipt
                </button>
                <button onClick={() => onPrint('A5')} disabled={!isPrintReady} style={isPrintReady ? styles.headerPrintBtn : styles.headerPrintBtnDisabled}>
                    Print A5 Invoice
                </button>
            </div>
        </div>
    );
};

const PrintableLayout = ({ invoice, companyInfo, onImageLoad }) => {
  if (!invoice || !Array.isArray(invoice.items)) {
    return null;
  }

  const subtotal = invoice.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  // ✅ **1. Update balance calculation to include delivery charges**
  const totalBeforeReceived = subtotal + (invoice.deliveryCharge || 0);
  const balanceToDisplay = invoice.received === 0 ? 0 : invoice.received - totalBeforeReceived;

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
            <p><strong>Invoice #:</strong> {invoice.invoiceNumber}</p>
            <p><strong>Date:</strong> {invoice.createdAt?.toDate().toLocaleDateString()}</p>
            <p><strong>Customer:</strong> {invoice.customerName}</p>
            <p><strong>Issued By:</strong> {invoice.issuedBy}</p>
        </div>
      </div>
      
      <table style={styles.itemsTable}>
        <thead>
          <tr>
            <th style={{ ...styles.th, ...styles.thItem }}>Item</th>
            <th style={styles.th}>Qty</th>
            <th style={styles.th}>Rate</th>
            <th style={styles.th}>Total</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, index) => (
            <tr key={index}>
              <td style={styles.td}>{item.itemName}</td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>{item.quantity}</td>
              <td style={{ ...styles.td, ...styles.tdRight }}>{item.price.toFixed(2)}</td>
              <td style={{ ...styles.td, ...styles.tdRight }}>{(item.quantity * item.price).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="invoice-footer-section">
        <div className="remarks-area">
        </div>
        <div style={styles.totalsContainer}>
            <div style={styles.totals}>
                <div style={styles.totalRow}><strong>Subtotal:</strong><span>Rs. {subtotal.toFixed(2)}</span></div>
                {/* ✅ **2. Conditionally display delivery charges if they exist** */}
                {invoice.deliveryCharge > 0 && (
                    <div style={styles.totalRow}><strong>Delivery:</strong><span>Rs. {invoice.deliveryCharge.toFixed(2)}</span></div>
                )}
                <div style={styles.totalRow}><strong>Grand Total:</strong><span>Rs. {invoice.total.toFixed(2)}</span></div>
                <hr style={styles.hr} />
                <div style={styles.totalRow}><strong>Amount Received:</strong><span>Rs. {invoice.received.toFixed(2)}</span></div>
                <div style={{ ...styles.totalRow, fontSize: '1.1em' }}><strong>Balance:</strong><span>Rs. {balanceToDisplay.toFixed(2)}</span></div>
            </div>
        </div>
      </div>
      
      <div style={styles.footer}><p>Thank you for your business!</p></div>
      <div style={styles.creditFooter}><p>Wayne Software Solutions | 078 722 3407</p></div>
    </div>
  );
};

const InvoiceViewer = () => {
  const { invoiceId } = useParams();
  const [invoice, setInvoice] = useState(null);
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

        if (invoiceSnap.exists()) { setInvoice(invoiceSnap.data()); }
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

  if (loading) return <p style={{ textAlign: 'center', marginTop: '50px' }}>Loading Invoice...</p>;
  if (!invoice) return <p style={{ textAlign: 'center', marginTop: '50px' }}>Invoice not found.</p>;
  
  const isPrintReady = isDataLoaded && isImageLoaded;

  return (
    <>
      <style>{`
        body {
          background-color: #f0f0f0;
        }
        
        @page thermal {
          size: 80mm auto;
          margin: 3mm;
        }
        @page a5sheet {
          size: A5;
          margin: 15mm;
        }

        .print-area-container {
          background: white;
          box-shadow: 0 0 15px rgba(0,0,0,0.15);
          margin: 40px auto;
          transition: all 0.3s ease-in-out;
          transform-origin: top center;
        }
        .format-80mm {
          width: 80mm;
          transform: scale(1.1);
        }
        .format-a5 {
          width: 148mm;
          transform: scale(1.0);
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
        />
      </div>

      <div className={`print-area-container format-${printFormat}`}>
        <div className="print-area">
            <PrintableLayout 
            invoice={invoice} 
            companyInfo={companyInfo} 
            onImageLoad={() => setIsImageLoaded(true)} 
            />
        </div>
      </div>
    </>
  );
};

// Styles object
const styles = {
  navbar: { 
    width: "100%", 
    padding: "16px 24px", 
    background: "linear-gradient(135deg, #2c3e50 0%, #1a2530 100%)", 
    color: "#fff", 
    display: "flex", 
    justifyContent: "space-between", 
    alignItems: "center", 
    boxSizing: "border-box",
    fontFamily: "'Inter', sans-serif"
  },
  logoContainer: { display: "flex", alignItems: "center" },
  logoPlaceholder: { width: "52px", height: "52px", borderRadius: "12px", background: "linear-gradient(135deg, #3498db, #2c3e50)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "22px", fontWeight: "bold", marginRight: "16px" },
  topInfo: { display: "flex", flexDirection: "column", alignItems: "flex-start" },
  companyName: { margin: "0", fontSize: "22px", fontWeight: "700" },
  wayneSystems: { fontSize: '12px', color: '#bdc3c7', margin: '2px 0 0 0', fontStyle: 'italic' },
  printButtonsContainer: { display: 'flex', gap: '10px' },
  headerPrintBtn: { padding: "10px 18px", border: "none", borderRadius: "8px", background: "linear-gradient(135deg, #3498db 0%, #2980b9 100%)", color: "#fff", cursor: "pointer", fontWeight: "600", fontSize: "14px", fontFamily: "'Inter', sans-serif" },
  headerPrintBtnDisabled: { padding: "10px 18px", border: "none", borderRadius: "8px", background: "#7f8c8d", color: "#fff", cursor: "not-allowed", fontWeight: "600", fontSize: "14px", fontFamily: "'Inter', sans-serif" },

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
