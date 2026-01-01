import React from 'react';

const Costing = ({ internalUser }) => {
  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, color: '#1e293b', fontSize: '24px' }}>Costing</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b' }}>Calculate and track product costs</p>
        </div>
        {/* Add buttons or actions here later */}
      </div>
      
      {/* Placeholder Content */}
      <div style={{ background: '#f8f9fa', padding: '40px', borderRadius: '12px', textAlign: 'center', color: '#94a3b8' }}>
        <h3>Costing Module Coming Soon</h3>
        <p>This is where you will manage item cost calculations.</p>
      </div>
    </div>
  );
};

export default Costing;