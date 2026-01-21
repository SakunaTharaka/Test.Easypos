import React, { useEffect, useState, useRef } from "react";
import ReactDOM from "react-dom";
import { auth, db } from "../../firebase"; 
// Removed 'where' from imports
import { collection, query, orderBy, onSnapshot, updateDoc, doc } from "firebase/firestore";
import { AiOutlineCheck, AiOutlinePrinter, AiOutlineExpand, AiOutlineCompress, AiOutlineCalendar } from "react-icons/ai";

// Helper to get today's date in Sri Lanka Time
const getSriLankaDate = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
};

// --- PRINT LAYOUT COMPONENT (The Ticket) ---
const KitchenTicket = ({ order }) => {
  // Removed unused isDineIn variable

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', width: '300px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', borderBottom: '2px dashed #000', paddingBottom: '10px', marginBottom: '10px' }}>
        <h2 style={{ margin: '0', fontSize: '24px', fontWeight: '900' }}>KITCHEN ORDER</h2>
        
        {/* ✅ ORDER TYPE LABEL IN PRINT */}
        <h3 style={{ margin: '5px 0', fontSize: '18px', fontWeight: 'bold', textTransform: 'uppercase' }}>
            [ {order.type || "TAKE AWAY"} ]
        </h3>

        <h1 style={{ margin: '5px 0', fontSize: '40px', fontWeight: '900' }}>#{order.orderNumber ? String(order.orderNumber).padStart(2, '0') : '-'}</h1>
        <p style={{ margin: '5px 0', fontSize: '12px' }}>{order.invoiceNumber}</p>
        <p style={{ margin: '0', fontSize: '12px' }}>{new Date().toLocaleString()}</p>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #000' }}>
            <th style={{ textAlign: 'left', padding: '5px 0' }}>ITEM</th>
            <th style={{ textAlign: 'right', padding: '5px 0' }}>QTY</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, i) => (
            <tr key={i} style={{ borderBottom: '1px dashed #ccc' }}>
              <td style={{ padding: '8px 0', fontSize: '16px', fontWeight: 'bold' }}>
                {item.itemName} 
                {item.variant && <span style={{fontSize: '0.8em', display: 'block', fontWeight: 'normal'}}>({item.variant})</span>}
              </td>
              <td style={{ padding: '8px 0', textAlign: 'right', fontSize: '20px', fontWeight: '900' }}>{item.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: '20px', borderTop: '2px dashed #000', paddingTop: '10px', textAlign: 'center', fontSize: '12px' }}>
        ** END OF TICKET **
      </div>
    </div>
  );
};

// --- PRINT MANAGER (Handles Iframe & Portal) ---
const KitchenPrintManager = ({ order, onPrintFinished }) => {
    const [mountNode, setMountNode] = useState(null);
    const iframeRef = useRef(null);

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
        doc.write('<html><head><title>Kitchen Ticket</title></head><body><div id="print-mount"></div></body></html>');
        doc.close();

        const style = doc.createElement('style');
        style.textContent = `
            @page { size: auto; margin: 0; }
            body { margin: 0; padding: 0; font-family: monospace; }
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
        if (mountNode && iframeRef.current) {
            const timer = setTimeout(() => {
                const win = iframeRef.current.contentWindow;
                if (win) {
                    win.focus();
                    win.print();
                }
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [mountNode]);

    useEffect(() => {
        if (!iframeRef.current) return;
        const win = iframeRef.current.contentWindow;
        const handleAfterPrint = () => {
            onPrintFinished();
        };
        win.addEventListener('afterprint', handleAfterPrint);
        return () => win.removeEventListener('afterprint', handleAfterPrint);
    }, [mountNode, onPrintFinished]);

    return mountNode ? ReactDOM.createPortal(<KitchenTicket order={order} />, mountNode) : null;
};


const KitchenDisplay = () => {
  // --- STATE ---
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getSriLankaDate());
  const [showCompleted, setShowCompleted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Modal & Print State
  const [confirmModal, setConfirmModal] = useState({ show: false, orderId: null });
  const [printingOrder, setPrintingOrder] = useState(null);

  const containerRef = useRef(null);

  // --- FULL SCREEN TOGGLE ---
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => console.log(err));
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // --- DATA FETCHING ---
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    setLoading(true);

    const kotCollectionRef = collection(db, user.uid, "kot", selectedDate);
    const q = query(kotCollectionRef, orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setOrders(fetchedOrders);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching KOT orders:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedDate]);

  // --- ACTIONS ---

  const requestComplete = (orderId) => {
    setConfirmModal({ show: true, orderId });
  };

  const confirmComplete = async () => {
    if (confirmModal.orderId) {
      try {
        const orderRef = doc(db, auth.currentUser.uid, "kot", selectedDate, confirmModal.orderId);
        await updateDoc(orderRef, { 
          status: "completed", 
          completedAt: new Date() 
        });
      } catch (error) {
        console.error("Error completing order:", error);
      }
    }
    setConfirmModal({ show: false, orderId: null });
  };

  const handlePrint = (order) => {
    setPrintingOrder(order);
  };

  const visibleOrders = orders.filter(order => {
    const status = (order.status || "Pending").toLowerCase();
    const isCompleted = status === "completed";
    return showCompleted ? isCompleted : !isCompleted;
  });

  return (
    <div ref={containerRef} style={styles.container}>
      
      {/* --- HIDDEN PRINT COMPONENT --- */}
      {printingOrder && (
        <KitchenPrintManager 
            order={printingOrder} 
            onPrintFinished={() => setPrintingOrder(null)} 
        />
      )}

      {/* --- TOP BAR --- */}
      <div style={styles.topBar}>
        <div style={styles.leftControls}>
           <h1 style={styles.pageTitle}>Kitchen Display</h1>
           <div style={styles.dateControl}>
              <AiOutlineCalendar size={20} color="#555" />
              <input 
                type="date" 
                value={selectedDate} 
                onChange={(e) => setSelectedDate(e.target.value)} 
                style={styles.dateInput} 
              />
           </div>
        </div>

        <div style={styles.rightControls}>
            <label style={styles.checkboxLabel}>
                <input 
                  type="checkbox" 
                  checked={showCompleted} 
                  onChange={(e) => setShowCompleted(e.target.checked)} 
                  style={styles.checkbox}
                />
                Show Completed
            </label>
            <button onClick={toggleFullscreen} style={styles.fullscreenBtn}>
                {isFullscreen ? <AiOutlineCompress size={20} /> : <AiOutlineExpand size={20} />}
                {isFullscreen ? " Exit Fullscreen" : " Fullscreen"}
            </button>
        </div>
      </div>

      {/* --- ORDERS GRID --- */}
      <div style={styles.gridContainer}>
        {loading ? (
            <div style={styles.loadingState}>Loading KOT orders...</div>
        ) : visibleOrders.length === 0 ? (
            <div style={styles.emptyState}>
                <AiOutlineCheck size={60} color="#ccc" />
                <p>No {showCompleted ? 'completed' : 'pending'} orders for {selectedDate}</p>
            </div>
        ) : (
            visibleOrders.map((order) => {
                // ✅ Check if Order is Dine-in
                const isDineIn = order.type === 'Dine-in';
                
                return (
                    <div key={order.id} style={styles.card}>
                        {/* Card Header: Blue for Dine-in, Yellow for Take Away */}
                        <div style={isDineIn ? styles.cardHeaderDineIn : styles.cardHeader}>
                            
                            {/* ✅ Dine-In Badge */}
                            {isDineIn && <div style={styles.dineInBadge}>DINE-IN</div>}
                            
                            <div style={styles.orderNumber}>
                                ORDER: {order.orderNumber ? String(order.orderNumber).padStart(2, '0') : "N/A"}
                            </div>
                            <div style={styles.invoiceNumber}>{order.invoiceNumber}</div>
                            {order.shift && <div style={{fontSize: '12px', opacity: 0.8, marginTop: '2px'}}>Shift: {order.shift}</div>}
                        </div>

                        {/* Items List */}
                        <div style={styles.cardBody}>
                            {order.items && order.items.map((item, idx) => (
                                <div key={idx} style={styles.itemRow}>
                                    <div style={styles.itemName}>
                                        {item.itemName}
                                        {item.variant && <span style={{fontSize: '0.8em', color: '#666', marginLeft: '5px'}}>({item.variant})</span>}
                                    </div>
                                    <div style={styles.itemQty}>x {item.quantity}</div>
                                </div>
                            ))}
                        </div>

                        {/* Card Footer */}
                        <div style={styles.cardFooter}>
                            <button 
                                onClick={() => handlePrint(order)} 
                                style={styles.printBtn}
                            >
                                <AiOutlinePrinter size={20} /> Print
                            </button>
                            {!showCompleted && (
                                <button 
                                    onClick={() => requestComplete(order.id)} 
                                    style={styles.completeBtn}
                                >
                                    <AiOutlineCheck size={20} /> Complete
                                </button>
                            )}
                        </div>
                    </div>
                );
            })
        )}
      </div>

      {/* --- CONFIRMATION MODAL --- */}
      {confirmModal.show && (
        <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
                <h2 style={styles.modalTitle}>Complete Order?</h2>
                <p>Mark this order as ready?</p>
                <div style={styles.modalActions}>
                    <button onClick={() => setConfirmModal({ show: false, orderId: null })} style={styles.btnNo}>No</button>
                    <button onClick={confirmComplete} style={styles.btnYes}>Yes</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

// --- STYLES ---
const styles = {
  container: { 
    padding: '24px', 
    backgroundColor: '#f3f4f6', 
    minHeight: '100vh', 
    color: '#1f2937', 
    fontFamily: "'Inter', sans-serif",
    display: 'flex',
    flexDirection: 'column'
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    backgroundColor: '#fff',
    padding: '16px 24px',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  leftControls: { display: 'flex', alignItems: 'center', gap: '24px' },
  pageTitle: { margin: 0, fontSize: '24px', fontWeight: '700', color: '#111827' },
  dateControl: { display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#f9fafb', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e7eb' },
  dateInput: { border: 'none', fontSize: '15px', outline: 'none', fontWeight: '600', color: '#374151', backgroundColor: 'transparent' },
  
  rightControls: { display: 'flex', alignItems: 'center', gap: '20px' },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', color: '#4b5563' },
  checkbox: { transform: 'scale(1.2)', cursor: 'pointer' },
  fullscreenBtn: { 
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '10px 16px', 
    backgroundColor: '#fff', 
    color: '#374151', 
    border: '1px solid #d1d5db', 
    borderRadius: '8px', 
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px',
    transition: 'background 0.2s'
  },

  // Grid Layout
  gridContainer: { 
    display: 'grid', 
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
    gap: '24px',
    flex: 1
  },
  
  // Card Styles
  card: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    height: 'fit-content',
    border: '1px solid #e5e7eb'
  },
  
  // ✅ Default Header (Take Away)
  cardHeader: {
    padding: '16px',
    textAlign: 'center',
    borderBottom: '1px solid #f3f4f6',
    backgroundColor: '#fef3c7', // Soft yellow
    color: '#92400e',
    position: 'relative'
  },

  // ✅ Dine-In Header
  cardHeaderDineIn: {
    padding: '16px',
    textAlign: 'center',
    borderBottom: '1px solid #e0e7ff',
    backgroundColor: '#e0e7ff', // Soft Indigo/Blue
    color: '#3730a3',
    position: 'relative'
  },

  // ✅ Dine-In Badge
  dineInBadge: {
    backgroundColor: '#3730a3',
    color: 'white',
    fontSize: '12px',
    fontWeight: '700',
    padding: '4px 8px',
    borderRadius: '4px',
    position: 'absolute',
    top: '10px',
    left: '10px',
    letterSpacing: '0.5px'
  },

  orderNumber: { fontSize: '2em', fontWeight: '800', lineHeight: 1, marginTop: '8px' },
  invoiceNumber: { fontSize: '0.85em', fontWeight: '600', marginTop: '4px', opacity: 0.8 },
  
  cardBody: {
    padding: '16px',
    backgroundColor: '#fff',
    color: '#374151',
    flex: 1
  },
  itemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px dashed #e5e7eb',
    padding: '10px 0',
    fontSize: '1.1em',
    fontWeight: '600'
  },
  itemName: { flex: 1, marginRight: '10px' },
  itemQty: { backgroundColor: '#f3f4f6', padding: '4px 10px', borderRadius: '6px', color: '#111827' },
  
  cardFooter: {
    display: 'flex',
    borderTop: '1px solid #e5e7eb'
  },
  printBtn: {
    flex: 1,
    padding: '16px',
    border: 'none',
    backgroundColor: '#3b82f6', // Blue
    color: 'white',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px'
  },
  completeBtn: {
    flex: 1,
    padding: '16px',
    border: 'none',
    backgroundColor: '#10b981', // Green
    color: 'white',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px'
  },

  // Modal Styles
  modalOverlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(2px)',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    zIndex: 1000
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: '32px',
    borderRadius: '16px',
    textAlign: 'center',
    color: '#1f2937',
    minWidth: '350px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
  },
  modalTitle: { marginTop: 0, marginBottom: '12px', fontSize: '20px', fontWeight: '700' },
  modalActions: {
    display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '24px'
  },
  btnYes: {
    padding: '10px 32px', backgroundColor: '#10b981', color: 'white',
    border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer', fontWeight: '600'
  },
  btnNo: {
    padding: '10px 32px', backgroundColor: '#e5e7eb', color: '#374151',
    border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer', fontWeight: '600'
  },

  loadingState: { textAlign: 'center', fontSize: '1.2em', marginTop: '50px', color: '#6b7280' },
  emptyState: { 
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    marginTop: '80px', color: '#9ca3af', fontSize: '1.2em'
  }
};

export default KitchenDisplay;