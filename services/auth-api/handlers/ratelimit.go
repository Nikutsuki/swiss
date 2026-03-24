package handlers

import (
	"sync"
	"time"
)

type slidingWindowLimiter struct {
	mu       sync.Mutex
	window   time.Duration
	maxHits  int
	buckets  map[string][]time.Time
}

func newSlidingWindowLimiter(window time.Duration, maxHits int) *slidingWindowLimiter {
	return &slidingWindowLimiter{
		window:  window,
		maxHits: maxHits,
		buckets: make(map[string][]time.Time),
	}
}

func (l *slidingWindowLimiter) allow(key string) bool {
	now := time.Now()
	cutoff := now.Add(-l.window)

	l.mu.Lock()
	defer l.mu.Unlock()

	ts := l.buckets[key]
	var kept []time.Time
	for _, t := range ts {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= l.maxHits {
		l.buckets[key] = kept
		return false
	}
	kept = append(kept, now)
	l.buckets[key] = kept
	return true
}
