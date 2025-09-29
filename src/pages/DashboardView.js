import React from "react";
// 💡 We'll use icons to make the cards more appealing
import { FaDollarSign, FaUserPlus, FaFileInvoice } from "react-icons/fa";

const DashboardView = ({ internalUser }) => {
  // Sample data for the UI
  const sampleStats = {
    totalSales: "12,450.00",
    newCustomers: 24,
    invoicesToday: 7,
  };

  const recentActivity = [
    { id: "INV-20250926-0004", customer: "John Doe", amount: "250.00", status: "Paid" },
    { id: "INV-20250926-0003", customer: "Jane Smith", amount: "420.00", status: "Paid" },
    { id: "INV-20250926-0002", customer: "Michael Lee", amount: "180.00", status: "Pending" },
    { id: "INV-20250926-0001", customer: "Sarah Brown", amount: "310.50", status: "Paid" },
  ];

  return (
    <div style={styles.container}>
      {/* Welcome Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Hi, {internalUser?.username || "Admin"}!</h1>
        <p style={styles.subtitle}>Welcome back, here's a look at your business today.</p>
      </div>

      {/* KPI Cards */}
      <div style={styles.cardsContainer}>
        <div style={styles.card}>
          <div style={{...styles.iconWrapper, backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#16a34a'}}>
            <FaDollarSign size={24} />
          </div>
          <p style={styles.cardLabel}>Total Sales (Today)</p>
          <p style={styles.cardValue}>Rs. {sampleStats.totalSales}</p>
        </div>
        <div style={styles.card}>
          <div style={{...styles.iconWrapper, backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6'}}>
            <FaUserPlus size={24} />
          </div>
          <p style={styles.cardLabel}>New Customers</p>
          <p style={styles.cardValue}>{sampleStats.newCustomers}</p>
        </div>
        <div style={styles.card}>
          <div style={{...styles.iconWrapper, backgroundColor: 'rgba(249, 115, 22, 0.1)', color: '#f97316'}}>
            <FaFileInvoice size={24} />
          </div>
          <p style={styles.cardLabel}>Invoices Today</p>
          <p style={styles.cardValue}>{sampleStats.invoicesToday}</p>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={styles.mainContent}>
        {/* Recent Activity Table */}
        <div style={styles.activitySection}>
          <h3 style={styles.sectionTitle}>Recent Activity</h3>
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Invoice ID</th>
                  <th style={styles.th}>Customer</th>
                  <th style={styles.th}>Amount</th>
                  <th style={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((item) => (
                  <tr key={item.id}>
                    <td style={styles.td}>{item.id}</td>
                    <td style={styles.td}>{item.customer}</td>
                    <td style={styles.td}>Rs. {item.amount}</td>
                    <td style={styles.td}>
                      <span style={{...styles.statusBadge, ...(item.status === 'Paid' ? styles.statusPaid : styles.statusPending)}}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sales Chart Placeholder */}
        <div style={styles.chartSection}>
          <h3 style={styles.sectionTitle}>Sales This Week</h3>
          <div style={styles.chartPlaceholder}>
            <p>Your sales chart will be displayed here.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// 💡 A completely new, modern style object
const styles = {
  container: { padding: '24px', fontFamily: "'Inter', sans-serif" },
  header: { marginBottom: '24px' },
  title: { fontSize: '32px', fontWeight: 'bold', color: '#111827', margin: 0 },
  subtitle: { fontSize: '16px', color: '#6b7280', marginTop: '4px' },
  cardsContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginBottom: '24px' },
  card: {
    backgroundColor: '#fff',
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  iconWrapper: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '12px'
  },
  cardLabel: { fontSize: '14px', color: '#6b7280', margin: 0 },
  cardValue: { fontSize: '28px', fontWeight: 'bold', color: '#111827', margin: 0 },
  mainContent: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', alignItems: 'flex-start' },
  activitySection: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' },
  sectionTitle: { fontSize: '18px', fontWeight: '600', padding: '20px 24px', margin: 0, borderBottom: '1px solid #e5e7eb' },
  tableWrapper: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '12px 24px', textAlign: 'left', backgroundColor: '#f9fafb', fontWeight: '600', color: '#4b5563', fontSize: '12px', textTransform: 'uppercase' },
  td: { padding: '16px 24px', borderTop: '1px solid #e5e7eb' },
  statusBadge: { padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '500' },
  statusPaid: { backgroundColor: '#dcfce7', color: '#166534' },
  statusPending: { backgroundColor: '#ffedd5', color: '#9a3412' },
  chartSection: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' },
  chartPlaceholder: {
    height: '250px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9ca3af',
    fontStyle: 'italic',
    padding: '24px',
  },
};

export default DashboardView;