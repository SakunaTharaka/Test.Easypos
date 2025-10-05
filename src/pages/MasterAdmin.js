import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, where, doc, updateDoc, Timestamp, getDoc } from 'firebase/firestore';
import { FaSearch, FaSync, FaUsers } from 'react-icons/fa';

// --- Master Admin Page ---
const MasterAdmin = () => {
  const [loggedIn, setLoggedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('uid'); // 'uid', 'email', 'phone'
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isExtending, setIsExtending] = useState(false); // For preventing double-press

  // NOTE: In a real-world scenario, this should be a more secure authentication method.
  const MASTER_PASSWORD = "master_password_123";

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === MASTER_PASSWORD) {
      setLoggedIn(true);
      setError('');
    } else {
      setError('Invalid password.');
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
        // ✅ **FIX: Use a more flexible "starts with" search for email and phone**
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
      alert(`An error occurred while searching: ${err.message}\n\nNOTE: This might require creating a new index in Firestore. Check your browser's developer console (F12) for a link to create it automatically.`);
    } finally {
      setLoading(false);
    }
  };

  // ✅ **NEW: Function to fetch all users**
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
        
        const currentEndDate = selectedUser.trialEndDate.toDate();
        const newEndDate = new Date(currentEndDate);
        newEndDate.setDate(currentEndDate.getDate() + days);

        await updateDoc(userRef, {
            trialEndDate: Timestamp.fromDate(newEndDate)
        });

        const updatedDoc = await getDoc(userRef);
        setSelectedUser({ id: updatedDoc.id, ...updatedDoc.data() });

        alert(`Trial extended successfully by ${days} days!`);

    } catch (err) {
        alert(`Failed to extend trial: ${err.message}`);
    } finally {
        setTimeout(() => setIsExtending(false), 1000);
    }
  };

  // Login Screen
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

  // Main Admin Panel
  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Master Admin Panel</h1>
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
        {/* ✅ **NEW: "Show All Users" button** */}
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
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} onClick={() => setSelectedUser(user)} style={styles.tr}>
                  <td style={styles.td}>{user.companyName}</td>
                  <td style={styles.td}>{user.email}</td>
                  <td style={styles.td}>{user.phone}</td>
                </tr>
              ))}
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

// --- Styles ---
const styles = {
    container: { fontFamily: "'Inter', sans-serif", padding: '24px', backgroundColor: '#f0f2f5', minHeight: '100vh' },
    loginContainer: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#f0f2f5' },
    loginBox: { padding: '40px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', textAlign: 'center', width: '100%', maxWidth: '400px' },
    header: { color: '#1f2937', marginBottom: '24px' },
    subHeader: { borderBottom: '2px solid #e5e7eb', paddingBottom: '8px', marginBottom: '16px' },
    searchContainer: { display: 'flex', gap: '12px', marginBottom: '24px', backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' },
    input: { flex: 1, padding: '12px', fontSize: '16px', border: '1px solid #d1d5db', borderRadius: '6px' },
    select: { padding: '12px', fontSize: '16px', border: '1px solid #d1d5db', borderRadius: '6px' },
    button: { padding: '12px 20px', fontSize: '16px', border: 'none', borderRadius: '6px', backgroundColor: '#2563eb', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
    buttonDisabled: { padding: '12px 20px', fontSize: '16px', border: 'none', borderRadius: '6px', backgroundColor: '#9ca3af', color: 'white', cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
    resultsContainer: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' },
    userList: { backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', overflowX: 'auto' },
    userDetails: { backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { textAlign: 'left', padding: '12px', borderBottom: '2px solid #e5e7eb', backgroundColor: '#f9fafb' },
    td: { padding: '12px', borderBottom: '1px solid #e5e7eb' },
    tr: { cursor: 'pointer', transition: 'background-color 0.2s', ':hover': {backgroundColor: '#f9fafb'} },
    trialDate: { fontWeight: 'bold', fontSize: '1.1em', backgroundColor: '#fef3c7', padding: '12px', borderRadius: '6px', marginTop: '20px' },
    buttonGroup: { display: 'flex', gap: '12px', marginTop: '20px' },
    errorText: { color: '#ef4444', marginTop: '12px' },
};
export default MasterAdmin;

