import { collection, getDocs, query } from "firebase/firestore";

/**
 * Calculates the current stock balance for all items.
 * This function fetches all stock-in and stock-out records and aggregates them.
 * @param {object} db - The Firestore database instance.
 * @param {string} uid - The user's unique ID.
 * @returns {Promise<Array>} A promise that resolves to an array of stock item objects.
 */
export const calculateStockBalances = async (db, uid) => {
  if (!uid) throw new Error("User ID (uid) is required for calculating stock balances.");

  try {
    const stockInSnap = await getDocs(query(collection(db, uid, "inventory", "stock_in")));
    const stockInData = stockInSnap.docs.map(doc => doc.data());

    const stockOutSnap = await getDocs(query(collection(db, uid, "inventory", "stock_out")));
    const stockOutData = stockOutSnap.docs.map(doc => doc.data());

    const itemsMap = {};

    // Process Stock In data
    stockInData.forEach((doc) => {
      if (Array.isArray(doc.lineItems)) {
        doc.lineItems.forEach((lineItem) => {
          const key = lineItem.name;
          if (!itemsMap[key]) {
            itemsMap[key] = {
              item: lineItem.name,
              category: lineItem.category || 'N/A',
              totalStockIn: 0,
              totalStockOut: 0,
            };
          }
          itemsMap[key].totalStockIn += Number(lineItem.quantity) || 0;
        });
      }
    });

    // Process Stock Out data
    stockOutData.forEach((out) => {
      const key = out.item;
      if (!key) return;

      if (!itemsMap[key]) {
        itemsMap[key] = {
          item: out.item,
          category: out.category || 'N/A',
          totalStockIn: 0,
          totalStockOut: 0,
        };
      }
      itemsMap[key].totalStockOut += Number(out.quantity) || 0;
    });

    // Calculate available quantity and return as a list
    const stockList = Object.keys(itemsMap).map((key) => ({
      ...itemsMap[key],
      availableQty: itemsMap[key].totalStockIn - itemsMap[key].totalStockOut,
    }));

    return stockList;
  } catch (error) {
    console.error("Error calculating stock balances:", error);
    // Re-throw the error so the calling component can handle it
    throw error;
  }
};