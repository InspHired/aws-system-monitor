import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

export function useRotation(items, dashTime = 30_000, spotTime = 60_000, opts = {}) {
  const { autoStart = true, priority = null } = opts;

  const ordered = useMemo(() => {
    const arr = [...items];
    if (priority) arr.sort(priority);
    return arr;
  }, [items, priority]);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(!autoStart);
  const [progress, setProgress] = useState(0); // 0..1
  const [phase, setPhase] = useState('dashboard'); // 'dashboard' | 'spotlight'

  const rafRef = useRef(null);
  const lastStartRef = useRef(0);
  const elapsedRef = useRef(0);

  // Clamp index
  useEffect(() => {
    if (index >= ordered.length && ordered.length > 0) setIndex(ordered.length - 1);
  }, [ordered.length, index]);

  // Reset progress on phase/index change
  useEffect(() => {
    elapsedRef.current = 0;
    setProgress(0);
    lastStartRef.current = performance.now();
  }, [index, paused, phase]);

  useEffect(() => {
    if (paused || ordered.length <= 1) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    
    // Determine how long the current phase should last
    const duration = phase === 'dashboard' ? dashTime : spotTime;
    lastStartRef.current = performance.now() - elapsedRef.current;

    const loop = (now) => {
      const elapsed = now - lastStartRef.current;
      elapsedRef.current = elapsed;
      const p = Math.min(elapsed / duration, 1);
      setProgress(p);
      
      if (p >= 1) {
        elapsedRef.current = 0;
        lastStartRef.current = performance.now();
        setProgress(0);
        
        // SWAP PHASE LOGIC
        if (phase === 'dashboard') {
          setPhase('spotlight');
        } else {
          setPhase('dashboard');
          setIndex(i => (i + 1) % ordered.length); // advance to next instance
        }
      } else {
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [paused, ordered.length, dashTime, spotTime, index, phase]);

  // Pause if tab hidden
  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const next = useCallback(() => {
    elapsedRef.current = 0; lastStartRef.current = performance.now(); setProgress(0);
    setPhase('spotlight'); // force go to spotlight
    setIndex(i => (ordered.length ? (i + 1) % ordered.length : 0));
  }, [ordered.length]);

  const prev = useCallback(() => {
    elapsedRef.current = 0; lastStartRef.current = performance.now(); setProgress(0);
    setPhase('spotlight');
    setIndex(i => (ordered.length ? (i - 1 + ordered.length) % ordered.length : 0));
  }, [ordered.length]);

  const goTo = useCallback((id) => {
    const i = ordered.findIndex(x => x.id === id);
    if (i >= 0) {
      elapsedRef.current = 0; lastStartRef.current = performance.now(); setProgress(0);
      setIndex(i);
      setPhase('spotlight');
    }
  }, [ordered]);

  return {
    items: ordered, index, current: ordered[index] || null,
    paused, setPaused, togglePause: () => setPaused(p => !p),
    next, prev, goTo, progress, phase, setPhase
  };
}