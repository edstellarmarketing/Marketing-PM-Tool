-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: the enforce_announcement_accept_shape() trigger uses is_admin() which
-- checks auth.uid(). API routes that use the service-role client (bypassing
-- RLS) have no auth.uid(), so is_admin() returns FALSE and the trigger
-- incorrectly blocks legitimate admin operations (PATCH on edit, etc.).
--
-- The trigger is meant to be a last line of defense against non-admin members
-- mutating things they shouldn't. Service-role calls originate from server
-- code we control and already enforce role via requireAdmin() before reaching
-- the DB, so they should pass through.
--
-- Adds: explicit `IF auth.uid() IS NULL` bypass at the top of the trigger.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".enforce_announcement_accept_shape()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Service role (no auth context) bypasses — API routes that use the
  -- service-role client have already verified the caller's role at the
  -- application layer.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF "Marketing-PM-Tool".is_admin() THEN
    RETURN NEW;
  END IF;

  -- Non-admin caller: only the accept transition is allowed.
  IF OLD.status <> 'open' OR NEW.status <> 'active' THEN
    RAISE EXCEPTION 'Only admins can modify an announcement outside the accept transition';
  END IF;
  IF NEW.accepted_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'accepted_by must equal the caller';
  END IF;
  IF NEW.accepted_at IS NULL OR NEW.accepted_task_id IS NULL THEN
    RAISE EXCEPTION 'accepted_at and accepted_task_id must be set when accepting';
  END IF;

  -- Pin the shape: no other column may change.
  IF NEW.title             IS DISTINCT FROM OLD.title
     OR NEW.description    IS DISTINCT FROM OLD.description
     OR NEW.departments    IS DISTINCT FROM OLD.departments
     OR NEW.due_date       IS DISTINCT FROM OLD.due_date
     OR NEW.priority       IS DISTINCT FROM OLD.priority
     OR NEW.task_type      IS DISTINCT FROM OLD.task_type
     OR NEW.complexity     IS DISTINCT FROM OLD.complexity
     OR NEW.category       IS DISTINCT FROM OLD.category
     OR NEW.award_type_id  IS DISTINCT FROM OLD.award_type_id
     OR NEW.bonus_points   IS DISTINCT FROM OLD.bonus_points
     OR NEW.score_weight   IS DISTINCT FROM OLD.score_weight
     OR NEW.created_by     IS DISTINCT FROM OLD.created_by
     OR NEW.expires_at     IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'Non-admins can only update accept fields (status, accepted_by, accepted_at, accepted_task_id)';
  END IF;

  RETURN NEW;
END;
$$;
