const { Pool } = require('pg');
const { config } = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.isProduction
    ? { rejectUnauthorized: config.dbRejectUnauthorized }
    : false,
  max: config.dbPoolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

async function initDB() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS users (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        VARCHAR(100) NOT NULL,
      email       VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role        VARCHAR(20) DEFAULT 'member' CHECK (role IN ('admin','member')),
      created_at  TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS projects (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        VARCHAR(200) NOT NULL,
      description TEXT,
      color       VARCHAR(20) DEFAULT '#7c6af7',
      due_date    DATE,
      created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title       VARCHAR(300) NOT NULL,
      description TEXT,
      project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
      assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
      priority    VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
      status      VARCHAR(20) DEFAULT 'todo' CHECK (status IN ('todo','inprogress','done')),
      due_date    DATE,
      created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS activities (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      text       TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Create indexes for better query performance
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks(assignee_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check'
      ) THEN
        ALTER TABLE users
          ADD CONSTRAINT users_role_check CHECK (role IN ('admin','member'));
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tasks_priority_check'
      ) THEN
        ALTER TABLE tasks
          ADD CONSTRAINT tasks_priority_check CHECK (priority IN ('low','medium','high'));
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tasks_status_check'
      ) THEN
        ALTER TABLE tasks
          ADD CONSTRAINT tasks_status_check CHECK (status IN ('todo','inprogress','done'));
      END IF;
    END $$;
  `);

  // Seed demo data only in non-production environments
  if (!config.isProduction) {
    const { rows } = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(rows[0].count) === 0) {
      const bcrypt = require('bcryptjs');
      const adminHash  = await bcrypt.hash('admin123', 10);
      const memberHash = await bcrypt.hash('pass123', 10);

      const admin = await pool.query(
        `INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,'admin') RETURNING id`,
        ['Alex Chen','admin@pilot.com', adminHash]
      );
      const jane = await pool.query(
        `INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,'member') RETURNING id`,
        ['Jane Smith','jane@pilot.com', memberHash]
      );
      const bob = await pool.query(
        `INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,'member') RETURNING id`,
        ['Bob Wilson','bob@pilot.com', memberHash]
      );

      const aId = admin.rows[0].id, jId = jane.rows[0].id, bId = bob.rows[0].id;

      const p1 = await pool.query(
        `INSERT INTO projects (name,description,color,due_date,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        ['Website Redesign','Full redesign of company website','#7c6af7','2026-06-30',aId]
      );
      const p2 = await pool.query(
        `INSERT INTO projects (name,description,color,due_date,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        ['Mobile App v2','Second version of mobile app','#2dd98f','2026-07-15',aId]
      );
      const p3 = await pool.query(
        `INSERT INTO projects (name,description,color,due_date,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        ['Data Migration','Migrate legacy DB to cloud','#f5a623','2026-05-01',aId]
      );

      const p1Id = p1.rows[0].id, p2Id = p2.rows[0].id, p3Id = p3.rows[0].id;

      const tasks = [
        ['Design new homepage mockups','Create Figma mockups',p1Id,jId,'high','done','2026-04-20',aId],
        ['Set up component library','Bootstrap design system',p1Id,aId,'medium','inprogress','2026-05-15',aId],
        ['Write API documentation','Document REST endpoints',p1Id,bId,'low','todo','2026-05-30',aId],
        ['Push notification system','Implement FCM notifications',p2Id,aId,'high','inprogress','2026-05-10',aId],
        ['User onboarding flow','Design 5-step onboarding',p2Id,jId,'medium','todo','2026-06-01',aId],
        ['Schema analysis & mapping','Map legacy tables to new schema',p3Id,bId,'high','done','2026-04-10',aId],
        ['Write migration scripts','Python data transform scripts',p3Id,aId,'high','todo','2026-04-30',aId],
        ['QA testing on staging','Regression testing before cutover',p3Id,jId,'medium','todo','2026-04-25',aId],
      ];

      for (const t of tasks) {
        await pool.query(
          `INSERT INTO tasks (title,description,project_id,assignee_id,priority,status,due_date,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          t
        );
      }

      await pool.query(`INSERT INTO activities (text) VALUES ($1),($2),($3),($4),($5)`, [
        'Alex Chen created project Website Redesign',
        'Jane Smith completed task "Design new homepage mockups"',
        'Bob Wilson created task "Write API documentation"',
        'Alex Chen created project Mobile App v2',
        'Alex Chen created project Data Migration'
      ]);

      console.log('Demo data seeded');
    }
  }
  console.log('Database ready');
}

module.exports = { pool, query: (t,p) => pool.query(t,p), initDB };
