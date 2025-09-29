// StockManagement.js
import React, { useEffect, useState } from "react";
import { db } from "../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

const StockManagement = ({ internalUser }) => {
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchStock = async () => {
    if (!internalUser) return;
    setLoading(true);
    try {
      const q = query(collection(db, "stockBalance"), where("uid", "==", internalUser.uid));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStock(data);
    } catch (error) {
      console.error("Error fetching stock:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStock();
  }, [internalUser]);

  return (
    <div>
      <h3>Stock Balance</h3>
      {loading ? <p>Loading...</p> :
        <table border="1" cellPadding="6" cellSpacing="0">
          <thead>
            <tr>
              <th>Item</th>
              <th>Total Quantity</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {stock.map(s => (
              <tr key={s.id}>
                <td>{s.item}</td>
                <td>{s.quantity}</td>
                <td>{s.updatedAt?.toDate().toLocaleString() || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    </div>
  );
};

export default StockManagement;
