/**
 * Evaluate alert rules against a list of services.
 *
 * @param {Array} services   — [{ id, name, cpu, memory, latency, status, ... }]
 * @param {Array} rules      — [{ id, metric, op, value, forSamples, level }]
 * @param {Object} state     — { [ruleId]: { [serviceId]: { consecutive, firing } } }
 * @returns {{ fired: Array, state: Object }}
 */
export function evaluateRules(services, rules, state = {}) {
  const fired = [];
  const nextState = {};

  for (const rule of rules) {
    const prevRule = state[rule.id] || {};
    nextState[rule.id] = {};

    for (const svc of services) {
      const raw = svc[rule.metric];
      
      // Skip if the metric doesn't exist on this service
      if (raw === undefined || raw === null) continue;

      const prev = prevRule[svc.id] || { consecutive: 0, firing: false };
      
      // Evaluate the logic based on the operator
      let matches = false;
      if (rule.op === '>') matches = raw > rule.value;
      else if (rule.op === '<') matches = raw < rule.value;
      else if (rule.op === '===') matches = raw === rule.value;
      else if (rule.op === '!==') matches = raw !== rule.value;

      let consecutive = matches ? prev.consecutive + 1 : 0;
      let firing = prev.firing;

      // armed → firing transition
      if (!prev.firing && consecutive >= rule.forSamples) {
        firing = true;
        fired.push({
          ruleId: rule.id,
          serviceId: svc.id,
          serviceName: svc.name,
          metric: rule.metric,
          op: rule.op,
          threshold: rule.value,
          value: raw,
          level: rule.level,
          at: new Date(),
        });
      }

      // recovery: re-arm when the metric clears
      if (prev.firing && !matches) {
        firing = false;
      }

      nextState[rule.id][svc.id] = { consecutive, firing };
    }
  }

  return { fired, state: nextState };
}

/** Is this service currently flagged by any rule? Used for the flame icon. */
export function isFlagged(state, serviceId) {
  for (const ruleId in state) {
    if (state[ruleId]?.[serviceId]?.firing) return true;
  }
  return false;
}