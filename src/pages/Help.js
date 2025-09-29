import React from 'react';

const Help = () => {
  const styles = {
    container: {
      padding: '24px',
      fontFamily: "'Inter', sans-serif",
    },
    title: {
      fontSize: '22px',
      fontWeight: '600',
      marginBottom: '20px',
    },
    placeholder: {
      textAlign: 'center',
      padding: '40px',
      backgroundColor: '#f8f9fa',
      borderRadius: '8px',
      color: '#6c757d',
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>❓ Help & Support</h2>
      <div style={styles.placeholder}>
        <p>The Help page is under construction.</p>
      </div>
    </div>
  );
};

export default Help;