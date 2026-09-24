package handlers

import (
	"math"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

// Spaced repetition state for one card, mirroring fiszki_card_progress.
type cardState struct {
	Status               string
	TimesReviewed        int32
	TimesCorrect         int32
	Difficulty           float32
	EaseFactor           float32
	IntervalDays         int32
	ConsecutiveCorrect   int32
	ConsecutiveIncorrect int32
	LastReviewedAt       pgtype.Timestamptz
	NextReviewAt         pgtype.Timestamptz
}

func newCardState() cardState {
	return cardState{
		Status:       cardStatusUnknown,
		Difficulty:   0.5,
		EaseFactor:   2.5,
		IntervalDays: 1,
	}
}

const (
	cardStatusKnown   = "known"
	cardStatusUnknown = "unknown"

	minEaseFactor = 1.3
	maxEaseFactor = 2.5
)

// applyReview advances a card through one modified SM-2 review.
// Response quality is derived from response time: instant recall scores 5,
// answers slower than 25s score 0.
func applyReview(s cardState, correct bool, responseTimeMs int, now time.Time) cardState {
	s.TimesReviewed++
	s.LastReviewedAt = pgtype.Timestamptz{Time: now, Valid: true}

	if correct {
		s.TimesCorrect++
		s.ConsecutiveCorrect++
		s.ConsecutiveIncorrect = 0
		s.Status = cardStatusKnown

		if s.ConsecutiveCorrect >= 3 {
			s.Difficulty = float32(math.Max(0, float64(s.Difficulty)-0.1))
		}

		responseTimeSec := float64(responseTimeMs) / 1000
		quality := math.Max(0, math.Min(5, 5-responseTimeSec/5))
		ease := float64(s.EaseFactor) + (0.1 - (5-quality)*(0.08+(5-quality)*0.02))
		s.EaseFactor = float32(math.Max(minEaseFactor, math.Min(maxEaseFactor, ease)))

		if s.IntervalDays <= 1 {
			s.IntervalDays = 6
		} else {
			s.IntervalDays = int32(math.Round(float64(s.IntervalDays) * float64(s.EaseFactor)))
		}
	} else {
		s.ConsecutiveIncorrect++
		s.ConsecutiveCorrect = 0
		s.Status = cardStatusUnknown

		s.Difficulty = float32(math.Min(1, float64(s.Difficulty)+0.2))
		s.EaseFactor = float32(math.Max(minEaseFactor, float64(s.EaseFactor)-0.2))
		s.IntervalDays = 1
	}

	s.NextReviewAt = pgtype.Timestamptz{
		Time:  now.AddDate(0, 0, int(s.IntervalDays)),
		Valid: true,
	}
	return s
}
