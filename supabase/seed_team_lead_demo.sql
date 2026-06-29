-- Demo/seed helper: promote an existing user to team lead of a department.
-- NOT a migration — run manually (e.g. in the Supabase SQL editor) on staging.
-- The user must already exist (invited / signed up) before promoting.
--
-- Appointing a team lead = setting role='team_lead' + a non-null department.
-- Admins can also do this from the UI at /admin (role + department dropdowns).

-- 1) Promote by email — edit the two values below.
UPDATE "Marketing-PM-Tool".profiles AS p
SET role = 'team_lead',
    department = 'SEO'                       -- <-- target department
FROM auth.users u
WHERE u.id = p.id
  AND u.email = 'lead@example.com';          -- <-- target user

-- 2) (Optional) make sure the lead's department has at least one member to manage.
-- UPDATE "Marketing-PM-Tool".profiles AS p
-- SET department = 'SEO'
-- FROM auth.users u
-- WHERE u.id = p.id AND u.email = 'member@example.com' AND p.role = 'member';

-- 3) Verify the result.
SELECT u.email, p.full_name, p.role, p.department
FROM "Marketing-PM-Tool".profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.role = 'team_lead'
ORDER BY p.department, p.full_name;
