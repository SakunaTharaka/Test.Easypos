import React, { useState, useEffect, useMemo } from 'react'; // Removed useContext
import { db, auth } from '../../firebase'; 
import { 
  collection, 
  onSnapshot, 
  query, 
  serverTimestamp,
  orderBy,
  limit, 
  startAfter,
  doc, 
  updateDoc, 
  where,
  getDocs,
  getDoc, 
  runTransaction 
} from 'firebase/firestore';
import { FaCalendarAlt, FaCheckCircle, FaTrash, FaEye, FaSave, FaSearch, FaArrowDown } from 'react-icons/fa';
// Removed unused CashBookContext import

const Services = ({ internalUser }) => {
  // Removed unused reconciledDates context hook

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

  // Pagination State
  const [lastVisible, setLastVisible] = useState(null);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const JOBS_PER_PAGE = 50; 

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

  // --- Load Initial Jobs (With Limit) ---
  useEffect(() => {
    if (!jobsCollectionRef) { setJobsLoading(false); return; }
    setJobsLoading(true);
    
    const q = query(
        jobsCollectionRef, 
        orderBy('createdAt', 'desc'),
        limit(JOBS_PER_PAGE)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllJobs(jobsData);
      
      if (snapshot.docs.length > 0) {
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      }
      
      setJobsLoading(false);
    }, (err) => { 
        console.error(err);
        setError("Failed to load jobs."); 
        setJobsLoading(false); 
    });
    return () => unsubscribe();
  }, [jobsCollectionRef]); 

  // --- Load More Jobs (Pagination) ---
  const handleLoadMore = async () => {
    if (!lastVisible || !uid) return;
    setLoadMoreLoading(true);

    try {
        const q = query(
            jobsCollectionRef,
            orderBy('createdAt', 'desc'),
            startAfter(lastVisible),
            limit(JOBS_PER_PAGE)
        );

        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            const newJobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAllJobs(prev => [...prev, ...newJobs]);
            setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
        }
    } catch (err) {
        console.error("Error loading more jobs:", err);
    } finally {
        setLoadMoreLoading(false);
    }
  };

  // Filter Jobs (Client-side)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPaymentConfirm, confirmPaymentMethod]);

  const getSriLankaDate = (dateObj = new Date()) => {
    return dateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' }); 
  };

  // --- ACTIONS ---

  const handleSaveClick = (e) => {
    e.preventDefault();
    if (!customerName || !customerPhone || !jobType || !jobCompleteDate || !totalCharge) { 
        setError('Customer Name, Phone, Job Type, Est. Completion, and Total Charge are required.'); 
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
        let salesMethodField = null;

        if (paymentMethod === 'Cash') { walletDocId = 'cash'; salesMethodField = 'totalSales_cash'; }
        else if (paymentMethod === 'Card') { walletDocId = 'card'; salesMethodField = 'totalSales_card'; }
        else if (paymentMethod === 'Online') { walletDocId = 'online'; salesMethodField = 'totalSales_online'; }

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

        const dailyDateString = getSriLankaDate(); 
        const dailyStatsRef = doc(db, uid, "daily_stats", "entries", dailyDateString);
        const dailyStatsSnap = await transaction.get(dailyStatsRef);
        const currentDailySales = dailyStatsSnap.exists() ? (Number(dailyStatsSnap.data().totalSales) || 0) : 0;
        const currentMethodSales = dailyStatsSnap.exists() ? (Number(dailyStatsSnap.data()[salesMethodField]) || 0) : 0;
        
        if (advanceVal > 0) {
            transaction.set(dailyStatsRef, { 
                totalSales: currentDailySales + advanceVal,
                [salesMethodField]: currentMethodSales + advanceVal,
                date: dailyDateString,
                lastUpdated: serverTimestamp()
            }, { merge: true });
        }

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
            let salesMethodField = null;

            if (paymentMethod === 'Cash') { walletDocId = 'cash'; salesMethodField = 'totalSales_cash'; }
            else if (paymentMethod === 'Card') { walletDocId = 'card'; salesMethodField = 'totalSales_card'; }
            else if (paymentMethod === 'Online') { walletDocId = 'online'; salesMethodField = 'totalSales_online'; }

            const walletRef = walletDocId ? doc(db, uid, "wallet", "accounts", walletDocId) : null;
            let currentWalletBalance = 0;

            const serviceJobRef = doc(db, uid, 'data', 'service_jobs', jobToComplete.id);
            const jobSnap = await transaction.get(serviceJobRef);
            if(!jobSnap.exists()) throw new Error("Job does not exist");
            
            if (walletRef) {
                const wDoc = await transaction.get(walletRef);
                if (wDoc.exists()) {
                    currentWalletBalance = Number(wDoc.data().balance) || 0;
                }
            }

            const jobData = jobSnap.data();
            const balanceAmount = (jobData.totalCharge || 0) - (jobData.advanceAmount || 0);

            const dailyDateString = getSriLankaDate(); 
            const dailyStatsRef = doc(db, uid, "daily_stats", "entries", dailyDateString);
            const dailyStatsSnap = await transaction.get(dailyStatsRef);
            const currentDailySales = dailyStatsSnap.exists() ? (Number(dailyStatsSnap.data().totalSales) || 0) : 0;
            const currentMethodSales = dailyStatsSnap.exists() ? (Number(dailyStatsSnap.data()[salesMethodField]) || 0) : 0;
            
            if (balanceAmount > 0) {
                 transaction.set(dailyStatsRef, { 
                    totalSales: currentDailySales + balanceAmount,
                    [salesMethodField]: currentMethodSales + balanceAmount,
                    date: dailyDateString,
                    lastUpdated: serverTimestamp()
                }, { merge: true });
            }

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

  // --- DELETE JOB (UPDATED: SPECIFIC ID LOCK) ---
  const handleDeleteJob = async (jobId) => {
    if (!uid) { setError("Authentication error."); return; }

    const job = allJobs.find(j => j.id === jobId);
    
    // ✅ 1. Check Specific Reconciliation Lock
    if (job && job.createdAt) {
        const dateVal = job.createdAt.toDate ? job.createdAt.toDate() : new Date(job.createdAt);
        
        // Generate Local YYYY-MM-DD
        const year = dateVal.getFullYear();
        const month = String(dateVal.getMonth() + 1).padStart(2, '0');
        const day = String(dateVal.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        try {
            // Fetch the Locked Document for this specific date
            const lockRef = doc(db, uid, 'user_data', 'locked_documents', dateStr);
            const lockSnap = await getDoc(lockRef);

            if (lockSnap.exists()) {
                const lockedIds = lockSnap.data().lockedIds || [];
                // Check if THIS job ID is in the locked list
                if (lockedIds.includes(jobId)) {
                    alert(`Cannot delete Job. It has been explicitly reconciled and locked.`);
                    return;
                }
            }
        } catch (e) {
            console.error("Error verifying lock status:", e);
            alert("System error verifying reconciliation status. Please try again.");
            return;
        }
    }

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
            if (!jobSnap.exists()) throw new Error("Job not found");
            const jobData = jobSnap.data();

            // 2. Find Invoices
            let advInvoiceRef = null;
            let advInvoiceData = null;
            if (jobData.linkedInvoiceId) {
                advInvoiceRef = doc(db, uid, "invoices", "invoice_list", jobData.linkedInvoiceId);
                const advSnap = await transaction.get(advInvoiceRef);
                if (advSnap.exists()) advInvoiceData = advSnap.data();
            }

            let balInvoiceRef = null;
            let balInvoiceData = null;
            if (jobData.generatedInvoiceNumber) {
                const balInvNum = `${jobData.generatedInvoiceNumber}_BAL`;
                const q = query(collection(db, uid, "invoices", "invoice_list"), where("invoiceNumber", "==", balInvNum));
                const balSnaps = await getDocs(q); 
                if (!balSnaps.empty) {
                    balInvoiceRef = balSnaps.docs[0].ref;
                    const balSnap = await transaction.get(balInvoiceRef);
                    if (balSnap.exists()) balInvoiceData = balSnap.data();
                }
            }

            // 3. Prepare Financial Reads
            const walletReads = {}; 
            const statsReads = {};  

            const queueReads = async (invoice) => {
                if (!invoice || !invoice.received || invoice.received <= 0) return;

                let wId = null;
                let salesMethodField = null;

                if (invoice.paymentMethod === 'Cash') { wId = 'cash'; salesMethodField = 'totalSales_cash'; }
                else if (invoice.paymentMethod === 'Card') { wId = 'card'; salesMethodField = 'totalSales_card'; }
                else if (invoice.paymentMethod === 'Online') { wId = 'online'; salesMethodField = 'totalSales_online'; }

                if (wId) {
                    const wRef = doc(db, uid, "wallet", "accounts", wId);
                    if (!walletReads[wRef.path]) {
                        const wSnap = await transaction.get(wRef);
                        walletReads[wRef.path] = { ref: wRef, data: wSnap.exists() ? wSnap.data() : null, deduction: 0 };
                    }
                    walletReads[wRef.path].deduction += Number(invoice.received);
                }

                if (invoice.createdAt) {
                    const dateVal = invoice.createdAt.toDate ? invoice.createdAt.toDate() : new Date(invoice.createdAt);
                    const dailyDateString = getSriLankaDate(dateVal);
                    const dailyStatsRef = doc(db, uid, "daily_stats", "entries", dailyDateString);
                    
                    if (!statsReads[dailyStatsRef.path]) {
                        const sSnap = await transaction.get(dailyStatsRef);
                        statsReads[dailyStatsRef.path] = { 
                            ref: dailyStatsRef, 
                            data: sSnap.exists() ? sSnap.data() : null, 
                            deductionTotal: 0, 
                            deductionMethod: 0, 
                            methodField: salesMethodField 
                        };
                    }
                    statsReads[dailyStatsRef.path].deductionTotal += Number(invoice.received);
                    if (statsReads[dailyStatsRef.path].methodField === salesMethodField) {
                        statsReads[dailyStatsRef.path].deductionMethod += Number(invoice.received);
                    }
                }
            };

            if (advInvoiceData) await queueReads(advInvoiceData);
            if (balInvoiceData) await queueReads(balInvoiceData);

            // Writes
            Object.values(walletReads).forEach(item => {
                if (item.data) {
                    const currentBal = Number(item.data.balance) || 0;
                    transaction.set(item.ref, { 
                        balance: currentBal - item.deduction,
                        lastUpdated: serverTimestamp()
                    }, { merge: true });
                }
            });

            Object.values(statsReads).forEach(item => {
                if (item.data) {
                    const currentSales = Number(item.data.totalSales) || 0;
                    const updateData = {
                        totalSales: currentSales - item.deductionTotal,
                        lastUpdated: serverTimestamp()
                    };
                    if (item.methodField) {
                        const currentMethod = Number(item.data[item.methodField]) || 0;
                        updateData[item.methodField] = currentMethod - item.deductionMethod;
                    }
                    transaction.set(item.ref, updateData, { merge: true });
                }
            });

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
          setAllJobs(prev => prev.map(j => j.id === jobToExtend.id ? {...j, jobCompleteDate: newCompleteDate} : j));
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
      <div style={styles.headerContainer}><h1 style={styles.header}>Services Management</h1></div>

      {/* --- FORM SECTION --- */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
            <h2 style={styles.sectionTitle}>New Job Entry</h2>
        </div>
        <form onSubmit={handleSaveClick} style={styles.formContent}>
           <div style={styles.gridThree}>
             <div style={styles.inputGroup}>
                <label style={styles.label}>Customer Name *</label>
                <input type="text" style={styles.input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Enter name" />
             </div>
             <div style={styles.inputGroup}>
                <label style={styles.label}>Phone Number *</label>
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
                <label style={styles.label}>Est. Completion *</label>
                <input type="datetime-local" style={styles.input} value={jobCompleteDate} onChange={(e) => setJobCompleteDate(e.target.value)} />
             </div>
          </div>
          
          <div style={{...styles.inputGroup, marginTop: '15px'}}>
            <label style={styles.label}>Info / Notes</label>
            <textarea style={styles.textarea} rows="2" value={generalInfo} onChange={(e) => setGeneralInfo(e.target.value)} placeholder="Device details, issues, serial number..." />
          </div>
          
          <div style={{...styles.gridThree, marginTop: '15px', padding: '15px', background: '#f9fafb', borderRadius: '4px', border: '1px solid #e5e7eb'}}>
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
      <div style={{...styles.card, marginTop: '20px'}}>
         <div style={styles.listHeader}>
            <div style={styles.searchWrapper}>
                <FaSearch style={styles.searchIcon}/>
                <input type="text" style={styles.searchInput} placeholder="Search loaded jobs..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <label style={styles.checkboxLabel}>
                <input type="checkbox" checked={showCompletedJobs} onChange={(e) => setShowCompletedJobs(e.target.checked)} /> 
                Show Completed
            </label>
        </div>
        
        <div style={styles.jobsGrid}>
          {jobsLoading ? <p style={styles.loadingText}>Loading jobs...</p> : filteredJobs.length === 0 ? <p style={styles.noJobsText}>No jobs found.</p> : filteredJobs.map(job => (
              <div key={job.id} style={styles.jobCard}>
                 <div style={styles.jobCardTop}>
                    <div>
                        <span style={styles.jobCardName}>{job.customerName}</span>
                        {job.customerPhone && <span style={{fontSize: 12, color: '#6b7280'}}>{job.customerPhone}</span>}
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
                    <div style={{...styles.detailRow, marginTop: 5, color: '#374151'}}>
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

        {/* --- LOAD MORE BUTTON --- */}
        {filteredJobs.length > 0 && !searchTerm && (
            <div style={{padding: '20px', display: 'flex', justifyContent: 'center', borderTop: '1px solid #e5e7eb'}}>
                <button onClick={handleLoadMore} disabled={loadMoreLoading} style={styles.btnSecondary}>
                    {loadMoreLoading ? 'Loading...' : <><FaArrowDown style={{marginRight: 8}} /> Load Older Jobs</>}
                </button>
            </div>
        )}
      </div>

      {/* --- MODALS --- */}
      
      {/* 1. Payment Confirm */}
      {showPaymentConfirm && (
        <div style={styles.confirmOverlay}>
          <div style={styles.confirmPopup}>
            <h4>Confirm Payment</h4>
            <p style={{margin: '0 0 20px 0', color: '#6b7280', fontSize: '14px'}}>
                {pendingAction?.type === 'COMPLETE' ? `Collecting Balance: Rs. ${pendingAction.job.balance.toFixed(2)}` : `Advance: Rs. ${(parseFloat(advanceAmount)||0).toFixed(2)}`}
            </p>
            <p style={{fontSize: '12px', color: '#9ca3af', marginBottom: '15px'}}>Use ← → arrow keys and press Enter to confirm.</p>
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
            <button onClick={() => setShowPaymentConfirm(false)} style={{marginTop: '20px', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', color: '#6b7280', fontSize: '12px'}}>Cancel</button>
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

const styles = {
  container: { padding: '20px', fontFamily: "'Inter', sans-serif", background: '#f3f4f6', minHeight: '100vh' },
  headerContainer: { marginBottom: '20px' },
  header: { fontSize: '24px', fontWeight: '600', color: '#1f2937' },
  card: { backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' },
  cardHeader: { padding: '16px 20px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' },
  sectionTitle: { margin: 0, fontSize: '16px', fontWeight: '600', color: '#374151' },
  formContent: { padding: '20px' },
  gridThree: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
  label: { fontSize: '12px', fontWeight: 'bold', color: '#374151', textTransform: 'uppercase' },
  input: { padding: '8px 12px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '14px', outline: 'none', transition: 'all 0.2s', width: '100%', boxSizing: 'border-box' },
  textarea: { padding: '8px 12px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
  balanceGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
  balanceValue: { fontSize: '16px', fontWeight: '700', color: '#ef4444', padding: '8px 0' },
  errorMsg: { color: '#ef4444', fontSize: '14px', marginTop: '10px', background: '#fee2e2', padding: '10px', borderRadius: '4px' },
  formActions: { marginTop: '20px', display: 'flex', justifyContent: 'flex-end' },
  listHeader: { padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' },
  searchWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
  searchIcon: { position: 'absolute', left: '10px', color: '#9ca3af' },
  searchInput: { padding: '8px 10px 8px 32px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '14px', width: '250px' },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600', color: '#4b5563', cursor: 'pointer', textTransform: 'uppercase' },
  jobsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px', padding: '20px' },
  jobCard: { background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' },
  jobCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  jobCardName: { fontSize: '15px', fontWeight: '700', color: '#1f2937', display: 'block' },
  jobCardType: { fontSize: '13px', color: '#6b7280' },
  statusPending: { fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '12px', background: '#fff7ed', color: '#c2410c' },
  statusCompleted: { fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '12px', background: '#ecfdf5', color: '#047857' },
  jobCardDetails: { fontSize: '13px', color: '#4b5563', display: 'flex', flexDirection: 'column', gap: '4px' },
  detailRow: { display: 'flex', justifyContent: 'space-between' },
  jobCardActions: { display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #e5e7eb' },
  btnPrimary: { padding: '8px 16px', background: '#00A1FF', color: 'white', border: 'none', borderRadius: '4px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  btnSecondary: { padding: '8px 16px', background: 'white', border: '1px solid #d1d5db', color: '#374151', borderRadius: '4px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  btnDanger: { padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontWeight: '600', cursor: 'pointer' },
  btnInfo: { padding: '8px 16px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '4px', fontWeight: '600', cursor: 'pointer' },
  btnDisabled: { padding: '8px 16px', background: '#9ca3af', color: 'white', border: 'none', borderRadius: '4px', cursor: 'not-allowed' },
  actionBtnPrimary: { flex: 1, padding: '6px', background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'center' },
  actionBtnSuccess: { flex: 1, padding: '6px', background: '#ecfdf5', color: '#10b981', border: '1px solid #a7f3d0', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'center' },
  actionBtnInfo: { flex: 1, padding: '6px', background: '#fffbeb', color: '#f59e0b', border: '1px solid #fde68a', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'center' },
  actionBtnDanger: { flex: 1, padding: '6px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'center' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000, backdropFilter: 'blur(1px)' },
  modalContent: { background: 'white', borderRadius: '8px', width: '90%', maxWidth: '600px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' },
  modalContentSmall: { background: 'white', borderRadius: '8px', width: '90%', maxWidth: '400px', padding: '20px', textAlign: 'center', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' },
  modalHeader: { padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { margin: 0, fontSize: '18px', fontWeight: '600', color: '#1f2937' },
  modalBody: { padding: '20px' },
  modalText: { color: '#4b5563', marginBottom: '20px', fontSize: '14px' },
  closeIcon: { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9ca3af' },
  detailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', marginBottom: '20px' },
  detailItem: { display: 'flex', flexDirection: 'column', fontSize: '14px' },
  notesBox: { background: '#f9fafb', padding: '12px', borderRadius: '4px', marginBottom: '20px', fontSize: '14px', border: '1px solid #e5e7eb' },
  financialBox: { background: '#f0f9ff', padding: '16px', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', fontSize: '14px' },
  modalActionsRow: { display: 'flex', justifyContent: 'flex-end', gap: '10px' },
  modalBtnRow: { display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px' },
  confirmOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 },
  confirmPopup: { backgroundColor: 'white', padding: '24px', borderRadius: '8px', textAlign: 'center', boxShadow: '0 10px 15px rgba(0,0,0,0.1)', width: 'auto', minWidth: '400px' },
  confirmButtons: { display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '20px' },
  confirmButton: { padding: '10px 24px', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', background: '#f9fafb', fontWeight: '600', flex: 1, color: '#374151' },
  confirmButtonActive: { padding: '10px 24px', border: '1px solid #3b82f6', borderRadius: '4px', cursor: 'pointer', background: '#3b82f6', color: 'white', fontWeight: '600', flex: 1 },
  loadingText: { textAlign: 'center', padding: '20px', color: '#6b7280' },
  noJobsText: { textAlign: 'center', padding: '20px', color: '#6b7280' },
};

export default Services;