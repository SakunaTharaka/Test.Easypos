import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../../firebase'; 
import { 
  collection, 
  onSnapshot, 
  query, 
  serverTimestamp,
  orderBy,
  doc, 
  deleteDoc, 
  updateDoc, 
  getDoc,  
  where,
  getDocs,
  runTransaction 
} from 'firebase/firestore';
import { FaCalendarAlt, FaCheckCircle, FaTrash, FaEye, FaSave, FaSearch } from 'react-icons/fa';

const Services = ({ internalUser }) => {
  // Form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [jobType, setJobType] = useState('');
  const [generalInfo, setGeneralInfo] = useState('');
  const [jobCompleteDate, setJobCompleteDate] = useState(''); 
  const [advanceAmount, setAdvanceAmount] = useState(''); 
  const [totalCharge, setTotalCharge] = useState('');

  // Payment & Modal State
  const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
  const [confirmPaymentMethod, setConfirmPaymentMethod] = useState('Cash');
  const [pendingAction, setPendingAction] = useState(null); 
  const paymentOptions = ['Cash', 'Card', 'Online'];

  // App state
  const [isLoading, setIsLoading] = useState(false); 
  const [isUpdating, setIsUpdating] = useState(false); 
  const [isDeleting, setIsDeleting] = useState(false); 
  const [error, setError] = useState(null);
  
  // List & Search state
  const [allJobs, setAllJobs] = useState([]);
  const [filteredJobs, setFilteredJobs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [jobsLoading, setJobsLoading] = useState(true);
  const [showCompletedJobs, setShowCompletedJobs] = useState(false); 

  // Modal state
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null); 
  
  // Extend Date Modal
  const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
  const [jobToExtend, setJobToExtend] = useState(null);
  const [newCompleteDate, setNewCompleteDate] = useState('');

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState(null); 

  const uid = auth.currentUser ? auth.currentUser.uid : null;

  const jobsCollectionRef = useMemo(() => {
    if (!uid) return null;
    return collection(db, uid, 'data', 'service_jobs');
  }, [uid]);

  // Load Jobs
  useEffect(() => {
    if (!jobsCollectionRef) { setJobsLoading(false); return; }
    setJobsLoading(true);
    const q = query(jobsCollectionRef, orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllJobs(jobsData);
      setJobsLoading(false);
    }, (err) => { setError("Failed to load jobs."); setJobsLoading(false); });
    return () => unsubscribe();
  }, [jobsCollectionRef]); 

  // Filter Jobs
  useEffect(() => {
    let filtered = allJobs;
    if (!showCompletedJobs) filtered = filtered.filter(job => job.status !== 'Completed');
    if (searchTerm) {
      const lowerCaseSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(job => 
        job.customerName?.toLowerCase().includes(lowerCaseSearch) ||
        job.customerPhone?.includes(searchTerm) ||
        job.jobType?.toLowerCase().includes(lowerCaseSearch) ||
        job.generatedInvoiceNumber?.toLowerCase().includes(lowerCaseSearch)
      );
    }
    setFilteredJobs(filtered);
  }, [searchTerm, allJobs, showCompletedJobs]);

  // Keyboard navigation
  useEffect(() => {
    const handlePaymentConfirmKeyDown = (e) => {
        if (!showPaymentConfirm) return;
        const currentIndex = paymentOptions.indexOf(confirmPaymentMethod);
        
        if (e.key === 'ArrowRight') {
            setConfirmPaymentMethod(paymentOptions[(currentIndex + 1) % paymentOptions.length]);
        }
        if (e.key === 'ArrowLeft') {
            setConfirmPaymentMethod(paymentOptions[(currentIndex - 1 + paymentOptions.length) % paymentOptions.length]);
        }
        
        if (e.key === 'Enter') {
            handleProcessPayment(confirmPaymentMethod);
        }
        if (e.key === 'Escape') {
            setShowPaymentConfirm(false);
            setPendingAction(null);
        }
    };
    window.addEventListener('keydown', handlePaymentConfirmKeyDown);
    return () => window.removeEventListener('keydown', handlePaymentConfirmKeyDown);
  }, [showPaymentConfirm, confirmPaymentMethod]);

  // --- ACTIONS ---

  const handleSaveClick = (e) => {
    e.preventDefault();
    if (!customerName || !jobType || !totalCharge) { 
        setError('Customer Name, Job Type, and Total Charge are required.'); 
        return; 
    }
    setPendingAction({ type: 'SAVE' });
    setConfirmPaymentMethod('Cash');
    setShowPaymentConfirm(true);
  };

  const handleCompleteClick = (jobId) => {
       const jobData = allJobs.find(j => j.id === jobId);
       if (!jobData) { setError("Could not find job details."); return; }
       
       const balance = (jobData.totalCharge || 0) - (jobData.advanceAmount || 0);
       const jobWithBalance = { ...jobData, balance: balance };
       
       setPendingAction({ type: 'COMPLETE', job: jobWithBalance });
       setConfirmPaymentMethod('Cash');
       setShowPaymentConfirm(true);
  };

  const handleProcessPayment = (method) => {
      if (!pendingAction) return;
      setShowPaymentConfirm(false);
      
      if (pendingAction.type === 'SAVE') {
          executeSaveJob(method);
      } else if (pendingAction.type === 'COMPLETE') {
          executeCompleteJob(pendingAction.job, method);
      }
  };

  // --- SAVE JOB ---
  const executeSaveJob = async (paymentMethod) => {
    if (!uid) { setError('User not authenticated.'); return; }
    setIsLoading(true);
    setError(null);

    try {
      await runTransaction(db, async (transaction) => {
        let walletDocId = null;
        if (paymentMethod === 'Cash') walletDocId = 'cash';
        else if (paymentMethod === 'Card') walletDocId = 'card';
        else if (paymentMethod === 'Online') walletDocId = 'online';

        const walletRef = walletDocId ? doc(db, uid, "wallet", "accounts", walletDocId) : null;
        let currentWalletBalance = 0;

        if (walletRef) {
            const wDoc = await transaction.get(walletRef);
            if (wDoc.exists()) {
                currentWalletBalance = Number(wDoc.data().balance) || 0;
            }
        }

        const invoicesRef = collection(db, uid, "invoices", "invoice_list");
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
        const prefix = `SRV-${dateStr}-`;
        const q = query(invoicesRef, where("invoiceNumber", ">=", prefix), where("invoiceNumber", "<=", prefix + "\uf8ff"));
        const snap = await getDocs(q); 
        const count = snap.size + 1;
        const newInvoiceNumber = `${prefix}${String(count).padStart(4, '0')}`;

        const totalVal = parseFloat(totalCharge) || 0;
        const advanceVal = parseFloat(advanceAmount) || 0;

        const newInvoiceRef = doc(collection(db, uid, "invoices", "invoice_list"));
        const newJobRef = doc(collection(db, uid, 'data', 'service_jobs'));

        const invoiceData = {
            invoiceNumber: newInvoiceNumber,
            customerName: customerName,
            customerTelephone: customerPhone,
            items: [{ itemName: jobType, quantity: 1, price: totalVal }], 
            total: advanceVal, 
            advanceAmount: 0, 
            received: advanceVal, 
            deliveryCharge: 0,
            createdAt: serverTimestamp(),
            issuedBy: internalUser?.username || 'User',
            status: "Pending", 
            type: "SERVICE", 
            remarks: `[ADVANCE] ${jobType}. Total Value: ${totalVal.toFixed(2)}`,
            paymentMethod: paymentMethod,
            relatedJobId: newJobRef.id
        };

        const jobData = {
            customerName, 
            customerPhone,
            jobType, 
            generalInfo, 
            jobCompleteDate,
            status: 'Pending',
            createdAt: serverTimestamp(),
            createdBy: internalUser?.username || 'User',
            totalCharge: totalVal,
            advanceAmount: advanceVal,
            generatedInvoiceNumber: newInvoiceNumber,
            linkedInvoiceId: newInvoiceRef.id 
        };

        transaction.set(newInvoiceRef, invoiceData);
        transaction.set(newJobRef, jobData);

        if (walletRef && advanceVal > 0) {
            transaction.set(walletRef, { 
                balance: currentWalletBalance + advanceVal,
                lastUpdated: serverTimestamp() 
            }, { merge: true });
        }
      });

      setCustomerName(''); setCustomerPhone(''); setJobType(''); setGeneralInfo(''); 
      setJobCompleteDate(''); setTotalCharge(''); setAdvanceAmount(''); 
    } catch (err) { console.error(err); setError('Failed to save job.'); } 
    finally { setIsLoading(false); setPendingAction(null); }
  };

  // --- COMPLETE JOB ---
  const executeCompleteJob = async (jobToComplete, paymentMethod) => {
      if (!uid) return;
      setIsUpdating(true);

      try {
          await runTransaction(db, async (transaction) => {
            let walletDocId = null;
            if (paymentMethod === 'Cash') walletDocId = 'cash';
            else if (paymentMethod === 'Card') walletDocId = 'card';
            else if (paymentMethod === 'Online') walletDocId = 'online';

            const walletRef = walletDocId ? doc(db, uid, "wallet", "accounts", walletDocId) : null;
            let currentWalletBalance = 0;

            const serviceJobRef = doc(db, uid, 'data', 'service_jobs', jobToComplete.id);
            const jobSnap = await transaction.get(serviceJobRef);
            if(!jobSnap.exists()) throw "Job does not exist";
            
            if (walletRef) {
                const wDoc = await transaction.get(walletRef);
                if (wDoc.exists()) {
                    currentWalletBalance = Number(wDoc.data().balance) || 0;
                }
            }

            const jobData = jobSnap.data();
            const balanceAmount = (jobData.totalCharge || 0) - (jobData.advanceAmount || 0);

            transaction.update(serviceJobRef, { status: 'Completed' });

            if (jobData.linkedInvoiceId) {
                const invoiceRef = doc(db, uid, "invoices", "invoice_list", jobData.linkedInvoiceId);
                transaction.update(invoiceRef, { status: "Paid" }); 
            }

            if (balanceAmount > 0) {
                const balInvoiceRef = doc(collection(db, uid, "invoices", "invoice_list"));
                const balInvoiceData = {
                    invoiceNumber: `${jobData.generatedInvoiceNumber}_BAL`,
                    customerName: jobData.customerName,
                    customerTelephone: jobData.customerPhone,
                    items: [{ itemName: "Balance Payment", quantity: 1, price: balanceAmount }],
                    total: balanceAmount,
                    advanceAmount: 0,
                    received: balanceAmount, 
                    deliveryCharge: 0,
                    createdAt: serverTimestamp(),
                    issuedBy: internalUser?.username || 'User',
                    status: "Paid", 
                    type: "SERVICE", 
                    relatedJobId: jobToComplete.id,
                    remarks: `Balance for: ${jobData.jobType}`,
                    paymentMethod: paymentMethod 
                };
                transaction.set(balInvoiceRef, balInvoiceData);

                if (walletRef) {
                    transaction.set(walletRef, { 
                        balance: currentWalletBalance + balanceAmount,
                        lastUpdated: serverTimestamp() 
                    }, { merge: true });
                }
            }
          });

          if (selectedJob?.id === jobToComplete.id) { setIsViewModalOpen(false); setSelectedJob(null); }
      } catch (err) { console.error("Error completing job:", err); setError("Failed to complete job."); } 
      finally { setIsUpdating(false); setPendingAction(null); }
  };

  // --- DELETE JOB (UPDATED: DEDUCT FROM WALLET) ---
  const handleDeleteJob = (jobId) => {
    if (!uid) { setError("Authentication error."); return; }
    setJobToDelete(jobId);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteJob = async () => {
    if (!jobToDelete || !uid) return;
    setIsDeleting(true);

    try {
        await runTransaction(db, async (transaction) => {
            // 1. Get Job Data
            const jobRef = doc(db, uid, 'data', 'service_jobs', jobToDelete);
            const jobSnap = await transaction.get(jobRef);
            if (!jobSnap.exists()) throw "Job not found";
            const jobData = jobSnap.data();

            // 2. Find Linked Advance Invoice
            let advInvoiceRef = null;
            let advInvoiceData = null;
            if (jobData.linkedInvoiceId) {
                advInvoiceRef = doc(db, uid, "invoices", "invoice_list", jobData.linkedInvoiceId);
                const advSnap = await transaction.get(advInvoiceRef);
                if (advSnap.exists()) advInvoiceData = advSnap.data();
            }

            // 3. Find Potential Balance Invoice
            let balInvoiceRef = null;
            let balInvoiceData = null;
            if (jobData.generatedInvoiceNumber) {
                const balInvNum = `${jobData.generatedInvoiceNumber}_BAL`;
                const q = query(collection(db, uid, "invoices", "invoice_list"), where("invoiceNumber", "==", balInvNum));
                const balSnaps = await getDocs(q); // Note: Queries must be done carefully outside txn if possible, or we assume single document
                // For simplicity in this structure, we fetch docs. 
                // Technically `getDocs` isn't transactional reading unless we pass transaction, but Firestore JS SDK `runTransaction` 
                // doesn't support query-based reads directly easily. 
                // WORKAROUND: We fetch the doc reference first, then transactional read.
                if (!balSnaps.empty) {
                    balInvoiceRef = balSnaps.docs[0].ref;
                    const balSnap = await transaction.get(balInvoiceRef);
                    if (balSnap.exists()) balInvoiceData = balSnap.data();
                }
            }

            // 4. Helper to Deduct
            const deductFromWallet = async (invoice) => {
                if (!invoice || !invoice.received || invoice.received <= 0) return;
                
                let wId = null;
                if (invoice.paymentMethod === 'Cash') wId = 'cash';
                else if (invoice.paymentMethod === 'Card') wId = 'card';
                else if (invoice.paymentMethod === 'Online') wId = 'online';

                if (wId) {
                    const wRef = doc(db, uid, "wallet", "accounts", wId);
                    const wDoc = await transaction.get(wRef);
                    if (wDoc.exists()) {
                        const currentBal = Number(wDoc.data().balance) || 0;
                        transaction.set(wRef, { 
                            balance: currentBal - Number(invoice.received),
                            lastUpdated: serverTimestamp()
                        }, { merge: true });
                    }
                }
            };

            // 5. Execute Deductions
            if (advInvoiceData) await deductFromWallet(advInvoiceData);
            if (balInvoiceData) await deductFromWallet(balInvoiceData);

            // 6. Delete Documents
            transaction.delete(jobRef);
            if (advInvoiceRef) transaction.delete(advInvoiceRef);
            if (balInvoiceRef) transaction.delete(balInvoiceRef);
        });

        if (selectedJob?.id === jobToDelete) { setIsViewModalOpen(false); setSelectedJob(null); }
    } catch (err) { 
        console.error(err); 
        setError("Failed to delete job. " + err.message); 
    } finally { 
        setIsDeleting(false); 
        setIsDeleteModalOpen(false); 
        setJobToDelete(null); 
    }
  };

  // --- VIEW & EXTEND ---
  const handleViewJob = (job) => { setSelectedJob(job); setIsViewModalOpen(true); };
  
  const handleExtendClick = (job) => { 
      setJobToExtend(job); 
      setNewCompleteDate(job.jobCompleteDate || ''); 
      setIsExtendModalOpen(true); 
  };
  
  const handleSaveExtension = async () => { 
      if (!jobToExtend) return; 
      setIsUpdating(true);
      try { 
          await updateDoc(doc(db, uid, 'data', 'service_jobs', jobToExtend.id), { jobCompleteDate: newCompleteDate }); 
          if (selectedJob?.id === jobToExtend.id) {
              setSelectedJob(prev => ({...prev, jobCompleteDate: newCompleteDate}));
          }
      } catch (err) { setError("Failed to update date."); } 
      finally { setIsUpdating(false); setIsExtendModalOpen(false); setJobToExtend(null); setNewCompleteDate(''); }
  };

  const calculateBalance = (job) => (job.totalCharge || 0) - (job.advanceAmount || 0);
  const formatDate = (date) => { 
      if (!date) return 'N/A'; 
      try { 
          const d = date.toDate ? date.toDate() : new Date(date);
          return d.toLocaleString(); 
      } catch{ return 'Invalid'; }
  };

  return (
    <div style={styles.container}>
      {/* --- FORM SECTION --- */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
            <h2 style={styles.cardTitle}>New Service Job</h2>
        </div>
        <form onSubmit={handleSaveClick} style={styles.formContent}>
           <div style={styles.gridThree}>
             <div style={styles.inputGroup}>
                <label style={styles.label}>Customer Name *</label>
                <input type="text" style={styles.input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Enter name" />
             </div>
             <div style={styles.inputGroup}>
                <label style={styles.label}>Phone Number</label>
                <input 
                    type="text" 
                    style={styles.input} 
                    value={customerPhone} 
                    onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, ''); 
                        if (val.length <= 10) setCustomerPhone(val);
                    }}
                    placeholder="07xxxxxxxx" 
                />
             </div>
             <div style={styles.inputGroup}>
                <label style={styles.label}>Job Type *</label>
                <input type="text" style={styles.input} value={jobType} onChange={(e) => setJobType(e.target.value)} placeholder="e.g. Phone Repair" />
             </div>
             <div style={styles.inputGroup}>
                <label style={styles.label}>Est. Completion</label>
                <input type="datetime-local" style={styles.input} value={jobCompleteDate} onChange={(e) => setJobCompleteDate(e.target.value)} />
             </div>
          </div>
          
          <div style={styles.inputGroup}>
            <label style={styles.label}>Info / Notes</label>
            <textarea style={styles.textarea} rows="3" value={generalInfo} onChange={(e) => setGeneralInfo(e.target.value)} placeholder="Device details, issues, serial number..." />
          </div>
          
          <div style={{...styles.gridThree, marginTop: '15px', padding: '15px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0'}}>
            <div style={styles.inputGroup}>
                <label style={styles.label}>Total Charge (Rs.) *</label>
                <input type="number" style={{...styles.input, fontWeight: 'bold'}} value={totalCharge} onChange={(e) => setTotalCharge(e.target.value)} placeholder="0.00" />
            </div>
            <div style={styles.inputGroup}>
                <label style={styles.label}>Advance Paid (Rs.)</label>
                <input type="number" style={styles.input} value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div style={styles.balanceGroup}>
                <label style={styles.label}>Balance Due</label>
                <div style={styles.balanceValue}>Rs. {((parseFloat(totalCharge)||0)-(parseFloat(advanceAmount)||0)).toFixed(2)}</div>
            </div>
          </div>
          
          {error && <div style={styles.errorMsg}>{error}</div>}
          
          <div style={styles.formActions}>
             <button type="submit" style={isLoading ? styles.btnDisabled : styles.btnPrimary} disabled={isLoading}>
                 <FaSave style={{marginRight: 8}}/> {isLoading ? 'Saving...' : 'Save Job'}
             </button>
          </div>
        </form>
      </div>

      {/* --- LIST SECTION --- */}
      <div style={{...styles.card, marginTop: '24px'}}>
         <div style={styles.listHeader}>
            <h2 style={styles.cardTitle}>Service Jobs</h2>
            <div style={styles.listControls}>
                <div style={styles.searchWrapper}>
                    <FaSearch style={styles.searchIcon}/>
                    <input type="text" style={styles.searchInput} placeholder="Search jobs/phone..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <label style={styles.checkboxLabel}>
                    <input type="checkbox" checked={showCompletedJobs} onChange={(e) => setShowCompletedJobs(e.target.checked)} /> 
                    Show Completed
                </label>
           </div>
        </div>
        
        <div style={styles.jobsGrid}>
          {jobsLoading ? <p style={styles.loadingText}>Loading jobs...</p> : filteredJobs.length === 0 ? <p style={styles.noJobsText}>No jobs found.</p> : filteredJobs.map(job => (
              <div key={job.id} style={styles.jobCard}>
                 <div style={styles.jobCardTop}>
                    <div>
                        <span style={styles.jobCardName}>{job.customerName}</span>
                        {job.customerPhone && <span style={{fontSize: 12, color: '#666'}}>{job.customerPhone}</span>}
                        <div style={styles.jobCardType}>{job.jobType}</div>
                    </div>
                    <span style={job.status === 'Pending' ? styles.statusPending : styles.statusCompleted}>
                        {job.status}
                    </span>
                </div>
                
                <div style={styles.jobCardDetails}>
                    <div style={styles.detailRow}><span>Inv:</span> <strong>{job.generatedInvoiceNumber}</strong></div>
                    <div style={styles.detailRow}><span>Date:</span> {formatDate(job.createdAt).split(',')[0]}</div>
                    <div style={styles.detailRow}><span>Est:</span> {formatDate(job.jobCompleteDate)}</div>
                    <div style={{...styles.detailRow, marginTop: 5, color: '#333'}}>
                        <span>Balance:</span> <strong style={{color: calculateBalance(job) > 0 ? '#ef4444' : '#10b981'}}>Rs. {calculateBalance(job).toFixed(2)}</strong>
                    </div>
                </div>

                <div style={styles.jobCardActions}>
                  {job.status === 'Pending' && (
                      <>
                        <button style={styles.actionBtnSuccess} onClick={() => handleCompleteClick(job.id)} title="Complete & Pay">
                            <FaCheckCircle />
                        </button>
                        <button style={styles.actionBtnInfo} onClick={() => handleExtendClick(job)} title="Extend Date">
                            <FaCalendarAlt />
                        </button>
                      </>
                  )}
                  <button style={styles.actionBtnPrimary} onClick={() => handleViewJob(job)} title="View Details">
                      <FaEye />
                  </button>
                  <button style={styles.actionBtnDanger} onClick={() => handleDeleteJob(job.id)} title="Delete">
                      <FaTrash />
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* --- MODALS --- */}
      
      {/* 1. Payment Confirm */}
      {showPaymentConfirm && (
        <div style={styles.confirmOverlay}>
          <div style={styles.confirmPopup}>
            <h4>Confirm Payment</h4>
            <p style={{margin: '0 0 20px 0', color: '#666', fontSize: '14px'}}>
                {pendingAction?.type === 'COMPLETE' ? `Collecting Balance: Rs. ${pendingAction.job.balance.toFixed(2)}` : `Advance: Rs. ${(parseFloat(advanceAmount)||0).toFixed(2)}`}
            </p>
            <p style={{fontSize: '12px', color: '#888', marginBottom: '15px'}}>Use ← → arrow keys and press Enter to confirm.</p>
            <div style={styles.confirmButtons}>
                {paymentOptions.map(method => (
                    <button 
                        key={method}
                        onClick={() => handleProcessPayment(method)} 
                        style={confirmPaymentMethod === method ? styles.confirmButtonActive : styles.confirmButton}
                    >
                        {method === 'Online' ? 'Online' : method}
                    </button>
                ))}
            </div>
            <button onClick={() => setShowPaymentConfirm(false)} style={{marginTop: '20px', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', color: '#666', fontSize: '12px'}}>Cancel</button>
          </div>
        </div>
      )}

      {/* 2. View Job */}
      {isViewModalOpen && selectedJob && (
        <div style={styles.modalOverlay} onClick={()=>setIsViewModalOpen(false)}>
            <div style={styles.modalContent} onClick={e=>e.stopPropagation()}>
                <div style={styles.modalHeader}>
                    <h3 style={styles.modalTitle}>Job Details</h3>
                    <button onClick={()=>setIsViewModalOpen(false)} style={styles.closeIcon}>&times;</button>
                </div>
                <div style={styles.modalBody}>
                    <div style={styles.detailGrid}>
                        <div style={styles.detailItem}><label>Customer:</label> <span>{selectedJob.customerName}</span></div>
                        <div style={styles.detailItem}><label>Phone:</label> <span>{selectedJob.customerPhone || 'N/A'}</span></div>
                        <div style={styles.detailItem}><label>Job Type:</label> <span>{selectedJob.jobType}</span></div>
                        <div style={styles.detailItem}><label>Invoice #:</label> <span>{selectedJob.generatedInvoiceNumber}</span></div>
                        <div style={styles.detailItem}><label>Status:</label> <span style={{fontWeight: 'bold', color: selectedJob.status === 'Pending' ? '#f59e0b' : '#10b981'}}>{selectedJob.status}</span></div>
                        <div style={styles.detailItem}><label>Created:</label> <span>{formatDate(selectedJob.createdAt)}</span></div>
                        <div style={styles.detailItem}><label>Est. Complete:</label> <span>{formatDate(selectedJob.jobCompleteDate)}</span></div>
                    </div>
                    
                    <div style={styles.notesBox}>
                        <label>Notes:</label>
                        <p>{selectedJob.generalInfo || "No notes."}</p>
                    </div>

                    <div style={styles.financialBox}>
                        <div>Total: <strong>Rs. {selectedJob.totalCharge?.toFixed(2)}</strong></div>
                        <div>Advance: <strong>Rs. {selectedJob.advanceAmount?.toFixed(2)}</strong></div>
                        <div style={{color: calculateBalance(selectedJob) > 0 ? '#ef4444' : '#10b981'}}>
                            Balance: <strong>Rs. {calculateBalance(selectedJob).toFixed(2)}</strong>
                        </div>
                    </div>
                    
                    <div style={styles.modalActionsRow}>
                        {selectedJob.status === 'Pending' && (
                             <button style={styles.btnInfo} onClick={() => { setIsViewModalOpen(false); handleExtendClick(selectedJob); }}>
                                Extend Date
                             </button>
                        )}
                        <button style={styles.btnSecondary} onClick={()=> window.open(`/invoice/view/${selectedJob.linkedInvoiceId}`, '_blank')}>
                            Print Receipt
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* 3. Extend Date Modal */}
      {isExtendModalOpen && (
          <div style={styles.modalOverlay}>
              <div style={styles.modalContentSmall}>
                  <h3 style={styles.modalTitle}>Extend Delivery Date</h3>
                  <p style={styles.modalText}>Select new estimated completion date:</p>
                  <input 
                    type="datetime-local" 
                    style={styles.input} 
                    value={newCompleteDate} 
                    onChange={(e) => setNewCompleteDate(e.target.value)} 
                  />
                  <div style={styles.modalBtnRow}>
                      <button style={styles.btnSecondary} onClick={() => setIsExtendModalOpen(false)}>Cancel</button>
                      <button style={styles.btnPrimary} onClick={handleSaveExtension} disabled={isUpdating}>
                          {isUpdating ? 'Saving...' : 'Save New Date'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* 4. Delete Confirm */}
      {isDeleteModalOpen && (
          <div style={styles.modalOverlay}>
              <div style={styles.modalContentSmall}>
                  <h3 style={{...styles.modalTitle, color: '#ef4444'}}>Delete Job?</h3>
                  <p style={styles.modalText}>This will delete the job and all linked invoices (Advance/Balance) and deduct amounts from your wallet.</p>
                  <div style={styles.modalBtnRow}>
                      <button style={styles.btnSecondary} onClick={() => setIsDeleteModalOpen(false)}>Cancel</button>
                      <button style={styles.btnDanger} onClick={confirmDeleteJob} disabled={isDeleting}>
                          {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

const themeColors = { 
    primary: '#00A1FF', 
    secondary: '#F089D7', 
    success: '#10b981', 
    warning: '#f59e0b',
    danger: '#ef4444',
    dark: '#1e293b', 
    light: '#f8fafc', 
    border: '#e2e8f0' 
};

const styles = {
  container: { padding: '24px', maxWidth: '1200px', margin: '0 auto' },
  card: { background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', border: `1px solid ${themeColors.border}`, overflow: 'hidden' },
  cardHeader: { padding: '20px 24px', borderBottom: `1px solid ${themeColors.border}`, background: '#f8fafc' },
  cardTitle: { margin: 0, fontSize: '18px', fontWeight: '600', color: themeColors.dark },
  formContent: { padding: '24px' },
  gridThree: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '13px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' },
  input: { padding: '10px 12px', borderRadius: '6px', border: `1px solid ${themeColors.border}`, fontSize: '14px', outline: 'none', transition: 'all 0.2s' },
  textarea: { padding: '10px 12px', borderRadius: '6px', border: `1px solid ${themeColors.border}`, fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' },
  balanceGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  balanceValue: { fontSize: '16px', fontWeight: '700', color: themeColors.danger, padding: '10px 0' },
  errorMsg: { color: themeColors.danger, fontSize: '14px', marginTop: '10px', background: '#fee2e2', padding: '10px', borderRadius: '6px' },
  formActions: { marginTop: '20px', display: 'flex', justifyContent: 'flex-end' },
  listHeader: { padding: '20px 24px', borderBottom: `1px solid ${themeColors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' },
  listControls: { display: 'flex', gap: '15px', alignItems: 'center' },
  searchWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
  searchIcon: { position: 'absolute', left: '10px', color: '#94a3b8' },
  searchInput: { padding: '8px 10px 8px 32px', borderRadius: '6px', border: `1px solid ${themeColors.border}`, fontSize: '14px', width: '200px' },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#475569', cursor: 'pointer' },
  jobsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px', padding: '24px' },
  jobCard: { background: 'white', border: `1px solid ${themeColors.border}`, borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', transition: 'transform 0.2s, box-shadow 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' },
  jobCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  jobCardName: { fontSize: '15px', fontWeight: '700', color: themeColors.dark, display: 'block' },
  jobCardType: { fontSize: '13px', color: '#64748b' },
  statusPending: { fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '12px', background: '#fff7ed', color: '#c2410c' },
  statusCompleted: { fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '12px', background: '#ecfdf5', color: '#047857' },
  jobCardDetails: { fontSize: '13px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px' },
  detailRow: { display: 'flex', justifyContent: 'space-between' },
  jobCardActions: { display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '12px', borderTop: `1px solid ${themeColors.border}` },
  btnPrimary: { padding: '10px 20px', background: themeColors.primary, color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  btnSecondary: { padding: '8px 16px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' },
  btnDanger: { padding: '8px 16px', background: themeColors.danger, color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' },
  btnInfo: { padding: '8px 16px', background: themeColors.warning, color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' },
  btnDisabled: { padding: '10px 20px', background: '#94a3b8', color: 'white', border: 'none', borderRadius: '6px', cursor: 'not-allowed' },
  actionBtnPrimary: { flex: 1, padding: '8px', background: '#e0f2fe', color: themeColors.primary, border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'center' },
  actionBtnSuccess: { flex: 1, padding: '8px', background: '#dcfce7', color: themeColors.success, border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'center' },
  actionBtnInfo: { flex: 1, padding: '8px', background: '#fef3c7', color: themeColors.warning, border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'center' },
  actionBtnDanger: { flex: 1, padding: '8px', background: '#fee2e2', color: themeColors.danger, border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'center' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000, backdropFilter: 'blur(2px)' },
  modalContent: { background: 'white', borderRadius: '12px', width: '90%', maxWidth: '600px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', animation: 'fadeIn 0.2s ease' },
  modalContentSmall: { background: 'white', borderRadius: '12px', width: '90%', maxWidth: '400px', padding: '24px', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' },
  modalHeader: { padding: '16px 24px', borderBottom: `1px solid ${themeColors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { margin: 0, fontSize: '18px', fontWeight: '700', color: themeColors.dark },
  modalBody: { padding: '24px' },
  modalText: { color: '#64748b', marginBottom: '20px' },
  closeIcon: { background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#94a3b8' },
  detailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginBottom: '20px' },
  detailItem: { display: 'flex', flexDirection: 'column', fontSize: '14px' },
  notesBox: { background: '#f8fafc', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', border: `1px solid ${themeColors.border}` },
  financialBox: { background: '#f0f9ff', padding: '16px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', fontSize: '15px' },
  modalActionsRow: { display: 'flex', justifyContent: 'flex-end', gap: '10px' },
  modalBtnRow: { display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px' },
  confirmOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 },
  confirmPopup: { backgroundColor: 'white', padding: '24px', borderRadius: '8px', textAlign: 'center', boxShadow: '0 5px 15px rgba(0,0,0,0.3)', width: 'auto', minWidth: '400px' },
  confirmButtons: { display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '20px' },
  confirmButton: { padding: '10px 24px', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer', background: '#f8f8f8', fontWeight: '600', flex: 1 },
  confirmButtonActive: { padding: '10px 24px', border: '1px solid #3b82f6', borderRadius: '6px', cursor: 'pointer', background: '#3b82f6', color: 'white', fontWeight: '600', flex: 1, boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.4)' },
};

export default Services;