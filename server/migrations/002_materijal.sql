-- Šifarnik materijala, lager i projekti sa delovima.
CREATE TABLE materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('metal', 'iverica', 'sper', 'drvo')),
  name TEXT NOT NULL,
  thickness REAL,
  has_grain INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX materials_kind ON materials (kind);

CREATE TABLE stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('metal', 'iverica', 'sper', 'drvo')),
  material_id INTEGER REFERENCES materials (id) ON DELETE RESTRICT,
  length REAL,
  width REAL,
  thickness REAL,
  grain TEXT NOT NULL DEFAULT 'l' CHECK (grain IN ('l', 'w', 'none')),
  planed INTEGER NOT NULL DEFAULT 0,
  qty INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX stock_kind ON stock (kind);
CREATE INDEX stock_material ON stock (material_id);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  done_at TEXT,
  done_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  stock_before TEXT
);

CREATE TABLE project_parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('metal', 'iverica', 'sper', 'drvo')),
  name TEXT NOT NULL DEFAULT '',
  material_id INTEGER REFERENCES materials (id) ON DELETE RESTRICT,
  any_wall INTEGER NOT NULL DEFAULT 0,
  length REAL,
  width REAL,
  thickness REAL,
  grain INTEGER NOT NULL DEFAULT 1,
  planed INTEGER NOT NULL DEFAULT 0,
  qty INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX project_parts_project ON project_parts (project_id);
CREATE INDEX project_parts_material ON project_parts (material_id);
