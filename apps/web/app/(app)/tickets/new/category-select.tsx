"use client";

import { useState, useEffect } from "react";

type Category = {
  id: string;
  name: string;
  client: { id: string; name: string };
};

type Subcategory = {
  id: string;
  name: string;
};

const selectClass =
  "w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-sm text-white outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20";

export default function CategorySelect({
  categories,
  isSuperAdmin,
}: {
  categories: Category[];
  isSuperAdmin: boolean;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!categoryId) {
      setSubcategories([]);
      return;
    }

    setLoading(true);
    fetch(`/api/subcategories?categoryId=${categoryId}`)
      .then((res) => res.json())
      .then((data: Subcategory[]) => setSubcategories(data))
      .catch(() => setSubcategories([]))
      .finally(() => setLoading(false));
  }, [categoryId]);

  return (
    <>
      <div>
        <label htmlFor="categoryId" className="block text-sm font-medium text-zinc-400 mb-2">
          Categoria <span className="text-red-400">*</span>
        </label>
        <select
          id="categoryId"
          name="categoryId"
          required
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={selectClass}
        >
          <option value="">Selecciona categoria</option>
          {isSuperAdmin
            ? Object.entries(
                categories.reduce<Record<string, Category[]>>((acc, cat) => {
                  const key = cat.client.name;
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(cat);
                  return acc;
                }, {})
              ).map(([clientName, cats]) => (
                <optgroup key={clientName} label={clientName}>
                  {cats.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </optgroup>
              ))
            : categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
        </select>
      </div>

      {categoryId && (
        <div>
          <label htmlFor="subcategoryId" className="block text-sm font-medium text-zinc-400 mb-2">
            Subcategoria
          </label>
          {loading ? (
            <p className="text-sm text-zinc-500">Cargando subcategorias...</p>
          ) : subcategories.length > 0 ? (
            <select
              id="subcategoryId"
              name="subcategoryId"
              className={selectClass}
            >
              <option value="">Sin subcategoria</option>
              {subcategories.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-zinc-500">No hay subcategorias para esta categoria</p>
          )}
        </div>
      )}
    </>
  );
}
