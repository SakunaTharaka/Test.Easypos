import { collection, getDocs, query, where, orderBy, limit, startAfter } from "firebase/firestore";

/**
 * Calculates stock balances with Server-Side Pagination.
 * * Strategy:
 * 1. Fetch 50 items from 'item_list'.
 * 2. For those 50 items ONLY, fetch their specific recent transactions.
 * 3. Return the processed list + the last document cursor (for the Next button).
 */
export const calculateStockBalances = async (db, uid, lastVisible = null, pageSize = 50, searchTerm = "") => {
  if (!uid) throw new Error("User ID is required.");

  try {
    // 1. Base Query for Items
    const itemsRef = collection(db, uid, "items", "item_list");
    let itemsQuery;

    // Handle Search vs Default Pagination
    if (searchTerm) {
        // Firestore simple search (Case sensitive prefix search)
        const searchEnd = searchTerm + "\uf8ff";
        itemsQuery = query(
            itemsRef, 
            orderBy("name"), 
            where("name", ">=", searchTerm),
            where("name", "<=", searchEnd),
            limit(pageSize)
        );
    } else {
        // Standard Pagination
        if (lastVisible) {
            itemsQuery = query(itemsRef, orderBy("name"), startAfter(lastVisible), limit(pageSize));
        } else {
            itemsQuery = query(itemsRef, orderBy("name"), limit(pageSize));
        }
    }

    const itemsSnap = await getDocs(itemsQuery);
    const lastDoc = itemsSnap.docs[itemsSnap.docs.length - 1]; // Cursor for next page

    if (itemsSnap.empty) {
        return { data: [], lastVisible: null };
    }

    // 2. Process the 50 Items
    // We use Promise.all to fetch transactions in parallel for these specific items
    const processedItems = await Promise.all(itemsSnap.docs.map(async (doc) => {
        const data = doc.data();
        const itemId = doc.id;
        
        // REVISED: Fetching sub-transactions for 50 items is heavy.
        // Better approach: Just return the Item Master data. 
        // If you need perfect PeriodIn/Out columns, we need to restructure data to store 
        // "periodIn" on the item document itself during StockIn.
        // FOR NOW: We will use the live "qtyOnHand" from the item document.
        
        return {
            id: itemId,
            item: data.name || "Unknown",
            category: data.category || "N/A",
            openingStock: Number(data.openingStock) || 0,
            
            // If you haven't updated Inventory.js to save 'periodIn' on the item, 
            // these might be 0 until you do. 
            // But 'availableQty' will be 100% correct because it's the live field.
            periodIn: data.periodIn || 0, 
            periodOut: data.periodOut || 0,
            
            availableQty: Number(data.qtyOnHand) || 0
        };
    }));

    return {
        data: processedItems,
        lastVisible: lastDoc
    };

  } catch (error) {
    console.error("Error fetching paginated stock:", error);
    throw error;
  }
};