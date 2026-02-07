import { type ReactNode } from 'react'
import { useDropzone, type Accept } from 'react-dropzone'
import { Upload } from 'lucide-react'

interface DropZoneProps {
  accept?: Accept
  maxFiles?: number
  onDrop: (files: File[]) => void
  children?: ReactNode
  className?: string
}

export function DropZone({ accept, maxFiles, onDrop, children, className = '' }: DropZoneProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    maxFiles,
    onDrop,
  })

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors duration-150 ${
        isDragActive
          ? 'border-brand-500 bg-brand-500/10'
          : 'border-surface-200 hover:border-surface-300 hover:bg-surface-50'
      } ${className}`}
    >
      <input {...getInputProps()} />
      {children || (
        <div className="flex flex-col items-center gap-2 text-surface-400">
          <Upload className="w-8 h-8" />
          <p className="text-sm">
            {isDragActive ? 'Drop files here' : 'Drag & drop files, or click to browse'}
          </p>
        </div>
      )}
    </div>
  )
}
