import React, { useEffect, useState } from "react";
import { db, auth } from "../../firebase";
import { doc, getDoc, writeBatch, serverTimestamp, collection, getDocs } from "firebase/firestore"; // Added writeBatch
import { AiOutlineReload, AiOutlineDownload, AiOutlineExclamationCircle, AiOutlineFieldTime, AiOutlineArrowLeft, AiOutlineArrowRight } from "react-icons/ai";
import { calculateStockBalances } from "../../utils/inventoryUtils";

const StockBalance = () => {
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [stockData, setStockData] = useState([]);
  
  // Pagination State
  const [lastVisible, setLastVisible] = useState(null); // Cursor for DB
  const [pageHistory, setPageHistory] = useState([]); // To handle "Previous"
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 50;
  const [isLastPage, setIsLastPage] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: 'item', direction: 'ascending' }); // Client-side sort for current page
  const [stockReminderThreshold, setStockReminderThreshold] = useState(null);
  const [showUnbalancedOnly, setShowUnbalancedOnly] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    fetchStockData('initial');
    fetchStockReminderSettings();
  }, []);

  // Debounce search to prevent too many DB reads
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (auth.currentUser) {
          fetchStockData('initial');
      }
    }, 800);
    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const fetchStockReminderSettings = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      const settingsRef = doc(db, uid, "settings");
      const settingsSnap = await getDoc(settingsRef);
      if (settingsSnap.exists()) {
        const threshold = settingsSnap.data().stockReminder;
        setStockReminderThreshold(threshold === "Do not remind" ? null : parseInt(threshold));
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  const fetchStockData = async (direction = 'initial') => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    
    setLoading(true);
    try {
      let cursor = null;

      if (direction === 'next') {
        cursor = lastVisible;
      } else if (direction === 'prev') {
        // Pop current page off, then peek at the one before
        const newHistory = [...pageHistory];
        newHistory.pop(); // Remove current
        cursor = newHistory[newHistory.length - 1] || null;
        setPageHistory(newHistory);
      } else {
        // Initial load
        setPageHistory([]);
        setPage(1);
      }

      const { data, lastVisible: newCursor } = await calculateStockBalances(
          db, 
          uid, 
          cursor, 
          ITEMS_PER_PAGE,
          searchTerm
      );
      
      setStockData(data);
      setLastVisible(newCursor);
      
      // Update pagination state
      if (direction === 'next') {
        setPageHistory(prev => [...prev, cursor]); // Save the cursor we JUST used
        setPage(p => p + 1);
      } else if (direction === 'prev') {
        setPage(p => p - 1);
      }
      
      // If we got fewer items than requested, it's the last page
      setIsLastPage(data.length < ITEMS_PER_PAGE);

    } catch (error) {
      console.error("Error fetching stock:", error);
      alert("Error: " + error.message);
    }
    setLoading(false);
  };

  const handleClosePeriod = async () => {
    const confirm = window.confirm(
      "⚠ CLOSE PERIOD & RESET COUNTERS?\n\n" +
      "This will set current 'Available Qty' as 'Opening Stock' for ALL items.\n" +
      "Are you sure?"
    );
    if (!confirm) return;

    setProcessing(true);
    const uid = auth.currentUser?.uid;

    try {
      const itemsRef = collection(db, uid, "items", "item_list");
      const snapshot = await getDocs(itemsRef);
      const allItems = snapshot.docs;

      const batchSize = 450;
      const chunks = [];
      for (let i = 0; i < allItems.length; i += batchSize) {
        chunks.push(allItems.slice(i, i + batchSize));
      }

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach((itemDoc) => {
            const currentQty = itemDoc.data().qtyOnHand || 0;
            const ref = doc(db, uid, "items", "item_list", itemDoc.id);
            batch.update(ref, {
                openingStock: currentQty,
                periodIn: 0,  // Reset counters
                periodOut: 0, // Reset counters
                lastReconciledAt: serverTimestamp()
            });
        });
        await batch.commit();
      }

      alert("Period Closed.");
      fetchStockData('initial'); 
    } catch (error) {
      console.error("Close Period Error:", error);
      alert("Failed: " + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const sortedData = React.useMemo(() => {
    if (!sortConfig.key) return stockData;
    return [...stockData].sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'ascending' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'ascending' ? 1 : -1;
      return 0;
    });
  }, [stockData, sortConfig]);

  const filteredData = showUnbalancedOnly 
    ? sortedData.filter(item => item.availableQty < 0)
    : sortedData;

  const exportToCSV = () => {
    // Note: This only exports the CURRENT PAGE because that's all we have loaded.
    // To export ALL, you'd need a separate function to fetch all collections.
    const headers = ["Item", "Category", "Opening Stock", "Period In", "Period Out", "Available Qty"];
    const csvContent = [
      headers.join(","),
      ...filteredData.map(item => [ 
          `"${item.item}"`, `"${item.category}"`, item.openingStock, item.periodIn, item.periodOut, item.availableQty 
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `stock_balance_page_${page}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.headerContainer}>
        <h2 style={styles.header}>Stock Balance Report</h2>
        <p style={styles.subHeader}>View inventory levels (Page {page})</p>
        {stockReminderThreshold && (
          <div style={styles.reminderNote}><AiOutlineExclamationCircle size={16} /><span>Items below threshold are highlighted.</span></div>
        )}
      </div>

      {/* Controls */}
      <div style={styles.controlsContainer}>
        <div style={styles.searchContainer}>
            <input type="text" placeholder="Search items (Start typing name...)" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={styles.searchInput}/>
        </div>
        <div style={styles.buttonGroup}>
          <label style={styles.filterCheckbox}>
              <input type="checkbox" checked={showUnbalancedOnly} onChange={(e) => setShowUnbalancedOnly(e.target.checked)} style={styles.checkboxInput}/>
              Show negative stock
          </label>
          <button style={styles.refreshButton} onClick={() => fetchStockData('initial')} disabled={processing || loading}>
              <AiOutlineReload size={18} /> Refresh
          </button>
          <button style={{...styles.refreshButton, backgroundColor: '#8e44ad'}} onClick={handleClosePeriod} disabled={processing || loading}>
              <AiOutlineFieldTime size={18} /> Close Period
          </button>
          <button style={styles.exportButton} onClick={exportToCSV} disabled={processing || loading}>
              <AiOutlineDownload size={18} /> Export Page
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={styles.tableContainer}>
        <div style={styles.tableWrapper}>
            {loading ? (
                <div style={styles.loadingContainer}>
                    <div style={styles.loadingSpinner}></div>
                    <p>Loading Page {page}...</p>
                </div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th} onClick={() => handleSort('item')}>Item {sortConfig.key === 'item' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}</th>
                    <th style={styles.th} onClick={() => handleSort('category')}>Category</th>
                    <th style={styles.th} onClick={() => handleSort('openingStock')}>Opening</th>
                    <th style={styles.th} onClick={() => handleSort('periodIn')}>Period In</th>
                    <th style={styles.th} onClick={() => handleSort('periodOut')}>Period Out</th>
                    <th style={styles.th} onClick={() => handleSort('availableQty')}>Available</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.length > 0 ? (
                    filteredData.map((item, idx) => {
                      // Calc percentage for reminder
                      const throughput = item.openingStock + item.periodIn;
                      const percentage = throughput > 0 ? (item.availableQty / throughput) * 100 : 100;
                      const isLow = stockReminderThreshold && percentage <= stockReminderThreshold;
                      const isUnbal = item.availableQty < 0;

                      return (
                        <tr key={idx} style={{ ...styles.tr, ...(isLow && styles.lowStockRow), ...(isUnbal && styles.unbalancedRow) }}>
                          <td style={styles.td}>{item.item}</td>
                          <td style={styles.td}>{item.category}</td>
                          <td style={{...styles.td, color: '#7f8c8d'}}>{item.openingStock}</td>
                          <td style={{...styles.td, color: '#2980b9'}}>{item.periodIn > 0 ? `+${item.periodIn}` : '-'}</td>
                          <td style={{...styles.td, color: '#c0392b'}}>{item.periodOut > 0 ? `-${item.periodOut}` : '-'}</td>
                          <td style={{ ...styles.td, color: isUnbal ? '#c0392b' : '#27ae60', fontWeight: 600 }}>
                              {item.availableQty}
                          </td>
                        </tr>
                      );
                    })
                  ) : (<tr><td colSpan={6} style={styles.noData}>No data found.</td></tr>)}
                </tbody>
              </table>
            )}
        </div>
        
        {/* Firebase Pagination Controls */}
        <div style={styles.pagination}>
          <button 
            style={{...styles.paginationButton, opacity: page === 1 ? 0.5 : 1}} 
            onClick={() => fetchStockData('prev')} 
            disabled={page === 1 || loading}
          >
            <AiOutlineArrowLeft /> Previous
          </button>
          
          <span style={styles.paginationInfo}>Page {page}</span>
          
          <button 
            style={{...styles.paginationButton, opacity: isLastPage ? 0.5 : 1}} 
            onClick={() => fetchStockData('next')} 
            disabled={isLastPage || loading}
          >
             Next <AiOutlineArrowRight />
          </button>
        </div>
      </div>
    </div>
  );
};

// ... Styles object remains exactly the same as previous, just ensure paginationButton styles are there
const styles = {
    container: { padding: '24px', fontFamily: "'Inter', sans-serif", backgroundColor: '#f8f9fa' },
    loadingContainer: { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '200px', color: '#6c757d' },
    loadingSpinner: { border: '3px solid #f3f3f3', borderTop: '3px solid #3498db', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', marginBottom: '15px' },
    headerContainer: { marginBottom: '24px' },
    header: { fontSize: '28px', fontWeight: '700', color: '#2c3e50' },
    subHeader: { fontSize: '16px', color: '#6c757d', margin: '4px 0 12px 0' },
    reminderNote: { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', backgroundColor: '#fffbe6', border: '1px solid #ffe58f', borderRadius: '8px', color: '#d46b08', fontSize: '14px' },
    controlsContainer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px', backgroundColor: '#fff', padding: '16px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' },
    searchContainer: { flex: 1, minWidth: '300px' },
    searchInput: { padding: '12px 16px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', width: '100%', boxSizing: 'border-box' },
    buttonGroup: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' },
    filterCheckbox: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#495057', cursor: 'pointer' },
    checkboxInput: { margin: 0, width: '16px', height: '16px' },
    refreshButton: { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' },
    exportButton: { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' },
    tableContainer: { backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' },
    tableWrapper: { overflowX: 'auto' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { padding: '16px', textAlign: 'left', backgroundColor: '#f8f9fa', fontWeight: '600', color: '#495057', fontSize: '14px', borderBottom: '1px solid #eaeaea', cursor: 'pointer', userSelect: 'none' },
    tr: { borderBottom: '1px solid #eaeaea' },
    lowStockRow: { backgroundColor: '#fffbe6' },
    unbalancedRow: { backgroundColor: '#fff1f0', borderLeft: '3px solid #c0392b' },
    td: { padding: '16px', fontSize: '14px', color: '#495057' },
    noData: { padding: '40px', textAlign: 'center', color: '#6c757d', fontSize: '16px' },
    pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', padding: '20px', borderTop: '1px solid #eaeaea' },
    paginationButton: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', backgroundColor: '#fff' },
    paginationInfo: { fontSize: '14px', color: '#495057', fontWeight: '600' }
};

const styleSheet = document.createElement("style");
styleSheet.innerText = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
document.head.appendChild(styleSheet);

export default StockBalance;