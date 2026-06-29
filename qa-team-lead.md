# QA Checklist — Team Lead role

Verifies the three-role model (see `features.md`). Run each row against four
actors and confirm the expected outcome at **both** the API and UI layers.

**Test actors**
- **A** — an admin.
- **TL** — a team lead of department *X* (`profiles.role='team_lead'`, `department='X'`).
- **TL-other** — a team lead of a *different* department *Y*.
- **M** — a plain member in department *X*.

**Setup:** as A, open `/admin`, set one user to **team lead** + department *X*
(this is the appoint step), another to team lead + department *Y*, and ensure a
member exists in *X*. Sign in as each actor in turn.

Legend: ✅ allowed / visible · ❌ denied (403 / redirect / hidden)

## A. Navigation & shell
| Check | A | TL | M |
|---|:--:|:--:|:--:|
| Badge shows correct role (purple / teal `team lead · X` / blue) | ✅ | ✅ | ✅ |
| Sidebar "Team" section visible | ✅ (Manage) | ✅ (Team) | ❌ |
| Point Settings / Email Settings / All Tasks in nav | ✅ | ❌ | ❌ |
| Personal items (My Tasks, My Performance, Attendance) | ❌ | ✅ | ✅ |
| Assign-Task / Create-Monthly-Tasks header buttons | ✅ | ✅ | ❌ |

## B. Users & roles
| Check | A | TL (X) | TL-other (Y) | M |
|---|:--:|:--:|:--:|:--:|
| `/admin` roster shows **all** users | ✅ | ❌ (only X) | ❌ (only Y) | ❌ redirect |
| Role / Department dropdowns editable | ✅ | ❌ (read-only) | ❌ | ❌ |
| Invite User button | ✅ | ❌ | ❌ | ❌ |
| Department Management tab | ✅ | ❌ | ❌ | ❌ |
| `PATCH /api/admin/users/:id {role}` | ✅ | ❌ 403 | ❌ 403 | ❌ 403 |
| Change **own** role | ❌ blocked | — | — | — |
| `/admin/users/:memberX` detail | ✅ | ✅ | ❌ redirect | ❌ |
| Deactivate member in X | ✅ | ✅ | ❌ | ❌ |
| **Remove** (delete) user | ✅ | ❌ hidden / denied | ❌ | ❌ |

## C. Tasks & approvals
| Check | A | TL (X) | TL-other (Y) | M |
|---|:--:|:--:|:--:|:--:|
| `GET /api/admin/tasks` rows | all | only X | only Y | ❌ 403 |
| Pending approvals queue | all | only X | only Y | own deps |
| Approve a member-X task (`/api/admin/tasks/:id/approve`) | ✅ | ✅ | ❌ 403 | ❌ |
| Approve a date-change request for X | ✅ | ✅ | ❌ | ❌ |
| Assign task to member X (`POST /api/tasks {user_id}`) | ✅ | ✅ | ❌ 403 | ❌ 403 |

## D. Attendance
| Check | A | TL (X) | TL-other (Y) | M |
|---|:--:|:--:|:--:|:--:|
| `/admin/attendance` list | all | only X | only Y | (empty) |
| Approve/reject a leave for member X | ✅ | ✅ | ❌ 403 | ❌ |
| Award attendance bonus | all members | only X | only Y | ❌ |

## E. Awards
| Check | A | TL (X) | TL-other (Y) | M |
|---|:--:|:--:|:--:|:--:|
| `GET /api/admin/awards` | all | only X | only Y | ❌ |
| Grant award to member X | ✅ | ✅ | ❌ 403 | ❌ |
| Revoke an award for member X | ✅ | ✅ | ❌ | ❌ |
| Define **award type** (`/api/admin/award-types`) | ✅ | ❌ 403 | ❌ | ❌ |

## F. Appraisals
| Check | A | TL (X) | TL-other (Y) | M |
|---|:--:|:--:|:--:|:--:|
| `/admin/appraisals` list | all | only X | only Y | ❌ |
| Generate/draft appraisal for member X | ✅ | ✅ | ❌ | ❌ |
| **Publish** appraisal (`/publish`) | ✅ | ❌ 403 (parked) | ❌ | ❌ |
| View **own** published appraisal | ✅ | ✅ | ✅ | ✅ |

## G. Announcements
| Check | A | TL (X) | TL-other (Y) | M |
|---|:--:|:--:|:--:|:--:|
| `/admin/announcements` list | all | own only | own only | ❌ |
| Create dept-X announcement | ✅ | ✅ | ❌ (only Y) | ❌ |
| Create **org-wide / multi-dept** announcement | ✅ | ❌ 403 | ❌ | ❌ |
| Edit / delete an announcement created by A | ✅ | ❌ 403 | ❌ | ❌ |
| Approve an acceptance on own announcement | ✅ | ✅ | ❌ | ❌ |

## H. Projects
| Check | A | TL-creator | TL-non-creator | M |
|---|:--:|:--:|:--:|:--:|
| Create project | ✅ | ✅ | ✅ | ❌ 403 |
| Edit project (`PATCH /api/projects/:id`) | ✅ | ✅ | ❌ 403 | ❌ |
| **Delete** project | ✅ | ❌ 403 | ❌ | ❌ |
| Manage owners / members | ✅ | ✅ (own) | ❌ | ❌ |
| Bulk-delete project tasks | ✅ | ✅ (own) | ❌ | ❌ |

## I. System (must stay admin-only)
| Check | A | TL | M |
|---|:--:|:--:|:--:|
| Point config (`/admin/settings`, `/api/admin/point-config`) | ✅ | ❌ | ❌ |
| Org score recalculation (`/api/admin/scores/recalculate`) | ✅ | ❌ | ❌ |
| Per-user recalc for member X (`/api/admin/users/:id/recalculate-scores`) | ✅ | ✅ (X only) | ❌ |
| Departments/categories CRUD (`/api/categories`) | ✅ | ❌ | ❌ |
| Email settings + test sends | ✅ | ❌ | ❌ |
| Cron endpoints (`/api/cron/*`) | secret only | ❌ | ❌ |
| AI team-insights | org | dept X only | ❌ |

## Cross-cutting edge cases
- **TL with no department:** every scoped query returns empty; award-bonus and
  announcement-create return "No department assigned"; roster shows "no
  department set". No crashes.
- **Direct URL access:** TL deep-linking `/admin/settings` or `/admin/all-tasks`
  → redirected to `/dashboard`.
- **API bypass attempt:** TL calling a cross-department record by id → 403, not
  empty 200 (confirms `canManage`/`canManageProject` gate, not just a filter).

## Known architectural note (not a bug)
For **projects** and **appraisals**, RLS is admin-only (migration 056); team-lead
authorization for those is enforced in the **route handler** + service-role
client, matching the existing `/api/admin/*` pattern. RLS is still the boundary
for direct client access. If DB-layer defense-in-depth for team leads is wanted,
add an RLS migration mirroring `manages_user()` / `canManageProject`.
