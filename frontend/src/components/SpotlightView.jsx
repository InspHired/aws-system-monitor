import React, { useMemo } from 'react';
import {
    Cpu, HardDrive, Zap, Activity, TrendingUp, TrendingDown,
    AlertTriangle, CheckCircle2, Clock, ArrowRight, ArrowLeft,
} from 'lucide-react';
import { LineChart, PALETTE } from './Charts';

/* ------------------------------------------------------------
   DISPLAY NAME MAPPING
   ------------------------------------------------------------ */
const DISPLAY_NAMES = {
  'amazon_linux_2-1': 'Insphired Worx',
  'insphired-jobs-v3': 'Jobot',
  'insphired-connect-v2': 'Insphired Connect',
};

const getDisplayName = (service) => {
  if (!service || !service.name) return 'Unknown';
  
  // Force lowercase to avoid case-sensitivity issues
  const key = service.name.toLowerCase();
  
  // Return mapped name, or fallback to original name
  return DISPLAY_NAMES[key] || service.name;
};
const STATUS = {
    healthy: { label: 'Healthy', color: PALETTE.emerald, badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', Icon: CheckCircle2 },
    degraded: { label: 'Degraded', color: PALETTE.amber, badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20', Icon: AlertTriangle },
    down: { label: 'Down', color: PALETTE.rose, badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20', Icon: AlertTriangle },
};
const getStatus = (s) => STATUS[s] || STATUS.down;

export default function SpotlightView({
    service, cpuHistory = [], memHistory = [], latHistory = [], audit = [], services = [], onJumpTo, onBackToMain,
}) {
    // Early return if no service is selected (prevents blank screen crash)
    if (!service) return <EmptySpotlight onBackToMain={onBackToMain} />;

    const cfg = getStatus(service.status);
    const { Icon } = cfg;

    // Safely calculate stats using cpuHistory
    const avgCpu = cpuHistory.length ? (cpuHistory.reduce((a, b) => a + b, 0) / cpuHistory.length).toFixed(1) : '—';
    const peakCpu = cpuHistory.length ? Math.max(...cpuHistory).toFixed(0) : '—';
    const delta = cpuHistory.length > 5
        ? +(cpuHistory[cpuHistory.length - 1] - cpuHistory[cpuHistory.length - 6]).toFixed(1)
        : 0;

    const siblings = services
        .filter(s => s.id !== service.id && s.type === service.type)
        .slice(0, 4);

    const relatedEvents = useMemo(
        () => audit.filter(e => e.service_id === service.id).slice(0, 6),
        [audit, service.id]
    );

    // Determine the Y-axis max dynamically so latency (e.g. 200ms) and % (e.g. 50%) fit nicely
    const maxLatency = Math.max(...latHistory, 100);
    const dynamicYMax = Math.max(100, maxLatency);

    return (
        <div>
            {onBackToMain && (
                <button
                    onClick={onBackToMain}
                    className="mb-4 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-100"
                >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
                </button>
            )}

            {/* HERO */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-900/40 border border-slate-800 rounded-3xl p-6 md:p-8 mb-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${cfg.badge}`}>
                                <Icon className="w-3 h-3" /> {cfg.label}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                                {service.type}
                            </span>
                        </div>
                        <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight truncate">
                            {getDisplayName(service)}
                        </h1>
                        <p className="text-xs font-mono text-slate-500 mt-2">{service.id}</p>
                    </div>

                    <div className="flex items-end gap-6 md:gap-10">
                        <BigNumber label="CPU" value={`${service.cpu}%`} color={PALETTE.blue} />
                        <BigNumber label="MEM" value={`${service.memory}%`} color={PALETTE.violet} />
                        <BigNumber label="P95" value={`${service.latency}ms`} color={PALETTE.cyan} />
                    </div>
                </div>
            </div>

            {/* TILES */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <Tile
                    label="Avg CPU (window)"
                    value={`${avgCpu}%`}
                    icon={Cpu}
                    accent={PALETTE.blue}
                    footer={
                        <span className={delta > 0 ? 'text-rose-400' : delta < 0 ? 'text-emerald-400' : 'text-slate-500'}>
                            {delta > 0
                                ? <TrendingUp className="inline w-3 h-3 mr-1" />
                                : <TrendingDown className="inline w-3 h-3 mr-1" />}
                            {delta > 0 ? '+' : ''}{delta}%
                        </span>
                    }
                />
                <Tile label="Peak CPU" value={`${peakCpu}%`} icon={Activity} accent={PALETTE.rose} />
                <Tile label="Memory" value={`${service.memory}%`} icon={HardDrive} accent={PALETTE.violet} />
                <Tile label="Latency" value={`${service.latency}ms`} icon={Zap} accent={PALETTE.cyan} />
            </div>

            {/* CHART + SIBLINGS */}
            <div className="grid grid-cols-12 gap-4 mb-4">
                <div className="col-span-12 xl:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h2 className="text-sm font-semibold text-white">Metrics — Rolling Window</h2>
                            <p className="text-[11px] text-slate-500">CPU, Memory, and Latency</p>
                        </div>
                    </div>
                    <LineChart
                        series={[
                            { name: 'CPU %', color: PALETTE.blue, points: cpuHistory },
                            { name: 'Memory %', color: PALETTE.violet, points: memHistory },
                            { name: 'Latency (ms)', color: PALETTE.cyan, points: latHistory }
                        ]}
                        yMax={dynamicYMax}
                        ySuffix="" // No % suffix since we mix ms and %
                        height={280}
                    />
                </div>

                <div className="col-span-12 xl:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-5">
                    <h2 className="text-sm font-semibold text-white mb-1">Same instance type</h2>
                    <p className="text-[11px] text-slate-500 mb-3">{siblings.length} peers · click to jump</p>
                    {siblings.length === 0 ? (
                        <div className="text-xs text-slate-600 py-6 text-center">No peers running this type.</div>
                    ) : (
                        <ul className="space-y-2">
                            {siblings.map(s => {
                                const c = getStatus(s.status);
                                return (
                                    <li key={s.id}>
                                        <button
                                            onClick={() => onJumpTo(s.id)}
                                            className="w-full flex items-center gap-3 bg-slate-950/60 hover:bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-left transition-colors"
                                        >
                                            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: c.color }} />
                                            <span className="flex-1 text-xs text-slate-200 truncate">{s.name}</span>
                                            <span className="text-[10px] font-mono text-slate-400">{s.cpu}%</span>
                                            <ArrowRight className="w-3 h-3 text-slate-600" />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>

            {/* EVENTS */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <h2 className="text-sm font-semibold text-white">Recent activity</h2>
                </div>
                {relatedEvents.length === 0 ? (
                    <p className="text-xs text-slate-600 py-4">No events recorded for this instance yet.</p>
                ) : (
                    <ul className="space-y-2">
                        {relatedEvents.map(e => (
                            <li key={e.id} className="flex items-center gap-3 text-xs bg-slate-950/60 rounded-lg px-3 py-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                <span className="text-slate-300 flex-1">{e.detail}</span>
                                <span className="text-slate-500 text-[10px]">{new Date(e.at).toLocaleTimeString()}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function BigNumber({ label, value, color }) {
    return (
        <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
            <p className="text-3xl md:text-4xl font-bold tabular-nums" style={{ color }}>{value}</p>
        </div>
    );
}

function Tile({ label, value, icon: Icon, accent, footer }) {
    return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: accent }} />
            <div className="flex items-start justify-between mb-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
                <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
            </div>
            <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
            {footer && <p className="text-[11px] mt-1">{footer}</p>}
        </div>
    );
}

function EmptySpotlight({ onBackToMain }) {
    return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
            <Activity className="w-10 h-10 text-slate-700 mb-4" />
            <p className="text-slate-400 font-medium">Nothing to spotlight</p>
            <p className="text-slate-600 text-sm mt-1">No instances available yet.</p>
            {onBackToMain && (
                <button
                    onClick={onBackToMain}
                    className="mt-4 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded-lg"
                >
                    Back to dashboard
                </button>
            )}
        </div>
    );
}