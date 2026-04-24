# Award Points System — Implementation Plan

## Overview

A bonus award layer on top of the existing task scoring system. Admins nominate users for exceptional work tied to a specific task. Each award type carries a configurable bonus point value that adds to the user's monthly score and appears as a permanent achievement on their profile, dashboard, performance page, and leaderboard.

---

## 1. Award Catalogue (Pre-defined)

| Award | Icon Concept | Description | Suggested Default Points |
|---|---|---|---|
| **Milestone Achieved** | 🏆 Gold trophy, burst animation | A task directly caused a measurable milestone (e.g., hitting 1,000 followers in a single month, a campaign generating 10× normal leads). | 50 |
| **Innovative Execution** | 💡 Glowing lightbulb pulse | Task was completed using a novel approach that saved time or amplified results beyond what the method was expected to deliver. | 40 |
| **Critical Problem Solver** | 🛡️ Shield with checkmark flash | Task resolved a blocker the team had been struggling with for an extended period, unblocking downstream work. | 45 |
| **Speed Champion** | ⚡ Lightning bolt streak | Task completed significantly ahead of deadline without sacrificing quality — measured against a hard due date. | 30 |
| **Quality Pioneer** | 💎 Diamond sparkle | Delivered on first attempt with zero revisions required. Raised the bar for what "done" looks like on the team. | 35 |
| **Team Catalyst** | 🔗 Chain link glow | Task unblocked or accelerated the work of two or more other team members. Dependency tasks cleared by this person. | 40 |
| **Impact Creator** | 📈 Rising chart pulse | Task produced a clear, quantifiable business outcome that went beyond its original scope or KPI target. | 50 |
| **Streak Master** | 🔥 Flame intensify loop | User has been a top-3 performer for three or more consecutive months. Awarded manually to recognise consistency. | 60 |
| **Above & Beyond** | ⭐ Star burst | Catch-all for extraordinary effort that doesn't fit another category — working extra hours, stepping in for a colleague, or volunteering for a hard task. | 35 |
| **First Blood** | 🥇 Medal swing | First person on the team to complete a brand-new type of task or initiative, paving the way for others. | 25 |

Admin can create additional award types from the settings page at any time.

---

## 2. Database Schema

### 2.1 New Table — `award_types`

```sql
CREATE TABLE "Marketing-PM-Tool".award_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text,
  badge_url     text,          -- URL to the GIF badge (Supabase Storage)
  bonus_points  int  NOT NULL DEFAULT 25,
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES "Marketing-PM-Tool".profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

### 2.2 New Table — `user_awards`

```sql
CREATE TABLE "Marketing-PM-Tool".user_awards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE CASCADE,
  award_type_id   uuid NOT NULL REFERENCES "Marketing-PM-Tool".award_types(id),
  task_id         uuid REFERENCES "Marketing-PM-Tool".tasks(id) ON DELETE SET NULL,
  awarded_by      uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id),
  note            text,          -- Admin's personalised message (optional)
  bonus_points    int  NOT NULL, -- Snapshot of points at time of award (award type may change later)
  month           int  NOT NULL, -- Which monthly score this bonus is applied to
  year            int  NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups by user and period
CREATE INDEX idx_user_awards_user  ON "Marketing-PM-Tool".user_awards(user_id);
CREATE INDEX idx_user_awards_month ON "Marketing-PM-Tool".user_awards(user_id, year, month);
```

### 2.3 Modify `monthly_scores` — Add Bonus Column

```sql
ALTER TABLE "Marketing-PM-Tool".monthly_scores
  ADD COLUMN IF NOT EXISTS bonus_points int NOT NULL DEFAULT 0;
```

> `score_earned` stays task-only. The display total shown everywhere = `score_earned + bonus_points`. The rank calculation also uses this combined total.

### 2.4 RLS Policies

- `award_types`: all authenticated users can `SELECT`; only admins can `INSERT / UPDATE / DELETE`.
- `user_awards`: users can `SELECT` their own rows; admins can `SELECT` all and `INSERT`.

### 2.5 Storage Bucket — `award-badges`

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('award-badges', 'award-badges', true);
```

All GIF badge files are stored here as public objects. Badge URLs are written into `award_types.badge_url`.

---

## 3. Points Calculation Changes

### 3.1 When an Award is Created

A server action / API route `POST /api/admin/awards`:
1. Inserts a row into `user_awards` (snapshot `bonus_points` from the award type at that moment).
2. Upserts the target user's `monthly_scores` row for the award's month/year, incrementing `bonus_points` by the snapshot value.
3. Re-runs rank calculation for that month/year via `calculate_monthly_scores(month, year)` — or a lighter UPDATE that re-ranks by `score_earned + bonus_points DESC`.

### 3.2 When an Award is Revoked (optional)

A `DELETE /api/admin/awards/[id]` route:
1. Reads the snapshot `bonus_points` from the row being deleted.
2. Decrements the corresponding `monthly_scores.bonus_points` by that amount.
3. Re-runs rank calculation.

### 3.3 Rank Calculation Update

Modify the `get_leaderboard` SQL function and `calculate_monthly_scores` to order by `(ms.score_earned + ms.bonus_points) DESC` instead of `ms.score_earned DESC`. The leaderboard return type gains a `bonus_points int` column.

---

## 4. API Routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/award-types` | List all award types (admin + users for display) |
| `POST` | `/api/admin/award-types` | Create a new award type |
| `PATCH` | `/api/admin/award-types/[id]` | Edit name / description / points / active status |
| `DELETE` | `/api/admin/award-types/[id]` | Soft-delete (set `is_active = false`) |
| `GET` | `/api/admin/awards` | List all awarded instances (admin view) |
| `POST` | `/api/admin/awards` | Award a user (body: user_id, award_type_id, task_id?, note?, month, year) |
| `DELETE` | `/api/admin/awards/[id]` | Revoke an award |
| `GET` | `/api/awards/me` | Fetch current user's awards (for dashboard + performance page) |
| `GET` | `/api/awards/leaderboard` | Fetch latest 5 + full award winners table |

---

## 5. Admin Settings Page — `/admin/settings`

Add a third tab **"Awards"** alongside the existing point-config tabs.

### Awards Tab Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Awards & Bonus Points                          [+ New Award]│
├─────────────────────────────────────────────────────────────┤
│  [Badge GIF]  Milestone Achieved                            │
│               Gets 1000+ followers in a month              │
│               Bonus: [ 50 ] pts    ● Active    [Edit][Del]  │
├─────────────────────────────────────────────────────────────┤
│  [Badge GIF]  Innovative Execution                          │
│               Novel approach that amplified results         │
│               Bonus: [ 40 ] pts    ● Active    [Edit][Del]  │
└─────────────────────────────────────────────────────────────┘
```

**New Award Modal** fields:
- Award Name *
- Description *
- Bonus Points * (number input)
- Upload Badge (GIF / PNG, max 2 MB) — stored in `award-badges` bucket
- Active toggle

---

## 6. Awarding a User — Flow

### Entry Points (Admin only)
1. **From `/admin/users/[id]`** — "Give Award" button in the user profile header.
2. **From `/tasks/[id]`** — "Award User" button in the task detail page (admin view only).

### Award Modal
```
┌──────────────────────────────────────┐
│  Give Award to [User Name]           │
│                                      │
│  Award Type  [dropdown of actives]   │
│  Linked Task [search / select]       │
│  Month/Year  [Apr 2026 ▾]            │
│  Note (optional)                     │
│  ─────────────────────────────────   │
│  Bonus points: +50 pts               │
│                                      │
│  [Cancel]              [Give Award]  │
└──────────────────────────────────────┘
```

On submit → `POST /api/admin/awards` → monthly_scores updated → scores re-ranked.

---

## 7. UI Changes by Page

### 7.1 User Dashboard (`/dashboard`)

Add a **"Your Awards"** card below the stat row, visible only if the user has ≥ 1 award.

```
┌────────────────────────────────────────────┐
│  🏅  Your Awards                           │
│                                            │
│  [🏆 gif]  Milestone Achieved  +50 pts     │
│            SEO Campaign · Apr 2026         │
│                                            │
│  [💡 gif]  Innovative Execution  +40 pts   │
│            Content Strategy · Mar 2026     │
└────────────────────────────────────────────┘
```

- Shows all awards (not just monthly).
- Each row: badge GIF (small 32px) + award name + bonus pts + linked task + month.

### 7.2 My Performance Page (`/performance`)

Add a permanent **"Awards & Recognition"** section between the trend chart and the task evidence panel.

```
┌──────────────────────────────────────────────────────────┐
│  Awards & Recognition                                    │
│                                                          │
│  [🏆]  Milestone Achieved    Apr 2026   +50 pts          │
│        SEO Campaign hit 1,000 followers in 3 weeks.      │
│                                                          │
│  [💡]  Innovative Execution  Mar 2026   +40 pts          │
│        Reused existing assets to cut production by 40%.  │
└──────────────────────────────────────────────────────────┘
```

- Filtered by selected Financial Year.
- Total bonus points for the FY shown as a metric card alongside Total Score.

### 7.3 Leaderboard Page (`/leaderboard`)

**Right Panel — Award Spotlight** (top 5 most recently awarded users)

```
┌──────────────────────────┐
│  🏅 Award Spotlight       │
│                           │
│  [Avatar] Jane D.         │
│  [🏆 gif badge large]     │
│  Milestone Achieved       │
│  +50 pts · Apr 2026       │
│                           │
│  [Avatar] Raj K.          │
│  [💡 gif badge large]     │
│  Innovative Execution     │
│  +40 pts · Apr 2026       │
│  ...                      │
│  [View All Awards ↓]      │
└──────────────────────────┘
```

**Below Leaderboard Table — Full Awards Table**

```
┌────────────────────────────────────────────────────────────────┐
│  All Awards                                                    │
├──────────┬────────────────────┬─────────────┬────────┬────────┤
│  User    │  Award             │  Task       │  Pts   │  Date  │
├──────────┼────────────────────┼─────────────┼────────┼────────┤
│  Jane D. │ 🏆 Milestone       │ SEO Camp.   │ +50    │ Apr 26 │
│  Raj K.  │ 💡 Innovative      │ Content Str │ +40    │ Apr 26 │
│  Priya S.│ 🛡️ Critical Solver │ API Migrate │ +45    │ Mar 26 │
└──────────┴────────────────────┴─────────────┴────────┴────────┘
```

- Table is not filtered by selected month — shows all time.
- Right panel shows the 5 most recent regardless of month filter.

---

## 8. Score Display Rule

Everywhere a score is displayed, the format becomes:

| Context | Before | After |
|---|---|---|
| Leaderboard rank score | `85 pts` | `85 pts` + `+50 🏅` badge if award exists |
| Dashboard stat card | `85 pts` | `135 pts` (combined, tooltip shows breakdown) |
| My Performance total | `Total Score: 85` | `Total Score: 135 (85 task + 50 award)` |
| Monthly score bar | Shows `score_earned` | Shows `score_earned + bonus_points` |

---

## 9. GIF Badge Library

Store all badges in the `award-badges` Supabase Storage bucket. Below is the full production library to be created (one animated GIF per award). Suggested dimensions: **120×120 px**, looping, < 200 KB each.

### Production Badges (10 pre-built)

| File Name | Animation Concept | Palette |
|---|---|---|
| `milestone.gif` | Gold trophy rises from base, burst of stars radiates outward, loops with slow glow | Gold `#FFD700`, white sparks |
| `innovative.gif` | Lightbulb flickers on, rays of light pulse outward, loops with gentle shimmer | Yellow `#FFF176`, electric blue `#40C4FF` |
| `critical-solver.gif` | Shield appears, checkmark draws itself inside, ripple effect outward | Deep blue `#1565C0`, silver `#B0BEC5` |
| `speed-champion.gif` | Lightning bolt strikes top-down, afterglow fades, loops with small crackle | Electric yellow `#FFEB3B`, white `#FFFFFF` |
| `quality-pioneer.gif` | Diamond rotates slowly, facets sparkle one by one, full glow loop | Cyan `#00E5FF`, white `#FFFFFF` |
| `team-catalyst.gif` | Three chain links lock together sequentially, golden lock-in flash | Orange `#FF6D00`, gold `#FFD740` |
| `impact-creator.gif` | Bar chart bars grow upward sequentially, ticker tape falls | Green `#00C853`, white confetti |
| `streak-master.gif` | Flame grows taller in 3 stages, ember particles float upward, loops | Deep red `#D32F2F`, orange `#FF6D00` |
| `above-beyond.gif` | Five-pointed star rotates and scales up, sparkles orbit it | Purple `#7C4DFF`, gold `#FFD700` |
| `first-blood.gif` | Gold medal swings on ribbon, catches light at bottom of swing, loops | Gold `#FFD700`, red `#C62828` ribbon |

### Future Award Badge Templates (5 blank templates)

For admin-created awards that don't yet have a custom badge, provide 5 generic animated badge templates:

| File Name | Style |
|---|---|
| `badge-blue.gif` | Blue hexagonal badge, rotating shimmer |
| `badge-green.gif` | Green circular seal, pulse animation |
| `badge-purple.gif` | Purple diamond, slow spin |
| `badge-gold.gif` | Gold ribbon badge, wave animation |
| `badge-red.gif` | Red shield, flash animation |

When an admin creates a new award and doesn't upload a badge, the system assigns `badge-gold.gif` by default.

> **Recommended tool**: Create badges using Adobe After Effects → export as GIF via Photoshop, or use LottieFiles (Lottie JSON → GIF conversion). Alternatively, use Canva's animation export for quick production.

---

## 10. Implementation Steps (Ordered)

### Phase 1 — Database & API (Backend)
1. Write and run migration: create `award_types`, `user_awards`, alter `monthly_scores` (add `bonus_points`), create `award-badges` bucket, add RLS policies.
2. Seed `award_types` with the 10 pre-built awards and their default points.
3. Modify `get_leaderboard` and `calculate_monthly_scores` SQL functions to include `bonus_points` in ranking.
4. Build all 8 API routes listed in Section 4.

### Phase 2 — Admin Settings (Award Management)
5. Add **Awards tab** to `/admin/settings` with the award management table.
6. Build **New Award / Edit Award** modal with badge upload to Supabase Storage.

### Phase 3 — Award Giving Flow
7. Add **Give Award** button to `/admin/users/[id]` profile header.
8. Add **Award User** button to `/tasks/[id]` detail page (admin-only).
9. Build the **Award Modal** component.

### Phase 4 — User-Facing UI
10. Add **"Your Awards"** card to `/dashboard` (member view).
11. Add **"Awards & Recognition"** section to `/performance` page.
12. Update score displays on dashboard, performance, and leaderboard to show `score_earned + bonus_points`.

### Phase 5 — Leaderboard Updates
13. Add **Award Spotlight** right panel to `/leaderboard` (latest 5 awardees with large badges).
14. Add **Full Awards Table** section below the leaderboard rankings table.
15. Wire up **"View All Awards"** anchor link from the spotlight panel to the full table.

### Phase 6 — Badges
16. Create / commission all 10 production GIF badges + 5 template badges.
17. Upload to `award-badges` Supabase Storage bucket.
18. Seed `award_types.badge_url` with the correct public URLs.

---

## 11. Open Questions / Decisions Needed

| # | Question | Options |
|---|---|---|
| 1 | Can an admin award the same award to the same user for the same task twice? | Allow (different months) / Block entirely |
| 2 | Should awards appear in the monthly score for the month they were **given** or the month the **task was due**? | Recommend: month of the task's due_date |
| 3 | Should revoked awards be hard-deleted or soft-deleted (kept for audit)? | Recommend: soft-delete with `revoked_at` column |
| 4 | Should team members be able to nominate each other (peer nominations → admin approves)? | Phase 2 feature |
| 5 | Maximum awards per user per month? | No cap / Cap at 3 |
