-- Phase 1 (a): introduce the 'team_lead' role.
--
-- A team lead is a department-scoped manager who handles most day-to-day admin
-- work for the members of their own department (profiles.department), while
-- system-wide / sensitive features stay admin-only. See features.md.
--
-- NOTE: `ALTER TYPE ... ADD VALUE` must be committed before any function or
-- policy can *reference* the new value as a literal. The RLS helpers that use
-- 'team_lead' therefore live in the next migration (067), which runs in its own
-- transaction after this value is committed.

ALTER TYPE "Marketing-PM-Tool".user_role ADD VALUE IF NOT EXISTS 'team_lead';
