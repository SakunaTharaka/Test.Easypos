import React, { useState, useEffect, useCallback, useContext } from "react";
import { db, auth } from "../../firebase";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import { CashBookContext } from "../../context/CashBookContext";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement
);

const Summary = () => {
  const { cashBooks, cashBookBalances, loading: balancesLoading } = useContext(CashBookContext);
  const [loading, setLoading] = useState(true);
  
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d.toISOString().split('T')[0];
  });
  
  const [kpiData, setKpiData] = useState({ totalRevenue: 0, grossProfit: 0, totalExpenses: 0, netIncome: 0 });
  const [salesChartData, setSalesChartData] = useState({ labels: [], datasets: [] });
  const [expenseChartData, setExpenseChartData] = useState({ labels: [], datasets: [] });

  const fetchDashboardData = useCallback(async (from, to) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !from || !to) return;

    setLoading(true);
    try {
      const startOfDay = new Date(from); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(to); endOfDay.setHours(23, 59, 59, 999);
      const startTimestamp = Timestamp.fromDate(startOfDay);
      const endTimestamp = Timestamp.fromDate(endOfDay);

      // --- 1. DAILY STATS (Revenue & COGS) ---
      // Instead of querying thousands of invoices, we query the pre-calculated daily entries.
      const statsQuery = query(
        collection(db, uid, "daily_stats", "entries"),
        where("date", ">=", from),
        where("date", "<=", to)
      );

      // --- 2. EXPENSES (Operating Only) ---
      const expensesQuery = query(
        collection(db, uid, "user_data", "expenses"), 
        where("createdAt", ">=", startTimestamp), 
        where("createdAt", "<=", endTimestamp)
      );
      
      const [statsSnap, expensesSnap] = await Promise.all([
        getDocs(statsQuery),
        getDocs(expensesQuery)
      ]);

      // --- CALCULATIONS ---
      
      // 1. Process Stats (Sales & COGS)
      let totalRevenue = 0;
      let totalCOGS = 0;
      const dailySales = {}; // Map for chart: "YYYY-MM-DD": amount

      statsSnap.docs.forEach(doc => {
          const data = doc.data();
          const daySales = Number(data.totalSales) || 0;
          const dayCOGS = Number(data.totalCOGS) || 0;
          
          totalRevenue += daySales;
          totalCOGS += dayCOGS;

          if (data.date) {
              dailySales[data.date] = daySales;
          }
      });

      // 2. Process Expenses
      const allExpenses = expensesSnap.docs.map(d => d.data());
      const totalExpenses = allExpenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
      
      // 3. Financials
      const grossProfit = totalRevenue - totalCOGS;
      const netIncome = grossProfit - totalExpenses;

      setKpiData({ totalRevenue, grossProfit, totalExpenses, netIncome });

      // --- CHARTS GENERATION ---
      
      // A. Sales Chart (Daily Trend)
      const labels = [];
      let currentDate = new Date(startOfDay);
      
      // Generate all dates in range to fill gaps with 0
      while (currentDate <= endOfDay) {
        // Use 'en-CA' to match the "YYYY-MM-DD" format used in daily_stats
        const dateStr = currentDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
        labels.push(dateStr);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      const salesDataPoints = labels.map(label => dailySales[label] || 0);
      
      setSalesChartData({
        labels,
        datasets: [{ 
            label: 'Daily Sales', 
            data: salesDataPoints, 
            borderColor: '#3498db', 
            backgroundColor: 'rgba(52, 152, 219, 0.1)', 
            fill: true, 
            tension: 0.3 
        }]
      });

      // B. Expense Chart
      const combinedExpensesForChart = {};
      allExpenses.forEach(exp => {
        const category = exp.category || 'Uncategorized';
        if (!combinedExpensesForChart[category]) combinedExpensesForChart[category] = 0;
        combinedExpensesForChart[category] += exp.amount;
      });

      setExpenseChartData({
        labels: Object.keys(combinedExpensesForChart),
        datasets: [{
          label: 'Operating Expenses',
          data: Object.values(combinedExpensesForChart),
          backgroundColor: ['#e74c3c', '#f1c40f', '#9b59b6', '#34495e', '#1abc9c', '#e67e22', '#3498db'],
          hoverOffset: 4
        }]
      });

    } catch (error) {
      console.error("Error fetching summary data:", error);
      alert("Failed to fetch summary data. See console for details.");
    }
    setLoading(false);
  }, []);
  
  useEffect(() => {
    fetchDashboardData(dateFrom, dateTo);
  }, [dateFrom, dateTo, fetchDashboardData]);

  const getLightColor = (color) => {
      if(color === '#2980b9') return 'rgba(41, 128, 185, 0.1)'; 
      if(color === '#27ae60') return 'rgba(39, 174, 96, 0.1)';  
      if(color === '#e74c3c') return 'rgba(231, 76, 60, 0.1)';  
      if(color === '#16a085') return 'rgba(22, 160, 133, 0.1)'; 
      if(color === '#c0392b') return 'rgba(192, 57, 43, 0.1)';  
      return 'rgba(0,0,0,0.05)';
  };

  const KpiCard = ({ title, value, isLoading, color }) => (
    <div style={{
        ...styles.kpiCard, 
        backgroundColor: getLightColor(color), 
        border: `1px solid ${color || '#3498db'}`,
        borderLeft: `1px solid ${color || '#3498db'}` 
    }}>
      <h3 style={styles.kpiTitle}>{title}</h3>
      <p style={{...styles.kpiValue, color: color || '#2c3e50'}}>{isLoading ? "..." : `Rs. ${value.toFixed(2)}`}</p>
    </div>
  );

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>📑 Finance Summary</h2>
      <p style={styles.subHeader}>Real-time Profit & Loss Statement (Data sourced from Daily Stats & Expenses).</p>

      <div style={styles.section}>
        <div style={styles.controlsContainer}>
          <div style={styles.filterGroup}>
            <label>From Date</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={styles.input} />
          </div>
          <div style={styles.filterGroup}>
            <label>To Date</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={styles.input} />
          </div>
        </div>
      </div>
      
      <div style={styles.kpiContainer}>
        <KpiCard title="Total Revenue (Sales)" value={kpiData.totalRevenue} isLoading={loading} color="#2980b9" />
        <KpiCard title="Gross Profit (Rev - COGS)" value={kpiData.grossProfit} isLoading={loading} color="#27ae60" />
        <KpiCard title="Operating Expenses" value={kpiData.totalExpenses} isLoading={loading} color="#e74c3c" />
        <KpiCard title="Net Income" value={kpiData.netIncome} isLoading={loading} color={kpiData.netIncome >= 0 ? "#16a085" : "#c0392b"} />
      </div>

      <div style={styles.graphsContainer}>
        <div style={styles.section}>
            <h3 style={styles.chartTitle}>Sales Trend</h3>
            {loading ? <p style={styles.loadingText}>Loading chart...</p> : 
                <div style={styles.chartWrapper}><Line options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }}}} data={salesChartData} /></div>}
        </div>
        <div style={styles.section}>
            <h3 style={styles.chartTitle}>Expense Breakdown</h3>
            {loading ? <p style={styles.loadingText}>Loading chart...</p> : 
                <div style={styles.chartWrapper}><Doughnut options={{ responsive: true, maintainAspectRatio: false }} data={expenseChartData} /></div>}
        </div>
      </div>
      
      <div style={styles.section}>
          <h3 style={styles.chartTitle}>Cash Book Closing Balances</h3>
          <div style={styles.balancesContainer}>
              {balancesLoading ? <p>Loading balances...</p> : cashBooks.length > 0 ? cashBooks.map(book => (
                  <div key={book.id} style={styles.balanceCard}>
                      <span style={styles.balanceLabel}>{book.name}</span>
                      <span style={styles.balanceAmount}>Rs. {(cashBookBalances[book.id] || 0).toFixed(2)}</span>
                  </div>
              )) : <p>No cash books found.</p>}
          </div>
      </div>
    </div>
  );
};

const styles = {
  container: { padding: "24px", fontFamily: "'Inter', sans-serif" },
  title: { fontSize: "22px", marginBottom: "5px", color: "#2c3e50", fontWeight: "600" },
  subHeader: { color: '#6c757d', marginTop: 0, marginBottom: '20px' },
  section: { backgroundColor: '#fff', padding: '24px', borderRadius: '8px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  controlsContainer: { display: 'flex', gap: '24px', alignItems: 'flex-end', flexWrap: 'wrap' },
  filterGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  input: { padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' },
  loadingText: { textAlign: 'center', padding: '40px', color: '#7f8c8d' },
  kpiContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '24px' },
  kpiCard: { padding: '20px', borderRadius: '8px', boxShadow: 'none' }, 
  kpiTitle: { margin: 0, fontSize: '14px', color: '#6c757d', fontWeight: '500' },
  kpiValue: { margin: '8px 0 0 0', fontSize: '28px', fontWeight: '700' },
  graphsContainer: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginBottom: '24px' },
  chartTitle: { fontSize: '18px', fontWeight: '600', color: '#2c3e50', margin: '0 0 20px 0' },
  chartWrapper: { position: 'relative', height: '300px' },
  balancesContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' },
  balanceCard: { backgroundColor: '#f8f9fa', padding: '16px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e5e7eb' },
  balanceLabel: { color: '#2c3e50', fontWeight: '500' },
  balanceAmount: { color: '#2980b9', fontWeight: 'bold', fontSize: '18px' },
};

export default Summary;