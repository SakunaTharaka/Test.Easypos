import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase'; 
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth'; // Import signOut

const BillingPage = () => {
  const navigate = useNavigate();
  // State to manage the loading, validation, and user details
  const [authStatus, setAuthStatus] = useState({
    loading: true,
    trialExpired: false,
    userEmail: '', // Store email
    userId: ''     // Store UID
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // If no user is logged in, redirect to the home page
      if (!user) {
        navigate('/');
        return;
      }

      // Fetch the user's profile from Firestore
      const userRef = doc(db, 'Userinfo', user.uid);
      const docSnap = await getDoc(userRef);

      if (docSnap.exists()) {
        const userData = docSnap.data();
        const trialEndDate = userData.trialEndDate?.toDate();

        // Check if the trial has actually expired
        if (trialEndDate) {
          const today = new Date();
          today.setHours(0, 0, 0, 0); // Normalize to the start of today

          if (today > trialEndDate) {
            // Trial is expired, user is allowed to see this page
            setAuthStatus({ 
              loading: false, 
              trialExpired: true,
              userEmail: user.email, // Capture email from auth user
              userId: user.uid       // Capture UID from auth user
            });
          } else {
            // Trial is still active, redirect user to the dashboard
            navigate('/dashboard');
          }
        } else {
          // If there's no trial date, they shouldn't be here
          navigate('/dashboard');
        }
      } else {
        // If user has no profile, send them to the details page
        navigate('/user-details');
      }
    });

    return () => unsubscribe(); // Cleanup the listener
  }, [navigate]);

  // Handle Logout Logic
  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/'); // Redirect to home after logout
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  const whatsappNumber = '94787223407';
  const whatsappLink = `https://wa.me/${whatsappNumber}`;

  // While checking, show a loading screen
  if (authStatus.loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingSpinner}></div>
      </div>
    );
  }
  
  // Only render the page if the trial is confirmed to be expired
  if (authStatus.trialExpired) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Your Trial Has Expired</h1>
          
          {/* User Details Section */}
          <div style={styles.userInfoBox}>
            <p style={styles.userInfoText}><strong>Account:</strong> {authStatus.userEmail}</p>
            <p style={styles.userInfoText}><strong>UID:</strong> <span style={styles.uidText}>{authStatus.userId}</span></p>
          </div>

          <p style={styles.subtitle}>
            To continue using EasyPOS LK, please complete your payment to reactivate your account.
          </p>
          
          <div style={styles.instructions}>
            <p>Please contact us on WhatsApp for payment details.</p>
            <p style={styles.phone}>📞 078 722 3407</p>
          </div>

          <div style={styles.buttonGroup}>
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer" style={styles.whatsappButton}>
               Contact on WhatsApp
            </a>
            
            <button onClick={handleLogout} style={styles.logoutButton}>
              Log Out
            </button>
          </div>

        </div>
      </div>
    );
  }

  // If loading is false but trial is not expired, the navigate function will have already
  // been called. Return null to prevent a flash of content.
  return null;
};

const styles = {
    container: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#f8f9fa',
        fontFamily: "'Inter', sans-serif",
    },
    card: {
        backgroundColor: '#fff',
        padding: '40px',
        borderRadius: '16px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
        textAlign: 'center',
        maxWidth: '500px',
        width: '90%',
    },
    title: {
        fontSize: '28px',
        fontWeight: 'bold',
        color: '#d9534f',
        margin: '0 0 20px 0',
    },
    userInfoBox: {
        backgroundColor: '#f1f5f9',
        padding: '15px',
        borderRadius: '8px',
        marginBottom: '20px',
        textAlign: 'left',
        border: '1px solid #e2e8f0',
    },
    userInfoText: {
        margin: '5px 0',
        fontSize: '14px',
        color: '#475569',
        wordBreak: 'break-all', // Ensures long UIDs don't overflow
    },
    uidText: {
        fontFamily: 'monospace',
        backgroundColor: '#e2e8f0',
        padding: '2px 4px',
        borderRadius: '4px',
        fontSize: '13px',
    },
    subtitle: {
        fontSize: '16px',
        color: '#6b7280',
        marginBottom: '30px',
        lineHeight: '1.5',
    },
    instructions: {
        marginBottom: '30px',
        fontSize: '18px',
        color: '#333',
    },
    phone: {
        fontSize: '22px',
        fontWeight: 'bold',
        color: '#111827',
        marginTop: '10px',
    },
    buttonGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '15px',
    },
    whatsappButton: {
        display: 'block',
        padding: '16px 32px',
        borderRadius: '12px',
        border: 'none',
        backgroundColor: '#25D366',
        color: '#fff',
        cursor: 'pointer',
        fontSize: '16px',
        fontWeight: 'bold',
        textDecoration: 'none',
        transition: 'background 0.2s',
    },
    logoutButton: {
        display: 'block',
        width: '100%',
        padding: '12px',
        borderRadius: '12px',
        border: '2px solid #ef4444',
        backgroundColor: 'transparent',
        color: '#ef4444',
        cursor: 'pointer',
        fontSize: '15px',
        fontWeight: '600',
        transition: 'all 0.2s',
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

const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  button:hover { opacity: 0.9; }
`;
document.head.appendChild(styleSheet);

export default BillingPage;