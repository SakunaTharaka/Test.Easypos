import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { db } from '../firebase'; // Import your Firestore instance
import { doc, onSnapshot } from 'firebase/firestore';
import { FaTools } from 'react-icons/fa';

const MaintenancePage = () => {
  // NEW: State to track maintenance mode status
  const [maintenanceStatus, setMaintenanceStatus] = useState({
    loading: true,
    isActive: true, // Assume maintenance is active until we confirm otherwise
  });

  // NEW: Real-time listener to check the maintenance status
  useEffect(() => {
    const maintRef = doc(db, 'global_settings', 'maintenance');
    const unsubscribe = onSnapshot(maintRef, (docSnap) => {
      if (docSnap.exists()) {
        setMaintenanceStatus({ loading: false, isActive: docSnap.data().isActive });
      } else {
        // If the document doesn't exist, maintenance is definitely off
        setMaintenanceStatus({ loading: false, isActive: false });
      }
    });

    return () => unsubscribe(); // Cleanup the listener
  }, []);

  // --- NEW RENDER LOGIC ---

  // 1. While checking, show a loading screen
  if (maintenanceStatus.loading) {
    return <div style={styles.loadingContainer}><div style={styles.loadingSpinner}></div></div>;
  }

  // 2. If maintenance is NOT active, redirect to the dashboard
  if (!maintenanceStatus.isActive) {
    return <Navigate to="/dashboard" replace />;
  }
  
  // 3. Only if maintenance IS active, show the maintenance page content
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <FaTools size={60} style={styles.icon} />
        <h1 style={styles.title}>Maintenance Break</h1>
        <p style={styles.subtitle}>
          We are currently performing scheduled maintenance on our software and servers to improve your experience.
        </p>
        <p style={styles.thankYou}>
          Thank you for your patience.
        </p>
      </div>
    </div>
  );
};

const styles = {
    container: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#f0f2f5',
        fontFamily: "'Inter', sans-serif",
    },
    card: {
        backgroundColor: '#fff',
        padding: '50px',
        borderRadius: '16px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
        textAlign: 'center',
        maxWidth: '600px',
        width: '90%',
    },
    icon: {
        color: '#f6ad55',
        marginBottom: '20px',
    },
    title: {
        fontSize: '32px',
        fontWeight: 'bold',
        color: '#1f2937',
        margin: '0 0 15px 0',
    },
    subtitle: {
        fontSize: '18px',
        color: '#4b5563',
        lineHeight: '1.6',
        marginBottom: '30px',
    },
    thankYou: {
        fontSize: '16px',
        color: '#6b7280',
        fontStyle: 'italic',
    },
    // NEW: Styles for the loading indicator
    loadingContainer: { 
        display: "flex", 
        justifyContent: "center", 
        alignItems: "center", 
        height: "100vh" 
    },
    loadingSpinner: { 
        border: "3px solid rgba(52, 152, 219, 0.2)", 
        borderTop: "3px solid #3498db", 
        borderRadius: "50%", 
        width: "50px", 
        height: "50px", 
        animation: "spin 1s linear infinite" 
    },
};

// NEW: Add keyframes for the spinner animation
const styleSheet = document.createElement("style");
styleSheet.innerText = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
document.head.appendChild(styleSheet);

export default MaintenancePage;