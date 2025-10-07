import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase'; // Import auth and db
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const BillingPage = () => {
  const navigate = useNavigate();
  // State to manage the loading and validation process
  const [authStatus, setAuthStatus] = useState({
    loading: true,
    trialExpired: false,
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
            setAuthStatus({ loading: false, trialExpired: true });
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
          <p style={styles.subtitle}>
            To continue using EasyPOS LK, please complete your payment to reactivate your account.
          </p>
          <div style={styles.instructions}>
            <p>Please contact us on WhatsApp for payment details.</p>
            <p style={styles.phone}>📞 078 722 3407</p>
          </div>
          <a href={whatsappLink} target="_blank" rel="noopener noreferrer" style={styles.button}>
            Contact on WhatsApp
          </a>
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
        margin: '0 0 10px 0',
    },
    subtitle: {
        fontSize: '16px',
        color: '#6b7280',
        marginBottom: '30px',
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
    button: {
        display: 'inline-block',
        padding: '16px 32px',
        borderRadius: '12px',
        border: 'none',
        backgroundColor: '#25D366',
        color: '#fff',
        cursor: 'pointer',
        fontSize: '16px',
        fontWeight: 'bold',
        textDecoration: 'none',
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
styleSheet.innerText = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
document.head.appendChild(styleSheet);

export default BillingPage;