import { useState } from "react";
import Sidebar from "./Sidebar.js";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-paper flex overflow-x-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="h-12 bg-[#0F172A] flex items-center px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 -ml-1 text-[#94A3B8] hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="ml-3 text-sm font-serif font-bold text-white">矩阵罗盘</h1>
        </header>

        <main className="flex-1">
          <div className="max-w-content mx-auto px-5 lg:px-10 py-6 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
