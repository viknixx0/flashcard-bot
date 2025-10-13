const sqlite3 = require('sqlite3').verbose();

class Database {
    constructor() {
        this.db = new sqlite3.Database('./flashcards.db');
        this.init();
    }

    init() {
        this.db.serialize(() => {
            this.db.run(`CREATE TABLE IF NOT EXISTS flashcards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                card_type TEXT DEFAULT 'text',
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                photo_id TEXT,
                wrong_answers TEXT,
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

    addCard(userId, cardData, callback) {
        // ВАЛИДАЦИЯ ОБЯЗАТЕЛЬНЫХ ПОЛЕЙ
        if (!cardData || !cardData.question || !cardData.answer) {
            const error = new Error('Question and answer are required');
            console.error('Validation error:', error);
            return callback(error);
        }

        const { card_type = 'text', question, answer, photo_id = null, wrong_answers = null, category = 'Общее' } = cardData;
        
        const sql = `INSERT INTO flashcards 
                    (user_id, card_type, question, answer, photo_id, wrong_answers, category) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)`;
        
        this.db.run(sql, [
            userId, 
            card_type, 
            question.trim(), 
            answer.trim(), 
            photo_id, 
            wrong_answers ? JSON.stringify(wrong_answers) : null, 
            category
        ], function(err) {
            if (err) {
                console.error('Database error adding card:', err);
                return callback(err);
            }
            
            // Обновляем статистику
            const statsSql = `INSERT OR REPLACE INTO user_stats (user_id, total_cards) 
                             VALUES (?, COALESCE((SELECT total_cards FROM user_stats WHERE user_id = ?), 0) + 1)`;
            
            this.db.run(statsSql, [userId, userId], (statsErr) => {
                if (statsErr) {
                    console.error('Error updating stats:', statsErr);
                }
                callback(null, this.lastID);
            });
        }.bind(this));
    }

    getWrongAnswersFromCategory(userId, correctAnswer, category, count = 3, callback) {
        const sql = `SELECT answer FROM flashcards 
                    WHERE user_id = ? AND answer != ? AND category = ?
                    ORDER BY RANDOM() LIMIT ?`;
        
        this.db.all(sql, [userId, correctAnswer, category, count], (err, rows) => {
            if (err) {
                console.error('Error getting wrong answers:', err);
                return callback(err);
            }

            let wrongAnswers = rows.map(row => row.answer);
            
            // Если в категории мало карточек, добираем из других
            if (wrongAnswers.length < count) {
                const additionalSql = `SELECT answer FROM flashcards 
                                     WHERE user_id = ? AND answer != ? AND category != ?
                                     ORDER BY RANDOM() LIMIT ?`;
                
                this.db.all(additionalSql, [userId, correctAnswer, category, count - wrongAnswers.length], (additionalErr, additionalRows) => {
                    if (!additionalErr && additionalRows) {
                        wrongAnswers = [...wrongAnswers, ...additionalRows.map(row => row.answer)];
                    }
                    
                    // Если все равно мало, добавляем стандартные
                    while (wrongAnswers.length < count) {
                        const defaults = ['Не знаю', 'Затрудняюсь ответить', 'Нет правильного ответа'];
                        const defaultAnswer = defaults[wrongAnswers.length] || `Вариант ${wrongAnswers.length + 1}`;
                        if (!wrongAnswers.includes(defaultAnswer)) {
                            wrongAnswers.push(defaultAnswer);
                        }
                    }
                    
                    callback(null, wrongAnswers.slice(0, count));
                });
            } else {
                callback(null, wrongAnswers.slice(0, count));
            }
        });
    }

    getDueCards(userId, callback) {
        const sql = `SELECT * FROM flashcards 
                    WHERE user_id = ? AND next_review <= datetime('now') 
                    ORDER BY next_review 
                    LIMIT 10`;
        this.db.all(sql, [userId], (err, rows) => {
            if (err) {
                console.error('Error getting due cards:', err);
            }
            callback(err, rows);
        });
    }

    updateCardAfterReview(cardId, isCorrect, callback) {
        const interval = isCorrect ? 7 : 1;
        this.db.run(
            `UPDATE flashcards SET next_review = datetime('now', '+' || ? || ' days') WHERE id = ?`,
            [interval, cardId],
            function(err) {
                if (err) {
                    console.error('Error updating card review:', err);
                }
                callback(err);
            }
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
        ], function(err) {
            if (err) {
                console.error('Error updating user stats:', err);
            }
            callback(err);
        });
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
        this.db.get(sql, [userId, userId], (err, row) => {
            if (err) {
                console.error('Error getting stats:', err);
            }
            callback(err, row);
        });
    }

    getCard(cardId, callback) {
        const sql = `SELECT * FROM flashcards WHERE id = ?`;
        this.db.get(sql, [cardId], (err, row) => {
            if (err) {
                console.error('Error getting card:', err);
            }
            callback(err, row);
        });
    }

    getUserCategories(userId, callback) {
        const sql = `SELECT DISTINCT category FROM flashcards WHERE user_id = ?`;
        this.db.all(sql, [userId], (err, rows) => {
            if (err) {
                console.error('Error getting categories:', err);
            }
            callback(err, rows);
        });
    }

    getCategoryStats(userId, callback) {
        const sql = `SELECT category, COUNT(*) as count FROM flashcards WHERE user_id = ? GROUP BY category`;
        this.db.all(sql, [userId], (err, rows) => {
            if (err) {
                console.error('Error getting category stats:', err);
            }
            callback(err, rows);
        });
    }

    getUsersWithDueCards(callback) {
        const sql = `SELECT DISTINCT user_id FROM flashcards WHERE next_review <= datetime('now')`;
        this.db.all(sql, [], (err, rows) => {
            if (err) {
                console.error('Error getting users with due cards:', err);
            }
            callback(err, rows);
        });
    }

    // Закрытие соединения с БД
    close() {
        this.db.close();
    }
}

module.exports = Database;
