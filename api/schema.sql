-- Garissa County PIM Dashboard: citizen feedback database (SQLite; also valid for MySQL with minor type changes)
CREATE TABLE IF NOT EXISTS feedback (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  reference     TEXT NOT NULL UNIQUE,
  kind          TEXT NOT NULL,              -- Enquiry, Complaint, Compliment, Suggestion, Grievance (GRM)
  category      TEXT,
  project_id    TEXT,
  project       TEXT,
  department    TEXT,
  ward          TEXT,
  message       TEXT NOT NULL,
  anonymous     INTEGER NOT NULL DEFAULT 0,
  name          TEXT,                       -- personal data: never published
  email         TEXT,
  phone         TEXT,
  language      TEXT,
  received_at   TEXT NOT NULL,              -- ISO 8601, East Africa Time
  due_at        TEXT NOT NULL,              -- received_at + 7 days
  status        TEXT NOT NULL DEFAULT 'Received',   -- Received, Assigned, Responded, Closed
  response      TEXT,
  responded_at  TEXT,
  responded_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_project ON feedback(project_id);
