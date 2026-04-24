interface Props {
  html: string
  className?: string
}

export default function RichTextView({ html, className = '' }: Props) {
  return (
    <div
      className={`rich-text text-sm text-gray-700 leading-relaxed ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
