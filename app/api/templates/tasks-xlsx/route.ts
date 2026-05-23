import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getAuthUser } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Generates the bulk-tasks-template.xlsx (personal task bulk upload) with three sheets:
 *   1. "Tasks"        — header row + sample rows
 *   2. "Instructions" — how to use the template + per-column meanings
 *   3. "Reference"    — valid values for each constrained field, pulled live from the DB
 *
 * Mirrors the project bulk-upload template's structure. Dependencies are intentionally
 * NOT part of this template; they're added per-task on the regular /tasks/new form.
 */
export async function GET() {
  const { error: authError } = await getAuthUser()
  if (authError) return authError

  // Pull live values so the Reference tab matches what the create form's dropdowns show.
  const admin = createAdminClient()
  const [pointConfigRes, categoriesRes] = await Promise.all([
    admin.from('point_config').select('config_key, label, category').order('config_key'),
    admin.from('categories').select('name').order('name'),
  ])
  const pointRows = pointConfigRes.data ?? []
  const categoryNames = (categoriesRes.data ?? [])
    .map(c => c.name?.trim())
    .filter((s): s is string => !!s && s.length > 0)

  type PointRow = { config_key: string; label: string; category: string }
  const taskTypeRows = (pointRows as PointRow[])
    .filter(r => r.category === 'task_type' && r.config_key.startsWith('task_type_'))
    .map(r => ({ key: r.config_key.replace(/^task_type_/, ''), label: r.label }))
  const complexityRows = (pointRows as PointRow[])
    .filter(r => r.category === 'complexity' && r.config_key.startsWith('complexity_'))
    .map(r => ({ key: r.config_key.replace(/^complexity_/, ''), label: r.label }))

  const sampleTaskType = taskTypeRows[0]?.key ?? 'monthly_task'
  const sampleComplexity = complexityRows[0]?.key ?? 'medium'
  const sampleCategory = categoryNames[0] ?? 'Marketing'

  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Tasks ──────────────────────────────────────────────────────────
  const headers = [
    'S.No',
    'Title', 'Description', 'Category', 'Priority',
    'Task Type', 'Complexity',
    'Start Date', 'Due Date',
    'Sub-tasks',
  ]
  const sampleRows: (string | number)[][] = [
    [
      1,
      'Launch May newsletter',
      'Pull together this month\'s customer newsletter and send it through Mailchimp.',
      sampleCategory, 'High',
      sampleTaskType, sampleComplexity,
      '6/1/2026', '6/5/2026',
      'Draft subject line, Write hero section, Pick 3 stories, Schedule send',
    ],
    [
      2,
      'Refresh pricing page hero',
      'Update hero copy + screenshot for the new pricing tier.',
      categoryNames[1] ?? sampleCategory, 'Medium',
      sampleTaskType, sampleComplexity,
      '6/2/2026', '6/8/2026',
      'Rewrite headline, Capture screenshot, Push to staging',
    ],
    [
      3,
      'Q2 SEO audit fixes',
      'Apply remediations identified in the Q2 audit.',
      categoryNames[2] ?? sampleCategory, 'High',
      sampleTaskType, sampleComplexity,
      '5/28/2026', '6/10/2026',
      'Fix duplicate titles, Add missing alt text, Update sitemap',
    ],
    [
      4,
      'Design social ad set',
      'Three creative variations for the June campaign.',
      categoryNames[3] ?? sampleCategory, 'Medium',
      sampleTaskType, sampleComplexity,
      '6/3/2026', '6/9/2026',
      'Variation A, Variation B, Variation C, Hand off to media buyer',
    ],
    [
      5,
      'Weekly metrics dashboard',
      'Refresh the weekly Looker board with the latest numbers.',
      sampleCategory, 'Low',
      sampleTaskType, sampleComplexity,
      '6/4/2026', '6/4/2026',
      '',
    ],
    [
      6,
      'AI assistant prompt library',
      'Curate a starter pack of prompts for the marketing team.',
      categoryNames[1] ?? sampleCategory, 'Medium',
      sampleTaskType, sampleComplexity,
      '6/5/2026', '6/15/2026',
      'Outline categories, Write 10 prompts, Add usage examples',
    ],
  ]
  const tasksSheet = XLSX.utils.aoa_to_sheet([headers, ...sampleRows])
  tasksSheet['!cols'] = [
    { wch: 6 },  // S.No
    { wch: 32 }, // Title
    { wch: 60 }, // Description
    { wch: 16 }, // Category
    { wch: 10 }, // Priority
    { wch: 18 }, // Task Type
    { wch: 14 }, // Complexity
    { wch: 12 }, // Start Date
    { wch: 12 }, // Due Date
    { wch: 60 }, // Sub-tasks
  ]
  XLSX.utils.book_append_sheet(wb, tasksSheet, 'Tasks')

  // ── Sheet 2: Instructions ───────────────────────────────────────────────────
  const instructions: (string | number)[][] = [
    ['BULK TASK UPLOAD — HOW TO USE THIS TEMPLATE'],
    [''],
    ['1. Open the "Tasks" sheet (first tab).'],
    ['2. Replace the sample rows with your own. Keep the header row in row 1 unchanged.'],
    ['3. Save the file as .xlsx (or export to .csv) and upload via "Bulk Upload Tasks" on the New Task page.'],
    [''],
    ['IMPORTANT'],
    ['• Only the "Title" column is required. Every other column is optional.'],
    ['• "S.No" controls the order tasks appear on your /tasks page. Lowest number shows first. Leave it blank to use the row order.'],
    ['• Dates can be MM/DD/YYYY (US) or YYYY-MM-DD. Excel date cells are also accepted.'],
    ['• "Sub-tasks" are comma-separated. Example: "Outline, Draft, Review". Each item becomes a checklist row on the task.'],
    ['• Empty rows are skipped. Rows missing the Title will be flagged in the preview.'],
    ['• This template intentionally has NO dependency columns — add dependency tasks per-task on the regular New Task form.'],
    [''],

    ['INSTRUCTIONS PER COLUMN'],
    ['Field',              'Required?', 'What to enter',                                                                                                'If left blank'],

    ['A. S.No',            'No (rec.)', 'Whole number controlling display order on /tasks (e.g. 1, 2, 3 …). Lowest number appears first.',              'Falls back to the row order in the file.'],
    ['B. Title',           'Yes',       'A short task name (preferably under 80 chars). Shown as the row identifier in the preview.',                   'Row is skipped and shown as invalid in the preview.'],
    ['C. Description',     'No',        'Free-text details / context. Newlines are preserved.',                                                          'No description on the imported task.'],
    ['D. Category',        'No',        'Must match one of the categories listed on the Reference tab (e.g. Marketing, SEO, Content).',                  'Task is created with no category.'],
    ['E. Priority',        'No',        'One of: Low / Medium / High / Critical.',                                                                       'Defaults to Medium.'],
    ['F. Task Type',       'No',        'One of the active task types on the Reference tab (e.g. monthly_task, new_implementation, ai). Affects scoring.','No task type set — task will not contribute to score until set.'],
    ['G. Complexity',      'No',        'One of the active complexities on the Reference tab (e.g. easy, medium, difficult). Affects scoring.',          'No complexity set — task will not contribute to score until set.'],
    ['H. Start Date',      'No',        'When work begins. MM/DD/YYYY, YYYY-MM-DD, or an Excel date cell.',                                               'No start date set.'],
    ['I. Due Date',        'No (rec.)', 'Deadline. Same date formats as Start Date. Recommended for reporting.',                                          'Task is un-dated; reports treat it as having no deadline.'],
    ['J. Sub-tasks',       'No',        'Comma-separated checklist items. Example: "Outline, Draft, Review". Each becomes a checkbox on the task.',       'No sub-tasks attached.'],
    [''],

    ['NEED MORE DETAIL?'],
    ['• The "Reference" tab lists the live, accepted values for Category, Task Type, and Complexity (pulled from the database at download time).'],
    ['• Need a plaintext version? Use the "CSV" template from the same modal — same columns, no extra tabs.'],
  ]
  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions)
  instructionsSheet['!cols'] = [
    { wch: 22 }, // Field
    { wch: 10 }, // Required?
    { wch: 90 }, // What to enter
    { wch: 60 }, // If left blank
  ]
  XLSX.utils.book_append_sheet(wb, instructionsSheet, 'Instructions')

  // ── Sheet 3: Reference ──────────────────────────────────────────────────────
  const reference: (string | number)[][] = [
    ['REFERENCE — Accepted values and examples for every column'],
    ['Use this tab when filling in the Tasks sheet. Sections appear in the same column order.'],
    [''],

    ['─── A. S.No  (optional, integer — recommended for ordering) ───'],
    ['Guidance',  'Notes'],
    ['Purpose',   'Controls the display order of tasks on your /tasks page. Lowest number shows first.'],
    ['Format',    'Whole number (1, 2, 3 …). Decimals are rounded down.'],
    ['Blank',     'Falls back to the row order in the spreadsheet.'],
    ['Tip',       'Numbering does not have to start at 1; the imported batch is appended after any existing tasks, and the relative order between rows is what matters.'],
    [''],

    ['─── B. TITLE  (required, free text) ───'],
    ['Guidance',  'Notes'],
    ['Short',     'Aim for under 80 characters.'],
    ['Action verb', 'Start with a verb where natural — "Write May newsletter", "Refresh hero".'],
    ['Examples',  ''],
    ['',          'Launch May newsletter'],
    ['',          'Refresh pricing page hero'],
    ['',          'Q2 SEO audit fixes'],
    [''],

    ['─── C. DESCRIPTION  (optional, free text) ───'],
    ['Guidance',  'Notes'],
    ['Multi-line', 'Newlines are preserved on import.'],
    ['Length',    'No hard cap, but very long values are truncated in the preview.'],
    ['Examples',  ''],
    ['',          'Pull together this month\'s customer newsletter and send it through Mailchimp.'],
    ['',          'Apply remediations identified in the Q2 audit.'],
    [''],

    ['─── D. CATEGORY  (optional, must match a defined category) ───'],
    ['Value',     'Notes'],
    ['Match rule', 'Case-insensitive. Exact match preferred; close matches are accepted.'],
    ['Blank',     'Task is created with no category.'],
    [''],
    ['Defined category names — accepted values'],
    ['#',         'Name'],
    ...categoryNames.map((n, i) => [String(i + 1), n] as (string | number)[]),
    [''],
    ['Tip',       'Categories are managed by admins. Re-download the template if your team adds new ones.'],
    [''],

    ['─── E. PRIORITY  (optional enum, defaults to "Medium") ───'],
    ['Value',     'Notes'],
    ['Low',       'Nice-to-have / low impact.'],
    ['Medium',    'Default if left blank.'],
    ['High',      'Important and time-sensitive.'],
    ['Critical',  'Highest urgency.'],
    [''],

    ['─── F. TASK TYPE  (optional — affects scoring) ───'],
    ['Value',     'Label / notes'],
    ...(taskTypeRows.length > 0
      ? taskTypeRows.map(t => [t.key, t.label] as (string | number)[])
      : [['monthly_task', 'Monthly task'], ['new_implementation', 'New implementation'], ['ai', 'AI']] as (string | number)[][]),
    [''],
    ['Match rule', 'Case-insensitive. Enter the key (left column). The label is for context only.'],
    ['Blank',     'Task is created without a task type and will not contribute to score until set.'],
    [''],

    ['─── G. COMPLEXITY  (optional — affects scoring) ───'],
    ['Value',     'Label / notes'],
    ...(complexityRows.length > 0
      ? complexityRows.map(c => [c.key, c.label] as (string | number)[])
      : [['easy', 'Easy'], ['medium', 'Medium'], ['difficult', 'Difficult']] as (string | number)[][]),
    [''],
    ['Match rule', 'Case-insensitive. Enter the key (left column).'],
    ['Blank',     'Task is created without a complexity and will not contribute to score until set.'],
    [''],

    ['─── H. START DATE  (optional, date) ───'],
    ['Format',     'Example'],
    ['US slash',   '6/15/2026'],
    ['ISO',        '2026-06-15'],
    ['Excel date cell', 'Any cell formatted as a date in Excel works.'],
    ['Blank',      'No start date set — the task can begin immediately.'],
    ['Rule',       'Must be on or before Due Date if both are set.'],
    [''],

    ['─── I. DUE DATE  (optional, date — recommended) ───'],
    ['Format',     'Example'],
    ['US slash',   '6/30/2026'],
    ['ISO',        '2026-06-30'],
    ['Excel date cell', 'Any cell formatted as a date in Excel works.'],
    ['Blank',      'No deadline shown on the task row. Reporting will treat it as un-dated.'],
    [''],

    ['─── J. SUB-TASKS  (optional, comma-separated) ───'],
    ['Format',     'Notes'],
    ['Comma list', 'Each item before / after a comma becomes one checklist row. Trim whitespace; empty items are skipped.'],
    ['Example',    'Outline, Draft, Review, Publish'],
    ['Quotes',     'Wrap the whole cell in quotes when the description contains commas — Excel handles this automatically; CSV exports may need the quotes added manually.'],
    ['Limit',      'Up to 50 sub-tasks per row.'],
    ['Dates',      'Sub-task due dates are not supported in bulk upload. Add them on the task page after import if you need them.'],
    ['Blank',      'Task is created with no checklist.'],
  ]
  const referenceSheet = XLSX.utils.aoa_to_sheet(reference)
  referenceSheet['!cols'] = [{ wch: 20 }, { wch: 80 }]
  XLSX.utils.book_append_sheet(wb, referenceSheet, 'Reference')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="bulk-tasks-template.xlsx"',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
