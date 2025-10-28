import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, auth } from '../../firebase'; // Adjust path if firebase.js is elsewhere
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  serverTimestamp,
  orderBy,
  doc, // Import doc
  deleteDoc, // Import deleteDoc
  updateDoc, // Import updateDoc
  getDoc,  // Import getDoc
  where // Import where
} from 'firebase/firestore';

/**
 * Services Component
 * Create, view, and search for service jobs stored in Firestore.
 */
const Services = ({ internalUser }) => {
  // Form state
  const [customerName, setCustomerName] = useState('');
  const [jobType, setJobType] = useState('');
  const [generalInfo, setGeneralInfo] = useState('');
  const [jobCompleteDate, setJobCompleteDate] = useState(''); 
  const [advanceAmount, setAdvanceAmount] = useState(''); // New state for advance

  // --- New state for invoicing ---
  const [billedItems, setBilledItems] = useState([]); // Holds items for the *new* job form
  const [totalCharge, setTotalCharge] = useState('');

  // App state
  const [isLoading, setIsLoading] = useState(false); // For saving new job
  const [isUpdating, setIsUpdating] = useState(false); // For general updates (extend, complete, bill more)
  const [isDeleting, setIsDeleting] = useState(false); // For delete modal
  const [error, setError] = useState(null);
  
  // List & Search state
  const [allJobs, setAllJobs] = useState([]);
  const [filteredJobs, setFilteredJobs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [jobsLoading, setJobsLoading] = useState(true);
  const [showCompletedJobs, setShowCompletedJobs] = useState(false); // New state for filtering

  // Modal state
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null); // Holds the job being viewed/edited
  
  // Extend Modal State
  const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
  const [jobToExtend, setJobToExtend] = useState(null);
  const [newCompleteDate, setNewCompleteDate] = useState('');
  
  // Delete Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState(null); 

  // Complete Job Confirmation Modal State
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [jobToComplete, setJobToComplete] = useState(null); // Will store { id: jobId, balance: calculatedBalance }

  // --- Invoice Modal State ---
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [servicePriceCategory, setServicePriceCategory] = useState("");
  const [pricedItems, setPricedItems] = useState([]); 
  const [settingsLoading, setSettingsLoading] = useState(true);
  // State to hold items while editing in invoice modal (for both new and existing jobs)
  const [invoiceModalItems, setInvoiceModalItems] = useState([]); 

  // Get the current user's UID
  const uid = auth.currentUser ? auth.currentUser.uid : null;

  // Memoize the collection reference
  const jobsCollectionRef = useMemo(() => {
    if (!uid) return null;
    return collection(db, uid, 'data', 'service_jobs');
  }, [uid]);

  // Effect to fetch settings and price category
  useEffect(() => {
    if (!uid) {
      setSettingsLoading(false);
      return;
    }

    const fetchSettings = async () => {
      setSettingsLoading(true);
      const settingsDocRef = doc(db, uid, "settings");
      try {
        const docSnap = await getDoc(settingsDocRef);
        if (docSnap.exists()) {
          const settingsData = docSnap.data();
          setServicePriceCategory(settingsData.serviceJobPriceCategory || "");
        } else {
          console.log("No settings document found.");
        }
      } catch (err) {
        console.error("Error fetching settings:", err);
        setError("Could not load settings.");
      }
      setSettingsLoading(false);
    };

    fetchSettings();
  }, [uid]);

  // Effect to fetch priced items once the category is known
  useEffect(() => {
    if (!uid || !servicePriceCategory) {
      setPricedItems([]);
      return;
    }

    const itemsColRef = collection(db, uid, "price_categories", "priced_items");
    const q = query(itemsColRef, where("categoryId", "==", servicePriceCategory));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const itemsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      setPricedItems(itemsData);
    }, (err) => {
      console.error("Error fetching priced items:", err);
      setError("Could not load items for invoicing.");
    });

    return () => unsubscribe();
  }, [uid, servicePriceCategory]);


  // Effect to fetch and listen for jobs from Firestore
  useEffect(() => {
    if (!jobsCollectionRef) {
      setJobsLoading(false);
      return;
    }

    setJobsLoading(true);
    const q = query(jobsCollectionRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      setAllJobs(jobsData);
      // Apply initial filtering based on showCompletedJobs state
      setFilteredJobs(jobsData.filter(job => showCompletedJobs || job.status !== 'Completed'));
      setJobsLoading(false);
    }, (err) => {
      console.error("Error fetching jobs:", err);
      setError("Failed to load jobs. Please try again.");
      setJobsLoading(false);
    });

    return () => unsubscribe();
  }, [jobsCollectionRef, showCompletedJobs]); // Re-run when showCompletedJobs changes

  // Effect to filter jobs based on search term AND completion status
  useEffect(() => {
    let filtered = allJobs;

    // Filter by completion status first
    if (!showCompletedJobs) {
      filtered = filtered.filter(job => job.status !== 'Completed');
    }

    // Then filter by search term
    if (searchTerm) {
      const lowerCaseSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(job => 
        job.customerName?.toLowerCase().includes(lowerCaseSearch) ||
        job.jobType?.toLowerCase().includes(lowerCaseSearch) ||
        job.generalInfo?.toLowerCase().includes(lowerCaseSearch)
      );
    }
    
    setFilteredJobs(filtered);
  }, [searchTerm, allJobs, showCompletedJobs]); // Add showCompletedJobs dependency


  /**
   * Handle form submission to create a NEW service job
   */
  const handleSaveJob = async (e) => {
    e.preventDefault();
    
    if (!customerName || !jobType) {
      setError('Customer Name and Job Type are required.');
      return;
    }
    if (!jobsCollectionRef) {
      setError('User not authenticated. Please refresh.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await addDoc(jobsCollectionRef, {
        customerName: customerName,
        jobType: jobType,
        generalInfo: generalInfo,
        jobCompleteDate: jobCompleteDate,
        status: 'Pending', // New jobs always start as Pending
        createdAt: serverTimestamp(),
        createdBy: internalUser?.username || 'User',
        billedItems: billedItems, // Items added via modal
        totalCharge: parseFloat(totalCharge) || 0,
        advanceAmount: parseFloat(advanceAmount) || 0, // Save advance
      });

      // Clear the form
      setCustomerName('');
      setJobType('');
      setGeneralInfo('');
      setJobCompleteDate('');
      setBilledItems([]); 
      setTotalCharge(''); 
      setAdvanceAmount(''); // Clear advance
      
    } catch (err) {
      console.error("Error adding document: ", err);
      setError('Failed to save job. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle clicking the delete button (opens confirmation modal)
   */
  const handleDeleteJob = (jobId) => {
    if (!uid) {
      setError("Authentication error. Cannot delete.");
      return;
    }
    setJobToDelete(jobId);
    setIsDeleteModalOpen(true);
  };

  /**
   * Handle the actual deletion after confirmation
   */
  const confirmDeleteJob = async () => {
    if (!jobToDelete) return;

    setIsDeleting(true);
    const docRef = doc(db, uid, 'data', 'service_jobs', jobToDelete);
    try {
      await deleteDoc(docRef);
      // Close view modal if the deleted job was being viewed
      if (selectedJob?.id === jobToDelete) {
          setIsViewModalOpen(false);
          setSelectedJob(null);
      }
    } catch (err) {
      console.error("Error deleting document:", err);
      setError("Failed to delete job.");
    } finally {
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
      setJobToDelete(null);
    }
  };

  /**
   * Handle opening the view modal
   */
  const handleViewJob = (job) => {
    setSelectedJob(job);
    setIsViewModalOpen(true);
  };

  /**
   * Handle "Extend" / "Edit" button click (opens extend modal)
   */
  const handleExtendJob = (job) => {
    setJobToExtend(job);
    setNewCompleteDate(job.jobCompleteDate || ''); 
    setIsExtendModalOpen(true);
  };

  /**
   * Handle saving the new date from the Extend modal
   */
  const handleUpdateJobDate = async () => {
    if (!jobToExtend) {
      console.error("No job or date selected");
      return;
    }

    setIsUpdating(true); // Use general updating state
    const docRef = doc(db, uid, 'data', 'service_jobs', jobToExtend.id);
    
    try {
      await updateDoc(docRef, {
        jobCompleteDate: newCompleteDate
      });
      // Optionally update the selectedJob state if view modal is open
      if (selectedJob?.id === jobToExtend.id) {
          setSelectedJob(prev => ({...prev, jobCompleteDate: newCompleteDate}));
      }
    } catch (err) {
      console.error("Error updating document:", err);
      setError("Failed to update job date.");
    } finally {
      setIsUpdating(false);
      setIsExtendModalOpen(false);
      setJobToExtend(null);
      setNewCompleteDate('');
    }
  };

  /**
   * Handle clicking the Complete Job button (opens confirmation modal)
   */
   const handleCompleteJob = (jobId) => {
       if (!uid) {
           setError("Authentication error.");
           return;
       }
       // Find the job data to calculate balance
       const jobData = allJobs.find(j => j.id === jobId);
       if (!jobData) {
           setError("Could not find job details.");
           return;
       }
       const balance = (jobData.totalCharge || 0) - (jobData.advanceAmount || 0);
       setJobToComplete({ id: jobId, balance: balance });
       setIsCompleteModalOpen(true);
   };

  /**
   * Handle the actual completion after confirmation
   */
   const confirmCompleteJob = async () => {
       if (!jobToComplete) return;

       setIsUpdating(true);
       const docRef = doc(db, uid, 'data', 'service_jobs', jobToComplete.id);
       try {
           await updateDoc(docRef, {
               status: 'Completed'
           });
           // Close view modal if the completed job was being viewed
           if (selectedJob?.id === jobToComplete.id) {
               setIsViewModalOpen(false);
               setSelectedJob(null);
           }
       } catch (err) {
           console.error("Error completing job:", err);
           setError("Failed to mark job as complete.");
       } finally {
           setIsUpdating(false);
           setIsCompleteModalOpen(false);
           setJobToComplete(null);
       }
   };

  /**
   * Opens the Invoice Modal for adding items to the *new* job form.
   */
  const openInvoiceModalForNewJob = () => {
      setInvoiceModalItems([...billedItems]); // Load current form items into modal
      setIsInvoiceModalOpen(true);
  };

  /**
   * Opens the Invoice Modal for adding *more* items to an *existing* job (from View Modal).
   */
  const openInvoiceModalForExistingJob = () => {
      if (!selectedJob) return;
      setInvoiceModalItems([...(selectedJob.billedItems || [])]); // Load existing job items
      setIsInvoiceModalOpen(true);
      // Keep the View Modal open in the background
  };

  /**
   * Handles saving items from the Invoice Modal.
   * Updates either the new job form state or the existing job in Firestore.
   */
  const handleSaveInvoiceItems = async (updatedItems) => {
      if (selectedJob) { 
          // If selectedJob exists, we are editing an existing job (from View Modal)
          setIsUpdating(true);
          const docRef = doc(db, uid, 'data', 'service_jobs', selectedJob.id);
          try {
              await updateDoc(docRef, {
                  billedItems: updatedItems 
              });
              // Update the selectedJob state to reflect changes immediately in View Modal
              setSelectedJob(prev => ({...prev, billedItems: updatedItems}));
          } catch (err) {
              console.error("Error updating billed items:", err);
              setError("Failed to save billed items.");
          } finally {
              setIsUpdating(false);
          }
      } else {
          // Otherwise, we are updating the items for the *new* job form
          setBilledItems(updatedItems);
      }
      setIsInvoiceModalOpen(false); // Close modal after saving
      setInvoiceModalItems([]); // Clear modal temp items
  };

  /**
   * Calculates the total for billed items
   */
  const billedItemsTotal = useMemo(() => {
    return billedItems.reduce((acc, item) => acc + (item.qty * item.price), 0);
  }, [billedItems]);


  /**
   * Helper to format Firestore Timestamp or Date String
   */
  const formatDate = (timestampOrDate) => {
    if (!timestampOrDate) return 'N/A';
    
    if (timestampOrDate.toDate) {
      return timestampOrDate.toDate().toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    
    if (typeof timestampOrDate === 'string' && timestampOrDate) {
       try {
        return new Date(timestampOrDate).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
       } catch (e) {
        return 'Invalid Date'; // Handle potential invalid date strings
       }
    }

    return 'Invalid Date';
  };

  // Helper to calculate balance
  const calculateBalance = (job) => {
      if (!job) return 0;
      return (job.totalCharge || 0) - (job.advanceAmount || 0);
  }

  return (
    <div style={styles.container}>
      {/* --- Create New Job Form --- */}
      <div style={styles.formContainer}>
        <h1 style={styles.header}>Create New Service Job</h1>
        <p style={styles.subHeader}>
          Enter job details below and save. (Logged in as: {internalUser?.username || 'User'})
        </p>
        
        <form onSubmit={handleSaveJob}>
          {/* ... (Customer, Job Type, Date inputs remain the same) ... */}
           <div style={styles.grid}>
            {/* Customer Name */}
            <div style={styles.inputGroup}>
              <label htmlFor="customerName" style={styles.label}>Customer Name *</label>
              <input
                type="text"
                id="customerName"
                style={styles.input}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. John Smith"
              />
            </div>

            {/* Job Type */}
            <div style={styles.inputGroup}>
              <label htmlFor="jobType" style={styles.label}>Job Type *</label>
              <input
                type="text"
                id="jobType"
                style={styles.input}
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                placeholder="e.g. Printer Repair, AC Service"
              />
            </div>

            {/* Est. Completion Date/Time */}
            <div style={styles.inputGroup}>
              <label htmlFor="jobCompleteDate" style={styles.label}>Est. Completion Date/Time</label>
              <input
                type="datetime-local"
                id="jobCompleteDate"
                style={styles.input}
                value={jobCompleteDate}
                onChange={(e) => setJobCompleteDate(e.target.value)}
              />
            </div>
          </div>

          {/* ... (General Info textarea remains the same) ... */}
           <div style={styles.inputGroup}>
            <label htmlFor="generalInfo" style={styles.label}>General Information / Notes</label>
            <textarea
              id="generalInfo"
              style={styles.textarea}
              rows="4"
              value={generalInfo}
              onChange={(e) => setGeneralInfo(e.target.value)}
              placeholder="e.g. Customer reports paper jam issue, model HP LaserJet Pro M404..."
            />
          </div>


          {/* --- Billed Items Section --- */}
          <div style={styles.billedItemsContainer}>
            {/* ... (Billed items table remains the same) ... */}
             <h3 style={styles.billedItemsHeader}>Billed Items</h3>
            {billedItems.length === 0 ? (
              <p style={styles.noItemsText}>No items added to this job yet.</p>
            ) : (
              <table style={styles.itemsTable}>
                <thead>
                  <tr>
                    <th style={styles.tableHeader}>Item Name</th>
                    <th style={styles.tableHeader}>Qty</th>
                    <th style={styles.tableHeader}>Price</th>
                    <th style={styles.tableHeader}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {billedItems.map((item, index) => (
                    <tr key={index}>
                      <td style={styles.tableCell}>{item.itemName}</td>
                      <td style={styles.tableCell}>{item.qty}</td>
                      <td style={styles.tableCell}>Rs. {item.price.toFixed(2)}</td>
                      <td style={styles.tableCell}>Rs. {(item.qty * item.price).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="3" style={{...styles.tableCell, ...styles.tableFooterLabel}}>Items Subtotal:</td>
                    <td style={{...styles.tableCell, ...styles.tableFooterTotal}}>Rs. {billedItemsTotal.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* --- Total Charge & Advance Input Grid --- */}
          <div style={styles.chargeGrid}>
            <div style={styles.inputGroup}>
              <label htmlFor="advanceAmount" style={styles.label}>Advance Amount (Rs.)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                id="advanceAmount"
                style={styles.input}
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
                placeholder="e.g. 5000.00"
              />
            </div>
            <div style={styles.inputGroup}>
              <label htmlFor="totalCharge" style={styles.label}>Total Charge (Rs.)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                id="totalCharge"
                style={{...styles.input, ...styles.totalChargeInput}}
                value={totalCharge}
                onChange={(e) => setTotalCharge(e.target.value)}
                placeholder="e.g. 15000.00"
              />
            </div>
            {/* Display calculated balance */}
            <div style={styles.balanceDisplay}>
              <label style={styles.label}>Balance Due (Rs.)</label>
              <p style={styles.balanceValue}>
                Rs. {((parseFloat(totalCharge) || 0) - (parseFloat(advanceAmount) || 0)).toFixed(2)}
              </p>
            </div>
          </div>


          {/* Error Message */}
          {error && <p style={styles.errorText}>{error}</p>}

          {/* --- Action Buttons --- */}
          <div style={styles.actionButtonContainer}>
             {/* ... (Save and Invoice buttons remain the same) ... */}
              <button 
              type="submit" 
              style={isLoading ? styles.saveButtonDisabled : styles.saveButton}
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save Job'}
            </button>
            <button
              type="button"
              style={styles.invoiceButton}
              onClick={openInvoiceModalForNewJob} // Use specific handler
              disabled={settingsLoading || !servicePriceCategory}
            >
              {settingsLoading ? 'Loading...' : !servicePriceCategory ? 'Set Price Category' : 'Invoice used items for this job'}
            </button>
          </div>
        </form>
      </div>

      {/* --- Saved Jobs List & Search --- */}
      <div style={styles.listContainer}>
         <div style={styles.listHeader}>
          <h2 style={styles.listTitle}>Saved Jobs</h2>
           {/* ... (Show Completed checkbox and search input) ... */}
            <div style={styles.listControls}>
             <label style={styles.checkboxLabel}>
               <input 
                 type="checkbox" 
                 checked={showCompletedJobs} 
                 onChange={(e) => setShowCompletedJobs(e.target.checked)} 
               />
               Show Completed Jobs
             </label>
             <input
               type="text"
               style={styles.searchInput}
               placeholder="Search by name, job, or info..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
           </div>
        </div>
        <div style={styles.jobsList}>
          {jobsLoading ? (
            <p style={styles.loadingText}>Loading jobs...</p>
          ) : filteredJobs.length === 0 ? (
            // ... (No jobs text) ...
             <p style={styles.noJobsText}>
              {searchTerm ? 'No jobs match your search.' : (showCompletedJobs ? 'No jobs found.' : 'No pending jobs found.')}
            </p>
          ) : (
            filteredJobs.map(job => (
              <div key={job.id} style={styles.jobCard}>
                {/* ... (Job Card Header, Type, Info) ... */}
                 <div style={styles.jobCardHeader}>
                  <span style={styles.jobCardName}>{job.customerName}</span>
                  <span 
                    style={{
                      ...styles.jobCardStatus, 
                      ...(job.status === 'Pending' ? styles.statusPending : styles.statusCompleted)
                    }}
                  >
                    {job.status}
                  </span>
                </div>
                <p style={styles.jobCardJobType}>{job.jobType}</p>
                <p style={styles.jobCardInfo}>{job.generalInfo || 'No additional info provided.'}</p>
                
                {/* Updated Meta Grid */}
                <div style={styles.jobCardMetaGrid}>
                  <span style={styles.jobCardMeta}><strong>Created By:</strong> {job.createdBy}</span>
                  <span style={styles.jobCardMeta}><strong>Created At:</strong> {formatDate(job.createdAt)}</span>
                  <span style={styles.jobCardMeta}>
                    <strong>Est. Comp:</strong> {formatDate(job.jobCompleteDate)}
                  </span>
                   <span style={styles.jobCardMeta}>
                    <strong>Advance:</strong> Rs. {(job.advanceAmount || 0).toFixed(2)} 
                  </span>
                  <span style={styles.jobCardMeta}>
                    <strong>Total Charge:</strong> Rs. {(job.totalCharge || 0).toFixed(2)}
                  </span>
                   <span style={styles.jobCardMeta}>
                    <strong>Balance:</strong> Rs. {calculateBalance(job).toFixed(2)}
                  </span>
                </div>

                {/* ... (Job Card Footer with buttons) ... */}
                <div style={styles.jobCardFooter}>
                  {/* Conditionally render Complete button */}
                  {job.status === 'Pending' && (
                     <button 
                       style={{...styles.cardButton, ...styles.completeButton}} 
                       onClick={() => handleCompleteJob(job.id)}
                       disabled={isUpdating} // Disable while any update is happening
                     >
                       {isUpdating ? '...' : 'Complete Job'}
                     </button>
                  )}
                  <button 
                    style={{...styles.cardButton, ...styles.viewButton}} 
                    onClick={() => handleViewJob(job)}
                  >
                    View
                  </button>
                  {/* Only allow extend/edit for Pending jobs */}
                  {job.status === 'Pending' && (
                      <button 
                        style={{...styles.cardButton, ...styles.extendButton}} 
                        onClick={() => handleExtendJob(job)}
                      >
                        Extend Date
                      </button>
                  )}
                  <button 
                    style={{...styles.cardButton, ...styles.deleteButton}} 
                    onClick={() => handleDeleteJob(job.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* --- View Job Modal --- */}
      {isViewModalOpen && selectedJob && (
        <div style={styles.modalOverlay} onClick={() => setIsViewModalOpen(false)}>
          <div style={{...styles.modalContent, maxWidth: '700px'}} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Job Details</h2>
              <button style={styles.modalCloseIcon} onClick={() => setIsViewModalOpen(false)}>&times;</button>
            </div>
            <div style={styles.modalBody}>
              {/* ... (Customer, Job Type, Status, Est Completion) ... */}
              <div style={styles.modalGrid}>
                <p style={styles.modalField}><strong>Customer:</strong> {selectedJob.customerName}</p>
                <p style={styles.modalField}><strong>Job Type:</strong> {selectedJob.jobType}</p>
                <p style={styles.modalField}><strong>Status:</strong> {selectedJob.status}</p>
                <p style={styles.modalField}><strong>Est. Completion:</strong> {formatDate(selectedJob.jobCompleteDate)}</p>
              </div>
              {/* ... (General Info) ... */}
              <p style={{...styles.modalField, ...styles.modalInfo}}>
                <strong>Info:</strong>
                <span style={styles.modalInfoText}>{selectedJob.generalInfo || 'N/A'}</span>
              </p>
              
              <hr style={styles.modalHr} />

              {/* ... (Billed Items Header + Bill More Button) ... */}
              <div style={styles.billedItemsHeaderContainer}>
                <h3 style={styles.billedItemsHeader}>Billed Items</h3>
                {/* Only show "Bill More" if the job is Pending */}
                {selectedJob.status === 'Pending' && (
                  <button
                    style={styles.billMoreButton}
                    onClick={openInvoiceModalForExistingJob}
                    disabled={isUpdating || settingsLoading || !servicePriceCategory}
                  >
                    {isUpdating ? '...' : 'Bill More Items'}
                  </button>
                )}
              </div>
              {/* ... (Billed Items Table or "No items" text) ... */}
              {(!selectedJob.billedItems || selectedJob.billedItems.length === 0) ? (
                 <p style={styles.noItemsText}>No items were billed for this job.</p>
              ) : (
                <table style={styles.itemsTable}>
                   <thead>
                    <tr>
                      <th style={styles.tableHeader}>Item Name</th>
                      <th style={styles.tableHeader}>Qty</th>
                      <th style={styles.tableHeader}>Price</th>
                      <th style={styles.tableHeader}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedJob.billedItems.map((item, index) => (
                      <tr key={index}>
                        <td style={styles.tableCell}>{item.itemName}</td>
                        <td style={styles.tableCell}>{item.qty}</td>
                        <td style={styles.tableCell}>Rs. {item.price.toFixed(2)}</td>
                        <td style={styles.tableCell}>Rs. {(item.qty * item.price).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="3" style={{...styles.tableCell, ...styles.tableFooterLabel}}>Items Subtotal:</td>
                      <td style={{...styles.tableCell, ...styles.tableFooterTotal}}>
                        Rs. {(selectedJob.billedItems.reduce((acc, item) => acc + (item.qty * item.price), 0)).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}

              {/* Charge Summary */}
               <div style={styles.chargeSummaryContainer}>
                   <div style={styles.chargeSummaryItem}>
                      <strong>Advance Amount:</strong>
                      <span>Rs. {(selectedJob.advanceAmount || 0).toFixed(2)}</span>
                   </div>
                   <div style={styles.chargeSummaryItem}>
                      <strong>Total Charge:</strong>
                      <span>Rs. {(selectedJob.totalCharge || 0).toFixed(2)}</span>
                   </div>
                   <div style={{...styles.chargeSummaryItem, ...styles.balanceHighlight}}>
                      <strong>Balance Due:</strong>
                      <span>Rs. {calculateBalance(selectedJob).toFixed(2)}</span>
                   </div>
               </div>

              <hr style={styles.modalHr} />
              
              {/* ... (Job ID, Created By, Created At) ... */}
              <div style={styles.modalGrid}>
                <p style={styles.modalField}><strong>Job ID:</strong> {selectedJob.id}</p>
                <p style={styles.modalField}><strong>Created By:</strong> {selectedJob.createdBy}</p>
                <p style={styles.modalField}><strong>Created At:</strong> {formatDate(selectedJob.createdAt)}</p>
              </div>

            </div>
            <div style={styles.modalFooter}>
              <button style={styles.modalCloseButton} onClick={() => setIsViewModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Extend Job Modal --- */}
      {isExtendModalOpen && jobToExtend && (
        <div style={styles.modalOverlay} onClick={() => setIsExtendModalOpen(false)}>
            {/* ... (Extend Modal Content - No changes needed here) ... */}
            <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Extend Job Date</h2>
              <button style={styles.modalCloseIcon} onClick={() => setIsExtendModalOpen(false)}>&times;</button>
            </div>
            <div style={styles.modalBody}>
              <p style={styles.modalField}><strong>Customer:</strong> {jobToExtend.customerName}</p>
              <p style={styles.modalField}><strong>Job Type:</strong> {jobToExtend.jobType}</p>
              <div style={{...styles.inputGroup, marginTop: '16px'}}>
                <label htmlFor="newCompleteDate" style={styles.label}>New Est. Completion Date/Time</label>
                <input
                  type="datetime-local"
                  id="newCompleteDate"
                  style={styles.input}
                  value={newCompleteDate}
                  onChange={(e) => setNewCompleteDate(e.target.value)}
                />
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button style={styles.modalCloseButton} onClick={() => setIsExtendModalOpen(false)}>
                Cancel
              </button>
              <button 
                style={isUpdating ? {...styles.modalSaveButton, ...styles.saveButtonDisabled} : styles.modalSaveButton}
                onClick={handleUpdateJobDate}
                disabled={isUpdating}
              >
                {isUpdating ? 'Saving...' : 'Save Change'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Delete Job Modal --- */}
      {isDeleteModalOpen && (
         <div style={styles.modalOverlay} onClick={() => setIsDeleteModalOpen(false)}>
             {/* ... (Delete Modal Content - No changes needed here) ... */}
             <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Confirm Deletion</h2>
              <button style={styles.modalCloseIcon} onClick={() => setIsDeleteModalOpen(false)}>&times;</button>
            </div>
            <div style={styles.modalBody}>
              <p style={styles.modalField}>Are you sure you want to permanently delete this job?</p>
              <p style={styles.modalField}>This action cannot be undone.</p>
            </div>
            <div style={styles.modalFooter}>
              <button style={styles.modalCloseButton} onClick={() => setIsDeleteModalOpen(false)}>
                Cancel
              </button>
              <button 
                style={isDeleting ? {...styles.modalDeleteButton, ...styles.saveButtonDisabled} : styles.modalDeleteButton}
                onClick={confirmDeleteJob}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

       {/* --- Complete Job Confirmation Modal --- */}
       {isCompleteModalOpen && jobToComplete && (
         <div style={styles.modalOverlay} onClick={() => setIsCompleteModalOpen(false)}>
             <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Confirm Job Completion</h2>
              <button style={styles.modalCloseIcon} onClick={() => setIsCompleteModalOpen(false)}>&times;</button>
            </div>
            <div style={styles.modalBody}>
              <p style={styles.modalField}>Did you complete this job and collect the balance of 
                 <strong style={styles.balanceHighlightText}> Rs. {jobToComplete.balance.toFixed(2)}</strong>?
              </p>
            </div>
            <div style={styles.modalFooter}>
              <button style={styles.modalCloseButton} onClick={() => setIsCompleteModalOpen(false)}>
                No
              </button>
              <button 
                style={isUpdating ? {...styles.modalSaveButton, ...styles.saveButtonDisabled} : styles.modalSaveButton}
                onClick={confirmCompleteJob}
                disabled={isUpdating}
              >
                {isUpdating ? 'Completing...' : 'Yes, Complete Job'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Invoice Items Modal --- */}
      {isInvoiceModalOpen && (
        <InvoiceItemsModal
          isOpen={isInvoiceModalOpen}
          // Pass the specific save handler and initial items
          onClose={(updatedItems) => { 
            if (updatedItems !== null) { // Check if save was clicked (passes items array or empty array)
                handleSaveInvoiceItems(updatedItems);
            } else { // Close button clicked (passes null)
                setIsInvoiceModalOpen(false);
                setInvoiceModalItems([]); // Clear modal temp items on cancel
            }
          }}
          pricedItems={pricedItems} 
          initialBilledItems={invoiceModalItems} // Pass the items to start with
        />
      )}
    </div>
  );
};

// --- InvoiceItemsModal Component --- (No changes needed in this component)
const InvoiceItemsModal = ({ isOpen, onClose, pricedItems, initialBilledItems }) => {
  const [itemSearch, setItemSearch] = useState('');
  const [currentBilledItems, setCurrentBilledItems] = useState([...initialBilledItems]); // Local state for modal edits
  const [activeIndex, setActiveIndex] = useState(-1); // For keyboard nav

  // Refs for focusing
  const searchInputRef = useRef(null);
  const qtyInputRefs = useRef({}); // Store refs for each item's qty input
  const priceInputRefs = useRef({}); // Store refs for each item's price input
  const activeItemRef = useRef(null); // Ref for scrolling selected item into view

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100); // Small delay
      setCurrentBilledItems([...initialBilledItems]); // Reset items on open
    }
  }, [isOpen, initialBilledItems]);

  // Scroll active item into view
   useEffect(() => {
    if (activeItemRef.current) {
        activeItemRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
        });
    }
  }, [activeIndex]);

  
  const filteredItems = useMemo(() => {
    if (!itemSearch) return [];
    const lowerSearch = itemSearch.toLowerCase();
    return pricedItems.filter(pItem => 
      !currentBilledItems.some(bItem => bItem.itemId === pItem.itemId) &&
      (pItem.itemName.toLowerCase().includes(lowerSearch) || 
       pItem.itemSKU?.toLowerCase().includes(lowerSearch))
    );
  }, [itemSearch, pricedItems, currentBilledItems]);

  const addItemToBill = (item) => {
    const newItem = {
      itemId: item.itemId, 
      itemName: item.itemName,
      qty: 1, // Default qty
      price: item.price, 
      total: item.price,
    };
    setCurrentBilledItems(prev => [...prev, newItem]);
    setItemSearch('');
    setActiveIndex(-1); // Reset selection
    // Focus the Qty input of the newly added item (last item)
    setTimeout(() => {
       const newIndex = currentBilledItems.length; // Index will be the current length
       qtyInputRefs.current[newIndex]?.focus();
    }, 100); 
  };

  const updateBilledItem = (index, field, value) => {
    const updatedItems = [...currentBilledItems];
    const item = updatedItems[index];
    let numValue = parseFloat(value);
    
    // Prevent negative numbers or NaN
    if (isNaN(numValue) || numValue < 0) {
        numValue = 0;
    }

    if (field === 'qty') {
      item.qty = numValue;
    } else if (field === 'price') {
      item.price = numValue;
    }
    item.total = item.qty * item.price;
    
    setCurrentBilledItems(updatedItems);
  };

  const removeBilledItem = (index) => {
    setCurrentBilledItems(prev => prev.filter((_, i) => i !== index));
  };

  const modalTotal = useMemo(() => {
    return currentBilledItems.reduce((acc, item) => acc + (item.qty * item.price), 0);
  }, [currentBilledItems]);

  // --- Keyboard Navigation Handlers ---
  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < filteredItems.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter' && activeIndex >= 0 && filteredItems[activeIndex]) {
      e.preventDefault();
      addItemToBill(filteredItems[activeIndex]);
    } else if (e.key === 'Escape') {
      setItemSearch(''); // Clear search on escape
      setActiveIndex(-1);
    }
  };

  const handleQtyKeyDown = (e, index) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Try to focus price input next
       priceInputRefs.current[index]?.focus();
    }
  };
  
  const handlePriceKeyDown = (e, index) => {
     if (e.key === 'Enter') {
        e.preventDefault();
        // Focus back on the search input
        searchInputRef.current?.focus();
     }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.modalOverlay} onClick={() => onClose(null)}> {/* Pass null on background click */}
      <div style={{...styles.modalContent, ...styles.invoiceModalContent}} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Add/Edit Billed Items</h2>
          <button style={styles.modalCloseIcon} onClick={() => onClose(null)}>&times;</button> {/* Pass null on close */}
        </div>
        <div style={{...styles.modalBody, ...styles.invoiceModalBody}}>
          {/* Search Bar */}
          <div style={{...styles.inputGroup, padding: '0 24px'}}> {/* Add padding */}
            <label htmlFor="itemSearch" style={styles.label}>Search for Item</label>
            <input
              ref={searchInputRef}
              type="text"
              id="itemSearch"
              style={styles.input}
              value={itemSearch}
              onChange={(e) => {setItemSearch(e.target.value); setActiveIndex(-1);}} // Reset index on change
              onKeyDown={handleSearchKeyDown}
              placeholder="Type item name or SKU..."
              autoComplete="off" // Prevent browser autocomplete
            />
          </div>
          
          {/* Search Results */}
          {itemSearch && (
            <div style={styles.searchResults}>
              {filteredItems.length > 0 ? (
                filteredItems.map((item, index) => (
                  <div 
                     key={item.id} 
                     ref={index === activeIndex ? activeItemRef : null} // Add ref for scrolling
                     style={{
                        ...styles.searchResultItem, 
                        ...(index === activeIndex ? styles.searchResultItemActive : {}) // Highlight active
                     }} 
                     onClick={() => addItemToBill(item)}
                     onMouseEnter={() => setActiveIndex(index)} // Select on hover
                  >
                    <span>{item.itemName} (SKU: {item.itemSKU || 'N/A'})</span>
                    <span>Rs. {item.price.toFixed(2)}</span>
                  </div>
                ))
              ) : (
                <div style={styles.noResults}>No items found (or item already added).</div>
              )}
            </div>
          )}

          {/* Billed Items List for Editing */}
          <div style={styles.invoiceItemsList}>
            {currentBilledItems.length === 0 ? (
              <p style={styles.noItemsText}>No items added yet.</p>
            ) : (
              <table style={styles.invoiceItemsTable}>
                {/* ... table head ... */}
                 <thead>
                  <tr>
                    <th style={styles.invoiceTableHeader}>Item</th>
                    <th style={styles.invoiceTableHeader}>Qty</th>
                    <th style={styles.invoiceTableHeader}>Price (Rs.)</th>
                    <th style={styles.invoiceTableHeader}>Total (Rs.)</th>
                    <th style={styles.invoiceTableHeader}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentBilledItems.map((item, index) => (
                    <tr key={index}>
                      <td style={styles.invoiceTableCell}>{item.itemName}</td>
                      <td style={styles.invoiceTableCell}>
                        <input
                          ref={el => qtyInputRefs.current[index] = el} // Assign ref
                          type="number"
                          style={styles.tableInput}
                          value={item.qty}
                          onChange={(e) => updateBilledItem(index, 'qty', e.target.value)}
                          onKeyDown={(e) => handleQtyKeyDown(e, index)} // Add keydown handler
                          min="0" // Prevent negative
                        />
                      </td>
                      <td style={styles.invoiceTableCell}>
                         <input
                          ref={el => priceInputRefs.current[index] = el} // Assign ref
                          type="number"
                          style={styles.tableInput}
                          value={item.price}
                          onChange={(e) => updateBilledItem(index, 'price', e.target.value)}
                          onKeyDown={(e) => handlePriceKeyDown(e, index)} // Add keydown handler
                          step="0.01" // Allow decimals
                          min="0" // Prevent negative
                        />
                      </td>
                      <td style={styles.invoiceTableCell}>
                        {(item.qty * item.price).toFixed(2)}
                      </td>
                      <td style={styles.invoiceTableCell}>
                        <button style={styles.invoiceDeleteButton} onClick={() => removeBilledItem(index)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div style={{...styles.modalFooter, ...styles.invoiceModalFooter}}>
          <span style={styles.modalTotal}>Total: Rs. {modalTotal.toFixed(2)}</span>
          {/* Pass back the updated items list on save */}
          <button style={styles.modalSaveButton} onClick={() => onClose(currentBilledItems)}> 
            Save Billed Items
          </button>
        </div>
      </div>
    </div>
  );
};


// --- Styles ---
const themeColors = {
  primary: '#00A1FF',
  primaryLight: '#e0f5ff',
  primaryDark: '#007acc',
  light: '#f8f9fa',
  darkText: '#1e293b',
  mediumText: '#334155',
  lightText: '#64748b',
  border: '#e2e8f0',
  red: '#ef4444',
  redLight: '#ffe4e6',
  green: '#10b981',
  greenLight: '#ecfdf5', // Added green light
  orange: '#f97316',
  yellow: '#f59e0b',
  yellowLight: '#fef9c3',
};

// Define base button styles to avoid self-reference in styles object
const baseButtonStyles = {
  padding: '12px 24px',
  fontSize: '15px',
  fontWeight: '600',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  transition: 'background-color 0.2s',
};

const styles = {
  container: {
    padding: '0px', 
  },
  // Form container styles
  formContainer: {
    padding: '24px 24px 32px 24px',
    borderBottom: `1px solid ${themeColors.border}`,
  },
  header: {
    color: themeColors.darkText,
    fontSize: '28px',
    fontWeight: '700',
    margin: '0 0 8px 0',
  },
  subHeader: {
    color: themeColors.lightText,
    fontSize: '16px',
    margin: '0 0 32px 0',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr', 
    gap: '24px',
    marginBottom: '24px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    marginBottom: '16px', 
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: themeColors.mediumText,
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    fontSize: '15px',
    border: `1px solid ${themeColors.border}`,
    borderRadius: '8px',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  textarea: {
    width: '100%',
    padding: '12px 14px',
    fontSize: '15px',
    border: `1px solid ${themeColors.border}`,
    borderRadius: '8px',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    resize: 'vertical',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  actionButtonContainer: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px',
  },
  saveButton: {
    ...baseButtonStyles,
    backgroundColor: themeColors.primary,
  },
  saveButtonDisabled: {
    ...baseButtonStyles,
    backgroundColor: themeColors.lightText,
    cursor: 'not-allowed',
    opacity: 0.7,
  },
  invoiceButton: {
    ...baseButtonStyles,
    backgroundColor: themeColors.green,
  },
  errorText: {
    color: themeColors.red,
    fontSize: '14px',
    marginTop: '16px',
  },

  // --- Billed Items Styles ---
  billedItemsContainer: {
    marginTop: '24px',
    border: `1px solid ${themeColors.border}`,
    borderRadius: '8px',
    overflow: 'hidden',
  },
  billedItemsHeader: {
    margin: 0,
    padding: '16px',
    backgroundColor: themeColors.light,
    color: themeColors.darkText,
    fontSize: '18px',
    fontWeight: '600',
    borderBottom: `1px solid ${themeColors.border}`,
  },
  noItemsText: {
    padding: '16px',
    color: themeColors.lightText,
    textAlign: 'center',
  },
  itemsTable: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableHeader: {
    textAlign: 'left',
    padding: '12px 16px',
    backgroundColor: themeColors.light,
    color: themeColors.mediumText,
    fontSize: '13px',
    fontWeight: '600',
    textTransform: 'uppercase',
    borderBottom: `1px solid ${themeColors.border}`,
  },
  tableCell: {
    padding: '12px 16px',
    borderBottom: `1px solid ${themeColors.border}`,
    color: themeColors.darkText,
    fontSize: '14px',
  },
  tableFooterLabel: {
    textAlign: 'right',
    fontWeight: '600',
    color: themeColors.mediumText,
  },
  tableFooterTotal: {
    fontWeight: '700',
    fontSize: '15px',
    color: themeColors.darkText,
  },
  chargeGrid: { // New style for charge/advance grid
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', // Responsive columns
      gap: '16px 24px',
      marginTop: '24px',
      alignItems: 'flex-end', // Align items to bottom
  },
  totalChargeInput: {
    fontSize: '16px', // Slightly smaller than balance display
    fontWeight: '600',
    color: themeColors.darkText,
  },
  balanceDisplay: { // Style for the calculated balance display
    paddingBottom: '12px', // Align with input bottom padding
  },
  balanceValue: {
    fontSize: '18px',
    fontWeight: '700',
    color: themeColors.darkText,
    margin: 0,
  },


  // List container styles
  listContainer: {
    padding: '24px',
  },
  listHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  listControls: { // Container for checkbox and search
      display: 'flex',
      alignItems: 'center',
      gap: '24px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: themeColors.mediumText,
    cursor: 'pointer',
  },
  listTitle: {
    color: themeColors.darkText,
    fontSize: '22px',
    fontWeight: '700',
    margin: 0,
  },
  searchInput: {
    width: '320px',
    padding: '10px 14px',
    fontSize: '14px',
    border: `1px solid ${themeColors.border}`,
    borderRadius: '8px',
    boxSizing: 'border-box',
  },
  jobsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    maxHeight: '60vh',
    overflowY: 'auto',
    padding: '4px',
  },
  jobCard: {
    background: '#fff',
    border: `1px solid ${themeColors.border}`,
    borderRadius: '12px',
    padding: '16px 20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
    transition: 'box-shadow 0.2s',
  },
  jobCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  jobCardName: {
    fontSize: '18px',
    fontWeight: '600',
    color: themeColors.darkText,
  },
  jobCardStatus: {
    fontSize: '13px',
    fontWeight: '600',
    padding: '4px 10px',
    borderRadius: '99px',
  },
  statusPending: {
    color: themeColors.orange,
    backgroundColor: '#fff7ed',
  },
  statusCompleted: {
    color: themeColors.green,
    backgroundColor: themeColors.greenLight, // Use light green
  },
  jobCardJobType: {
    fontSize: '15px',
    fontWeight: '500',
    color: themeColors.primary,
    margin: '0 0 12px 0',
  },
  jobCardInfo: {
    fontSize: '14px',
    color: themeColors.mediumText,
    margin: '0 0 16px 0',
    lineHeight: 1.5,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  jobCardMetaGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr', // Keep 2 columns
    gap: '8px 16px', // Adjust gap if needed
    paddingBottom: '16px',
    borderBottom: `1px solid ${themeColors.border}`,
  },
  jobCardMeta: {
    fontSize: '13px',
    color: themeColors.lightText,
    whiteSpace: 'nowrap', // Prevent wrapping
  },
  jobCardFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: '16px',
    gap: '12px',
    flexWrap: 'wrap', // Allow buttons to wrap on smaller screens
  },
  cardButton: {
    fontSize: '13px',
    fontWeight: '600',
    padding: '6px 14px',
    border: '1px solid',
    borderRadius: '6px',
    background: 'transparent',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  viewButton: {
    borderColor: themeColors.primary,
    color: themeColors.primary,
  },
  extendButton: {
    borderColor: themeColors.yellow,
    color: themeColors.yellow,
  },
  deleteButton: {
    borderColor: themeColors.red,
    color: themeColors.red,
  },
  completeButton: { // New style for complete button
      borderColor: themeColors.green,
      color: themeColors.green,
  },
  loadingText: {
    textAlign: 'center',
    padding: '32px',
    color: themeColors.lightText,
    fontSize: '16px',
  },
  noJobsText: {
    textAlign: 'center',
    padding: '32px',
    color: themeColors.lightText,
    fontSize: '16px',
    background: themeColors.light,
    borderRadius: '8px',
  },

  // Modal Styles
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
    backdropFilter: 'blur(4px)',
  },
  modalContent: {
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)',
    width: '90%',
    maxWidth: '600px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: `1px solid ${themeColors.border}`,
  },
  modalTitle: {
    color: themeColors.darkText,
    fontSize: '22px',
    fontWeight: '700',
    margin: 0,
  },
  modalCloseIcon: {
    background: 'transparent',
    border: 'none',
    fontSize: '28px',
    lineHeight: '1',
    color: themeColors.lightText,
    cursor: 'pointer',
  },
  modalBody: {
    padding: '24px',
    overflowY: 'auto',
  },
  modalGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px 24px',
  },
  modalField: {
    fontSize: '15px',
    color: themeColors.mediumText,
    marginBottom: '12px',
    margin: 0, // Reset margin for grid consistency
  },
  modalInfo: {
    gridColumn: '1 / -1', // Span full width in grid
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  modalInfoText: {
    background: themeColors.light,
    border: `1px solid ${themeColors.border}`,
    borderRadius: '6px',
    padding: '12px',
    fontSize: '14px',
    lineHeight: 1.6,
    color: themeColors.darkText,
    whiteSpace: 'pre-wrap', 
  },
  modalHr: {
    border: 'none',
    borderTop: `1px solid ${themeColors.border}`,
    margin: '16px 0',
  },
  modalFooter: {
    padding: '20px 24px',
    borderTop: `1px solid ${themeColors.border}`,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    background: themeColors.light,
    borderBottomLeftRadius: '12px',
    borderBottomRightRadius: '12px',
  },
  modalCloseButton: {
    fontSize: '15px',
    fontWeight: '600',
    padding: '10px 20px',
    border: `1px solid ${themeColors.border}`,
    borderRadius: '8px',
    background: '#fff',
    color: themeColors.mediumText,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  modalSaveButton: {
    ...baseButtonStyles,
    marginTop: 0,
    backgroundColor: themeColors.green,
  },
  modalDeleteButton: {
    ...baseButtonStyles,
    marginTop: 0,
    backgroundColor: themeColors.red,
  },
  chargeSummaryContainer: { // New container for charge details in View Modal
    marginTop: '16px',
    padding: '16px',
    backgroundColor: themeColors.light,
    borderRadius: '8px',
    border: `1px solid ${themeColors.border}`,
  },
  chargeSummaryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '15px',
    color: themeColors.mediumText,
    marginBottom: '8px',
    paddingBottom: '8px',
    borderBottom: `1px dashed ${themeColors.border}`,
  },
  balanceHighlight: { // Style to highlight the balance row
    fontSize: '16px',
    fontWeight: '600',
    color: themeColors.darkText,
    borderBottom: 'none', // No border on last item
    marginBottom: 0,
    paddingBottom: 0,
  },
  balanceHighlightText: { // Style for balance amount in Complete modal
      color: themeColors.primaryDark,
      marginLeft: '5px', // Add space
  },
  billedItemsHeaderContainer: { // New container for header + button
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '16px', // Add some space below
  },
  billMoreButton: { // New style for the button in view modal
    fontSize: '13px',
    fontWeight: '600',
    padding: '6px 14px',
    border: `1px solid ${themeColors.green}`,
    borderRadius: '6px',
    background: themeColors.greenLight,
    color: themeColors.green,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },


  // --- Invoice Modal Styles ---
  invoiceModalContent: {
    maxWidth: '800px', 
  },
  invoiceModalBody: {
    padding: 0, // Remove body padding
    display: 'flex',
    flexDirection: 'column',
    height: '60vh', 
  },
  searchResults: {
    maxHeight: '150px',
    overflowY: 'auto',
    border: `1px solid ${themeColors.border}`,
    borderRadius: '8px',
    margin: '0 24px 16px 24px', // Adjust margin
    boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
  },
  searchResultItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 14px',
    cursor: 'pointer',
    borderBottom: `1px solid ${themeColors.border}`,
    fontSize: '14px',
  },
  searchResultItemActive: { // Style for active item
     backgroundColor: themeColors.primaryLight,
     fontWeight: '500',
  },
  noResults: {
    padding: '10px 14px',
    color: themeColors.lightText,
    fontSize: '14px',
    textAlign: 'center',
  },
  invoiceItemsList: {
    flex: 1, 
    overflowY: 'auto',
    padding: '0 24px 24px 24px', // Adjust padding
  },
  invoiceItemsTable: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  invoiceTableHeader: {
    textAlign: 'left',
    padding: '12px',
    backgroundColor: themeColors.light,
    color: themeColors.mediumText,
    fontSize: '13px',
    fontWeight: '600',
    borderBottom: `1px solid ${themeColors.border}`,
    position: 'sticky', // Make header sticky
    top: 0, // Stick to top
    zIndex: 1, // Ensure it's above table rows
  },
  invoiceTableCell: {
    padding: '8px 12px',
    borderBottom: `1px solid ${themeColors.border}`,
    color: themeColors.darkText,
    fontSize: '14px',
    verticalAlign: 'middle',
  },
  tableInput: {
    width: '80px',
    padding: '8px 10px',
    fontSize: '14px',
    border: `1px solid ${themeColors.border}`,
    borderRadius: '6px',
  },
  invoiceDeleteButton: {
    fontSize: '13px',
    fontWeight: '500',
    padding: '4px 10px',
    border: `1px solid ${themeColors.red}`,
    borderRadius: '6px',
    background: themeColors.redLight,
    color: themeColors.red,
    cursor: 'pointer',
  },
  invoiceModalFooter: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTotal: {
    fontSize: '18px',
    fontWeight: '700',
    color: themeColors.darkText,
  }
};

// Add focus styles dynamically
const styleSheet = document.createElement("style");
styleSheet.innerText = `
  input[type="text"]:focus,
  input[type="datetime-local"]:focus,
  input[type="number"]:focus,
  textarea:focus,
  .searchInput:focus {
    border-color: ${themeColors.primary} !important;
    box-shadow: 0 0 0 3px ${themeColors.primaryLight} !important;
    outline: none;
  }
  .saveButton:hover, .invoiceButton:hover, .billMoreButton:hover {
     opacity: 0.85;
  }
  .jobCard:hover {
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  }
  .cardButton:hover {
    opacity: 0.7;
  }
  .viewButton:hover {
    background: ${themeColors.primaryLight};
  }
  .extendButton:hover {
    background: ${themeColors.yellowLight};
  }
  .deleteButton:hover {
    background: ${themeColors.redLight};
  }
   .completeButton:hover {
      background: ${themeColors.greenLight};
   }
  .modalCloseButton:hover {
    background: ${themeColors.border};
  }
  .searchResultItem:hover {
    background: ${themeColors.primaryLight};
  }
  .invoiceDeleteButton:hover {
    opacity: 0.7;
  }
  /* Modal button hovers */
  .modalSaveButton:hover {
    background-color: #059669; /* Darker green */
  }
  .modalDeleteButton:hover {
    background-color: #dc2626; /* Darker red */
  }
  /* Custom scrollbar */
  .jobsList::-webkit-scrollbar,
  .modalBody::-webkit-scrollbar,
  .searchResults::-webkit-scrollbar,
  .invoiceItemsList::-webkit-scrollbar {
    width: 8px;
  }
  .jobsList::-webkit-scrollbar-track,
  .modalBody::-webkit-scrollbar-track,
  .searchResults::-webkit-scrollbar-track,
  .invoiceItemsList::-webkit-scrollbar-track {
    background: #f1f5f9;
    border-radius: 4px;
  }
  .jobsList::-webkit-scrollbar-thumb,
  .modalBody::-webkit-scrollbar-thumb,
  .searchResults::-webkit-scrollbar-thumb,
  .invoiceItemsList::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 4px;
  }
  .jobsList::-webkit-scrollbar-thumb:hover,
  .modalBody::-webkit-scrollbar-thumb:hover,
  .searchResults::-webkit-scrollbar-thumb:hover,
  .invoiceItemsList::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }
`;
document.head.appendChild(styleSheet);

export default Services;

