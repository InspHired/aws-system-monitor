import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Server, Activity, AlertTriangle, CheckCircle2, RefreshCw,
  Cpu, HardDrive, Zap, Search, X, TrendingUp,
  Bell, Sun, Moon, Layers, Flame,
} from 'lucide-react';
import {
  LineChart, BarChart, DonutChart, Sparkline, Heatmap, PALETTE,
} from './components/Charts';
import ScreenSwitcher from './components/ScreenSwitcher';
import SpotlightView from './components/SpotlightView';
import RotationControls from './components/RotationControls';
import { AlertPopUp, AlertBell } from './components/AlertBanner';
import { useRotation } from './hooks/useRotation';
import { useAlertRules } from './hooks/useAlertRules';
import { isFlagged } from './lib/evaluateRules';

/* ------------------------------------------------------------
   STATUS
   ------------------------------------------------------------ */
const STATUS = {
  healthy:  { label: 'Healthy',  color: PALETTE.emerald, badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', Icon: CheckCircle2 },
  degraded: { label: 'Degraded', color: PALETTE.amber,   badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',   Icon: AlertTriangle },
  down:     { label: 'Down',     color: PALETTE.rose,    badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20',       Icon: AlertTriangle },
};
const getStatus = (s) => STATUS[s] || STATUS.down;

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
  const key = service.name.toLowerCase();
  return DISPLAY_NAMES[key] || service.name;
};

/* ------------------------------------------------------------
   HOOKS
   ------------------------------------------------------------ */
function useServices(intervalMs = 5000) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch(import.meta.env.VITE_API_URL || 'https://aws-system-monitor.onrender.com/api/v1/services');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setServices(await res.json());
      setLastUpdated(new Date());
      setError(null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { services, loading, error, lastUpdated, refreshing, refresh };
}

function useHistory(services, size = 24) {
  const [history, setHistory] = useState({});
  const [memHistory, setMemHistory] = useState({});
  const [latHistory, setLatHistory] = useState({});
  const [cluster, setCluster] = useState([]);
  const [timestamps, setTimestamps] = useState([]);

  useEffect(() => {
    if (!services.length) return;
    const now = new Date();
    const avg = services.reduce((a, c) => a + c.cpu, 0) / services.length;
    const max = Math.max(...services.map(s => s.cpu));
    const min = Math.min(...services.map(s => s.cpu));

    setHistory(prev => {
      const next = { ...prev };
      services.forEach(s => { next[s.id] = [...(next[s.id] || []), s.cpu].slice(-size); });
      return next;
    });

    setMemHistory(prev => {
      const next = { ...prev };
      services.forEach(s => { next[s.id] = [...(next[s.id] || []), s.memory].slice(-size); });
      return next;
    });

    setLatHistory(prev => {
      const next = { ...prev };
      services.forEach(s => { next[s.id] = [...(next[s.id] || []), s.latency].slice(-size); });
      return next;
    });

    setCluster(prev => [...prev, { avg: +avg.toFixed(1), max, min }].slice(-size));
    setTimestamps(prev => [
      ...prev,
      now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    ].slice(-size));
  }, [services, size]);

  return { history, memHistory, latHistory, cluster, timestamps };
}

function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((t) => {
    const id = Math.random();
    setToasts(x => [...x, { id, ...t }]);
    setTimeout(() => setToasts(x => x.filter(y => y.id !== id)), 4500);
  }, []);
  const remove = useCallback((id) => setToasts(x => x.filter(y => y.id !== id)), []);
  return { toasts, push, remove };
}

function useTransitions(services, pushToast) {
  const prev = useRef({});
  const [incidents, setIncidents] = useState([]);
  useEffect(() => {
    if (!services.length) return;
    const next = {};
    services.forEach(s => {
      const was = prev.current[s.id];
      next[s.id] = s.status;
      if (was && was !== s.status) {
        const cfg = getStatus(s.status);
        pushToast({
          title: getDisplayName(s),
          message: `${was} → ${s.status}`,
          variant: s.status === 'healthy' ? 'success' : s.status === 'degraded' ? 'warning' : 'error',
          icon: cfg.Icon,
        });
        setIncidents(x => [
          { id: Math.random(), name: getDisplayName(s), from: was, to: s.status, at: new Date(), source: 'backend' },
          ...x,
        ].slice(0, 20));
      }
    });
    prev.current = next;
  }, [services, pushToast]);
  return incidents;
}

/* ------------------------------------------------------------
   APP
   ------------------------------------------------------------ */
export default function App() {
  const { services, loading, error, lastUpdated, refreshing, refresh } = useServices();
  const { history, memHistory, latHistory, cluster, timestamps } = useHistory(services);
  const { toasts, push: pushToast, remove: removeToast } = useToasts();
  const incidents = useTransitions(services, pushToast);

  /* ---- rule fires merged into incident log ---- */
  const [ruleIncidents, setRuleIncidents] = useState([]);
  const rulesApi = useAlertRules(services, (fired) => {
    const lvl = fired.level === 'crit' ? 'error' : 'warning';
    
    let msg = '';
    if (fired.metric === 'status') {
      msg = `is ${fired.value.toUpperCase()} [${fired.level.toUpperCase()}]`;
    } else {
      const unit = fired.metric === 'latency' ? 'ms' : '%';
      msg = `${fired.metric.toUpperCase()} ${fired.op} ${fired.threshold}${unit} — now ${fired.value}${unit} [${fired.level.toUpperCase()}]`;
    }

    pushToast({
      title: fired.serviceName,
      message: msg,
      variant: lvl,
      icon: AlertTriangle,
    });
    
    setRuleIncidents(prev => [
      {
        id: Math.random(),
        name: fired.serviceName,
        from: 'ok',
        to: fired.level === 'crit' ? 'critical' : 'warn',
        at: fired.at,
        source: 'rule',
      },
      ...prev,
    ].slice(0, 20));
  });

  /* ---- Auto-rotating screens (30s dashboard, 30s spotlight) ---- */
  const [autoRotate, setAutoRotate] = useState(true);
  const rotation = useRotation(services, 30_000, 30_000, {
    autoStart: true,
    priority: (a, b) => {
      const w = (s) => s.status === 'down' ? 0 : s.status === 'degraded' ? 1 : 2;
      return w(a) - w(b) || a.name.localeCompare(b.name);
    },
  });

  /* ---- Pop-up state ---- */
  const [showAlertPopUp, setShowAlertPopUp] = useState(false);
  
  const prevAlertCount = useRef(0);
  useEffect(() => {
    if (rulesApi.activeAlerts.length > prevAlertCount.current) {
      setShowAlertPopUp(true);
    }
    prevAlertCount.current = rulesApi.activeAlerts.length;
  }, [rulesApi.activeAlerts.length]);

  /* ---- UI state ---- */
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('cpu');
  const [selectedId, setSelectedId] = useState(null);
  const [theme, setTheme] = useState('dark');
  const searchRef = useRef(null);

  /* ---- THEME EFFECT ---- */
  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light');
      document.body.classList.remove('dark');
    } else {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    }
  }, [theme]);

  /* ---- derived KPIs ---- */
  const activeIncidents = services.filter(s => s.status !== 'healthy').length;
  const avgCpu = services.length ? +(services.reduce((a, c) => a + c.cpu, 0) / services.length).toFixed(1) : 0;
  const avgMem = services.length ? +(services.reduce((a, c) => a + c.memory, 0) / services.length).toFixed(1) : 0;
  const avgLat = services.length ? Math.round(services.reduce((a, c) => a + c.latency, 0) / services.length) : 0;

  const cpuDelta = cluster.length > 5
    ? +(cluster[cluster.length - 1].avg - cluster[cluster.length - 6].avg).toFixed(1)
    : 0;

  const statusCounts = useMemo(() => ({
    healthy:  services.filter(s => s.status === 'healthy').length,
    degraded: services.filter(s => s.status === 'degraded').length,
    down:     services.filter(s => s.status === 'down').length,
  }), [services]);

  const topCpu = useMemo(() =>
    [...services].sort((a, b) => b.cpu - a.cpu).slice(0, 6)
      .map(s => ({ label: getDisplayName(s), value: s.cpu })),
    [services]);

  const topLatency = useMemo(() =>
    [...services].sort((a, b) => b.latency - a.latency).slice(0, 6)
      .map(s => ({ label: getDisplayName(s), value: s.latency, color: PALETTE.violet })),
    [services]);

  const heatmapRows = useMemo(() =>
    services.map(s => ({ id: s.id, label: getDisplayName(s), values: history[s.id] || [] })),
    [services, history]);

  const tableRows = useMemo(() => {
    let list = [...services];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s => 
        s.name.toLowerCase().includes(q) || 
        getDisplayName(s).toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      if (sortBy === 'cpu') return b.cpu - a.cpu;
      if (sortBy === 'latency') return b.latency - a.latency;
      if (sortBy === 'memory') return b.memory - a.memory;
      return getDisplayName(a).localeCompare(getDisplayName(b));
    });
    return list;
  }, [services, search, sortBy]);

  const selected = services.find(s => s.id === selectedId) || null;

  const allIncidents = useMemo(
    () => [...ruleIncidents, ...incidents].sort((a, b) => b.at - a.at).slice(0, 20),
    [ruleIncidents, incidents]
  );

  /* ---- keyboard shortcuts ---- */
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === '/' && !typing) {
        e.preventDefault(); searchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (selectedId) setSelectedId(null);
        else if (rotation.phase === 'spotlight') rotation.setPhase('dashboard');
      }
      if (rotation.phase === 'spotlight' && !typing) {
        if (e.key === 'ArrowRight') rotation.next();
        if (e.key === 'ArrowLeft')  rotation.prev();
        if (e.key === ' ') { e.preventDefault(); rotation.togglePause(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rotation.phase, selectedId, rotation]);

  /* ---- cluster line series ---- */
  const clusterSeries = cluster.length > 1 ? [
    { name: 'Average CPU', color: PALETTE.blue,    points: cluster.map(c => c.avg) },
    { name: 'Max CPU',     color: PALETTE.rose,    points: cluster.map(c => c.max) },
    { name: 'Min CPU',     color: PALETTE.emerald, points: cluster.map(c => c.min) },
  ] : [];

  /* ---- handlers ---- */
  const handleToggleAuto = () => {
    setAutoRotate(a => !a);
    rotation.togglePause();
  };

  const jumpToSpotlight = (id) => {
    if (id) rotation.goTo(id);
    if (!autoRotate) setAutoRotate(true);
  };

  return (
    <div className="min-h-screen text-slate-100 font-sans relative z-0">

      <div className="p-4 md:p-6 max-w-[1700px] mx-auto">

        {/* ============ HEADER ============ */}
        <Header
          lastUpdated={lastUpdated}
          refreshing={refreshing}
          onRefresh={refresh}
          theme={theme}
          onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          right={
            <>
              <AlertBell
                alerts={rulesApi.activeAlerts}
                onJumpTo={jumpToSpotlight}
                onAcknowledge={rulesApi.acknowledge}
              />
              <ScreenSwitcher
                screen={rotation.phase}
                onChange={rotation.setPhase}
                autoRotate={autoRotate}
                onToggleAuto={handleToggleAuto}
              />
            </>
          }
        />

        {/* ============ SCREEN: MAIN ============ */}
        {rotation.phase === 'dashboard' && (
          <>
            {/* KPI ROW */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <KpiTile
                label="Monitored Services"
                value={services.length}
                sub="Live from eu-north-1"
                icon={Layers}
                accent={PALETTE.blue}
              />
              <KpiTile
                label="Active Incidents"
                value={activeIncidents}
                sub={activeIncidents ? 'Needs attention' : 'All systems nominal'}
                icon={AlertTriangle}
                accent={activeIncidents ? PALETTE.rose : PALETTE.emerald}
                trend={activeIncidents > 0 ? 'bad' : 'good'}
              />
              <KpiTile
                label="Avg CPU"
                value={`${avgCpu}%`}
                sub={cpuDelta === 0 ? 'stable' : `${cpuDelta > 0 ? '+' : ''}${cpuDelta}% vs 5 samples ago`}
                icon={Cpu}
                accent={PALETTE.blue}
                trend={cpuDelta > 0 ? 'bad' : cpuDelta < 0 ? 'good' : 'neutral'}
                spark={cluster.map(c => c.avg)}
                sparkColor={PALETTE.blue}
              />
              <KpiTile
                label="Avg Memory"
                value={`${avgMem}%`}
                sub={`Latency avg ${avgLat}ms`}
                icon={HardDrive}
                accent={PALETTE.violet}
              />
            </section>

            {/* SYSTEM FLEET */}
            <FleetOverview services={services} onSelect={jumpToSpotlight} />

            {/* MAIN GRID */}
            <div className="grid grid-cols-12 gap-4">

              <Panel
                className="col-span-12 xl:col-span-8"
                title="Cluster CPU — Rolling 120s"
                subtitle="Average, max, and min across all instances"
                icon={Activity}
                right={
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">
                    {timestamps.length} samples
                  </span>
                }
              >
                <LineChart
                  series={clusterSeries}
                  labels={timestamps}
                  height={260}
                  yMax={Math.max(10, ...cluster.map(c => c.max))} 
                  ySuffix="%"
                />
              </Panel>

              <Panel
                className="col-span-12 xl:col-span-4"
                title="Health Distribution"
                subtitle="Current state of all services"
                icon={CheckCircle2}
              >
                <DonutChart
                  segments={[
                    { label: 'Healthy',  value: statusCounts.healthy,  color: PALETTE.emerald },
                    { label: 'Degraded', value: statusCounts.degraded, color: PALETTE.amber },
                    { label: 'Down',     value: statusCounts.down,     color: PALETTE.rose },
                  ]}
                  size={180}
                />
              </Panel>

              <Panel
                className="col-span-12 lg:col-span-6"
                title="Top CPU Consumers"
                subtitle="Highest utilization right now"
                icon={Cpu}
              >
                <BarChart data={topCpu} max={100} suffix="%" />
              </Panel>

              <Panel
                className="col-span-12 lg:col-span-6"
                title="Highest Latency"
                subtitle="Slowest response times (ms)"
                icon={Zap}
              >
                <BarChart data={topLatency} max={Math.max(...topLatency.map(d => d.value), 100)} suffix="ms" />
              </Panel>

              <Panel
                className="col-span-12"
                title="CPU Heatmap"
                subtitle="Per-instance utilization over time (darker = higher)"
                icon={Layers}
                right={
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    <span>low</span>
                    <span className="w-4 h-2 rounded-sm" style={{ background: 'rgba(244,63,94,0.2)' }} />
                    <span className="w-4 h-2 rounded-sm" style={{ background: 'rgba(244,63,94,0.5)' }} />
                    <span className="w-4 h-2 rounded-sm" style={{ background: 'rgba(244,63,94,0.85)' }} />
                    <span>high</span>
                  </div>
                }
              >
                <Heatmap rows={heatmapRows} cols={20} />
              </Panel>

              {allIncidents.length > 0 && (
                <Panel
                  className="col-span-12"
                  title="Recent Activity"
                  subtitle="Status changes and rule fires this session"
                  icon={Bell}
                >
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {allIncidents.slice(0, 12).map(i => {
                      const to = getStatus(i.to);
                      const isRule = i.source === 'rule';
                      return (
                        <div key={i.id} className="shrink-0 flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: isRule ? PALETTE.amber : to.color }} />
                          {isRule && (
                            <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1 py-0.5 rounded">
                              rule
                            </span>
                          )}
                          <span className="text-xs font-mono text-slate-300 truncate max-w-[140px]">{i.name}</span>
                          <span className="text-[10px] text-slate-500">
                            {isRule ? `${i.to}` : `${i.from} → ${i.to}`}
                          </span>
                          <span className="text-[10px] text-slate-600">{i.at.toLocaleTimeString()}</span>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              )}

              <Panel
                className="col-span-12"
                title="Instances"
                subtitle={`${tableRows.length} shown · click for spotlight`}
                icon={Server}
                right={
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        ref={searchRef}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search…  /"
                        className="w-44 bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-2 py-1.5 text-xs focus:outline-none focus:border-blue-500 placeholder:text-slate-500"
                      />
                    </div>
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value)}
                      className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                    >
                      <option value="cpu">CPU ↓</option>
                      <option value="memory">Memory ↓</option>
                      <option value="latency">Latency ↓</option>
                      <option value="name">Name</option>
                    </select>
                  </div>
                }
              >
                <InstanceTable
                  rows={tableRows}
                  history={history}
                  onSelect={jumpToSpotlight}
                  ruleState={rulesApi.state}
                />
              </Panel>

            </div>
          </>
        )}

        {/* ============ SCREEN: SPOTLIGHT ============ */}
        {rotation.phase === 'spotlight' && (
          <div className="animate-[fadeIn_300ms_ease-out]">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                  Spotlight mode
                </p>
                <p className="text-sm text-slate-300">
                  {autoRotate
                    ? `Auto-cycling every 30s · next in ${Math.max(0, Math.ceil((1 - rotation.progress) * 30))}s`
                    : 'Auto-cycle is off'}
                </p>
              </div>
              <RotationControls
                progress={rotation.progress}
                paused={rotation.paused || !autoRotate}
                onToggle={() => {
                  if (!autoRotate) setAutoRotate(true);
                  rotation.togglePause();
                }}
                onPrev={rotation.prev}
                onNext={rotation.next}
                index={rotation.index}
                total={rotation.items.length}
                intervalMs={30_000}
              />
            </div>

            <SpotlightView
              service={rotation.current}
              cpuHistory={rotation.current ? (history[rotation.current.id] || []) : []}
              memHistory={rotation.current ? (memHistory[rotation.current.id] || []) : []}
              latHistory={rotation.current ? (latHistory[rotation.current.id] || []) : []}
              audit={allIncidents.map(i => ({
                id: i.id,
                service_id: services.find(s => s.name === i.name)?.id,
                detail: i.source === 'rule' ? `Rule fired: ${i.to}` : `${i.from} → ${i.to}`,
                actor: i.source === 'rule' ? 'rule-engine' : 'system',
                at: i.at.toISOString(),
              }))}
              services={rotation.items}
              onJumpTo={(id) => rotation.goTo(id)}
              onBackToMain={() => rotation.setPhase('dashboard')}
            />
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 px-4 py-3 text-sm">
            Failed to load telemetry: {error}
          </div>
        )}
      </div>

      {/* ============ POP-UPS & OVERLAYS ============ */}
      {selected && (
        <DetailDrawer
          service={selected}
          history={history[selected.id] || []}
          onClose={() => setSelectedId(null)}
        />
      )}

      {showAlertPopUp && rulesApi.activeAlerts.length > 0 && (
        <AlertPopUp
          alerts={rulesApi.activeAlerts}
          onJumpTo={jumpToSpotlight}
          onClose={() => setShowAlertPopUp(false)}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}

/* ============================================================
   LAYOUT PRIMITIVES
   ============================================================ */
function Header({ lastUpdated, refreshing, onRefresh, theme, onToggleTheme, right }) {
  return (
    <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 pb-5 border-b border-slate-800/60 mb-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-blue-600 rounded-xl shadow-lg shadow-blue-900/50">
          <Server className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-white">
            Insphired Infrastructure
          </h1>
          <p className="text-slate-400 text-xs mt-0.5 flex items-center gap-2">
            <span>eu-north-1</span>
            <span className="text-slate-600">•</span>
            <span className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${refreshing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {right}
        <div className="hidden md:flex items-center gap-2 bg-slate-900/50 px-3 py-2 rounded-xl border border-slate-800">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[11px] text-emerald-400 font-medium">Live · 5s</span>
        </div>
        <button onClick={onToggleTheme} className="p-2 bg-slate-900/50 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors">
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-900/50 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Sync
        </button>
      </div>
    </header>
  );
}

function KpiTile({ label, value, sub, icon: Icon, accent, trend, spark, sparkColor }) {
  const trendColor =
    trend === 'good' ? 'text-emerald-400' :
    trend === 'bad'  ? 'text-rose-400' :
                       'text-slate-400';
  return (
    <div className="glass-panel relative rounded-2xl p-5 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: accent }} />
      <div className="flex items-start justify-between mb-2">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        <Icon className="w-4 h-4" style={{ color: accent }} />
      </div>
      <p className="text-2xl md:text-3xl font-bold text-white leading-tight">{value}</p>
      <p className={`text-[11px] mt-1 ${trendColor}`}>{sub}</p>
      {spark && spark.length > 1 && (
        <div className="mt-2 -mx-1">
          <Sparkline values={spark} color={sparkColor || accent} height={28} />
        </div>
      )}
    </div>
  );
}

function Panel({ title, subtitle, icon: Icon, right, children, className = '' }) {
  return (
    <section className={`glass-panel rounded-2xl p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2 min-w-0">
          {Icon && (
            <div className="p-1.5 bg-slate-800/60 rounded-lg shrink-0">
              <Icon className="w-3.5 h-3.5 text-slate-300" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white truncate">{title}</h2>
            {subtitle && <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/* ============================================================
   INSTANCE TABLE
   ============================================================ */
function InstanceTable({ rows, history, onSelect, ruleState }) {
  if (!rows.length) {
    return <div className="text-center py-10 text-slate-500 text-sm">No instances match.</div>;
  }
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
            <th className="w-8"></th>
            <th className="text-left font-semibold px-3 py-2">Service</th>
            <th className="text-left font-semibold px-3 py-2">Status</th>
            <th className="text-left font-semibold px-3 py-2 w-40">CPU</th>
            <th className="text-left font-semibold px-3 py-2 w-40">Memory</th>
            <th className="text-left font-semibold px-3 py-2">Trend</th>
            <th className="text-right font-semibold px-3 py-2">Latency</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(s => {
            const cfg = getStatus(s.status);
            const { Icon } = cfg;
            const spark = history[s.id] || [];
            const cpuColor = s.cpu > 80 ? PALETTE.rose : s.cpu > 50 ? PALETTE.amber : PALETTE.blue;
            const flagged = ruleState ? isFlagged(ruleState, s.id) : false;
            return (
              <tr
                key={s.id}
                onClick={() => onSelect(s.id)}
                className="border-b border-slate-800/40 hover:bg-slate-800/30 cursor-pointer transition-colors"
              >
                <td className="px-1 py-2.5 text-center">
                  {flagged && (
                    <Flame
                      className="w-3.5 h-3.5 text-rose-500 inline"
                      title="Alert rule firing"
                    />
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-100 truncate max-w-[160px]">{getDisplayName(s)}</span>
                    <span className="text-[10px] font-mono text-slate-500">{s.type}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.badge}`}>
                    <Icon className="w-3 h-3" /> {cfg.label}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-800/60 h-1.5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(s.cpu, 100)}%`, background: cpuColor }} />
                    </div>
                    <span className="text-[11px] font-mono text-slate-300 w-8 text-right">{s.cpu}%</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-800/60 h-1.5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(s.memory, 100)}%`, background: PALETTE.violet }} />
                    </div>
                    <span className="text-[11px] font-mono text-slate-300 w-8 text-right">{s.memory}%</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 w-24">
                  <Sparkline values={spark} color={cpuColor} height={22} fill={false} />
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[11px] text-slate-300">{s.latency}ms</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ============================================================
   DETAIL DRAWER
   ============================================================ */
function DetailDrawer({ service, history, onClose }) {
  const cfg = getStatus(service.status);
  const { Icon } = cfg;
  const avg = history.length ? (history.reduce((a, b) => a + b, 0) / history.length).toFixed(1) : '—';

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-full max-w-md glass-panel border-l border-white/10 z-50 p-6 overflow-y-auto shadow-2xl">
        <div className="flex justify-between items-start mb-6">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-white truncate">{getDisplayName(service)}</h2>
            <p className="text-xs font-mono text-slate-500 mt-1">{service.id}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-6 border ${cfg.badge}`}>
          <Icon className="w-3.5 h-3.5" /> {cfg.label}
        </div>
        <div className="space-y-1">
          <Row k="Type" v={service.type} />
          <Row k="CPU" v={`${service.cpu}%`} />
          <Row k="Memory" v={`${service.memory}%`} />
          <Row k="Latency" v={`${service.latency}ms`} />
          <Row k="Avg CPU (session)" v={`${avg}%`} />
        </div>
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> CPU History
          </h3>
          <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800">
            <LineChart
              series={[{ name: 'CPU', color: service.cpu > 80 ? PALETTE.rose : PALETTE.blue, points: history }]}
              height={140}
              yMax={100}
              ySuffix="%"
              showLegend={false}
            />
          </div>
        </div>
      </aside>
    </>
  );
}
function Row({ k, v }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-slate-800/70">
      <span className="text-sm text-slate-400">{k}</span>
      <span className="text-sm font-mono text-slate-200">{v}</span>
    </div>
  );
}

/* ============================================================
   TOASTS
   ============================================================ */
function ToastStack({ toasts, onDismiss }) {
  const variants = {
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    error:   'border-rose-500/30 bg-rose-500/10 text-rose-300',
  };
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(t => {
        const Icon = t.icon || Bell;
        return (
          <div key={t.id} className={`flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-2xl ${variants[t.variant] || variants.warning}`}>
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{t.title}</p>
              <p className="text-xs opacity-80">{t.message}</p>
            </div>
            <button onClick={() => onDismiss(t.id)} className="p-0.5 hover:bg-black/20 rounded">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   FLEET OVERVIEW
   ============================================================ */
function FleetOverview({ services, onSelect }) {
  if (!services.length) return null;

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">System Fleet</h2>
        <span className="text-[10px] bg-slate-800/80 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700/50">
          {services.length} Monitored
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {services.map(s => {
          const cfg = getStatus(s.status);
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className="group text-left relative overflow-hidden rounded-xl glass-panel hover:bg-white/5 transition-all p-3"
            >
              <div className={`absolute left-0 top-0 bottom-0 w-1`} style={{ background: cfg.color }} />
              <p className="text-xs font-bold text-white truncate pl-2">{getDisplayName(s)}</p>
              <div className="flex items-center gap-1.5 mt-1 pl-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.color }} />
                <span className="text-[10px] text-slate-400 capitalize">{cfg.label}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}