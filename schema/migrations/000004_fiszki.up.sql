CREATE TABLE fiszki_study_set (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fiszki_study_set_user ON fiszki_study_set (user_id, created_at DESC);

CREATE TABLE fiszki_question (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_set_id UUID NOT NULL REFERENCES fiszki_study_set(id) ON DELETE CASCADE,
    position INT NOT NULL,
    question_type VARCHAR(20) NOT NULL CHECK (question_type IN ('flashcard', 'multiple_choice')),
    prompt TEXT NOT NULL,
    answer TEXT NULL,
    choices TEXT[] NULL,
    correct_indices INT[] NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fiszki_question_set ON fiszki_question (study_set_id, position);

CREATE TABLE fiszki_session (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    study_set_id UUID NOT NULL REFERENCES fiszki_study_set(id) ON DELETE CASCADE,
    mode VARCHAR(20) NOT NULL CHECK (mode IN ('quiz', 'flashcards')),
    total_questions INT NOT NULL,
    correct_answers INT NOT NULL,
    score INT NOT NULL,
    time_spent_seconds INT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fiszki_session_user ON fiszki_session (user_id, ended_at DESC);
CREATE INDEX idx_fiszki_session_set ON fiszki_session (study_set_id, ended_at DESC);

CREATE TABLE fiszki_session_answer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES fiszki_session(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES fiszki_question(id) ON DELETE CASCADE,
    question_number INT NOT NULL,
    selected_indices INT[] NULL,
    flashcard_result VARCHAR(10) NULL CHECK (flashcard_result IN ('known', 'unknown')),
    is_correct BOOLEAN NOT NULL,
    response_time_ms INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_fiszki_session_answer_session ON fiszki_session_answer (session_id, question_number);

CREATE TABLE fiszki_card_progress (
    user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES fiszki_question(id) ON DELETE CASCADE,
    status VARCHAR(10) NOT NULL CHECK (status IN ('known', 'unknown')),
    times_reviewed INT NOT NULL DEFAULT 0,
    times_correct INT NOT NULL DEFAULT 0,
    difficulty REAL NOT NULL DEFAULT 0.5,
    ease_factor REAL NOT NULL DEFAULT 2.5,
    interval_days INT NOT NULL DEFAULT 1,
    consecutive_correct INT NOT NULL DEFAULT 0,
    consecutive_incorrect INT NOT NULL DEFAULT 0,
    last_reviewed_at TIMESTAMPTZ NULL,
    next_review_at TIMESTAMPTZ NULL,
    PRIMARY KEY (user_id, question_id)
);

CREATE INDEX idx_fiszki_card_progress_user ON fiszki_card_progress (user_id, next_review_at);
