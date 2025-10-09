import React, { useState, useEffect, useCallback, useContext } from "react";
import { db, auth } from "../../firebase";
import { collection, query, where, orderBy, getDocs, Timestamp } from "firebase/firestore";
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

      const customersRef = collection(db, uid, "customers", "customer_list");
      const creditCustomersQuery = query(customersRef, where("isCreditCustomer", "==", true));

      const invoicesQuery = query(collection(db, uid, "invoices", "invoice_list"), where("createdAt", ">=", Timestamp.fromDate(startOfDay)), where("createdAt", "<=", Timestamp.fromDate(endOfDay)));
      const expensesQuery = query(collection(db, uid, "user_data", "expenses"), where("createdAt", ">=", startOfDay), where("createdAt", "<=", endOfDay));
      const itemsQuery = query(collection(db, uid, "items", "item_list"));
      
      const [creditCustomersSnap, invoicesSnap, expensesSnap, itemsSnap] = await Promise.all([
        getDocs(creditCustomersQuery),
        getDocs(invoicesQuery),
        getDocs(expensesQuery),
        getDocs(itemsQuery),
      ]);

      const creditCustomerIds = new Set(creditCustomersSnap.docs.map(doc => doc.id));
      
      // ✅ **FIX: Filter invoices to exclude credit sales but include credit repayments**
      const validInvoices = invoicesSnap.docs
        .map(d => d.data())
        .filter(inv => {
            const isCreditRepayment = inv.paymentMethod === 'Credit-Repayment';
            const isFromCreditCustomer = creditCustomerIds.has(inv.customerId);
            // This is the key: include income if it's a repayment OR if the sale is not from a credit customer
            return isCreditRepayment || !isFromCreditCustomer;
        });

      const allExpenses = expensesSnap.docs.map(d => d.data());
      const itemCostMap = new Map();
      itemsSnap.docs.forEach(d => {
        const itemData = d.data();
        if (itemData.pid) {
            // Using PID as a robust unique key for items
            itemCostMap.set(itemData.pid, itemData.costPrice || 0);
        }
      });
      
      const totalRevenue = validInvoices.reduce((sum, inv) => sum + inv.total, 0);
      const totalExpenses = allExpenses.reduce((sum, exp) => sum + exp.amount, 0);
      
      const totalCOGS = validInvoices.reduce((sum, inv) => {
        if (inv.paymentMethod === 'Credit-Repayment') return sum;
        
        const invoiceCOGS = inv.items.reduce((itemSum, item) => {
          // The itemId in the invoice should correspond to the PID of the item
          const cost = itemCostMap.get(item.itemId) || 0;
          return itemSum + (cost * item.quantity);
        }, 0);
        return sum + invoiceCOGS;
      }, 0);

      const grossProfit = totalRevenue - totalCOGS;
      const netIncome = grossProfit - totalExpenses;
      setKpiData({ totalRevenue, grossProfit, totalExpenses, netIncome });

      const dailySales = {};
      validInvoices.forEach(inv => {
        const date = inv.createdAt.toDate().toISOString().split('T')[0];
        if (!dailySales[date]) dailySales[date] = 0;
        dailySales[date] += inv.total;
      });
      const labels = [];
      let currentDate = new Date(startOfDay);
      while (currentDate <= endOfDay) {
        labels.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      const salesDataPoints = labels.map(label => dailySales[label] || 0);
      setSalesChartData({
        labels,
        datasets: [{ label: 'Daily Sales', data: salesDataPoints, borderColor: '#3498db', backgroundColor: 'rgba(52, 152, 219, 0.1)', fill: true, tension: 0.1 }]
      });

      const expenseCategories = {};
      allExpenses.forEach(exp => {
        const category = exp.category || 'Uncategorized';
        if (!expenseCategories[category]) expenseCategories[category] = 0;
        expenseCategories[category] += exp.amount;
      });
      setExpenseChartData({
        labels: Object.keys(expenseCategories),
        datasets: [{
          label: 'Expenses by Category',
          data: Object.values(expenseCategories),
          backgroundColor: ['#e74c3c', '#f1c40f', '#9b59b6', '#34495e', '#1abc9c', '#e67e22'],
          hoverOffset: 4
        }]
      });

    } catch (error) {
      console.error("Error fetching summary data:", error);
      alert("Failed to fetch summary data.");
    }
    setLoading(false);
  }, []);
  
  useEffect(() => {
    fetchDashboardData(dateFrom, dateTo);
  }, [dateFrom, dateTo, fetchDashboardData]);

  const KpiCard = ({ title, value, isLoading }) => (
    <div style={styles.kpiCard}>
      <h3 style={styles.kpiTitle}>{title}</h3>
      <p style={styles.kpiValue}>{isLoading ? "..." : `Rs. ${value.toFixed(2)}`}</p>
    </div>
  );

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>📑 Finance Summary</h2>
      <p style={styles.subHeader}>A financial overview of cash/card sales and credit repayments.</p>

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
        <KpiCard title="Total Revenue" value={kpiData.totalRevenue} isLoading={loading} />
        <KpiCard title="Gross Profit" value={kpiData.grossProfit} isLoading={loading} />
        <KpiCard title="Total Expenses" value={kpiData.totalExpenses} isLoading={loading} />
        <KpiCard title="Net Income" value={kpiData.netIncome} isLoading={loading} />
      </div>

      <div style={styles.graphsContainer}>
        <div style={styles.section}>
            <h3 style={styles.chartTitle}>Sales Trend</h3>
            {loading ? <p style={styles.loadingText}>Loading chart...</p> : 
                <div style={styles.chartWrapper}><Line options={{ responsive: true, plugins: { legend: { display: false }}}} data={salesChartData} /></div>}
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
  kpiCard: { backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  kpiTitle: { margin: 0, fontSize: '14px', color: '#6c757d', fontWeight: '500' },
  kpiValue: { margin: '8px 0 0 0', fontSize: '28px', color: '#2c3e50', fontWeight: '700' },
  graphsContainer: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginBottom: '24px' },
  chartTitle: { fontSize: '18px', fontWeight: '600', color: '#2c3e50', margin: '0 0 20px 0' },
  chartWrapper: { position: 'relative', height: '300px' },
  balancesContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' },
  balanceCard: { backgroundColor: '#f8f9fa', padding: '16px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e5e7eb' },
  balanceLabel: { color: '#2c3e50', fontWeight: '500' },
  balanceAmount: { color: '#2980b9', fontWeight: 'bold', fontSize: '18px' },
};

export default Summary;