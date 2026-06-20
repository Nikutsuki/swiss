package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/Nikutsuki/swiss/services/fiszki-api/models"
	"github.com/Nikutsuki/swiss/services/internal/database"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	maxStudySetsPerUser   = 10
	maxQuestionsPerSet    = 2000
	maxChoicesPerQuestion = 8
	maxRequestBodyBytes   = 2 << 20 // 2 MiB

	questionTypeFlashcard      = "flashcard"
	questionTypeMultipleChoice = "multiple_choice"
)

func validateQuestion(q models.QuestionInput) string {
	if strings.TrimSpace(q.Prompt) == "" {
		return "question prompt must not be empty"
	}
	switch q.Type {
	case questionTypeFlashcard:
		if strings.TrimSpace(q.Answer) == "" {
			return "flashcard answer must not be empty"
		}
	case questionTypeMultipleChoice:
		if len(q.Choices) < 2 || len(q.Choices) > maxChoicesPerQuestion {
			return "multiple choice question must have between 2 and 8 choices"
		}
		for _, c := range q.Choices {
			if strings.TrimSpace(c) == "" {
				return "answer choices must not be empty"
			}
		}
		if len(q.CorrectIndices) == 0 {
			return "multiple choice question must have at least one correct answer"
		}
		seen := map[int]bool{}
		for _, idx := range q.CorrectIndices {
			if idx < 0 || idx >= len(q.Choices) {
				return "correct answer index out of range"
			}
			if seen[idx] {
				return "duplicate correct answer index"
			}
			seen[idx] = true
		}
	default:
		return "question type must be 'flashcard' or 'multiple_choice'"
	}
	return ""
}

func (h *Handler) CreateStudySet(w http.ResponseWriter, r *http.Request) {
	userID, ok := mustClaimsUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	var body models.CreateStudySetRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			http.Error(w, "Study set is too large (max 2 MiB)", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	name := strings.TrimSpace(body.Name)
	if name == "" {
		http.Error(w, "Study set name is required", http.StatusBadRequest)
		return
	}
	if len(name) > 255 {
		http.Error(w, "Study set name is too long", http.StatusBadRequest)
		return
	}
	if len(body.Questions) == 0 {
		http.Error(w, "Study set must contain at least one question", http.StatusBadRequest)
		return
	}
	if len(body.Questions) > maxQuestionsPerSet {
		http.Error(w, "Study set has too many questions", http.StatusBadRequest)
		return
	}
	for _, q := range body.Questions {
		if msg := validateQuestion(q); msg != "" {
			http.Error(w, msg, http.StatusBadRequest)
			return
		}
	}

	ctx := r.Context()
	setCount, err := h.db.CountFiszkiStudySetsByUser(ctx, userID)
	if err != nil {
		http.Error(w, "Failed to create study set", http.StatusInternalServerError)
		return
	}
	if setCount >= maxStudySetsPerUser {
		http.Error(w, "Study set limit reached (10). Delete a set to import a new one.", http.StatusConflict)
		return
	}

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		http.Error(w, "Failed to create study set", http.StatusInternalServerError)
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := database.New(tx)
	setID, err := qtx.CreateFiszkiStudySet(ctx, database.CreateFiszkiStudySetParams{
		UserID:      userID,
		Name:        name,
		Description: strings.TrimSpace(body.Description),
	})
	if err != nil {
		http.Error(w, "Failed to create study set", http.StatusInternalServerError)
		return
	}

	rows := make([]database.InsertFiszkiQuestionsParams, 0, len(body.Questions))
	for i, q := range body.Questions {
		row := database.InsertFiszkiQuestionsParams{
			StudySetID:   setID,
			Position:     int32(i),
			QuestionType: q.Type,
			Prompt:       strings.TrimSpace(q.Prompt),
		}
		if q.Type == questionTypeFlashcard {
			row.Answer = pgtype.Text{String: strings.TrimSpace(q.Answer), Valid: true}
		} else {
			row.Choices = q.Choices
			row.CorrectIndices = int32sFromInts(q.CorrectIndices)
		}
		rows = append(rows, row)
	}
	if _, err := qtx.InsertFiszkiQuestions(ctx, rows); err != nil {
		http.Error(w, "Failed to save questions", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		http.Error(w, "Failed to create study set", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, models.CreateStudySetResponse{ID: uuidString(setID)})
}

func summaryFromRow(row database.ListFiszkiStudySetsWithStatsRow) models.StudySetSummary {
	return models.StudySetSummary{
		ID:                    uuidString(row.ID),
		Name:                  row.Name,
		Description:           row.Description,
		CreatedAt:             timestampString(row.CreatedAt),
		QuestionCount:         row.QuestionCount,
		FlashcardCount:        row.FlashcardCount,
		KnownCount:            row.KnownCount,
		UnknownCount:          row.UnknownCount,
		SessionCount:          row.SessionCount,
		BestScore:             row.BestScore,
		AverageScore:          row.AverageScore,
		TotalTimeSpentSeconds: row.TotalTimeSpentSeconds,
		LastAttemptAt:         timestampPtr(row.LastAttemptAt),
	}
}

func (h *Handler) ListStudySets(w http.ResponseWriter, r *http.Request) {
	userID, ok := mustClaimsUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	rows, err := h.db.ListFiszkiStudySetsWithStats(r.Context(), userID)
	if err != nil {
		http.Error(w, "Failed to load study sets", http.StatusInternalServerError)
		return
	}

	out := make([]models.StudySetSummary, 0, len(rows))
	for _, row := range rows {
		out = append(out, summaryFromRow(row))
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) GetStudySet(w http.ResponseWriter, r *http.Request) {
	userID, ok := mustClaimsUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	setID, err := pgUUIDFromString(r.PathValue("id"))
	if err != nil {
		http.Error(w, "Invalid study set id", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	set, err := h.db.GetFiszkiStudySet(ctx, database.GetFiszkiStudySetParams{ID: setID, UserID: userID})
	if err != nil {
		http.Error(w, "Study set not found", http.StatusNotFound)
		return
	}

	questions, err := h.db.ListFiszkiQuestionsBySet(ctx, setID)
	if err != nil {
		http.Error(w, "Failed to load questions", http.StatusInternalServerError)
		return
	}
	progress, err := h.db.ListFiszkiCardProgressBySet(ctx, database.ListFiszkiCardProgressBySetParams{
		UserID:     userID,
		StudySetID: setID,
	})
	if err != nil {
		http.Error(w, "Failed to load progress", http.StatusInternalServerError)
		return
	}

	resp := models.StudySetDetailResponse{
		ID:          uuidString(set.ID),
		Name:        set.Name,
		Description: set.Description,
		CreatedAt:   timestampString(set.CreatedAt),
		Questions:   make([]models.QuestionResponse, 0, len(questions)),
		Progress:    make([]models.CardProgressResponse, 0, len(progress)),
	}
	for _, q := range questions {
		resp.Questions = append(resp.Questions, models.QuestionResponse{
			ID:             uuidString(q.ID),
			Type:           q.QuestionType,
			Prompt:         q.Prompt,
			Answer:         q.Answer.String,
			Choices:        q.Choices,
			CorrectIndices: intsFromInt32s(q.CorrectIndices),
		})
	}
	for _, p := range progress {
		resp.Progress = append(resp.Progress, models.CardProgressResponse{
			QuestionID:           uuidString(p.QuestionID),
			Status:               p.Status,
			TimesReviewed:        int(p.TimesReviewed),
			TimesCorrect:         int(p.TimesCorrect),
			Difficulty:           p.Difficulty,
			EaseFactor:           p.EaseFactor,
			IntervalDays:         int(p.IntervalDays),
			ConsecutiveCorrect:   int(p.ConsecutiveCorrect),
			ConsecutiveIncorrect: int(p.ConsecutiveIncorrect),
			LastReviewedAt:       timestampPtr(p.LastReviewedAt),
			NextReviewAt:         timestampPtr(p.NextReviewAt),
		})
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) DeleteStudySet(w http.ResponseWriter, r *http.Request) {
	userID, ok := mustClaimsUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	setID, err := pgUUIDFromString(r.PathValue("id"))
	if err != nil {
		http.Error(w, "Invalid study set id", http.StatusBadRequest)
		return
	}

	deleted, err := h.db.DeleteFiszkiStudySet(r.Context(), database.DeleteFiszkiStudySetParams{ID: setID, UserID: userID})
	if err != nil {
		http.Error(w, "Failed to delete study set", http.StatusInternalServerError)
		return
	}
	if deleted == 0 {
		http.Error(w, "Study set not found", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ResetStudySetProgress(w http.ResponseWriter, r *http.Request) {
	userID, ok := mustClaimsUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	setID, err := pgUUIDFromString(r.PathValue("id"))
	if err != nil {
		http.Error(w, "Invalid study set id", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	if _, err := h.db.GetFiszkiStudySet(ctx, database.GetFiszkiStudySetParams{ID: setID, UserID: userID}); err != nil {
		http.Error(w, "Study set not found", http.StatusNotFound)
		return
	}
	if _, err := h.db.DeleteFiszkiCardProgressForSet(ctx, database.DeleteFiszkiCardProgressForSetParams{
		UserID:     userID,
		StudySetID: setID,
	}); err != nil {
		http.Error(w, "Failed to reset progress", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
