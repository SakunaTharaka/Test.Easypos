import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, where, doc, updateDoc, Timestamp, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { FaSearch, FaSync, FaUsers, FaBullhorn, FaToggleOn, FaToggleOff, FaTools, FaKey } from 'react-icons/fa';

const MasterAdmin = () => {
  const [loggedIn, setLoggedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('uid');
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isExtending, setIsExtending] = useState(false);

  const [announcement, setAnnouncement] = useState({ message: '', isEnabled: false });
  const [isUpdatingAnn, setIsUpdatingAnn] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  const [masterPassword, setMasterPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isUpdatingPass, setIsUpdatingPass] = useState(false);

  useEffect(() => {
    const fetchGlobalSettings = async () => {
      const credRef = doc(db, 'global_settings', 'credentials');
      const credSnap = await getDoc(credRef);
      if (credSnap.exists()) {
        setMasterPassword(credSnap.data().password);
      } else {
        const defaultPass = 'admin123';
        await setDoc(credRef, { password: defaultPass });
        setMasterPassword(defaultPass);
      }
    };
    fetchGlobalSettings();
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    
    const fetchAdminData = async () => {
      const annRef = doc(db, 'global_settings', 'announcement');
      const annSnap = await getDoc(annRef);
      if (annSnap.exists()) {
        setAnnouncement(annSnap.data());
      } else {
        await setDoc(annRef, { message: '', isEnabled: false, lastUpdated: serverTimestamp() });
      }

      const maintRef = doc(db, 'global_settings', 'maintenance');
      const maintSnap = await getDoc(maintRef);
      if (maintSnap.exists()) {
        setMaintenanceMode(maintSnap.data().isActive);
      } else {
        await setDoc(maintRef, { isActive: false });
      }
    };
    fetchAdminData();
  }, [loggedIn]);

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === masterPassword) {
      setLoggedIn(true);
      setError('');
    } else {
      setError('Invalid password.');
    }
  };
  
  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      alert('New password must be at least 6 characters long.');
      return;
    }
    setIsUpdatingPass(true);
    try {
      const credRef = doc(db, 'global_settings', 'credentials');
      await updateDoc(credRef, { password: newPassword });
      setMasterPassword(newPassword);
      setNewPassword('');
      alert('Master password updated successfully!');
    } catch (err) {
      alert(`Failed to update password: ${err.message}`);
    } finally {
      setIsUpdatingPass(false);
    }
  };

  const handleUpdateMessage = async () => {
    if (!announcement.message.trim()) {
        alert('Please enter a message for the announcement.');
        return;
    }
    setIsUpdatingAnn(true);
    try {
        const annRef = doc(db, 'global_settings', 'announcement');
        await updateDoc(annRef, { 
            message: announcement.message,
            lastUpdated: serverTimestamp() 
        });
        alert('Announcement message has been updated successfully!');
    } catch (err) {
        alert(`Failed to update message: ${err.message}`);
    } finally {
        setIsUpdatingAnn(false);
    }
  };

  const handleToggleAnnouncement = async () => {
    const newStatus = !announcement.isEnabled;
    setAnnouncement(prev => ({ ...prev, isEnabled: newStatus }));
    try {
        const annRef = doc(db, 'global_settings', 'announcement');
        await updateDoc(annRef, {
            isEnabled: newStatus,
            lastUpdated: serverTimestamp()
        });
    } catch (err) {
        setAnnouncement(prev => ({ ...prev, isEnabled: !newStatus }));
        alert(`Failed to toggle announcement: ${err.message}`);
    }
  };

  const handleToggleMaintenanceMode = async () => {
    const newStatus = !maintenanceMode;
    setMaintenanceMode(newStatus);
    try {
      const maintRef = doc(db, 'global_settings', 'maintenance');
      await setDoc(maintRef, { isActive: newStatus }, { merge: true });
    } catch (err) {
      alert(`Failed to update maintenance mode: ${err.message}`);
      setMaintenanceMode(!newStatus);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      alert('Please enter a search query.');
      return;
    }
    setLoading(true);
    setSelectedUser(null);
    setUsers([]);
    try {
      const usersRef = collection(db, 'Userinfo');
      let q;
      if (searchType === 'uid') {
        const userDoc = await getDoc(doc(usersRef, searchQuery.trim()));
        if (userDoc.exists()) {
           setUsers([{ id: userDoc.id, ...userDoc.data() }]);
        }
      } else {
        const searchTerm = searchQuery.trim();
        q = query(usersRef, 
            where(searchType, '>=', searchTerm), 
            where(searchType, '<=', searchTerm + '\uf8ff')
        );
        const querySnapshot = await getDocs(q);
        const foundUsers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setUsers(foundUsers);
      }
    } catch (err) {
      alert(`An error occurred while searching: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleShowAll = async () => {
    setLoading(true);
    setSelectedUser(null);
    setUsers([]);
    try {
      const usersRef = collection(db, 'Userinfo');
      const querySnapshot = await getDocs(usersRef);
      const allUsers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(allUsers);
    } catch (err) {
      alert(`An error occurred while fetching users: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  const handleExtendTrial = async (days) => {
    if (!selectedUser || isExtending) return;
    setIsExtending(true);
    try {
        const userRef = doc(db, "Userinfo", selectedUser.id);
        
        // ✅ **START: CRITICAL 100% TRUSTABLE DATE LOGIC**
        
        // 1. Get today's date and normalize it to the start of the day (midnight) for accurate, time-agnostic comparison.
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set time to 00:00:00 in local timezone

        // 2. Get the user's current trial end date from Firestore and normalize it as well.
        const currentEndDate = selectedUser.trialEndDate.toDate();
        currentEndDate.setHours(0, 0, 0, 0); // Set time to 00:00:00 in local timezone

        let baseDate;

        // 3. Determine the correct base date according to your critical rules.
        if (currentEndDate > today) {
            // SCENARIO 1: Trial is still active (ends in the future).
            // Extend from their EXISTING end date to "top up" their time.
            baseDate = selectedUser.trialEndDate.toDate();
        } else {
            // SCENARIO 2 & 3: Trial is expired or ends today.
            // Extend from TODAY to give them a fresh period.
            baseDate = new Date();
        }

        // 4. Calculate the new end date by adding the specified days to the determined base date.
        const newEndDate = new Date(baseDate);
        newEndDate.setDate(baseDate.getDate() + days);

        // ✅ **END: CRITICAL 100% TRUSTABLE DATE LOGIC**

        await updateDoc(userRef, {
            trialEndDate: Timestamp.fromDate(newEndDate)
        });

        const updatedDoc = await getDoc(userRef);
        setSelectedUser({ id: updatedDoc.id, ...updatedDoc.data() });

        alert(`Trial successfully extended to ${newEndDate.toLocaleDateString('en-LK')}!`);
    } catch (err) {
        alert(`Failed to extend trial: ${err.message}`);
    } finally {
        setTimeout(() => setIsExtending(false), 1000); // Prevent double-clicks
    }
  };

  const calculateDaysLeft = (trialEndDate) => {
    if (!trialEndDate || !trialEndDate.toDate) {
      return { text: '-', color: '#555' };
    }
    const today = new Date();
    const endDate = trialEndDate.toDate();
    
    today.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    
    const diffTime = endDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: 'Expired', color: '#e74c3c' };
    }
    if (diffDays === 0) {
      return { text: 'Expires Today', color: '#f59e0b' };
    }
    if (diffDays < 5) {
      return { text: `${diffDays} days`, color: '#e74c3c' };
    }
    return { text: `${diffDays} days`, color: '#27ae60' };
  };

  if (!loggedIn) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginBox}>
          <h1 style={styles.header}>Master Admin Login</h1>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter Master Password"
              style={styles.input}
            />
            <button type="submit" style={styles.button}>Login</button>
            {error && <p style={styles.errorText}>{error}</p>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Master Admin Panel</h1>
      
      <div style={styles.announcementContainer}>
          <h2 style={styles.subHeader}><FaBullhorn /> Global Announcement</h2>
          <textarea
            placeholder="Type your critical announcement here..."
            style={styles.textarea}
            value={announcement.message}
            onChange={(e) => setAnnouncement({...announcement, message: e.target.value})}
          />
          <div style={styles.announcementControls}>
            <div style={styles.toggleContainer} onClick={handleToggleAnnouncement}>
                {announcement.isEnabled ? <FaToggleOn size={28} color="#10b981" /> : <FaToggleOff size={28} color="#6b7280" />}
                <span style={{fontWeight: announcement.isEnabled ? 'bold' : 'normal', color: announcement.isEnabled ? '#10b981' : '#6b7280'}}>
                    {announcement.isEnabled ? 'Announcement is LIVE' : 'Announcement is OFF'}
                </span>
            </div>
            <button onClick={handleUpdateMessage} disabled={isUpdatingAnn} style={isUpdatingAnn ? styles.buttonDisabled : styles.button}>
                {isUpdatingAnn ? 'Updating...' : 'Update Message Text'}
            </button>
          </div>
      </div>

      <div style={styles.maintenanceContainer}>
        <h2 style={styles.subHeader}><FaTools /> System Maintenance Mode</h2>
        <div style={styles.announcementControls}>
            <p style={styles.description}>When enabled, all users will be blocked from logging in and will see a maintenance page.</p>
            <div style={styles.toggleContainer} onClick={handleToggleMaintenanceMode}>
                {maintenanceMode ? <FaToggleOn size={28} color="#d9534f" /> : <FaToggleOff size={28} color="#6b7280" />}
                <span style={{fontWeight: maintenanceMode ? 'bold' : 'normal', color: maintenanceMode ? '#d9534f' : '#6b7280'}}>
                    {maintenanceMode ? 'Maintenance Mode is ACTIVE' : 'Maintenance Mode is OFF'}
                </span>
            </div>
        </div>
      </div>
      
      <div style={styles.passwordContainer}>
        <h2 style={styles.subHeader}><FaKey /> Change Master Password</h2>
        <div style={styles.passwordControls}>
          <input
            type="password"
            placeholder="Enter new password (min. 6 characters)"
            style={styles.input}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <button onClick={handleUpdatePassword} disabled={isUpdatingPass} style={isUpdatingPass ? styles.buttonDisabled : styles.button}>
            {isUpdatingPass ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </div>

      <div style={styles.searchContainer}>
        <select value={searchType} onChange={(e) => setSearchType(e.target.value)} style={styles.select}>
          <option value="uid">User ID</option>
          <option value="email">Email</option>
          <option value="phone">Phone Number</option>
        </select>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`Search by ${searchType}...`}
          style={styles.input}
        />
        <button onClick={handleSearch} disabled={loading} style={styles.button}>
            {loading ? <FaSync className="spin" /> : <FaSearch />} Search
        </button>
        <button onClick={handleShowAll} disabled={loading} style={{...styles.button, backgroundColor: '#10b981'}}>
            {loading ? <FaSync className="spin" /> : <FaUsers />} Show All
        </button>
      </div>

      <div style={styles.resultsContainer}>
        <div style={styles.userList}>
          <h2 style={styles.subHeader}>Search Results ({users.length})</h2>
          {loading && <p>Searching...</p>}
          {!loading && users.length === 0 && <p>No users found. Try the 'Show All' button to see all registered users.</p>}
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Company Name</th>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Phone</th>
                <th style={styles.th}>Days Left</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const daysLeftInfo = calculateDaysLeft(user.trialEndDate);
                return (
                  <tr 
                    key={user.id} 
                    onClick={() => setSelectedUser(user)} 
                    style={selectedUser?.id === user.id ? { ...styles.tr, ...styles.trSelected } : styles.tr}
                  >
                    <td style={styles.td}>{user.companyName}</td>
                    <td style={styles.td}>{user.email}</td>
                    <td style={styles.td}>{user.phone}</td>
                    <td style={{...styles.td, color: daysLeftInfo.color, fontWeight: 'bold' }}>
                      {daysLeftInfo.text}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={styles.userDetails}>
          <h2 style={styles.subHeader}>User Details</h2>
          {selectedUser ? (
            <div>
              <p><strong>User ID:</strong> {selectedUser.id}</p>
              <p><strong>Full Name:</strong> {selectedUser.fullName}</p>
              <p><strong>Company:</strong> {selectedUser.companyName}</p>
              <p><strong>Email:</strong> {selectedUser.email}</p>
              <p><strong>Phone:</strong> {selectedUser.phone}</p>
              <p><strong>Address:</strong> {selectedUser.companyAddress}</p>
              <p><strong>Plan:</strong> {selectedUser.selectedPackage}</p>
              <p style={styles.trialDate}>
                <strong>Trial Ends:</strong> {selectedUser.trialEndDate?.toDate().toLocaleDateString('en-LK', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              
              <div style={styles.buttonGroup}>
                <button onClick={() => handleExtendTrial(30)} disabled={isExtending} style={isExtending ? styles.buttonDisabled : styles.button}>
                  {isExtending ? 'Updating...' : 'Extend 1 Month'}
                </button>
                <button onClick={() => handleExtendTrial(365)} disabled={isExtending} style={isExtending ? styles.buttonDisabled : styles.button}>
                   {isExtending ? 'Updating...' : 'Extend 1 Year'}
                </button>
              </div>
            </div>
          ) : (
            <p>Select a user from the results to see their details.</p>
          )}
        </div>
      </div>
    </div>
  );
};

const styles = {
    container: { fontFamily: "'Inter', sans-serif", padding: '24px', backgroundColor: '#f0f2f5', minHeight: '100vh' },
    loginContainer: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#f0f2f5' },
    loginBox: { padding: '40px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', textAlign: 'center', width: '100%', maxWidth: '400px' },
    header: { color: '#1f2937', marginBottom: '24px' },
    subHeader: { borderBottom: '2px solid #e5e7eb', paddingBottom: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' },
    announcementContainer: { backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', marginBottom: '24px' },
    maintenanceContainer: { backgroundColor: '#fffbe6', border: '1px solid #ffe58f', padding: '20px', borderRadius: '8px', marginBottom: '24px' },
    passwordContainer: { backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', marginBottom: '24px' },
    description: { margin: '0', color: '#92400e', fontSize: '14px', flex: 1 },
    textarea: { width: '100%', minHeight: '80px', padding: '12px', fontSize: '16px', border: '1px solid #d1d5db', borderRadius: '6px', resize: 'vertical', boxSizing: 'border-box' },
    announcementControls: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap', gap: '16px' },
    passwordControls: { display: 'flex', gap: '12px', alignItems: 'center' },
    toggleContainer: { display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none', fontSize: '14px' },
    searchContainer: { display: 'flex', gap: '12px', marginBottom: '24px', backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' },
    input: { flex: 1, padding: '12px', fontSize: '16px', border: '1px solid #d1d5db', borderRadius: '6px' },
    select: { padding: '12px', fontSize: '16px', border: '1px solid #d1d5db', borderRadius: '6px' },
    button: { padding: '12px 20px', fontSize: '16px', border: 'none', borderRadius: '6px', backgroundColor: '#2563eb', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
    buttonDisabled: { padding: '12px 20px', fontSize: '16px', border: 'none', borderRadius: '6px', backgroundColor: '#9ca3af', color: 'white', cursor: 'not-allowed' },
    resultsContainer: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' },
    userList: { backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', overflowX: 'auto' },
    userDetails: { backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { textAlign: 'left', padding: '12px', borderBottom: '2px solid #e5e7eb', backgroundColor: '#f9fafb' },
    td: { padding: '12px', borderBottom: '1px solid #e5e7eb' },
    tr: { cursor: 'pointer', transition: 'background-color 0.2s' },
    trSelected: { backgroundColor: '#eaf5ff', color: '#2563eb' },
    trialDate: { fontWeight: 'bold', fontSize: '1.1em', backgroundColor: '#fef3c7', padding: '12px', borderRadius: '6px', marginTop: '20px' },
    buttonGroup: { display: 'flex', gap: '12px', marginTop: '20px' },
    errorText: { color: '#ef4444', marginTop: '12px' },
};

export default MasterAdmin;

