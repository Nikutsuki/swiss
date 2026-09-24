-- name: CreateFiszkiStudySet :one
INSERT INTO fiszki_study_set (user_id, name, description)
VALUES ($1, $2, $3)
RETURNING id;

-- name: CountFiszkiStudySetsByUser :one
SELECT COUNT(*)
FROM fiszki_study_set
WHERE user_id = $1;

-- name: GetFiszkiStudySet :one
SELECT *
FROM fiszki_study_set
WHERE id = $1
  AND user_id = $2;

-- name: ListFiszkiStudySetsWithStats :many
SELECT s.id,
       s.name,
       s.description,
       s.created_at,
       s.updated_at,
       (SELECT COUNT(*)
        FROM fiszki_question q
        WHERE q.study_set_id = s.id)::BIGINT AS question_count,
       (SELECT COUNT(*)
        FROM fiszki_question q
        WHERE q.study_set_id = s.id
          AND q.question_type = 'flashcard')::BIGINT AS flashcard_count,
       (SELECT COUNT(*)
        FROM fiszki_card_progress cp
                 JOIN fiszki_question q ON q.id = cp.question_id
        WHERE cp.user_id = s.user_id
          AND q.study_set_id = s.id
          AND cp.status = 'known')::BIGINT AS known_count,
       (SELECT COUNT(*)
        FROM fiszki_card_progress cp
                 JOIN fiszki_question q ON q.id = cp.question_id
        WHERE cp.user_id = s.user_id
          AND q.study_set_id = s.id
          AND cp.status = 'unknown')::BIGINT AS unknown_count,
       (SELECT COUNT(*)
        FROM fiszki_session sess
        WHERE sess.study_set_id = s.id
          AND sess.user_id = s.user_id)::BIGINT AS session_count,
       (SELECT COALESCE(MAX(sess.score), 0)
        FROM fiszki_session sess
        WHERE sess.study_set_id = s.id
          AND sess.user_id = s.user_id)::BIGINT AS best_score,
       (SELECT COALESCE(AVG(sess.score), 0)
        FROM fiszki_session sess
        WHERE sess.study_set_id = s.id
          AND sess.user_id = s.user_id)::FLOAT AS average_score,
       (SELECT COALESCE(SUM(sess.time_spent_seconds), 0)
        FROM fiszki_session sess
        WHERE sess.study_set_id = s.id
          AND sess.user_id = s.user_id)::BIGINT AS total_time_spent_seconds,
       (SELECT MAX(sess.ended_at)
        FROM fiszki_session sess
        WHERE sess.study_set_id = s.id
          AND sess.user_id = s.user_id)::TIMESTAMPTZ AS last_attempt_at
FROM fiszki_study_set s
WHERE s.user_id = $1
ORDER BY s.created_at DESC;

-- name: DeleteFiszkiStudySet :execrows
DELETE
FROM fiszki_study_set
WHERE id = $1
  AND user_id = $2;

-- name: InsertFiszkiQuestions :copyfrom
INSERT INTO fiszki_question (study_set_id, position, question_type, prompt, answer, choices, correct_indices, image_path)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: ListFiszkiQuestionsBySet :many
SELECT *
FROM fiszki_question
WHERE study_set_id = $1
ORDER BY position;

-- name: ListFiszkiCardProgressBySet :many
SELECT cp.*
FROM fiszki_card_progress cp
         JOIN fiszki_question q ON q.id = cp.question_id
WHERE cp.user_id = $1
  AND q.study_set_id = $2;

-- name: UpsertFiszkiCardProgress :exec
INSERT INTO fiszki_card_progress (user_id, question_id, status, times_reviewed, times_correct, difficulty,
                                  ease_factor, interval_days, consecutive_correct, consecutive_incorrect,
                                  last_reviewed_at, next_review_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
ON CONFLICT (user_id, question_id) DO UPDATE
    SET status                = EXCLUDED.status,
        times_reviewed        = EXCLUDED.times_reviewed,
        times_correct         = EXCLUDED.times_correct,
        difficulty            = EXCLUDED.difficulty,
        ease_factor           = EXCLUDED.ease_factor,
        interval_days         = EXCLUDED.interval_days,
        consecutive_correct   = EXCLUDED.consecutive_correct,
        consecutive_incorrect = EXCLUDED.consecutive_incorrect,
        last_reviewed_at      = EXCLUDED.last_reviewed_at,
        next_review_at        = EXCLUDED.next_review_at;

-- name: DeleteFiszkiCardProgressForSet :execrows
DELETE
FROM fiszki_card_progress cp
    USING fiszki_question q
WHERE cp.question_id = q.id
  AND cp.user_id = $1
  AND q.study_set_id = $2;

-- name: CreateFiszkiSession :one
INSERT INTO fiszki_session (user_id, study_set_id, mode, total_questions, correct_answers, score,
                            time_spent_seconds, started_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id, ended_at;

-- name: GetFiszkiSession :one
SELECT sess.*, s.name AS study_set_name
FROM fiszki_session sess
         JOIN fiszki_study_set s ON s.id = sess.study_set_id
WHERE sess.id = $1
  AND sess.user_id = $2;

-- name: InsertFiszkiSessionAnswers :copyfrom
INSERT INTO fiszki_session_answer (session_id, question_id, question_number, selected_indices, flashcard_result,
                                   is_correct, response_time_ms)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: ListFiszkiSessionAnswers :many
SELECT a.question_number,
       a.selected_indices,
       a.flashcard_result,
       a.is_correct,
       a.response_time_ms,
       q.id AS question_id,
       q.question_type,
       q.prompt,
       q.answer,
       q.choices,
       q.correct_indices
FROM fiszki_session_answer a
         JOIN fiszki_question q ON q.id = a.question_id
WHERE a.session_id = $1
ORDER BY a.question_number;

-- name: GetFiszkiOverallStats :one
SELECT COUNT(DISTINCT sess.study_set_id)::BIGINT          AS studied_set_count,
       COUNT(*)::BIGINT                                   AS session_count,
       COALESCE(AVG(sess.score), 0)::FLOAT                AS average_score,
       COALESCE(MAX(sess.score), 0)::BIGINT               AS best_score,
       COALESCE(SUM(sess.time_spent_seconds), 0)::BIGINT  AS total_time_spent_seconds,
       COALESCE(SUM(sess.total_questions), 0)::BIGINT     AS total_questions_answered,
       COALESCE(SUM(sess.correct_answers), 0)::BIGINT     AS total_correct_answers
FROM fiszki_session sess
WHERE sess.user_id = $1;
