import { useProductStore } from '../../stores/productStore'

export function ProductSelector() {
  const { products, activeProduct, setActiveProduct } = useProductStore()

  if (products.length <= 1) return null

  return (
    <div className="border-b border-surface-100">
      <div className="max-w-6xl mx-auto px-8 py-2">
        <div className="flex gap-2">
          {products.map((product) => (
            <button
              key={product.id}
              onClick={() => setActiveProduct(product)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeProduct?.id === product.id
                  ? 'bg-brand-600 text-white'
                  : 'text-surface-400 hover:text-surface-900 hover:bg-surface-100'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: product.color_primary }}
              />
              {product.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
