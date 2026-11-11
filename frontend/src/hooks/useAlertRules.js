import { useState, useEffect, useRef, useCallback } from 'react';
import { evaluateRules } from '../lib/evaluateRules';

// Changed to :v2 to force the browser to forget the old rules!
const STORAGE_KEY = 'aws-dashboard:alert-rules:v2';

/* ──────────────────────────────────────────────────────────
   Background rule set
   ────────────────────────────────────────────────────────── */
const DEFAULT_RULES = [
  // 1. Instance Down (Triggers immediately, since it's a critical outage)
  { id: 'r1', metric: 'status',  op: '===', value: 'down', forSamples: 1, level: 'crit', enabled: true },
  
  // 2. CPU Over 70% (Must stay over 70 for 2 samples to avoid temporary spikes)
  { id: 'r2', metric: 'cpu',     op: '>',   value: 70,     forSamples: 2, level: 'warn', enabled: true },
];

function loadRules() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RULES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_RULES;
  } catch {
    return DEFAULT_RULES;
  }
}

export function useAlertRules(services, onFire) {
  const [rules, setRules] = useState(loadRules);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const stateRef = useRef({});
  const onFireRef = useRef(onFire);

  useEffect(() => { onFireRef.current = onFire; }, [onFire]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rules)); } catch {}
  }, [rules]);

  /* evaluate on every services tick */
  useEffect(() => {
    if (!services.length) return;
    const enabled = rules.filter(r => r.enabled !== false);
    const { fired, state } = evaluateRules(services, enabled, stateRef.current);
    stateRef.current = state;

    /* build the current active-alert set from state */
    const nowActive = [];
    enabled.forEach(rule => {
      const perService = state[rule.id] || {};
      Object.entries(perService).forEach(([serviceId, s]) => {
        if (!s.firing) return;
        const svc = services.find(x => x.id === serviceId);
        if (!svc) return;
        nowActive.push({
          ruleId: rule.id,
          serviceId,
          serviceName: svc.name,
          metric: rule.metric,
          op: rule.op,
          threshold: rule.value,
          value: svc[rule.metric],
          forSamples: rule.forSamples,
          level: rule.level,
          at: new Date(),
        });
      });
    });
    /* crit first, then warn; then by service name */
    nowActive.sort((a, b) => {
      const rank = (l) => l === 'crit' ? 0 : 1;
      return rank(a.level) - rank(b.level) || a.serviceName.localeCompare(b.serviceName);
    });
    setActiveAlerts(nowActive);

    /* fire callbacks for newly-triggered rules */
    if (fired.length && onFireRef.current) {
      fired.forEach(f => onFireRef.current(f));
    }
  }, [services, rules]);

  /* dismiss one alert (acknowledges it visually until next tick if still firing) */
  const acknowledge = useCallback((ruleId, serviceId) => {
    setActiveAlerts(prev =>
      prev.filter(a => !(a.ruleId === ruleId && a.serviceId === serviceId))
    );
  }, []);

  return {
    rules,
    activeAlerts,
    acknowledge,
    state: stateRef.current,
  };
}