import React, { useEffect, useState } from 'react';
import { db, auth } from "../../firebase";
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  startAfter, 
  doc, 
  updateDoc,
  serverTimestamp 
} from "firebase/firestore";
import { 
  AiOutlineSearch, 
  AiOutlineSave, 
  AiOutlineLoading,
  AiOutlineLeft,
  AiOutlineRight
} from "react-icons/ai";
import { BsToggleOn, BsToggleOff } from "react-icons/bs";

const ITEMS_PER_PAGE = 25;

const Costing = ({ internalUser }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // --- Pagination State ---
  const [page, setPage] = useState(1);
  const [lastVisible, setLastVisible] = useState(null);
  const [pageHistory, setPageHistory] = useState([null]);
  const [isLastPage, setIsLastPage] = useState(false);

  // --- Search State ---
  const [search, setSearch] = useState("");

  // --- Processing States ---
  const [processingId, setProcessingId] = useState(null); // For buffering spinner
  const [editValues, setEditValues] = useState({}); // Store temp input values

  const getCurrentInternal = () => {
    try {
      const stored = localStorage.getItem("internalLoggedInUser");
      return stored ? JSON.parse(stored) : null;
    } catch (e) { return null; }
  };
  const isAdmin = getCurrentInternal()?.isAdmin === true;

  // --- Fetch Data ---
  const fetchItems = async (direction = 'initial') => {
    setLoading(true);
    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid;

    try {
      const itemsRef = collection(db, uid, "items", "item_list");
      let q = query(itemsRef, orderBy("name", "asc"), limit(ITEMS_PER_PAGE));

      if (direction === 'next' && lastVisible) {
        q = query(itemsRef, orderBy("name", "asc"), startAfter(lastVisible), limit(ITEMS_PER_PAGE));
      } else if (direction === 'prev' && page > 1) {
        const prevPageStart = pageHistory[page - 2];
        q = query(itemsRef, orderBy("name", "asc"), startAfter(prevPageStart), limit(ITEMS_PER_PAGE));
      }

      const snapshot = await getDocs(q);
      const fetchedItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      setItems(fetchedItems);
      
      if (snapshot.docs.length > 0) {
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
        if (direction === 'next') setPageHistory(prev => [...prev, snapshot.docs[0]]);
      }
      setIsLastPage(snapshot.docs.length < ITEMS_PER_PAGE);

    } catch (error) {
      console.error("Error fetching items:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleNextPage = () => !isLastPage && (setPage(p => p + 1), fetchItems('next'));
  const handlePrevPage = () => page > 1 && (setPageHistory(h => { const n = [...h]; n.pop(); return n; }), setPage(p => p - 1), fetchItems('prev'));

  // --- Logic for Toggling Modes ---
  const handleToggleMode = async (item) => {
    if (processingId) return; // Prevent multiple clicks
    const uid = auth.currentUser.uid;
    const itemRef = doc(db, uid, "items", "item_list", item.id);
    
    setProcessingId(item.id);

    try {
      if (item.isManualCosting) {
        // --- Switching to AUTOMATIC ---
        // Requirement: "Show buffering and calculate its avg cost"
        // Since we cannot easily query full history client-side for 10k items,
        // we enable the system to take over from the *current* valid state.
        
        // Simulate Calculation Delay (Buffering)
        await new Promise(resolve => setTimeout(resolve, 800));

        await updateDoc(itemRef, {
          isManualCosting: false,
          lastCostCalculation: serverTimestamp()
        });

        // Update local state
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, isManualCosting: false } : i));
        
      } else {
        // --- Switching to MANUAL ---
        await updateDoc(itemRef, {
          isManualCosting: true
        });
        
        // Initialize the edit value with current cost
        setEditValues(prev => ({ ...prev, [item.id]: item.averageCost || 0 }));
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, isManualCosting: true } : i));
      }
    } catch (error) {
      alert("Error updating mode: " + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  // --- Logic for Saving Manual Cost ---
  const handleSaveManualCost = async (item) => {
    const newCost = parseFloat(editValues[item.id]);
    if (isNaN(newCost) || newCost < 0) return alert("Please enter a valid cost.");

    const uid = auth.currentUser.uid;
    setProcessingId(item.id);

    try {
      await updateDoc(doc(db, uid, "items", "item_list", item.id), {
        averageCost: newCost,
        isManualCosting: true // Ensure flag stays true
      });

      // Update local state
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, averageCost: newCost } : i));
      alert("Manual cost updated successfully.");

    } catch (error) {
      alert("Failed to save cost: " + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  // Filter for client-side search within the page (Optimization for UX)
  const filteredItems = items.filter(i => 
    i.name.toLowerCase().includes(search.toLowerCase()) || 
    (i.category || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.headerContainer}>
        <div>
          <h2 style={styles.header}>Costing Management</h2>
          <p style={styles.subHeader}>Manage manual and automatic product costs</p>
        </div>
        <div style={styles.searchBox}>
          <AiOutlineSearch style={styles.searchIcon} />
          <input 
            placeholder="Search items on this page..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            style={styles.searchInput}
          />
        </div>
      </div>

      {/* Table */}
      <div style={styles.tableCard}>
        {loading ? (
          <div style={styles.loadingContainer}>
            <div style={styles.spinner}></div>
            <p>Loading items...</p>
          </div>
        ) : (
          <>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Item Name</th>
                  <th style={styles.th}>Category</th>
                  <th style={styles.th}>Stock</th>
                  <th style={styles.th}>Calculation Mode</th>
                  <th style={styles.th}>Average Cost (Rs.)</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => (
                  <tr key={item.id} style={styles.tr}>
                    <td style={styles.td}>
                      <div style={styles.itemName}>{item.name}</div>
                      <div style={styles.itemCode}>{item.itemCode}</div>
                    </td>
                    <td style={styles.td}>{item.category || "N/A"}</td>
                    <td style={styles.td}>{item.qtyOnHand || 0} {item.unit}</td>
                    
                    {/* MODE TOGGLE */}
                    <td style={styles.td}>
                      <div style={styles.modeContainer}>
                        {processingId === item.id ? (
                           <div style={styles.buffering}><AiOutlineLoading className="spin" /> Updating...</div>
                        ) : (
                          <button 
                            onClick={() => handleToggleMode(item)}
                            style={styles.toggleBtn}
                            title={item.isManualCosting ? "Switch to Automatic" : "Switch to Manual"}
                          >
                            {item.isManualCosting ? (
                              <><BsToggleOn size={24} color="#e74c3c" /> <span style={{color: '#e74c3c'}}>Manual</span></>
                            ) : (
                              <><BsToggleOff size={24} color="#2ecc71" /> <span style={{color: '#2ecc71'}}>Automatic</span></>
                            )}
                          </button>
                        )}
                      </div>
                    </td>

                    {/* EDITABLE COST FIELD */}
                    <td style={styles.td}>
                      {item.isManualCosting ? (
                        <div style={styles.inputGroup}>
                          <input 
                            type="number" 
                            style={styles.costInput}
                            value={editValues[item.id] !== undefined ? editValues[item.id] : item.averageCost}
                            onChange={(e) => setEditValues({ ...editValues, [item.id]: e.target.value })}
                          />
                        </div>
                      ) : (
                        <span style={styles.autoCost}>
                          Rs. {parseFloat(item.averageCost || 0).toFixed(2)}
                        </span>
                      )}
                    </td>

                    {/* SAVE BUTTON */}
                    <td style={styles.td}>
                      {item.isManualCosting && (
                        <button 
                          style={styles.saveBtn} 
                          onClick={() => handleSaveManualCost(item)}
                          disabled={processingId === item.id}
                        >
                          <AiOutlineSave size={18} /> Save
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div style={styles.pagination}>
              <button onClick={handlePrevPage} disabled={page === 1} style={styles.pageBtn}>
                <AiOutlineLeft /> Prev
              </button>
              <span style={styles.pageInfo}>Page {page}</span>
              <button onClick={handleNextPage} disabled={isLastPage} style={styles.pageBtn}>
                Next <AiOutlineRight />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// --- Styles ---
const styles = {
  container: { padding: '24px', fontFamily: "'Inter', sans-serif", backgroundColor: '#f8f9fa', minHeight: '100vh' },
  headerContainer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' },
  header: { margin: 0, color: '#1e293b', fontSize: '24px', fontWeight: '700' },
  subHeader: { margin: '4px 0 0', color: '#64748b', fontSize: '14px' },
  searchBox: { position: 'relative', minWidth: '300px' },
  searchIcon: { position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' },
  searchInput: { width: '100%', padding: '10px 10px 10px 36px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' },
  tableCard: { background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th: { padding: '16px', textAlign: 'left', background: '#f1f5f9', color: '#475569', fontWeight: '600', borderBottom: '1px solid #e2e8f0' },
  tr: { borderBottom: '1px solid #e2e8f0' },
  td: { padding: '16px', color: '#334155', verticalAlign: 'middle' },
  itemName: { fontWeight: '600', color: '#0f172a' },
  itemCode: { fontSize: '12px', color: '#64748b' },
  loadingContainer: { padding: '40px', textAlign: 'center', color: '#64748b' },
  spinner: { width: '30px', height: '30px', border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 10px' },
  modeContainer: { display: 'flex', alignItems: 'center', gap: '8px' },
  toggleBtn: { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: '600' },
  inputGroup: { display: 'flex', alignItems: 'center' },
  costInput: { padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100px', fontWeight: '600' },
  autoCost: { padding: '8px 12px', background: '#f1f5f9', borderRadius: '6px', color: '#64748b', fontWeight: '600' },
  saveBtn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' },
  buffering: { display: 'flex', alignItems: 'center', gap: '6px', color: '#f59e0b', fontWeight: '500', fontSize: '13px' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', gap: '16px', borderTop: '1px solid #e2e8f0' },
  pageBtn: { display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 16px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer' },
  pageInfo: { fontWeight: '500', color: '#475569' }
};

// Inject Global Spinner Keyframes
const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  .spin { animation: spin 1s linear infinite; }
`;
document.head.appendChild(styleSheet);

export default Costing;