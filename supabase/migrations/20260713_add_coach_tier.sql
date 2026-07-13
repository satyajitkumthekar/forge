-- The coach tier: staff scoped to their assigned clients.
-- Added alone: an enum value cannot be used in the same transaction
-- that creates it. The role's plumbing lands in 20260713_coach_role.sql.
ALTER TYPE account_type ADD VALUE IF NOT EXISTS 'coach';
