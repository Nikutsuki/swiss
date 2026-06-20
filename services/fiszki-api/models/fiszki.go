package models

// QuestionInput is one question in POST /sets.
type QuestionInput struct {
	Type           string   `json:"type"`
	Prompt         string   `json:"prompt"`
	Answer         string   `json:"answer,omitempty"`
	Choices        []string `json:"choices,omitempty"`
	CorrectIndices []int    `json:"correct_indices,omitempty"`
}

// CreateStudySetRequest is the JSON body for POST /sets.
type CreateStudySetRequest struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Questions   []QuestionInput `json:"questions"`
}

// CreateStudySetResponse is returned after POST /sets.
type CreateStudySetResponse struct {
	ID string `json:"id"`
}

// StudySetSummary is one row from GET /sets and GET /stats.
type StudySetSummary struct {
	ID                    string  `json:"id"`
	Name                  string  `json:"name"`
	Description           string  `json:"description"`
	CreatedAt             string  `json:"created_at"`
	QuestionCount         int64   `json:"question_count"`
	FlashcardCount        int64   `json:"flashcard_count"`
	KnownCount            int64   `json:"known_count"`
	UnknownCount          int64   `json:"unknown_count"`
	SessionCount          int64   `json:"session_count"`
	BestScore             int64   `json:"best_score"`
	AverageScore          float64 `json:"average_score"`
	TotalTimeSpentSeconds int64   `json:"total_time_spent_seconds"`
	LastAttemptAt         *string `json:"last_attempt_at,omitempty"`
}

// QuestionResponse is one question inside GET /sets/{id}.
type QuestionResponse struct {
	ID             string   `json:"id"`
	Type           string   `json:"type"`
	Prompt         string   `json:"prompt"`
	Answer         string   `json:"answer,omitempty"`
	Choices        []string `json:"choices,omitempty"`
	CorrectIndices []int    `json:"correct_indices,omitempty"`
}

// CardProgressResponse is per-card spaced-repetition state inside GET /sets/{id}.
type CardProgressResponse struct {
	QuestionID           string  `json:"question_id"`
	Status               string  `json:"status"`
	TimesReviewed        int     `json:"times_reviewed"`
	TimesCorrect         int     `json:"times_correct"`
	Difficulty           float32 `json:"difficulty"`
	EaseFactor           float32 `json:"ease_factor"`
	IntervalDays         int     `json:"interval_days"`
	ConsecutiveCorrect   int     `json:"consecutive_correct"`
	ConsecutiveIncorrect int     `json:"consecutive_incorrect"`
	LastReviewedAt       *string `json:"last_reviewed_at,omitempty"`
	NextReviewAt         *string `json:"next_review_at,omitempty"`
}

// StudySetDetailResponse is returned by GET /sets/{id}.
type StudySetDetailResponse struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	CreatedAt   string                 `json:"created_at"`
	Questions   []QuestionResponse     `json:"questions"`
	Progress    []CardProgressResponse `json:"progress"`
}

// SessionAnswerInput is one answered question in POST /sessions.
type SessionAnswerInput struct {
	QuestionID      string `json:"question_id"`
	QuestionNumber  int    `json:"question_number"`
	SelectedIndices []int  `json:"selected_indices,omitempty"`
	FlashcardResult string `json:"flashcard_result,omitempty"`
	ResponseTimeMs  int    `json:"response_time_ms"`
}

// CreateSessionRequest is the JSON body for POST /sessions.
type CreateSessionRequest struct {
	StudySetID       string               `json:"study_set_id"`
	Mode             string               `json:"mode"`
	StartedAt        string               `json:"started_at"`
	TimeSpentSeconds int                  `json:"time_spent_seconds"`
	Answers          []SessionAnswerInput `json:"answers"`
}

// CreateSessionResponse is returned after POST /sessions.
type CreateSessionResponse struct {
	ID             string `json:"id"`
	Score          int    `json:"score"`
	CorrectAnswers int    `json:"correct_answers"`
	TotalQuestions int    `json:"total_questions"`
}

// SessionAnswerResponse is one row in SessionReportResponse.
type SessionAnswerResponse struct {
	QuestionNumber  int      `json:"question_number"`
	QuestionID      string   `json:"question_id"`
	Type            string   `json:"type"`
	Prompt          string   `json:"prompt"`
	Answer          string   `json:"answer,omitempty"`
	Choices         []string `json:"choices,omitempty"`
	CorrectIndices  []int    `json:"correct_indices,omitempty"`
	SelectedIndices []int    `json:"selected_indices,omitempty"`
	FlashcardResult string   `json:"flashcard_result,omitempty"`
	IsCorrect       bool     `json:"is_correct"`
	ResponseTimeMs  int      `json:"response_time_ms"`
}

// SessionReportResponse is returned by GET /sessions/{id}.
type SessionReportResponse struct {
	ID               string                  `json:"id"`
	StudySetID       string                  `json:"study_set_id"`
	StudySetName     string                  `json:"study_set_name"`
	Mode             string                  `json:"mode"`
	TotalQuestions   int                     `json:"total_questions"`
	CorrectAnswers   int                     `json:"correct_answers"`
	Score            int                     `json:"score"`
	TimeSpentSeconds int                     `json:"time_spent_seconds"`
	StartedAt        string                  `json:"started_at"`
	EndedAt          string                  `json:"ended_at"`
	Answers          []SessionAnswerResponse `json:"answers"`
}

// OverallStatsResponse is returned by GET /stats.
type OverallStatsResponse struct {
	StudiedSetCount        int64             `json:"studied_set_count"`
	SessionCount           int64             `json:"session_count"`
	AverageScore           float64           `json:"average_score"`
	BestScore              int64             `json:"best_score"`
	TotalTimeSpentSeconds  int64             `json:"total_time_spent_seconds"`
	TotalQuestionsAnswered int64             `json:"total_questions_answered"`
	TotalCorrectAnswers    int64             `json:"total_correct_answers"`
	Sets                   []StudySetSummary `json:"sets"`
}
