package handlers

import (
	"encoding/json"
	"math"
	"net/http"
	"time"

	"github.com/Nikutsuki/swiss/services/fiszki-api/models"
	"github.com/Nikutsuki/swiss/services/internal/database"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	sessionModeQuiz       = "quiz"
	sessionModeFlashcards = "flashcards"
)

// isChoiceCorrect reports whether the selected indices exactly match the
// correct indices: every correct option chosen and no incorrect option chosen.
// A multi-answer question is marked wrong if any single selection is wrong.
func isChoiceCorrect(selected []int, correct []int32) bool {
	selectedSet := make(map[int]struct{}, len(selected))
	for _, s := range selected {
		selectedSet[s] = struct{}{}
	}
	if len(selectedSet) != len(correct) {
		return false
	}
	for _, c := range correct {
		if _, ok := selectedSet[int(c)]; !ok {
			return false
		}
	}
	return true
}

func (h *Handler) CreateSession(w http.ResponseWriter, r *http.Request) {
	userID, ok := mustClaimsUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	var body models.CreateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if body.Mode != sessionModeQuiz && body.Mode != sessionModeFlashcards {
		http.Error(w, "Session mode must be 'quiz' or 'flashcards'", http.StatusBadRequest)
		return
	}
	if len(body.Answers) == 0 {
		http.Error(w, "Session must contain at least one answer", http.StatusBadRequest)
		return
	}
	setID, err := pgUUIDFromString(body.StudySetID)
	if err != nil {
		http.Error(w, "Invalid study set id", http.StatusBadRequest)
		return
	}
	if body.TimeSpentSeconds < 0 {
		http.Error(w, "Invalid time spent", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	startedAt := now
	if body.StartedAt != "" {
		if parsed, err := time.Parse(time.RFC3339, body.StartedAt); err == nil {
			startedAt = parsed.UTC()
		}
	}

	ctx := r.Context()
	if _, err := h.db.GetFiszkiStudySet(ctx, database.GetFiszkiStudySetParams{ID: setID, UserID: userID}); err != nil {
		http.Error(w, "Study set not found", http.StatusNotFound)
		return
	}

	questions, err := h.db.ListFiszkiQuestionsBySet(ctx, setID)
	if err != nil {
		http.Error(w, "Failed to load questions", http.StatusInternalServerError)
		return
	}
	questionByID := make(map[string]database.FiszkiQuestion, len(questions))
	for _, q := range questions {
		questionByID[uuidString(q.ID)] = q
	}

	type gradedAnswer struct {
		input     models.SessionAnswerInput
		question  database.FiszkiQuestion
		isCorrect bool
	}
	graded := make([]gradedAnswer, 0, len(body.Answers))
	correctCount := 0
	for _, a := range body.Answers {
		q, found := questionByID[a.QuestionID]
		if !found {
			http.Error(w, "Answer references a question outside this study set", http.StatusBadRequest)
			return
		}
		var isCorrect bool
		switch q.QuestionType {
		case questionTypeFlashcard:
			if a.FlashcardResult != cardStatusKnown && a.FlashcardResult != cardStatusUnknown {
				http.Error(w, "Flashcard answers must be 'known' or 'unknown'", http.StatusBadRequest)
				return
			}
			isCorrect = a.FlashcardResult == cardStatusKnown
		case questionTypeMultipleChoice:
			if len(a.SelectedIndices) == 0 {
				http.Error(w, "Multiple choice answers must select at least one option", http.StatusBadRequest)
				return
			}
			for _, idx := range a.SelectedIndices {
				if idx < 0 || idx >= len(q.Choices) {
					http.Error(w, "Selected answer index out of range", http.StatusBadRequest)
					return
				}
			}
			isCorrect = isChoiceCorrect(a.SelectedIndices, q.CorrectIndices)
		}
		if isCorrect {
			correctCount++
		}
		graded = append(graded, gradedAnswer{input: a, question: q, isCorrect: isCorrect})
	}

	total := len(graded)
	score := int(math.Round(float64(correctCount) / float64(total) * 100))

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		http.Error(w, "Failed to save session", http.StatusInternalServerError)
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := database.New(tx)

	session, err := qtx.CreateFiszkiSession(ctx, database.CreateFiszkiSessionParams{
		UserID:           userID,
		StudySetID:       setID,
		Mode:             body.Mode,
		TotalQuestions:   int32(total),
		CorrectAnswers:   int32(correctCount),
		Score:            int32(score),
		TimeSpentSeconds: int32(body.TimeSpentSeconds),
		StartedAt:        pgtype.Timestamptz{Time: startedAt, Valid: true},
	})
	if err != nil {
		http.Error(w, "Failed to save session", http.StatusInternalServerError)
		return
	}

	answerRows := make([]database.InsertFiszkiSessionAnswersParams, 0, total)
	for i, g := range graded {
		number := g.input.QuestionNumber
		if number <= 0 {
			number = i + 1
		}
		row := database.InsertFiszkiSessionAnswersParams{
			SessionID:      session.ID,
			QuestionID:     g.question.ID,
			QuestionNumber: int32(number),
			IsCorrect:      g.isCorrect,
			ResponseTimeMs: int32(g.input.ResponseTimeMs),
		}
		if g.question.QuestionType == questionTypeFlashcard {
			row.FlashcardResult = pgtype.Text{String: g.input.FlashcardResult, Valid: true}
		} else {
			row.SelectedIndices = int32sFromInts(g.input.SelectedIndices)
		}
		answerRows = append(answerRows, row)
	}
	if _, err := qtx.InsertFiszkiSessionAnswers(ctx, answerRows); err != nil {
		http.Error(w, "Failed to save answers", http.StatusInternalServerError)
		return
	}

	// Flashcard reviews also advance per-card spaced repetition state.
	progressRows, err := qtx.ListFiszkiCardProgressBySet(ctx, database.ListFiszkiCardProgressBySetParams{
		UserID:     userID,
		StudySetID: setID,
	})
	if err != nil {
		http.Error(w, "Failed to load progress", http.StatusInternalServerError)
		return
	}
	stateByQuestion := make(map[string]cardState, len(progressRows))
	for _, p := range progressRows {
		stateByQuestion[uuidString(p.QuestionID)] = cardState{
			Status:               p.Status,
			TimesReviewed:        p.TimesReviewed,
			TimesCorrect:         p.TimesCorrect,
			Difficulty:           p.Difficulty,
			EaseFactor:           p.EaseFactor,
			IntervalDays:         p.IntervalDays,
			ConsecutiveCorrect:   p.ConsecutiveCorrect,
			ConsecutiveIncorrect: p.ConsecutiveIncorrect,
			LastReviewedAt:       p.LastReviewedAt,
			NextReviewAt:         p.NextReviewAt,
		}
	}
	for _, g := range graded {
		if g.question.QuestionType != questionTypeFlashcard {
			continue
		}
		qid := uuidString(g.question.ID)
		state, found := stateByQuestion[qid]
		if !found {
			state = newCardState()
		}
		state = applyReview(state, g.isCorrect, g.input.ResponseTimeMs, now)
		if err := qtx.UpsertFiszkiCardProgress(ctx, database.UpsertFiszkiCardProgressParams{
			UserID:               userID,
			QuestionID:           g.question.ID,
			Status:               state.Status,
			TimesReviewed:        state.TimesReviewed,
			TimesCorrect:         state.TimesCorrect,
			Difficulty:           state.Difficulty,
			EaseFactor:           state.EaseFactor,
			IntervalDays:         state.IntervalDays,
			ConsecutiveCorrect:   state.ConsecutiveCorrect,
			ConsecutiveIncorrect: state.ConsecutiveIncorrect,
			LastReviewedAt:       state.LastReviewedAt,
			NextReviewAt:         state.NextReviewAt,
		}); err != nil {
			http.Error(w, "Failed to update progress", http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		http.Error(w, "Failed to save session", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, models.CreateSessionResponse{
		ID:             uuidString(session.ID),
		Score:          score,
		CorrectAnswers: correctCount,
		TotalQuestions: total,
	})
}

func (h *Handler) GetSession(w http.ResponseWriter, r *http.Request) {
	userID, ok := mustClaimsUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	sessionID, err := pgUUIDFromString(r.PathValue("id"))
	if err != nil {
		http.Error(w, "Invalid session id", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	session, err := h.db.GetFiszkiSession(ctx, database.GetFiszkiSessionParams{ID: sessionID, UserID: userID})
	if err != nil {
		http.Error(w, "Session not found", http.StatusNotFound)
		return
	}
	answers, err := h.db.ListFiszkiSessionAnswers(ctx, sessionID)
	if err != nil {
		http.Error(w, "Failed to load answers", http.StatusInternalServerError)
		return
	}

	resp := models.SessionReportResponse{
		ID:               uuidString(session.ID),
		StudySetID:       uuidString(session.StudySetID),
		StudySetName:     session.StudySetName,
		Mode:             session.Mode,
		TotalQuestions:   int(session.TotalQuestions),
		CorrectAnswers:   int(session.CorrectAnswers),
		Score:            int(session.Score),
		TimeSpentSeconds: int(session.TimeSpentSeconds),
		StartedAt:        timestampString(session.StartedAt),
		EndedAt:          timestampString(session.EndedAt),
		Answers:          make([]models.SessionAnswerResponse, 0, len(answers)),
	}
	for _, a := range answers {
		resp.Answers = append(resp.Answers, models.SessionAnswerResponse{
			QuestionNumber:  int(a.QuestionNumber),
			QuestionID:      uuidString(a.QuestionID),
			Type:            a.QuestionType,
			Prompt:          a.Prompt,
			Answer:          a.Answer.String,
			Choices:         a.Choices,
			CorrectIndices:  intsFromInt32s(a.CorrectIndices),
			SelectedIndices: intsFromInt32s(a.SelectedIndices),
			FlashcardResult: a.FlashcardResult.String,
			IsCorrect:       a.IsCorrect,
			ResponseTimeMs:  int(a.ResponseTimeMs),
		})
	}
	writeJSON(w, http.StatusOK, resp)
}
