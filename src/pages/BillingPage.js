import React from 'react';

const BillingPage = () => {
  const whatsappNumber = '94787223407'; // Sri Lankan number format for the link
  const whatsappLink = `https://wa.me/${whatsappNumber}`;

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
};

// Styles for the billing page
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
        color: '#d9534f', // A soft red to indicate an issue
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
        backgroundColor: '#25D366', // WhatsApp green
        color: '#fff',
        cursor: 'pointer',
        fontSize: '16px',
        fontWeight: 'bold',
        textDecoration: 'none',
    },
};

export default BillingPage;