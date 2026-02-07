import { create } from 'zustand'
import { apiUrl, authFetch } from '../lib/api'

interface Product {
  id: number
  name: string
  slug: string
  color_primary: string
  color_accent: string
  prompt_schema: string | null
  is_active: number
}

const PRODUCT_PALETTES: Record<string, Record<string, string>> = {
  'clone-ai': {
    '50': '#f5f3ff', '100': '#ede9fe', '200': '#ddd6fe', '300': '#c4b5fd',
    '400': '#a78bfa', '500': '#8b5cf6', '600': '#7c3aed', '700': '#6d28d9',
    '800': '#5b21b6', '900': '#4c1d95',
  },
  fyro: {
    '50': '#fff7ed', '100': '#ffedd5', '200': '#fed7aa', '300': '#fdba74',
    '400': '#fb923c', '500': '#f97316', '600': '#ea580c', '700': '#c2410c',
    '800': '#9a3412', '900': '#7c2d12',
  },
  fling: {
    '50': '#fdf2f8', '100': '#fce7f3', '200': '#fbcfe8', '300': '#f9a8d4',
    '400': '#f472b6', '500': '#ec4899', '600': '#db2777', '700': '#be185d',
    '800': '#9d174d', '900': '#831843',
  },
  zurna: {
    '50': '#ecfeff', '100': '#cffafe', '200': '#a5f3fc', '300': '#67e8f9',
    '400': '#22d3ee', '500': '#06b6d4', '600': '#0891b2', '700': '#0e7490',
    '800': '#155e75', '900': '#164e63',
  },
  impresso: {
    '50': '#ecfdf5', '100': '#d1fae5', '200': '#a7f3d0', '300': '#6ee7b7',
    '400': '#34d399', '500': '#10b981', '600': '#059669', '700': '#047857',
    '800': '#065f46', '900': '#064e3b',
  },
}

function applyProductPalette(slug: string): void {
  const palette = PRODUCT_PALETTES[slug]
  if (!palette) return

  const root = document.documentElement
  for (const [shade, color] of Object.entries(palette)) {
    root.style.setProperty(`--product-${shade}`, color)
  }
}

interface ProductState {
  products: Product[]
  activeProduct: Product | null
  loading: boolean

  loadProducts: () => Promise<void>
  setActiveProduct: (product: Product) => void
}

export const useProductStore = create<ProductState>()((set) => ({
  products: [],
  activeProduct: null,
  loading: false,

  loadProducts: async () => {
    set({ loading: true })
    try {
      const res = await authFetch(apiUrl('/api/products'))
      if (!res.ok) return
      const { products } = await res.json()
      const saved = localStorage.getItem('pixflow_product')
      const active = products.find((p: Product) => p.slug === saved) ?? products[0] ?? null
      set({ products, activeProduct: active, loading: false })
      if (active) applyProductPalette(active.slug)
    } catch {
      set({ loading: false })
    }
  },

  setActiveProduct: (product) => {
    localStorage.setItem('pixflow_product', product.slug)
    applyProductPalette(product.slug)
    set({ activeProduct: product })
  },
}))
