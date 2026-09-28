-- Inventar: lokacije u stablu, kategorije, stvari, slike i pozajmice.
CREATE TABLE locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER REFERENCES locations (id) ON DELETE RESTRICT,
  type TEXT NOT NULL DEFAULT 'kutija',
  name TEXT NOT NULL DEFAULT '',
  code TEXT UNIQUE COLLATE NOCASE,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX locations_parent ON locations (parent_id);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
INSERT INTO categories (name) VALUES
  ('Elektrika'), ('Elektronika'), ('Ručni alat'), ('Električni alat'), ('Alat na baterije'),
  ('Vodovod'), ('Pecanje'), ('Okov'), ('Potrošni materijal');

CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  category_id INTEGER REFERENCES categories (id) ON DELETE SET NULL,
  location_id INTEGER REFERENCES locations (id) ON DELETE RESTRICT,
  qty REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'kom',
  min_qty REAL,
  battery TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX items_location ON items (location_id);
CREATE INDEX items_category ON items (category_id);

-- Slike se čuvaju u bazi, pa ulaze u rezervne kopije.
CREATE TABLE photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('item', 'location')),
  owner_id INTEGER NOT NULL,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  thumb BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX photos_owner ON photos (owner_type, owner_id);

CREATE TABLE loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  borrower TEXT NOT NULL,
  since TEXT NOT NULL,
  returned_at TEXT,
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX loans_item ON loans (item_id);
