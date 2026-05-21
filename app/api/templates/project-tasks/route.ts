import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

export async function GET() {
  const filePath = path.join(process.cwd(), 'public', 'templates', 'bulk-task-template.csv')
  const file = await readFile(filePath)

  return new NextResponse(file, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="bulk-task-template.csv"',
      'Cache-Control': 'no-store',
    },
  })
}
