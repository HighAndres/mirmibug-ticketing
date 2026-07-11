"use client";

import { useRouter } from "next/navigation";

export default function ClientFilter({
  clients,
  currentClientId,
}: {
  clients: { id: string; name: string }[];
  currentClientId: string;
}) {
  const router = useRouter();

  return (
    <select
      value={currentClientId}
      onChange={(e) => {
        const val = e.target.value;
        router.push(val ? `/admin/categories?clientId=${val}` : "/admin/categories");
      }}
      className="rounded-xl border border-white/10 bg-[#15171c] px-3 py-2 text-sm text-white outline-none focus:border-[#38d84e]/50"
    >
      <option value="">Todos los clientes</option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
