# My Performance Page Plan

## Goal

Turn `/performance` into a personal performance hub for each member. The page should answer four questions quickly:

1. How am I doing right now?
2. What changed over time?
3. What work contributed to my score?
4. What should I improve next?

Reorganize the page so the latest/current financial year is immediately useful, with clear scoring, trend, work evidence, and growth guidance.

## Primary Audience

- Member users checking their own performance.
- Admin users may use the same member-facing view to understand the member experience.

## Data Already Available

Use existing tables and types first:

- `monthly_scores`: monthly score, score possible, completion rate, rank, total tasks, completed tasks.
- Existing performance summary fields: total score, average monthly score, peak month, AI summary, strengths, growth areas.
- `tasks`: task status, due date, completion date, score weight, score earned, priority, category, approval status.
- `profiles`: name, designation, department, avatar.

Avoid adding new tables for the first version. If self-reflection, peer notes, or goal-level feedback are needed later, add them as a second phase.

## Recommended Page Structure

### 1. Header

Show:

- Page title: `My Performance`
- Subtitle: `Track your monthly scores, work evidence, and growth areas`
- Current financial year selector, defaulting to the current FY from `getCurrentFinancialYear()`.
- Optional action: `Export Summary` when the selected FY has enough performance data.

How to show:

- Use the same constrained layout as the app: `max-w-4xl mx-auto space-y-6`.
- Keep the FY selector on the right for desktop and below the title on mobile.
- Do not show admin-only controls here.

### 2. Current FY Summary

Show four high-signal metric tiles for the selected FY:

- `Total Score`: sum of selected FY `monthly_scores.score_earned`.
- `Average Monthly`: average monthly score for months with score records.
- `Completion Rate`: completed tasks divided by total tasks, or average of monthly completion rates.
- `Best Month`: highest scoring month, with score.

How to show:

- Use a 2x2 grid on mobile and 4 columns on desktop.
- Use restrained color bands already present in the app: blue for score, purple for average, green for best month, orange/yellow for improvement.
- Include tiny supporting text below each value, for example `Apr 2026 to Mar 2027`.

### 3. Rating Status

Show:

- Rating band based on average monthly score:
  - `90+`: Exceptional
  - `75-89`: Exceeds Expectations
  - `60-74`: Meets Expectations
  - `45-59`: Needs Improvement
  - `<45`: Underperforming
- Data coverage for the selected FY, for example `8 of 12 months available`.
- Last score update date when available.

How to show:

- Put this as a horizontal status strip below the metric tiles.
- Use the existing pill style from `performance/page.tsx`.
- If data is incomplete, explain with one line: `More monthly data will appear here as tasks are completed.`

### 4. Monthly Performance Trend

Show:

- Month-by-month score across the selected FY, April through March.
- Completion percentage for each month.
- Rank marker if rank exists.

How to show:

- Replace the small bar chart with the existing `ScoreHistoryChart` pattern or a FY-specific chart.
- Prefer a combined chart:
  - Solid blue line or bars for score.
  - Dashed purple line for completion percentage.
  - Tooltip with `score earned`, `score possible`, `completion rate`, `rank`, and `tasks completed`.
- Keep an empty month visible as a low-opacity placeholder so the FY timeline stays stable.

### 5. Task Evidence

Show a compact evidence section for the selected FY:

- Completed tasks count.
- In-progress tasks count.
- Overdue or blocked tasks count.
- Top scoring completed tasks, limited to 5.
- Category breakdown if categories are populated.

How to show:

- Use two columns on desktop:
  - Left: task status breakdown.
  - Right: top scoring completed work.
- Link each task title to `/tasks/[id]`.
- Use small status pills matching existing task colors.
- Keep this section factual and scannable; it should explain the score without duplicating the full task list.

### 6. Strengths and Growth Areas

Show:

- Performance summary.
- Strengths.
- Growth areas.

How to show:

- If summary fields exist, show them as concise performance insights.
- Use two side-by-side columns for strengths and growth areas on desktop.
- On mobile, stack strengths first, growth areas second.
- Use icon components from `lucide-react` instead of raw special characters.

### 7. Personal Improvement Focus

Show:

- One clear recommended focus for the next month.
- Supporting reason from the data, for example:
  - low completion rate,
  - repeated overdue tasks,
  - falling score trend,
  - no approved goals,
  - score possible is high but earned score is low.

How to show:

- Display as a simple full-width callout after strengths/growth areas.
- Keep it deterministic in version one. Do not require AI for this section.
- Example logic:
  - If completion rate is below 60%, focus on closing committed tasks.
  - If overdue tasks exist, focus on due-date discipline.
  - If score trend dropped for two consecutive months, focus on recovering score momentum.
  - Otherwise, focus on maintaining consistency.

### 8. Performance History

Show:

- Financial year.
- Total score.
- Average monthly score.
- Rating band.
- Data coverage.
- Best month.

How to show:

- Use a table on desktop.
- Use stacked cards on mobile.
- Make the selected FY row visually active.
- Clicking a row/card can update the FY selector or expand the full details inline.

## Empty States

### No Summary Yet

Use a helpful state that still allows members to see available score data:

- Title: `No performance summary yet`
- Body: `Your monthly scores and task progress will appear here as data becomes available.`
- Show current FY monthly score summary if `monthly_scores` exists.

### No Monthly Scores Yet

Show:

- Title: `No performance data yet`
- Body: `Scores are calculated after tasks are created and completed.`
- Link: `Go to My Tasks`

### No Tasks For Selected FY

Show:

- Title: `No task evidence for this financial year`
- Body: `Create or complete tasks to build your performance record.`

## Layout Priority

The first viewport should show:

1. Header and FY selector.
2. Current FY summary metric tiles.
3. Rating and data coverage status.
4. Top of the monthly trend chart.

Avoid starting the page with only old summary cards. Members should immediately see their current standing.

## Visual Direction

- Match the existing app style: white cards, light gray borders, Tailwind utility classes, blue/purple/green status colors.
- Keep cards to real content blocks only.
- Use icons from `lucide-react` for section labels and buttons.
- Avoid decorative gradients except where already used for leaderboard-style highlight panels.
- Keep charts compact but readable: 220-280px height.
- Ensure metric tiles do not resize based on number length.

## Suggested Implementation Phases

### Phase 1: Reorganize With Existing Data

- Add FY selector to `/performance`.
- Query current user's monthly scores and existing performance summary data.
- Compute selected FY summary metrics.
- Show current FY summary, rating status, monthly trend, performance insights, and history.
- Reuse `ScoreHistoryChart` or create a FY-specific chart component.

### Phase 2: Add Task Evidence

- Query tasks for the selected FY.
- Add status breakdown, top scoring completed tasks, and category breakdown.
- Link evidence items to task detail pages.

### Phase 3: Improve Export

- Add member-facing `Export Summary` button.
- Export the selected FY metrics, monthly trend, strengths, growth areas, and task evidence.
- Hide export when selected FY has no performance data.

### Phase 4: Optional Feedback Workflow

- Add employee self-reflection.
- Add peer or lead feedback notes.
- Add downloadable performance summary archive.

## Acceptance Criteria

- Members can understand their current FY performance from available score and task data.
- Performance summary content remains visible and clearly marked.
- The selected FY consistently filters monthly scores, tasks, evidence, and performance history.
- The page handles no snapshot, no scores, and no tasks without looking broken.
- The layout works on mobile and desktop.
- The implementation does not require new database tables for phase 1.
