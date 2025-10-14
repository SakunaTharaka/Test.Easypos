import React, { useEffect, useState } from "react";
import { db, auth } from "../../firebase";
import { doc, getDoc } from "firebase/firestore"; // Removed unused collection/query imports
import { AiOutlineReload, AiOutlineDownload, AiOutlineExclamationCircle } from "react-icons/ai";
import { calculateStockBalances } from "../../utils/inventoryUtils"; // 💡 Import the new utility function

const StockBalance = () => {
  // ... (all state variables remain the same) ...
  const [loading, setLoading] = useState(true);
  const [stockData, setStockData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: 'item', direction: 'ascending' });
  const [stockReminderThreshold, setStockReminderThreshold] = useState(null);
  const [showUnbalancedOnly, setShowUnbalancedOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 40;


  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    
    fetchStockData();
    fetchStockReminderSettings();
  }, []);

  const fetchStockReminderSettings = async () => {
    // ... (this function remains exactly the same) ...
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
      console.error("Error fetching stock reminder settings:", error);
    }
  };

  const fetchStockData = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    
    setLoading(true);
    try {
      // 💡 FIX: Replaced the entire aggregation logic with a single call to our utility function.
      const stockList = await calculateStockBalances(db, uid);
      setStockData(stockList);
    } catch (error) {
      console.error("Error fetching stock balance:", error);
      alert("Error fetching stock balance: " + error.message);
    }
    setLoading(false);
  };

  // ... (all other functions like isLowStock, handleSort, exportToCSV, and the entire return JSX remain exactly the same) ...
  // Helper functions for checking stock status
  const isLowStock = (item) => {
    if (!stockReminderThreshold || item.totalStockIn <= 0) return false;
    const percentage = (item.availableQty / item.totalStockIn) * 100;
    return percentage <= stockReminderThreshold;
  };
  const isUnbalanced = (item) => item.availableQty < 0;

  // Sorting, filtering, and pagination logic
  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };

  const sortedData = React.useMemo(() => {
    if (!sortConfig.key) return stockData;
    return [...stockData].sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'ascending' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'ascending' ? 1 : -1;
      return 0;
    });
  }, [stockData, sortConfig]);

  const filteredData = sortedData.filter(item => {
    const matchesSearch = item.item.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesUnbalancedFilter = !showUnbalancedOnly || isUnbalanced(item);
    return matchesSearch && matchesUnbalancedFilter;
  });

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const currentItems = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const exportToCSV = () => {
    const headers = ["Item", "Category", "Total Stock In", "Total Stock Out", "Available Qty"];
    const csvContent = [
      headers.join(","),
      ...filteredData.map(item => [ `"${item.item}"`, `"${item.category}"`, item.totalStockIn, item.totalStockOut, item.availableQty ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `stock_balance_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return (
    <div style={styles.loadingContainer}>
      <div style={styles.loadingSpinner}></div>
      <p>Calculating stock balance...</p>
    </div>
  );

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.headerContainer}>
        <h2 style={styles.header}>Stock Balance Report</h2>
        <p style={styles.subHeader}>View the current quantity of all items in your inventory.</p>
        {stockReminderThreshold && (
          <div style={styles.reminderNote}><AiOutlineExclamationCircle size={16} /><span>Items highlighted in red are at or below {stockReminderThreshold}% of their total stock.</span></div>
        )}
      </div>

      {/* Controls */}
      <div style={styles.controlsContainer}>
        <div style={styles.searchContainer}><input type="text" placeholder="Search items or categories..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={styles.searchInput}/></div>
        <div style={styles.buttonGroup}>
          <label style={styles.filterCheckbox}><input type="checkbox" checked={showUnbalancedOnly} onChange={(e) => {setShowUnbalancedOnly(e.target.checked); setCurrentPage(1);}} style={styles.checkboxInput}/>Show negative stock only</label>
          <button style={styles.refreshButton} onClick={fetchStockData}><AiOutlineReload size={18} /> Refresh</button>
          <button style={styles.exportButton} onClick={exportToCSV}><AiOutlineDownload size={18} /> Export CSV</button>
        </div>
      </div>

      {/* Table */}
      <div style={styles.tableContainer}>
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th} onClick={() => handleSort('item')}>Item {sortConfig.key === 'item' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}</th>
                <th style={styles.th} onClick={() => handleSort('category')}>Category {sortConfig.key === 'category' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}</th>
                <th style={styles.th} onClick={() => handleSort('totalStockIn')}>Total In {sortConfig.key === 'totalStockIn' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}</th>
                <th style={styles.th} onClick={() => handleSort('totalStockOut')}>Total Out {sortConfig.key === 'totalStockOut' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}</th>
                <th style={styles.th} onClick={() => handleSort('availableQty')}>Available Qty {sortConfig.key === 'availableQty' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}</th>
              </tr>
            </thead>
            <tbody>
              {currentItems.length > 0 ? (
                currentItems.map((item, idx) => {
                  const isLow = isLowStock(item);
                  const isUnbal = isUnbalanced(item);
                  return (
                    <tr key={idx} style={{ ...styles.tr, ...(isLow && styles.lowStockRow), ...(isUnbal && styles.unbalancedRow) }}>
                      <td style={styles.td}>{item.item}</td>
                      <td style={styles.td}>{item.category}</td>
                      <td style={styles.td}>{item.totalStockIn}</td>
                      <td style={styles.td}>{item.totalStockOut}</td>
                      <td style={{ ...styles.td, color: isUnbal ? '#c0392b' : '#27ae60', fontWeight: 600 }}>{item.availableQty}</td>
                    </tr>
                  );
                })
              ) : (<tr><td colSpan={5} style={styles.noData}>{searchTerm ? 'No items match your search.' : 'No stock data available.'}</td></tr>)}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={styles.pagination}>
            <button style={styles.paginationButton} onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>Previous</button>
            <span style={styles.paginationInfo}>Page {currentPage} of {totalPages}</span>
            <button style={styles.paginationButton} onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
};
// ... (styles remain the same) ...
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
    paginationButton: { padding: '8px 16px', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
    paginationInfo: { fontSize: '14px', color: '#495057' }
};

const styleSheet = document.createElement("style");
styleSheet.innerText = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
document.head.appendChild(styleSheet);


export default StockBalance;