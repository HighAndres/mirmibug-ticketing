import Image from "next/image";

export default function AppLoading() {
  return (
    <div className="flex min-h-full items-center justify-center bg-[#0a0a0a]">
      <div className="flex flex-col items-center gap-4 animate-fade-in">
        {/* Logo animado */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-[#38d84e]/20 blur-xl animate-pulse" />
          <Image
            src="/branding/mirmibug-logo-green_sfondo.png"
            alt="Cargando..."
            width={64}
            height={64}
            className="relative animate-bounce-gentle"
            priority
          />
        </div>

        {/* Barra de carga */}
        <div className="w-32 h-1 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-[#38d84e] to-[#7CFF8D] animate-loading-bar" />
        </div>

        <p className="text-xs text-zinc-500 tracking-wide">Cargando...</p>
      </div>

      <style>{`
        @keyframes bounce-gentle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes loading-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes fade-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .animate-bounce-gentle {
          animation: bounce-gentle 1.5s ease-in-out infinite;
        }
        .animate-loading-bar {
          animation: loading-bar 1.2s ease-in-out infinite;
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
