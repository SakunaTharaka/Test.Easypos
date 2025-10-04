import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

/**
 * A self-contained, printable layout for the invoice.
 */
const PrintableLayout = ({ invoice, companyInfo, onImageLoad }) => {
  // Defensive check to prevent rendering with incomplete data
  if (!invoice || !Array.isArray(invoice.items)) {
    return null;
  }

  const subtotal = invoice.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Apply special condition: If amount received is 0, display balance as 0.
  const balanceToDisplay = invoice.received === 0 ? 0 : invoice.balance;

  return (
    <div style={styles.invoiceBox}>
      <div style={styles.header}>
        {companyInfo?.companyLogo ? (
          <img 
            src={companyInfo.companyLogo} 
            style={styles.logo} 
            alt="Company Logo" 
            onLoad={onImageLoad}
            onError={onImageLoad}
          />
        ) : null}
        <h1 style={styles.companyName}>{companyInfo?.companyName || "Your Company"}</h1>
        <p style={styles.headerText}>{companyInfo?.companyAddress || "123 Main St, City"}</p>
        {/* Display phone number from settings; hide if not present */}
        {companyInfo?.phone && <p style={styles.headerText}>{companyInfo.phone}</p>}
      </div>
      <div style={styles.meta}>
        <p><strong>Invoice #:</strong> {invoice.invoiceNumber}</p>
        <p><strong>Date:</strong> {invoice.createdAt?.toDate().toLocaleDateString()}</p>
        <p><strong>Customer:</strong> {invoice.customerName}</p>
        <p><strong>Issued By:</strong> {invoice.issuedBy}</p>
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
      <div style={styles.totalsContainer}>
        <div style={styles.totals}>
          <div style={styles.totalRow}><strong>Subtotal:</strong><span>Rs. {subtotal.toFixed(2)}</span></div>
          <div style={styles.totalRow}><strong>Grand Total:</strong><span>Rs. {invoice.total.toFixed(2)}</span></div>
          <hr style={styles.hr} />
          <div style={styles.totalRow}><strong>Amount Received:</strong><span>Rs. {invoice.received.toFixed(2)}</span></div>
          <div style={{ ...styles.totalRow, fontSize: '1.1em' }}><strong>Balance:</strong><span>Rs. {balanceToDisplay.toFixed(2)}</span></div>
        </div>
      </div>
      <div style={styles.footer}><p>Thank you for your business!</p></div>
      <div style={styles.creditFooter}><p>Wayne Software Solutions | 078 722 3407</p></div>
    </div>
  );
};

/**
 * The main component that fetches invoice data and manages the print-ready state.
 */
const InvoiceViewer = () => {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  useEffect(() => {
    const fetchInvoiceData = async (user) => {
      if (!user || !invoiceId) {
        setLoading(false);
        return;
      }
      try {
        const invoiceRef = doc(db, user.uid, "invoices", "invoice_list", invoiceId);
        const settingsRef = doc(db, user.uid, "settings");
        
        const [invoiceSnap, settingsSnap] = await Promise.all([
          getDoc(invoiceRef),
          getDoc(settingsRef)
        ]);

        if (invoiceSnap.exists()) {
          setInvoice(invoiceSnap.data());
        } else {
          console.log("Invoice not found in database.");
        }

        if (settingsSnap.exists()) {
          const settingsData = settingsSnap.data();
          setCompanyInfo(settingsData);
          if (!settingsData.companyLogo) {
            setIsImageLoaded(true);
          }
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
  if (!invoice) return <p style={{ textAlign: 'center', marginTop: '50px' }}>Invoice not found. It may have been deleted or is missing data.</p>;
  
  const isPrintReady = isDataLoaded && isImageLoaded;

  return (
    <>
      <style>{`
        body {
          background-color: #f0f0f0;
        }
        @page {
          size: 88mm auto;
          margin: 0;
        }
        @media print {
          body {
            background-color: #fff;
            margin: 0;
            padding: 0;
          }
          .no-print {
            display: none !important;
          }
          .print-area {
            box-shadow: none;
            margin: 0;
            padding: 0;
          }
        }
        .print-area {
          background: white;
          box-shadow: 0 0 10px rgba(0,0,0,0.15);
          margin: 20px auto;
        }
        .no-print {
          padding: 15px;
          text-align: center;
        }
        .no-print button {
          padding: 10px 20px;
          margin: 0 10px;
          font-size: 16px;
          cursor: pointer;
        }
      `}</style>

      <div className="no-print">
        <button onClick={() => navigate(-1)}>Back</button>
        <button 
          onClick={() => window.print()} 
          disabled={!isPrintReady} 
        >
          {isPrintReady ? 'Print Invoice' : 'Preparing Invoice...'}
        </button>
      </div>

      <div className="print-area">
        <PrintableLayout 
          invoice={invoice} 
          companyInfo={companyInfo} 
          onImageLoad={() => setIsImageLoaded(true)} 
        />
      </div>
    </>
  );
};

// Styles for the invoice layout
const styles = {
  invoiceBox: { width: '88mm', margin: '0 auto', padding: '10px', fontFamily: "'Courier New', Courier, monospace", color: '#000' },
  header: { textAlign: 'center', marginBottom: '10px' },
  logo: { maxWidth: '60px', maxHeight: '60px', marginBottom: '5px' },
  companyName: { fontSize: '1.2em', margin: '0' },
  headerText: { margin: '2px 0', fontSize: '0.9em' },
  meta: { borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '5px 0', marginBottom: '10px', fontSize: '0.9em' },
  itemsTable: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' },
  th: { borderBottom: '1px solid #000', padding: '3px', textAlign: 'right' },
  thItem: { textAlign: 'left' },
  td: { padding: '3px', borderBottom: '1px dotted #ccc' },
  tdCenter: { textAlign: 'center' },
  tdRight: { textAlign: 'right' },
  totalsContainer: { display: 'flex', justifyContent: 'flex-end', marginTop: '10px' },
  totals: { width: '100%' },
  totalRow: { display: 'flex', justifyContent: 'space-between', marginBottom: '3px' },
  hr: { border: 'none', borderTop: '1px dashed #000' },
  footer: { textAlign: 'center', marginTop: '15px', paddingTop: '5px', borderTop: '1px solid #000', fontSize: '0.75em' },
  creditFooter: { textAlign: 'center', marginTop: '10px', fontSize: '0.7em', color: '#777' },
};

export default InvoiceViewer;