// Mirrors server/aisles.js: the walking order through Thomas & Lote's AH
// Haarlemmerplein, used to group and label the combined shopping list (recipe
// ingredients + manual "Other groceries" items) and to offer a picker for
// changing a manual item's aisle. Keep in sync with the server list.

export const AISLES = [
  { key: 'spices', label: 'Spices', order: 1 },
  { key: 'fruit', label: 'Fruit', order: 2 },
  { key: 'vegetables', label: 'Vegetables', order: 3 },
  { key: 'fresh-meals', label: 'Fresh pasta & ready-made', order: 4 },
  { key: 'meat', label: 'Meat & fish', order: 5 },
  { key: 'cheese-deli', label: 'Cheese & deli', order: 6 },
  { key: 'bread', label: 'Bread', order: 7 },
  { key: 'carbs', label: 'Rice & pasta', order: 8 },
  { key: 'world-food', label: 'World food', order: 9 },
  { key: 'cereals', label: 'Cereals', order: 10 },
  { key: 'snacks', label: 'Chips & crackers', order: 11 },
  { key: 'tea', label: 'Tea & coffee', order: 12 },
  { key: 'dairy', label: 'Dairy', order: 13 },
  { key: 'drinks', label: 'Drinks', order: 14 },
  { key: 'misc', label: 'Other', order: 15 },
]

export const AISLE_KEYS = AISLES.map((a) => a.key)
export const AISLE_LABELS = Object.fromEntries(AISLES.map((a) => [a.key, a.label]))
