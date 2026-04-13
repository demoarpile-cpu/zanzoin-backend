const db = require('./config/db');

async function checkAndPatch() {
  try {
    const [columns] = await db.query("DESCRIBE purchase_requests");
    const hasItems = columns.some(c => c.Field === 'items');
    
    if (!hasItems) {
      console.log("Adding items column...");
      await db.query("ALTER TABLE purchase_requests ADD COLUMN items JSON AFTER category, MODIFY item_name VARCHAR(255) NULL, MODIFY quantity INT NULL");
      console.log("Column added successfully.");
    } else {
      console.log("Items column already exists.");
      await db.query("ALTER TABLE purchase_requests MODIFY item_name VARCHAR(255) NULL, MODIFY quantity INT NULL");
      console.log("Constraints updated.");
    }
    process.exit(0);
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  }
}

checkAndPatch();
