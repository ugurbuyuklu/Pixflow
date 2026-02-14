import type { ReactNode } from 'react'

interface BrandedNameProps {
  prefix: string
  suffix: string
  className?: string
  prefixClassName?: string
}

export function BrandedName({ prefix, suffix, className = '', prefixClassName = 'text-brand-500' }: BrandedNameProps) {
  return (
    <span className={className}>
      <span className={prefixClassName}>{prefix}</span>
      {suffix}
    </span>
  )
}

type NameDef = { prefix: string; suffix: string }

const CATEGORY_NAMES: Record<string, NameDef> = {
  prompts: { prefix: 'Prompt', suffix: 'Factory' },
  generate: { prefix: 'Asset', suffix: 'Monster' },
  img2video: { prefix: 'Img2', suffix: 'Engine' },
  avatars: { prefix: 'Avatar', suffix: 'Studio' },
  captions: { prefix: 'Cap', suffix: 'tions' },
  machine: { prefix: 'The', suffix: 'Machine' },
  lifetime: { prefix: 'Life', suffix: 'time' },
  history: { prefix: 'Lib', suffix: 'rary' },
  home: { prefix: 'Pix', suffix: 'flow' },
}

export function brandedName(id: string, prefixClassName?: string): ReactNode {
  const def = CATEGORY_NAMES[id]
  if (!def) return id
  return <BrandedName prefix={def.prefix} suffix={def.suffix} prefixClassName={prefixClassName} />
}

export function brandedPlainText(id: string): string {
  const def = CATEGORY_NAMES[id]
  if (!def) return id
  return `${def.prefix}${def.suffix}`
}
