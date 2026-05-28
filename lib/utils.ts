import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function isOverdue(dueDate: string | null | undefined, status: string): boolean {
  if (!dueDate || status === 'done') return false
  return new Date(dueDate) < new Date(new Date().toDateString())
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

// Domain acts as a display prefix: "Edstellar - LMS". Falls back to just the
// name for legacy projects that pre-date the domain column.
export function formatProjectName(p: { domain?: string | null; name: string }): string {
  return p.domain ? `${p.domain} - ${p.name}` : p.name
}

export function getCurrentFinancialYear(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  if (month >= 4) return `${year}-${String(year + 1).slice(2)}`
  return `${year - 1}-${String(year).slice(2)}`
}
