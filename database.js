const sqlite3 = require('sqlite3').verbose();

class Database {
    constructor() {
        this.db = new sqlite3.Database('./flashcards.db');
        this.init();
    }

    init() {
        this.db.serialize(() => {
            // Обновленная таблица карточек
            this.db.run(`CREATE TABLE IF NOT EXISTS flashcards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                card_type TEXT DEFAULT 'text', -- 'text', 'photo', 'test'
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                photo_id TEXT, -- для карточек с фото
                wrong_answers TEXT, -- JSON массив неправильных ответов
                category TEXT DEFAULT 'Общее',
                next_review DATETIME DEFAULT (datetime('now', '+1 day')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            this.db.run(`CREATE TABLE IF NOT EXISTS user_stats (
                user_id INTEGER PRIMARY KEY,
                total_cards INTEGER DEFAULT 0,
                total_reviews INTEGER DEFAULT 0,
                correct_answers INTEGER DEFAULT 0,
                streak INTEGER DEFAULT 0
            )`);
        });
    }

    // Добавление карточки с поддержкой типов
    addCard(userId, cardData, callback) {
        const { card_type, question, answer, photo_id, wrong_answers, category } = cardData;
        
        const sql = `INSERT INTO flashcards 
                    (user_id, card_type, question, answer, photo_id, wrong_answers, category) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)`;
        
        this.db.run(sql, [
            userId, card_type, question, answer, photo_id, 
            wrong_answers ? JSON.stringify(wrong_answers) : null, 
            category || 'Общее'
        ], function(err) {
            if (err) {
                console.error('Error adding card:', err);
                callback(err);
            } else {
                // Обновляем статистику
                const statsSql = `INSERT OR REPLACE INTO user_stats (user_id, total_cards) 
                                 VALUES (?, COALESCE((SELECT total_cards FROM user_stats WHERE user_id = ?), 0) + 1)`;
                this.db.run(statsSql, [userId, userId], (err) => {
                    callback(err, this.lastID);
                });
            }
        }.bind(this));
    }

    // Получение случайных неправильных ответов из других карточек
    getWrongAnswers(userId, correctAnswer, count = 3, callback) {
        const sql = `SELECT answer FROM flashcards 
                    WHERE user_id = ? AND answer != ? 
                    ORDER BY RANDOM() LIMIT ?`;
        
        this.db.all(sql, [userId, correctAnswer, count], (err, rows) => {
            if (err) {
                callback(err);
            } else {
                const wrongAnswers = rows.map(row => row.answer);
                
                // Если не хватает вариантов, добавляем стандартные
                while (wrongAnswers.length < count) {
                    const defaults = ['Не знаю', 'Затрудняюсь ответить', 'Нет правильного ответа'];
                    const defaultAnswer = defaults[wrongAnswers.length] || `Вариант ${wrongAnswers.length + 1}`;
                    if (!wrongAnswers.includes(defaultAnswer)) {
                        wrongAnswers.push(defaultAnswer);
                    }
                }
                
                callback(null, wrongAnswers.slice(0, count));
            }
        });
    }

    getDueCards(userId, callback) {
        const sql = `SELECT * FROM flashcards 
                    WHERE user_id = ? AND next_review <= datetime('now') 
                    ORDER BY next_review 
                    LIMIT 10`;
        this.db.all(sql, [userId], callback);
    }

    updateCardAfterReview(cardId, isCorrect, callback) {
        const interval = isCorrect ? 7 : 1;
        this.db.run(
            `UPDATE flashcards SET next_review = datetime('now', '+' || ? || ' days') WHERE id = ?`,
            [interval, cardId],
            callback
        );
    }

    updateUserStats(userId, isCorrect, callback) {
        const updateSql = `
            INSERT OR REPLACE INTO user_stats 
            (user_id, total_reviews, correct_answers, streak) 
            VALUES (
                ?, 
                COALESCE((SELECT total_reviews FROM user_stats WHERE user_id = ?), 0) + 1,
                COALESCE((SELECT correct_answers FROM user_stats WHERE user_id = ?), 0) + ?,
                CASE WHEN ? THEN COALESCE((SELECT streak FROM user_stats WHERE user_id = ?), 0) + 1 ELSE 0 END
            )
        `;
        
        this.db.run(updateSql, [
            userId, userId, userId, isCorrect ? 1 : 0, isCorrect, userId
        ], callback);
    }

    getStats(userId, callback) {
        const sql = `
            SELECT 
                us.total_cards,
                us.total_reviews,
                us.correct_answers,
                us.streak,
                (SELECT COUNT(*) FROM flashcards WHERE user_id = ? AND next_review <= datetime('now')) as due_cards,
                CASE 
                    WHEN us.total_reviews > 0 THEN ROUND((us.correct_answers * 100.0 / us.total_reviews), 1)
                    ELSE 0 
                END as accuracy
            FROM user_stats us 
            WHERE us.user_id = ?
        `;
        this.db.get(sql, [userId, userId], callback);
    }

    getCard(cardId, callback) {
        const sql = `SELECT * FROM flashcards WHERE id = ?`;
        this.db.get(sql, [cardId], callback);
    }

    getUserCategories(userId, callback) {
        const sql = `SELECT DISTINCT category FROM flashcards WHERE user_id = ?`;
        this.db.all(sql, [userId], callback);
    }

    getUsersWithDueCards(callback) {
        const sql = `SELECT DISTINCT user_id FROM flashcards WHERE next_review <= datetime('now')`;
        this.db.all(sql, [], callback);
    }
}

module.exports = Database;