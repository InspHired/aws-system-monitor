import React, { useState, useRef, useEffect } from 'react';
import {
  AlertTriangle, ShieldAlert, X, Bell, ArrowRight
} from 'lucide-react';

const LEVEL = {
  crit: { label: 'CRITICAL', color: '#f43f5e', Icon: ShieldAlert },
  warn: { label: 'WARN',     color: '#f59e0b', Icon: AlertTriangle },
};

function formatVal(metric, value) {
  if (metric === 'status') return value.toUpperCase();
  return `${value}${metric === 'latency' ? 'ms' : '%'}`;
}

function formatRule(alert) {
  if (alert.metric === 'status') {
    return `is ${alert.value.toUpperCase()}`;
  }
  const unit = alert.metric === 'latency' ? 'ms' : '%';
  const verb = alert.op === '>' ? 'above' : 'below';
  return `${alert.metric.toUpperCase()} ${verb} ${alert.threshold}${unit} (now ${formatVal(alert.metric, alert.value)})`;
}

/* ── Alert Pop-up ──────────────────────────────────────────── */
export function AlertPopUp({ alerts, onJumpTo, onClose }) {
  if (!alerts.length) return null;

  const crits = alerts.filter(a => a.level === 'crit').length;
  const isCrit = crits > 0;
  
  const color = isCrit ? '#f43f5e' : '#f59e0b';
  const Icon = isCrit ? ShieldAlert : AlertTriangle;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-[fadeIn_200ms_ease-out]">
      <div 
        className="glass-panel border-2 rounded-2xl w-full max-w-md shadow-[0_0_50px_-12px_rgba(244,63,94,0.5)] overflow-hidden flex flex-col max-h-[80vh] animate-[slideUp_300ms_cubic-bezier(0.16,1,0.3,1)]"
        style={{ borderColor: color }}
      >
        
        {/* Header */}
        <div 
          className="px-5 py-5 border-b flex flex-col items-center text-center gap-2 shrink-0 relative overflow-hidden"
          style={{ borderColor: `${color}44`, background: `${color}15` }}
        >
          {/* Pulsing background effect */}
          <div 
            className="absolute inset-0 opacity-20 animate-pulse"
            style={{ background: `radial-gradient(circle, ${color} 0%, transparent 70%)` }}
          />
          
          <Icon className="w-10 h-10 animate-bounce" style={{ color }} />
          <h2 className="text-xl font-black text-white uppercase tracking-wider">
            {isCrit ? 'Critical Alert' : 'System Warning'}
          </h2>
          <p className="text-xs font-medium text-slate-300">
            {alerts.length} service{alerts.length > 1 ? 's' : ''} require immediate attention
          </p>
        </div>

        {/* List */}
        <div className="overflow-y-auto p-2">
          {alerts.map(a => {
            const c = LEVEL[a.level] || LEVEL.warn;
            const RowIcon = c.Icon;
            return (
              <div key={`${a.ruleId}:${a.serviceId}`} className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/10">
                <RowIcon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: c.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-100 truncate">{a.serviceName}</p>
                  <p className="text-xs text-slate-400 truncate">{formatRule(a)}</p>
                  <p className="text-[10px] uppercase tracking-wider font-bold mt-1" style={{ color: c.color }}>
                    {c.label} · for {a.forSamples} sample{a.forSamples === 1 ? '' : 's'}
                  </p>
                </div>
                <button
                  onClick={() => { onJumpTo(a.serviceId); onClose(); }}
                  className="shrink-0 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold text-white transition-colors border border-white/10"
                >
                  Investigate
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/10 bg-black/20 text-center shrink-0">
          <button onClick={onClose} className="text-xs font-semibold text-slate-400 hover:text-white transition-colors">
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Bell icon + dropdown ──────────────────────────────────── */
export function AlertBell({ alerts, onJumpTo, onAcknowledge }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const count = alerts.length;
  const hasCrit = alerts.some(a => a.level === 'crit');

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors glass-panel"
        title={count ? `${count} active alert${count === 1 ? '' : 's'}` : 'No alerts'}
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center shadow-lg"
            style={{ background: hasCrit ? '#f43f5e' : '#f59e0b' }}
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 max-h-[420px] overflow-y-auto glass-panel rounded-xl shadow-2xl z-40 animate-[slideDown_200ms_ease-out]">
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between sticky top-0 bg-slate-900/90 backdrop-blur-md z-10">
            <p className="text-xs font-semibold text-slate-200">
              {count ? `${count} active alert${count === 1 ? '' : 's'}` : 'No active alerts'}
            </p>
            {count > 0 && (
              <span className="text-[10px] text-slate-500">click to jump</span>
            )}
          </div>

          {count === 0 ? (
            <div className="px-3 py-8 text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-2">
                <Bell className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-xs text-slate-400">All clear. Rules are quiet.</p>
            </div>
          ) : (
            <ul className="py-1">
              {alerts.map(a => {
                const c = LEVEL[a.level] || LEVEL.warn;
                const { Icon } = c;
                return (
                  <li key={`${a.ruleId}:${a.serviceId}`} className="px-2 py-1">
                    <div className="flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-white/5 group transition-colors">
                      <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: c.color }} />
                      <button
                        onClick={() => { onJumpTo && onJumpTo(a.serviceId); setOpen(false); }}
                        className="flex-1 text-left min-w-0"
                      >
                        <p className="text-xs font-semibold text-slate-100 truncate">{a.serviceName}</p>
                        <p className="text-[11px] text-slate-400 truncate">{formatRule(a)}</p>
                        <p className="text-[10px] uppercase tracking-wider font-bold mt-0.5" style={{ color: c.color }}>
                          {c.label} · for {a.forSamples} sample{a.forSamples === 1 ? '' : 's'}
                        </p>
                      </button>
                      {onAcknowledge && (
                        <button
                          onClick={() => onAcknowledge(a.ruleId, a.serviceId)}
                          className="p-1 text-slate-500 hover:text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Dismiss until next trigger"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}