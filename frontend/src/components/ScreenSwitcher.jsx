import React from 'react';
import { LayoutDashboard, Focus } from 'lucide-react';

export default function ScreenSwitcher({ screen, onChange, autoRotate, onToggleAuto }) {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'spotlight', label: 'Spotlight', icon: Focus },
  ];

  return (
    <div className="flex items-center gap-2">
      <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1">
        {tabs.map(t => {
          const Icon = t.icon;
          const active = screen === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                onChange(t.id); 
                // If the user manually clicks "Dashboard", stop the auto-rotation
                // so they can actually read the data.
                if (t.id === 'dashboard' && autoRotate) {
                  onToggleAuto(); 
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={onToggleAuto}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
          autoRotate
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-slate-900 border-slate-800 text-slate-400'
        }`}
        title="Auto-cycle every 60s"
      >
        {autoRotate ? 'Auto · 30s/60s' : 'Auto off'}
      </button>
    </div>
  );
}