CREATE TABLE household_information_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 80),
  icon_key TEXT NOT NULL CHECK (icon_key IN (
    'house', 'building', 'water', 'electricity', 'gas', 'internet', 'groceries',
    'food', 'cleaning', 'appliances', 'furniture', 'repairs', 'transport', 'health',
    'pets', 'education', 'other', 'children', 'car', 'gift', 'travel', 'clothing',
    'fitness', 'entertainment'
  )),
  provider_name TEXT CHECK (
    provider_name IS NULL OR length(trim(provider_name)) BETWEEN 1 AND 120
  ),
  customer_reference TEXT CHECK (
    customer_reference IS NULL OR length(trim(customer_reference)) BETWEEN 1 AND 120
  ),
  payment_url TEXT CHECK (
    payment_url IS NULL
    OR (length(payment_url) BETWEEN 1 AND 2048
      AND (payment_url LIKE 'https://%' OR payment_url LIKE 'http://%'))
  ),
  notes TEXT CHECK (notes IS NULL OR length(trim(notes)) BETWEEN 1 AND 2000),
  sort_order INTEGER NOT NULL UNIQUE CHECK (sort_order > 0),
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  FOREIGN KEY (created_by_user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_household_information_active_order
  ON household_information_items(archived_at, sort_order);

CREATE TABLE household_information_fields (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 60),
  value TEXT NOT NULL CHECK (length(trim(value)) BETWEEN 1 AND 500),
  display_type TEXT NOT NULL CHECK (display_type IN ('text', 'link')),
  sort_order INTEGER NOT NULL CHECK (sort_order > 0),
  CHECK (
    display_type = 'text'
    OR value LIKE 'https://%'
    OR value LIKE 'http://%'
  ),
  FOREIGN KEY (item_id) REFERENCES household_information_items(id) ON DELETE CASCADE,
  UNIQUE (item_id, sort_order)
);

CREATE UNIQUE INDEX idx_household_information_fields_label
  ON household_information_fields(item_id, lower(label));

CREATE INDEX idx_household_information_fields_order
  ON household_information_fields(item_id, sort_order);
