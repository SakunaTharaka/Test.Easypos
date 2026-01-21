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
  serverTimestamp,
  where 
} from "firebase/firestore";
import { 
  AiOutlineSearch, 
  AiOutlineSave, 
  AiOutlineLoading,
  AiOutlineLeft,
  AiOutlineRight,
  AiFillLock,
  AiOutlineEdit
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
  const [processingId, setProcessingId] = useState(null); 
  const [editValues, setEditValues] = useState({}); // Stores temporary input values
  const [editingRows, setEditingRows] = useState({}); // ✅ Tracks which rows are in "Edit Mode"

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
      const allowedTypes = ["buySell", "ourProduct"];
      let q;

      if (direction === 'next' && lastVisible) {
        q = query(itemsRef, where("type", "in", allowedTypes), orderBy("name", "asc"), startAfter(lastVisible), limit(ITEMS_PER_PAGE));
      } else if (direction === 'prev' && page > 1) {
        const prevPageStart = pageHistory[page - 2];
        q = query(itemsRef, where("type", "in", allowedTypes), orderBy("name", "asc"), startAfter(prevPageStart), limit(ITEMS_PER_PAGE));
      } else {
        q = query(itemsRef, where("type", "in", allowedTypes), orderBy("name", "asc"), limit(ITEMS_PER_PAGE));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNextPage = () => !isLastPage && (setPage(p => p + 1), fetchItems('next'));
  const handlePrevPage = () => page > 1 && (setPageHistory(h => { const n = [...h]; n.pop(); return n; }), setPage(p => p - 1), fetchItems('prev'));

  // --- Toggle Modes ---
  const handleToggleMode = async (item) => {
    if (processingId) return; 
    if (item.type === "ourProduct") return; // Prevent toggle for finished products

    const uid = auth.currentUser.uid;
    const itemRef = doc(db, uid, "items", "item_list", item.id);
    
    setProcessingId(item.id);

    try {
      if (item.isManualCosting) {
        // Switch to AUTOMATIC
        await new Promise(resolve => setTimeout(resolve, 500)); // UX delay
        await updateDoc(itemRef, { isManualCosting: false, lastCostCalculation: serverTimestamp() });
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, isManualCosting: false } : i));
        // Exit edit mode if active
        setEditingRows(prev => ({ ...prev, [item.id]: false }));
      } else {
        // Switch to MANUAL
        await updateDoc(itemRef, { isManualCosting: true });
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, isManualCosting: true } : i));
        // Automatically enter edit mode
        setEditValues(prev => ({ ...prev, [item.id]: item.averageCost || 0 }));
        setEditingRows(prev => ({ ...prev, [item.id]: true }));
      }
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  // --- Enter Edit Mode ---
  const handleEditClick = (item) => {
      // Pre-fill value and enable edit mode for this row
      setEditValues(prev => ({ ...prev, [item.id]: item.averageCost || 0 }));
      setEditingRows(prev => ({ ...prev, [item.id]: true }));
  };

  // --- Save Cost ---
  const handleSaveManualCost = async (item) => {
    const newCost = parseFloat(editValues[item.id]);
    if (isNaN(newCost) || newCost < 0) return alert("Please enter a valid cost.");

    const uid = auth.currentUser.uid;
    setProcessingId(item.id);

    try {
      await updateDoc(doc(db, uid, "items", "item_list", item.id), {
        averageCost: newCost,
        isManualCosting: true 
      });

      setItems(prev => prev.map(i => i.id === item.id ? { ...i, averageCost: newCost } : i));
      
      // ✅ Exit Edit Mode upon success
      setEditingRows(prev => ({ ...prev, [item.id]: false }));

    } catch (error) {
      alert("Failed to save: " + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  // Client-side search filter
  const filteredItems = items.filter(i => 
    i.name.toLowerCase().includes(search.toLowerCase()) || 
    (i.category || "").toLowerCase().includes(search.toLowerCase())
  );

  if (!isAdmin) {
    return (
        <div style={{...styles.container, display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
            <div style={{textAlign: 'center', color: '#64748b'}}>
                <AiFillLock size={48} style={{marginBottom: '16px', color: '#ef4444'}} />
                <h2 style={{margin: '0 0 8px 0', color: '#1e293b'}}>Access Denied</h2>
                <p style={{margin: 0}}>You do not have permission to view Costing.</p>
            </div>
        </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.headerContainer}>
        <div>
          <h2 style={styles.header}>Costing Management</h2>
          <p style={styles.subHeader}>Manage manual and automatic product costs</p>
        </div>
        <div style={styles.searchBox}>
          <AiOutlineSearch style={styles.searchIcon} />
          <input 
            placeholder="Search items..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            style={styles.searchInput}
          />
        </div>
      </div>

      <div style={styles.tableCard}>
        {loading ? (
          <div style={styles.loadingContainer}><div style={styles.spinner}></div><p>Loading items...</p></div>
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
                {filteredItems.map(item => {
                  const isFinishedProduct = item.type === "ourProduct";
                  const isManualMode = item.isManualCosting || isFinishedProduct;
                  const isEditing = editingRows[item.id]; // Check if this specific row is being edited

                  return (
                    <tr key={item.id} style={styles.tr}>
                      <td style={styles.td}>
                        <div style={styles.itemName}>{item.name}</div>
                        <div style={styles.itemCode}>{item.itemCode}</div>
                        {isFinishedProduct && <span style={styles.typeBadge}>Finished Product</span>}
                      </td>
                      <td style={styles.td}>{item.category || "N/A"}</td>
                      <td style={styles.td}>{item.qtyOnHand || 0} {item.unit}</td>
                      
                      {/* Mode Toggle */}
                      <td style={styles.td}>
                        <div style={styles.modeContainer}>
                          {processingId === item.id ? (
                             <div style={styles.buffering}><AiOutlineLoading className="spin" /> Updating...</div>
                          ) : isFinishedProduct ? (
                            <div style={{...styles.toggleBtn, cursor: 'not-allowed', opacity: 0.8}} title="Locked">
                                <BsToggleOn size={24} color="#e74c3c" /> 
                                <span style={{color: '#e74c3c'}}>Manual</span>
                                <AiFillLock size={14} color="#999" style={{marginLeft: 4}}/>
                            </div>
                          ) : (
                            <button 
                              onClick={() => handleToggleMode(item)}
                              style={styles.toggleBtn}
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

                      {/* Cost Value (Input vs Text) */}
                      <td style={styles.td}>
                        {isManualMode ? (
                          isEditing ? (
                            // ✅ EDIT MODE: Show Input with AutoFocus
                            <div style={styles.inputGroup}>
                              <input 
                                type="number" 
                                autoFocus={true} // ✅ Auto Focus
                                style={styles.costInput}
                                value={editValues[item.id] !== undefined ? editValues[item.id] : item.averageCost}
                                onChange={(e) => setEditValues({ ...editValues, [item.id]: e.target.value })}
                                onKeyDown={(e) => { if(e.key === 'Enter') handleSaveManualCost(item); }}
                              />
                            </div>
                          ) : (
                            // ✅ VIEW MODE: Show Text
                            <span style={styles.manualCostText}>
                              Rs. {parseFloat(item.averageCost || 0).toFixed(2)}
                            </span>
                          )
                        ) : (
                          // ✅ AUTOMATIC: Show Text
                          <span style={styles.autoCostText}>
                            Rs. {parseFloat(item.averageCost || 0).toFixed(2)}
                          </span>
                        )}
                      </td>

                      {/* Actions (Save vs Edit) */}
                      <td style={styles.td}>
                        {isManualMode && (
                          isEditing ? (
                            <button 
                              style={styles.saveBtn} 
                              onClick={() => handleSaveManualCost(item)}
                              disabled={processingId === item.id}
                            >
                              <AiOutlineSave size={16} /> Save
                            </button>
                          ) : (
                            <button 
                              style={styles.editBtn} 
                              onClick={() => handleEditClick(item)}
                              disabled={processingId === item.id}
                            >
                              <AiOutlineEdit size={16} /> Edit
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={styles.pagination}>
              <button onClick={handlePrevPage} disabled={page === 1} style={styles.pageBtn}><AiOutlineLeft /> Prev</button>
              <span style={styles.pageInfo}>Page {page}</span>
              <button onClick={handleNextPage} disabled={isLastPage} style={styles.pageBtn}>Next <AiOutlineRight /></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

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
  typeBadge: { display: 'inline-block', fontSize: '10px', backgroundColor: '#e0e7ff', color: '#3730a3', padding: '2px 6px', borderRadius: '4px', marginTop: '4px', fontWeight: '500' },
  loadingContainer: { padding: '40px', textAlign: 'center', color: '#64748b' },
  spinner: { width: '30px', height: '30px', border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 10px' },
  modeContainer: { display: 'flex', alignItems: 'center', gap: '8px' },
  toggleBtn: { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: '600' },
  inputGroup: { display: 'flex', alignItems: 'center' },
  costInput: { padding: '8px', borderRadius: '6px', border: '2px solid #3b82f6', width: '100px', fontWeight: '600', outline: 'none' },
  
  // Text Styles
  autoCostText: { padding: '6px 10px', background: '#f1f5f9', borderRadius: '6px', color: '#64748b', fontWeight: '600' },
  manualCostText: { padding: '6px 10px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '6px', color: '#c2410c', fontWeight: '700' },

  // Button Styles
  saveBtn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', boxShadow: '0 2px 4px rgba(22, 163, 74, 0.2)' },
  editBtn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)' },

  buffering: { display: 'flex', alignItems: 'center', gap: '6px', color: '#f59e0b', fontWeight: '500', fontSize: '13px' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', gap: '16px', borderTop: '1px solid #e2e8f0' },
  pageBtn: { display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 16px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer' },
  pageInfo: { fontWeight: '500', color: '#475569' }
};

const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  .spin { animation: spin 1s linear infinite; }
`;
document.head.appendChild(styleSheet);

export default Costing;