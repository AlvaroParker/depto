CREATE TABLE expense_kinds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 60),
  icon_key TEXT NOT NULL CHECK (icon_key IN (
    'house', 'building', 'water', 'electricity', 'gas', 'internet', 'groceries',
    'food', 'cleaning', 'appliances', 'furniture', 'repairs', 'transport', 'health',
    'pets', 'education', 'other', 'children', 'car', 'gift', 'travel', 'clothing',
    'fitness', 'entertainment'
  )),
  sort_order INTEGER NOT NULL UNIQUE CHECK (sort_order > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO expense_kinds (id, name, icon_key, sort_order, created_at, updated_at) VALUES
  ('kind-rent', 'Arriendo', 'house', 1, '2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z'),
  ('kind-common-expenses', 'Gastos comunes', 'building', 2, '2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z'),
  ('kind-water', 'Agua', 'water', 3, '2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z'),
  ('kind-electricity', 'Luz', 'electricity', 4, '2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z'),
  ('kind-gas', 'Gas', 'gas', 5, '2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z'),
  ('kind-internet', 'Internet', 'internet', 6, '2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z'),
  ('kind-groceries', 'Supermercado', 'groceries', 7, '2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z'),
  ('kind-food', 'Comida', 'food', 8, '2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z'),
  ('kind-cleaning', 'Limpieza', 'cleaning', 9, '2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z'),
  ('kind-appliances', 'Electrodomésticos', 'appliances', 10, '2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z'),
  ('kind-furniture', 'Muebles', 'furniture', 11, '2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z'),
  ('kind-repairs', 'Reparaciones', 'repairs', 12, '2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z'),
  ('kind-transport', 'Transporte', 'transport', 13, '2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z'),
  ('kind-health', 'Salud', 'health', 14, '2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z'),
  ('kind-pets', 'Mascotas', 'pets', 15, '2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z'),
  ('kind-education', 'Educación', 'education', 16, '2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z'),
  ('kind-other', 'Otros', 'other', 17, '2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z');

ALTER TABLE expenses
ADD COLUMN kind_id TEXT REFERENCES expense_kinds(id) ON DELETE RESTRICT;

UPDATE expenses SET kind_id = 'kind-other' WHERE kind_id IS NULL;

CREATE INDEX idx_expenses_kind ON expenses(kind_id);

CREATE TRIGGER expenses_require_kind_insert
BEFORE INSERT ON expenses
FOR EACH ROW
WHEN NEW.kind_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'expenses require a kind');
END;

CREATE TRIGGER expenses_require_kind_update
BEFORE UPDATE OF kind_id ON expenses
FOR EACH ROW
WHEN NEW.kind_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'expenses require a kind');
END;
