import React, { useEffect, useState } from "react";
import { db, auth } from "../../firebase";
import {
  doc,
  getDocs,
  setDoc,
  updateDoc,
  collection,
  deleteDoc,
} from "firebase/firestore";
import { FaKey, FaTrash } from 'react-icons/fa';

const Admin = ({ internalUsers, setInternalUsers }) => {
  const [loading, setLoading] = useState(true);
  const [newUser, setNewUser] = useState({ username: "", password: "", isAdmin: false });
  const [showPasswordPopup, setShowPasswordPopup] = useState(false);
  const [changePasswordUser, setChangePasswordUser] = useState(null);
  const [passwordInput, setPasswordInput] = useState({ newPassword: "", confirmPassword: "" });

  const getCurrentInternal = () => {
    try {
      const stored = localStorage.getItem("internalLoggedInUser");
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  };
  const loggedInUser = getCurrentInternal();

  useEffect(() => {
    if (internalUsers) {
      setLoading(false);
    }
  }, [internalUsers]);

  const handleAddUser = async () => {
    if (!newUser.username || !newUser.password) return alert("Enter username and password");

    // ✅ NEW CHECK: Password Minimum Length
    if (newUser.password.length < 6) {
      return alert("Password must be at least 6 characters long.");
    }

    // --- CHECK: Limit max users to 6 ---
    if (internalUsers.length >= 6) {
      return alert("Maximum limit reached. You cannot add more than 6 users.");
    }
    // -----------------------------------

    if (internalUsers.some(u => u.username.toLowerCase() === newUser.username.toLowerCase())) return alert("Username already exists");

    const uid = auth.currentUser.uid;
    const newUserDocRef = doc(db, uid, "admin", "admin_details", newUser.username);

    try {
      await setDoc(newUserDocRef, { ...newUser, isMaster: false });
      setInternalUsers([...internalUsers, { id: newUser.username, ...newUser, isMaster: false }]);
      setNewUser({ username: "", password: "", isAdmin: false });
      alert("User added successfully!");
    } catch (error) {
      alert("Error adding user: " + error.message);
    }
  };

  const handleDeleteUser = async (user) => {
    if (user.isMaster) return alert("Cannot delete the master admin account.");
    if (user.id === loggedInUser?.id) return alert("You cannot delete your own account.");
    
    if (!window.confirm(`Delete user ${user.username}?`)) return;

    const uid = auth.currentUser.uid;
    const userDocRef = doc(db, uid, "admin", "admin_details", user.id);

    try {
      await deleteDoc(userDocRef);
      setInternalUsers(internalUsers.filter(u => u.id !== user.id));
      alert("User deleted successfully!");
    } catch (error) {
      alert("Error deleting user: " + error.message);
    }
  };
  
  const handleChangePassword = async () => {
    if (changePasswordUser?.isMaster && !loggedInUser?.isMaster) {
      alert("Only the master admin can change their own password.");
      return;
    }
    
    if (!passwordInput.newPassword || passwordInput.newPassword !== passwordInput.confirmPassword) {
      return alert("Passwords do not match or are empty.");
    }
    if (passwordInput.newPassword.length < 6) {
        return alert("Password must be at least 6 characters long.");
    }

    const uid = auth.currentUser.uid;
    const userDocRef = doc(db, uid, "admin", "admin_details", changePasswordUser.id);
    
    try {
        await updateDoc(userDocRef, { password: passwordInput.newPassword });
        setInternalUsers(internalUsers.map(u => 
            u.id === changePasswordUser.id ? { ...u, password: passwordInput.newPassword } : u
        ));
        setShowPasswordPopup(false);
        alert("Password updated successfully!");
    } catch(error) {
        alert("Error updating password: " + error.message);
    }
  };
  
  const openChangePasswordPopup = (user) => {
    setChangePasswordUser(user);
    setPasswordInput({ newPassword: "", confirmPassword: "" });
    setShowPasswordPopup(true);
  };

  if (loading) return (
    <div style={styles.loadingContainer}>
      <div style={styles.loadingSpinner}></div>
      <p>Loading Admin Panel...</p>
    </div>
  );
  
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>User Management</h2>
        <p style={styles.subtitle}>Manage internal user accounts and permissions</p>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHeaderRow}>
            <h3 style={styles.sectionTitle}>Add New User</h3>
            {/* Visual Counter for User Limit */}
            <span style={internalUsers.length >= 6 ? styles.limitReached : styles.limitBadge}>
                Current: {internalUsers.length}/6
            </span>
        </div>
        
        <div style={styles.formRow}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Username</label>
            <input 
              style={styles.input} 
              placeholder="Enter username" 
              value={newUser.username} 
              onChange={e => setNewUser({ ...newUser, username: e.target.value })} 
              disabled={internalUsers.length >= 6} // Disable input if full
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <input 
              type="password" 
              style={styles.input} 
              placeholder="Enter password (min 6 chars)" 
              value={newUser.password} 
              onChange={e => setNewUser({ ...newUser, password: e.target.value })} 
              disabled={internalUsers.length >= 6} // Disable input if full
            />
          </div>
          <div style={styles.checkboxGroup}>
            <label style={styles.checkboxLabel}>
              <input 
                type="checkbox" 
                checked={newUser.isAdmin} 
                onChange={e => setNewUser({ ...newUser, isAdmin: e.target.checked })} 
                style={styles.checkbox}
                disabled={internalUsers.length >= 6}
              /> 
              Admin Privileges
            </label>
          </div>
          <button 
            onClick={handleAddUser} 
            style={internalUsers.length >= 6 ? styles.addButtonDisabled : styles.addButton}
            disabled={internalUsers.length >= 6}
            title={internalUsers.length >= 6 ? "User limit reached (Max 6)" : "Add User"}
          >
            Add User
          </button>
        </div>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>User Accounts</h3>
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.th}>Username</th>
                <th style={styles.th}>Role</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {internalUsers.map(user => (
                <tr key={user.id} style={user.isMaster ? styles.masterRow : styles.regularRow}>
                  <td style={styles.td}>
                    <div style={styles.userCell}>
                      <span style={styles.username}>{user.username}</span>
                      {user.isMaster && <span style={styles.masterBadge}>Master</span>}
                    </div>
                  </td>
                  <td style={styles.td}>{user.isAdmin ? "Administrator" : "Standard User"}</td>
                  <td style={styles.td}>
                    <span style={styles.statusActive}>Active</span>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.actionButtons}>
                      <button 
                        onClick={() => openChangePasswordPopup(user)} 
                        style={user.isMaster && !loggedInUser?.isMaster ? styles.changePasswordButtonDisabled : styles.changePasswordButton}
                        title={user.isMaster && !loggedInUser?.isMaster ? "Only the master admin can change this password" : "Change password"}
                        disabled={user.isMaster && !loggedInUser?.isMaster}
                      >
                        <FaKey />
                      </button>
                      {!user.isMaster && (
                        <button 
                          onClick={() => handleDeleteUser(user)} 
                          style={user.id === loggedInUser?.id ? styles.deleteButtonDisabled : styles.deleteButton}
                          title={user.id === loggedInUser?.id ? "You cannot delete your own account" : "Delete user"}
                          disabled={user.id === loggedInUser?.id}
                        >
                          <FaTrash />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showPasswordPopup && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Change Password</h3>
              <span 
                style={styles.closeButton}
                onClick={() => setShowPasswordPopup(false)}
              >
                &times;
              </span>
            </div>
            <div style={styles.modalContent}>
              <p style={styles.modalText}>Changing password for: <strong>{changePasswordUser?.username}</strong></p>
              <div style={styles.inputGroup}>
                <label style={styles.label}>New Password</label>
                <input 
                  type="password" 
                  style={styles.input} 
                  placeholder="Enter new password (min. 6 characters)" 
                  value={passwordInput.newPassword} 
                  onChange={e => setPasswordInput({ ...passwordInput, newPassword: e.target.value })} 
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Confirm Password</label>
                <input 
                  type="password" 
                  style={styles.input} 
                  placeholder="Confirm new password" 
                  value={passwordInput.confirmPassword} 
                  onChange={e => setPasswordInput({ ...passwordInput, confirmPassword: e.target.value })} 
                />
              </div>
            </div>
            <div style={styles.modalActions}>
              <button 
                onClick={() => setShowPasswordPopup(false)} 
                style={styles.cancelButton}
              >
                Cancel
              </button>
              <button 
                onClick={handleChangePassword} 
                style={styles.saveButton}
              >
                Update Password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: "24px",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    backgroundColor: "#f8f9fa",
    minHeight: "100vh",
  },
  header: { marginBottom: "30px" },
  title: { fontSize: "28px", fontWeight: "600", color: "#2c3e50", margin: "0 0 8px 0" },
  subtitle: { fontSize: "16px", color: "#7f8c8d", margin: 0 },
  section: { backgroundColor: "#fff", borderRadius: "8px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)", padding: "20px", marginBottom: "20px" },
  sectionHeaderRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid #eee", paddingBottom: "10px" },
  sectionTitle: { fontSize: "18px", fontWeight: "600", color: "#2c3e50", margin: 0 },
  limitBadge: { fontSize: "13px", color: "#7f8c8d", backgroundColor: "#f1f2f6", padding: "4px 8px", borderRadius: "4px" },
  limitReached: { fontSize: "13px", color: "#c0392b", backgroundColor: "#fadbd8", padding: "4px 8px", borderRadius: "4px", fontWeight: "bold" },
  formRow: { display: "flex", flexWrap: "wrap", gap: "15px", alignItems: "flex-end" },
  inputGroup: { display: "flex", flexDirection: "column", minWidth: "200px", flex: 1 },
  label: { marginBottom: "8px", fontWeight: "500", fontSize: "14px", color: "#2c3e50" },
  input: { padding: "10px 12px", borderRadius: "6px", border: "1px solid #ddd", fontSize: "14px" },
  checkboxGroup: { display: "flex", alignItems: "center", margin: "0 10px" },
  checkboxLabel: { display: "flex", alignItems: "center", fontSize: "14px", color: "#2c3e50" },
  checkbox: { marginRight: "8px" },
  addButton: { padding: "10px 20px", background: "#3498db", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "500", fontSize: "14px", height: "fit-content" },
  addButtonDisabled: { padding: "10px 20px", background: "#bdc3c7", color: "#fff", border: "none", borderRadius: "6px", cursor: "not-allowed", fontWeight: "500", fontSize: "14px", height: "fit-content" },
  tableContainer: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse" },
  tableHeader: { backgroundColor: "#f1f8ff" },
  th: { padding: "16px", textAlign: "left", fontWeight: "600", color: "#2c3e50", borderBottom: "2px solid #ddd", fontSize: "14px" },
  td: { padding: "16px", borderBottom: "1px solid #eee", fontSize: "14px" },
  masterRow: { backgroundColor: "#f0f9ff" },
  regularRow: {},
  userCell: { display: "flex", alignItems: "center", gap: "10px" },
  username: { fontWeight: "500" },
  masterBadge: { backgroundColor: "#3498db", color: "#fff", padding: "3px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "500" },
  statusActive: { color: "#2ecc71", fontWeight: "500" },
  actionButtons: { display: "flex", gap: "10px" },
  changePasswordButton: { background: "transparent", border: "none", cursor: "pointer", fontSize: "16px", color: "#3498db", padding: "5px" },
  changePasswordButtonDisabled: { background: "transparent", border: "none", fontSize: "16px", color: "#bdc3c7", padding: "5px", cursor: "not-allowed" },
  deleteButton: { background: "transparent", border: "none", cursor: "pointer", fontSize: "16px", color: "#e74c3c", padding: "5px" },
  deleteButtonDisabled: { background: "transparent", border: "none", fontSize: "16px", color: "#bdc3c7", padding: "5px", cursor: "not-allowed" },
  modalOverlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000, padding: "20px" },
  modal: { backgroundColor: "#fff", borderRadius: "10px", width: "100%", maxWidth: "450px", boxShadow: "0 5px 20px rgba(0,0,0,0.15)" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 25px", borderBottom: "1px solid #eee" },
  modalTitle: { margin: 0, fontSize: "20px", fontWeight: "600", color: "#2c3e50" },
  closeButton: { fontSize: "24px", cursor: "pointer", color: "#95a5a6", fontWeight: "bold" },
  modalContent: { padding: "25px" },
  modalText: { margin: "0 0 20px 0", fontSize: "14px", color: "#7f8c8d" },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: "15px", padding: "20px 25px", borderTop: "1px solid #eee" },
  cancelButton: { padding: "10px 20px", background: "#95a5a6", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "500" },
  saveButton: { padding: "10px 20px", background: "#2ecc71", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "500" },
  loadingContainer: { display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "200px", fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", color: "#7f8c8d" },
  loadingSpinner: { border: "4px solid #f3f3f3", borderTop: "4px solid #3498db", borderRadius: "50%", width: "40px", height: "40px", animation: "spin 1s linear infinite", marginBottom: "15px" },
};

const styleSheet = document.createElement("style");
styleSheet.innerText = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
document.head.appendChild(styleSheet);

export default Admin;