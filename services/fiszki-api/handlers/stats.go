package handlers

import (
	"net/http"

	"github.com/Nikutsuki/swiss/services/fiszki-api/models"
)

func (h *Handler) GetStats(w http.ResponseWriter, r *http.Request) {
	userID, ok := mustClaimsUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	ctx := r.Context()
	overall, err := h.db.GetFiszkiOverallStats(ctx, userID)
	if err != nil {
		http.Error(w, "Failed to load stats", http.StatusInternalServerError)
		return
	}
	sets, err := h.db.ListFiszkiStudySetsWithStats(ctx, userID)
	if err != nil {
		http.Error(w, "Failed to load study sets", http.StatusInternalServerError)
		return
	}

	resp := models.OverallStatsResponse{
		StudiedSetCount:        overall.StudiedSetCount,
		SessionCount:           overall.SessionCount,
		AverageScore:           overall.AverageScore,
		BestScore:              overall.BestScore,
		TotalTimeSpentSeconds:  overall.TotalTimeSpentSeconds,
		TotalQuestionsAnswered: overall.TotalQuestionsAnswered,
		TotalCorrectAnswers:    overall.TotalCorrectAnswers,
		Sets:                   make([]models.StudySetSummary, 0, len(sets)),
	}
	for _, row := range sets {
		resp.Sets = append(resp.Sets, summaryFromRow(row))
	}
	writeJSON(w, http.StatusOK, resp)
}
