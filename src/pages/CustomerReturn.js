import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom"; 
import { db, auth } from "../firebase";
import {
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
  doc,
  getDoc,
  runTransaction,
  limit,
  orderBy,
  increment,
  startAfter
} from "firebase/firestore";
import { 
  AiOutlineSearch, 
  AiOutlineReload, 
  AiOutlineLoading,
  AiOutlinePrinter,
  AiOutlineDelete,
  AiOutlineLeft,
  AiOutlineRight
} from "react-icons/ai";

// --- INTERNAL PRINT COMPONENT ---
const PrintFrame = ({ children, onComplete }) => {
  const iframeRef = useRef(null);
  const [mountNode, setMountNode] = useState(null);

  useEffect(() => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);
    iframeRef.current = iframe;

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write('<html><head><title>Print Receipt</title></head><body><div id="print-root"></div></body></html>');
    doc.close();
    
    setMountNode(doc.getElementById('print-root'));

    return () => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    };
  }, []);

  useEffect(() => {
    if (mountNode) {
      setTimeout(() => {
        if (iframeRef.current) {
            iframeRef.current.contentWindow.focus();
            iframeRef.current.contentWindow.print();
            if (onComplete) onComplete();
        }
      }, 500); 
    }
  }, [mountNode, onComplete]);

  if (!mountNode) return null;
  return ReactDOM.createPortal(children, mountNode);
};

// --- RECEIPT TEMPLATE ---
const ReturnReceipt = ({ data, companyName }) => {
    if (!data) return null;
    return (
        <div style={{ padding: '20px', fontFamily: 'monospace', color: '#000', width: '80mm', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '15px', borderBottom: '1px dashed #000', paddingBottom: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', textTransform: 'uppercase' }}>{companyName || "RETURN NOTE"}</h3>
                <p style={{ margin: '5px 0', fontSize: '12px' }}>Return ID: {data.returnId}</p>
                <p style={{ margin: 0, fontSize: '12px' }}>Orig. Inv: {data.originalInvoice}</p>
                <p style={{ margin: 0, fontSize: '12px' }}>Date: {data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : new Date().toLocaleString()}</p>
            </div>
            
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', marginBottom: '10px' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid #000' }}>
                        <th style={{ textAlign: 'left', padding: '2px' }}>Item</th>
                        <th style={{ textAlign: 'center', padding: '2px' }}>Qty</th>
                        <th style={{ textAlign: 'right', padding: '2px' }}>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {data.items.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px dashed #ccc' }}>
                            <td style={{ padding: '4px 0' }}>
                                <div>{item.name}</div>
                                <div style={{ fontSize: '10px', fontStyle: 'italic' }}>({item.condition})</div>
                            </td>
                            <td style={{ textAlign: 'center', padding: '4px 0' }}>{item.qty}</td>
                            <td style={{ textAlign: 'right', padding: '4px 0' }}>{(item.price * item.qty).toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div style={{ borderTop: '1px solid #000', paddingTop: '5px', marginTop: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}>
                    <span>REFUND TOTAL:</span>
                    <span>{Number(data.refundAmount).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '5px' }}>
                    <span>Method:</span>
                    <span>{data.refundMethod}</span>
                </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '10px' }}>
                <p>--- Return Complete ---</p>
            </div>
        </div>
    );
};

const CustomerReturn = () => {
  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceData, setInvoiceData] = useState(null);
  const [returnItems, setReturnItems] = useState({}); 
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  
  const [refundTotal, setRefundTotal] = useState(0);
  const [refundMethod, setRefundMethod] = useState("Cash");
  
  // --- PAGINATION & FILTER STATE ---
  const [recentReturns, setRecentReturns] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCursors, setPageCursors] = useState([null]); // Stores the first doc of each page
  const [hasNextPage, setHasNextPage] = useState(false);
  const PAGE_SIZE = 40;

  const [companyName, setCompanyName] = useState("");
  const [printData, setPrintData] = useState(null);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
      const fetchSettings = async () => {
          const user = auth.currentUser;
          if (user) {
              const settingsRef = doc(db, user.uid, "settings");
              const snap = await getDoc(settingsRef);
              if (snap.exists()) {
                  setCompanyName(snap.data().companyName || "Business Name");
              }
          }
      };
      fetchSettings();
  }, []);

  // --- SEARCH INVOICE TO RETURN ---
  const handleSearch = async () => {
    if (!invoiceId.trim()) return alert("Please enter an Invoice Number.");
    setLoading(true);
    setInvoiceData(null);
    setReturnItems({});
    setRefundTotal(0);

    try {
      const user = auth.currentUser;
      
      const returnsRef = collection(db, user.uid, "returns", "return_list");
      const returnCheckQuery = query(returnsRef, where("originalInvoice", "==", invoiceId.trim()));
      const returnCheckSnap = await getDocs(returnCheckQuery);

      if (!returnCheckSnap.empty) {
          const prevReturn = returnCheckSnap.docs[0].data();
          alert(`⚠️ This invoice was already returned on ${prevReturn.createdAt?.toDate().toLocaleDateString()} (Return ID: ${prevReturn.returnId}).\n\nCannot return the same invoice twice.`);
          setLoading(false);
          return; 
      }

      const invRef = collection(db, user.uid, "invoices", "invoice_list");
      const q = query(invRef, where("invoiceNumber", "==", invoiceId.trim()), limit(1));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const data = snap.docs[0].data();
        setInvoiceData({ id: snap.docs[0].id, ...data });
        setRefundMethod(data.paymentMethod || "Cash");
      } else {
        alert("Invoice not found!");
      }
    } catch (error) {
      console.error("Search error:", error);
      alert("Error searching invoice.");
    } finally {
      setLoading(false);
    }
  };

  const handleItemChange = (itemId, field, value, price, originalQty) => {
    setReturnItems(prev => {
      const current = prev[itemId] || { qty: 0, condition: "Good" };
      let newItem = { ...current, [field]: value };

      if (field === 'qty') {
          if (value > originalQty) newItem.qty = originalQty;
          else if (value < 0) newItem.qty = 0;
          else newItem.qty = Number(value);
      }

      const updated = { ...prev, [itemId]: newItem };
      calculateTotal(updated, invoiceData.items);
      return updated;
    });
  };

  const calculateTotal = (itemsMap, originalItems) => {
    let total = 0;
    originalItems.forEach(item => {
        const returnData = itemsMap[item.itemId || item.id];
        if (returnData && returnData.qty > 0) {
            total += returnData.qty * item.price;
        }
    });
    setRefundTotal(total);
  };

  const handleProcessReturn = async () => {
    if (refundTotal <= 0) return alert("Please select at least one item to return.");
    if (!window.confirm(`Confirm refund of Rs. ${refundTotal.toFixed(2)} via ${refundMethod}?`)) return;

    setProcessing(true);
    const user = auth.currentUser;
    const uid = user.uid;

    try {
      await runTransaction(db, async (transaction) => {
        // --- READS ---
        const walletDocId = refundMethod.toLowerCase();
        let walletRef = null;
        let walletSnap = null;
        
        if (['cash', 'card', 'online'].includes(walletDocId)) {
            walletRef = doc(db, uid, "wallet", "accounts", walletDocId);
            walletSnap = await transaction.get(walletRef);
        }

        const itemsToRestock = [];
        for (const originalItem of invoiceData.items) {
            const id = originalItem.itemId || originalItem.id;
            const returnInfo = returnItems[id];

            if (returnInfo && returnInfo.qty > 0 && returnInfo.condition === "Good") {
                const itemRef = doc(db, uid, "items", "item_list", id);
                itemsToRestock.push({ ref: itemRef, qtyToAdd: returnInfo.qty });
            }
        }

        // --- CHECKS ---
        if (walletRef && walletSnap) {
            if (!walletSnap.exists()) throw new Error(`Wallet ${refundMethod} not found.`);
            const currentBal = Number(walletSnap.data().balance) || 0;
            if (currentBal < refundTotal) {
                throw new Error(`Insufficient funds in ${refundMethod}. Available: ${currentBal}`);
            }
        }

        // --- WRITES ---
        const returnId = "RET-" + Date.now();
        const expenseId = "EXP-" + Date.now();
        const returnDate = serverTimestamp();
        const today = new Date();
        const dateString = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });

        if (walletRef && walletSnap) {
            transaction.update(walletRef, { balance: increment(-refundTotal) });
        }

        itemsToRestock.forEach((item) => {
             transaction.update(item.ref, { qtyOnHand: increment(item.qtyToAdd) }); 
        });
        
        const returnRef = doc(collection(db, uid, "returns", "return_list"));
        let itemsProcessedData = [];
        for (const originalItem of invoiceData.items) {
            const id = originalItem.itemId || originalItem.id;
            const returnInfo = returnItems[id];
            if (returnInfo && returnInfo.qty > 0) {
                itemsProcessedData.push({
                    itemId: id,
                    name: originalItem.itemName || originalItem.name,
                    qty: returnInfo.qty,
                    price: originalItem.price,
                    condition: returnInfo.condition
                });
            }
        }

        transaction.set(returnRef, {
            returnId,
            originalInvoice: invoiceData.invoiceNumber,
            customerName: invoiceData.customerName || "Walk-in",
            refundAmount: refundTotal,
            refundMethod,
            items: itemsProcessedData,
            createdAt: returnDate,
            dateString: dateString,
            processedBy: "Admin"
        });

        const expenseRef = doc(db, uid, "expenses", "expense_list", expenseId);
        const expenseDesc = `Refund for Inv: ${invoiceData.invoiceNumber}`;
        
        transaction.set(expenseRef, {
            id: expenseId,
            category: "Sales Return",
            amount: refundTotal,
            description: expenseDesc,
            details: expenseDesc, 
            date: returnDate,
            dateString: dateString,
            createdAt: returnDate,
            cashBook: refundMethod,
            cashBookId: walletDocId, 
            relatedReturnId: returnId,
            type: 'expense' 
        });
      });

      alert("Return Processed Successfully!");
      setInvoiceData(null);
      setInvoiceId("");
      setReturnItems({});
      setRefundTotal(0);
      // Refresh History
      setCurrentPage(1);
      setPageCursors([null]);
      fetchHistory(1, searchQuery, filterDate);

    } catch (error) {
      console.error("Return Failed:", error);
      alert("Failed: " + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteReturn = async (returnData) => {
    if (!returnData || !returnData.id) return alert("Error: Missing Return ID.");
    if (!window.confirm("🔴 Undo this return? Money will be added back to wallet, and items removed from stock.")) return;

    setLoading(true);
    const user = auth.currentUser;
    try {
        const expRef = collection(db, user.uid, "expenses", "expense_list");
        const expQ = query(expRef, where("relatedReturnId", "==", returnData.returnId));
        const expSnap = await getDocs(expQ);
        let expenseDocRef = null;
        if (!expSnap.empty) {
            expenseDocRef = expSnap.docs[0].ref;
        }

        await runTransaction(db, async (transaction) => {
            const walletDocId = returnData.refundMethod ? returnData.refundMethod.toLowerCase() : 'cash';
            if (['cash', 'card', 'online'].includes(walletDocId)) {
                const walletRef = doc(db, user.uid, "wallet", "accounts", walletDocId);
                const wSnap = await transaction.get(walletRef);
                if (wSnap.exists()) {
                    transaction.update(walletRef, { balance: increment(Number(returnData.refundAmount)) });
                }
            }

            if (returnData.items && Array.isArray(returnData.items)) {
                returnData.items.forEach(item => {
                    if (item.condition === "Good" && item.itemId) {
                        const itemRef = doc(db, user.uid, "items", "item_list", item.itemId);
                        transaction.update(itemRef, { qtyOnHand: increment(-item.qty) });
                    }
                });
            }

            transaction.delete(doc(db, user.uid, "returns", "return_list", returnData.id));
            if (expenseDocRef) transaction.delete(expenseDocRef);
        });

        alert("Return Deleted & Reverted!");
        // Refresh Current View
        fetchHistory(currentPage, searchQuery, filterDate);

    } catch (error) {
        alert("Failed to delete return: " + error.message);
    } finally {
        setLoading(false);
    }
  };

  // --- UPDATED HISTORY FETCH WITH SEARCH & PAGINATION ---
  const fetchHistory = async (page, search, date) => {
      const user = auth.currentUser;
      if (!user) return;
      setHistoryLoading(true);

      try {
          const ref = collection(db, user.uid, "returns", "return_list");
          let q;

          // 1. Search Mode (Overrides pagination)
          if (search && search.trim() !== "") {
              const term = search.trim();
              if (term.toUpperCase().startsWith("RET")) {
                  q = query(ref, where("returnId", "==", term));
              } else {
                  // Assume Invoice Search
                  q = query(ref, where("originalInvoice", "==", term));
              }
              const snap = await getDocs(q);
              setRecentReturns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
              setHasNextPage(false);
          } 
          // 2. Date Filter Mode
          else if (date && date !== "") {
               // Assuming 'dateString' field exists (YYYY-MM-DD). If not, range query on createdAt is needed.
               // We added dateString in the process function above, so this works for NEW records.
               // For old records without dateString, this might return empty.
               q = query(ref, where("dateString", "==", date)); // Simple equality if field exists
               
               // If you want to support older records without dateString, you need a range query on createdAt:
               // const start = new Date(date); start.setHours(0,0,0,0);
               // const end = new Date(date); end.setHours(23,59,59,999);
               // q = query(ref, where("createdAt", ">=", start), where("createdAt", "<=", end));
               
               const snap = await getDocs(q);
               setRecentReturns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
               setHasNextPage(false);
          }
          // 3. Pagination Mode (Default)
          else {
              let baseQuery = query(ref, orderBy("createdAt", "desc"));
              
              if (page > 1 && pageCursors[page - 1]) {
                  baseQuery = query(baseQuery, startAfter(pageCursors[page - 1]));
              }
              
              const paginatedQuery = query(baseQuery, limit(PAGE_SIZE));
              const snap = await getDocs(paginatedQuery);
              
              const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
              setRecentReturns(docs);

              // Setup cursor for next page
              if (docs.length === PAGE_SIZE) {
                  const lastDoc = snap.docs[snap.docs.length - 1];
                  setPageCursors(prev => {
                      const newCursors = [...prev];
                      newCursors[page] = lastDoc; // Store cursor for next page (index matches page number)
                      return newCursors;
                  });
                  setHasNextPage(true);
              } else {
                  setHasNextPage(false);
              }
          }

      } catch (e) {
          console.error("Fetch history error", e);
          alert("Error loading history: " + e.message);
      } finally {
          setHistoryLoading(false);
      }
  };

  // Triggers
  useEffect(() => {
      // Reset to page 1 when filters change
      setCurrentPage(1);
      setPageCursors([null]);
  }, [searchQuery, filterDate]);

  useEffect(() => {
      fetchHistory(currentPage, searchQuery, filterDate);
      // eslint-disable-next-line
  }, [currentPage, searchQuery, filterDate]);


  const handlePrint = (returnData) => {
      setPrintData(returnData);
      setIsPrinting(true);
  };

  return (
    <div style={styles.container}>
      <div style={styles.headerContainer}>
        <h2 style={styles.header}>Customer Return / Refund</h2>
        <p style={styles.subHeader}>Process returns, restock items, and issue refunds.</p>
      </div>

      {/* --- INVOICE LOOKUP SECTION --- */}
      <div style={styles.card}>
        <div style={styles.searchBar}>
            <input type="text" placeholder="Scan Invoice Number (e.g., INV-2025-001)" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} style={styles.input} />
            <button onClick={handleSearch} style={styles.searchBtn} disabled={loading}>{loading ? <AiOutlineLoading className="spin" /> : <AiOutlineSearch />} Search</button>
        </div>
      </div>

      {invoiceData && (
          <div style={styles.mainGrid}>
              <div style={styles.itemsCard}>
                  <h3 style={styles.cardTitle}>Invoice: {invoiceData.invoiceNumber}</h3>
                  <table style={styles.table}>
                      <thead><tr><th style={styles.th}>Item</th><th style={styles.th}>Sold</th><th style={styles.th}>Price</th><th style={styles.th}>Return</th><th style={styles.th}>Condition</th></tr></thead>
                      <tbody>
                          {invoiceData.items.map((item, index) => {
                              const id = item.itemId || item.id;
                              const currentReturn = returnItems[id] || { qty: 0, condition: "Good" };
                              return (
                                <tr key={index} style={currentReturn.qty > 0 ? styles.activeRow : {}}>
                                    <td style={styles.td}>{item.itemName}</td>
                                    <td style={styles.td}>{item.quantity}</td>
                                    <td style={styles.td}>{item.price}</td>
                                    <td style={styles.td}><input type="number" min="0" max={item.quantity} value={currentReturn.qty} onChange={(e) => handleItemChange(id, 'qty', e.target.value, item.price, item.quantity)} style={styles.qtyInput} /></td>
                                    <td style={styles.td}><select value={currentReturn.condition} onChange={(e) => handleItemChange(id, 'condition', e.target.value)} style={styles.select} disabled={currentReturn.qty === 0}><option value="Good">Good (Restock)</option><option value="Damaged">Damaged (Waste)</option></select></td>
                                </tr>
                              );
                          })}
                      </tbody>
                  </table>
              </div>

              <div style={styles.summaryCard}>
                  <h3 style={styles.cardTitle}>Refund Summary</h3>
                  <div style={styles.summaryRow}><span>Refund Amount:</span><span style={styles.totalAmount}>Rs. {refundTotal.toFixed(2)}</span></div>
                  <div style={styles.formGroup}>
                      <label style={styles.label}>Refund From (Wallet)</label>
                      <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)} style={styles.fullSelect}>
                          <option value="Cash">Cash</option>
                          <option value="Card">Card</option>
                          <option value="Online">Online Transfer</option>
                      </select>
                  </div>
                  <button onClick={handleProcessReturn} disabled={processing || refundTotal === 0} style={processing || refundTotal === 0 ? styles.processBtnDisabled : styles.processBtn}>{processing ? "Processing..." : "Confirm Refund"}</button>
              </div>
          </div>
      )}
      
      {/* --- HISTORY SECTION --- */}
      <div style={{...styles.card, marginTop: '30px'}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'15px', flexWrap:'wrap', gap:'10px'}}>
             <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                 <AiOutlineReload size={20} style={{cursor:'pointer', color:'#6b7280'}} onClick={() => fetchHistory(1, "", "")} /> 
                 <h3 style={{...styles.cardTitle, margin: 0}}>Return History</h3>
             </div>
             
             {/* HISTORY CONTROLS */}
             <div style={{display:'flex', gap:'10px'}}>
                 <input 
                    type="text" 
                    placeholder="Search ID (RET or INV)..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={styles.historyInput}
                 />
                 <input 
                    type="date" 
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    style={styles.historyInput}
                 />
                 {(searchQuery || filterDate) && (
                     <button onClick={() => { setSearchQuery(""); setFilterDate(""); }} style={styles.clearBtn}>Clear</button>
                 )}
             </div>
          </div>

          <div style={{overflowX: 'auto'}}>
            <table style={styles.table}>
                <thead><tr><th style={styles.th}>Return ID</th><th style={styles.th}>Date</th><th style={styles.th}>Original Inv</th><th style={styles.th}>Refund</th><th style={styles.th}>Action</th></tr></thead>
                <tbody>
                    {historyLoading ? (
                         <tr><td colSpan="5" style={styles.tdCenter}><AiOutlineLoading className="spin" /> Loading...</td></tr>
                    ) : recentReturns.length === 0 ? (
                         <tr><td colSpan="5" style={styles.tdCenter}>No returns found matching criteria.</td></tr> 
                    ) : (
                      recentReturns.map((r, idx) => (
                          <tr key={idx}>
                              <td style={styles.td}>{r.returnId}</td>
                              <td style={styles.td}>{r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString() : r.dateString}</td>
                              <td style={styles.td}>{r.originalInvoice}</td>
                              <td style={{...styles.td, color: '#c0392b', fontWeight:'bold'}}>- Rs. {Number(r.refundAmount).toFixed(2)}</td>
                              <td style={{...styles.td, whiteSpace: 'nowrap'}}>
                                  <div style={{display:'flex', gap:'10px'}}>
                                      <button onClick={() => handlePrint(r)} style={styles.printBtn}><AiOutlinePrinter /> Print</button>
                                      <button onClick={() => handleDeleteReturn(r)} style={styles.deleteBtn}><AiOutlineDelete /> Delete</button>
                                  </div>
                              </td>
                          </tr>
                      ))
                    )}
                </tbody>
            </table>
          </div>
          
          {/* PAGINATION CONTROLS */}
          {!searchQuery && !filterDate && !historyLoading && (
              <div style={styles.pagination}>
                  <button 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                      disabled={currentPage === 1}
                      style={currentPage === 1 ? styles.pageBtnDisabled : styles.pageBtn}
                  >
                      <AiOutlineLeft /> Prev
                  </button>
                  <span style={styles.pageInfo}>Page {currentPage}</span>
                  <button 
                      onClick={() => setCurrentPage(p => p + 1)} 
                      disabled={!hasNextPage}
                      style={!hasNextPage ? styles.pageBtnDisabled : styles.pageBtn}
                  >
                      Next <AiOutlineRight />
                  </button>
              </div>
          )}
      </div>

      {isPrinting && printData && (
          <PrintFrame onComplete={() => setIsPrinting(false)}>
              <ReturnReceipt data={printData} companyName={companyName} />
          </PrintFrame>
      )}
    </div>
  );
};

const styles = {
    container: { padding: '24px', fontFamily: "'Inter', sans-serif", backgroundColor: '#f8f9fa', minHeight: '100vh' },
    headerContainer: { marginBottom: '24px' },
    header: { fontSize: '28px', fontWeight: '700', color: '#2c3e50', marginBottom: '8px' },
    subHeader: { fontSize: '16px', color: '#6c757d', margin: 0 },
    card: { backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', overflow: 'hidden' },
    searchBar: { display: 'flex', gap: '10px', alignItems: 'center' },
    input: { flex: 1, padding: '12px 16px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', outline: 'none', transition: 'border 0.2s', height: '48px', boxSizing: 'border-box' },
    searchBtn: { padding: '0 24px', height: '48px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', display:'flex', alignItems:'center', gap:'8px', fontWeight: '500', fontSize: '15px' },
    mainGrid: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginTop: '20px', alignItems: 'start' },
    itemsCard: { backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' },
    summaryCard: { backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', position: 'sticky', top: '20px' },
    cardTitle: { margin: '0 0 20px 0', fontSize: '18px', fontWeight: '600', color: '#1f2937' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { textAlign: 'left', padding: '12px', borderBottom: '2px solid #f3f4f6', color: '#6b7280', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', verticalAlign: 'middle', whiteSpace: 'nowrap' },
    td: { padding: '12px', borderBottom: '1px solid #f3f4f6', fontSize: '14px', verticalAlign: 'middle', color: '#374151' },
    tdCenter: { textAlign: 'center', padding: '40px', color: '#9ca3af', fontStyle: 'italic' },
    qtyInput: { width: '70px', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', textAlign: 'center' },
    select: { padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: 'white', width: '100%' },
    fullSelect: { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', marginTop: '6px', fontSize: '14px' },
    summaryRow: { display: 'flex', justifyContent: 'space-between', marginBottom: '24px', fontSize: '18px', fontWeight: '700', alignItems: 'center', paddingBottom: '15px', borderBottom: '1px dashed #e5e7eb' },
    totalAmount: { color: '#dc2626', fontSize: '20px' },
    formGroup: { marginBottom: '20px' },
    processBtn: { width: '100%', padding: '14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', transition: 'background 0.2s', marginTop: '10px' },
    processBtnDisabled: { width: '100%', padding: '14px', background: '#fca5a5', color: 'white', border: 'none', borderRadius: '8px', cursor: 'not-allowed', marginTop: '10px' },
    activeRow: { backgroundColor: '#eff6ff' },
    label: { fontSize: '14px', fontWeight: '500', color: '#4b5563' },
    printBtn: { padding: '8px 12px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: '#374151', fontSize: '13px', fontWeight: '500' },
    deleteBtn: { padding: '8px 12px', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontSize: '13px', fontWeight: '500' },
    // NEW STYLES
    historyInput: { padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' },
    clearBtn: { padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', fontSize: '13px' },
    pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '20px' },
    pageBtn: { display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' },
    pageBtnDisabled: { display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 16px', background: '#e5e7eb', color: '#9ca3af', border: 'none', borderRadius: '6px', cursor: 'not-allowed' },
    pageInfo: { fontSize: '14px', fontWeight: '500', color: '#4b5563' }
};

export default CustomerReturn;