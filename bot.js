const TelegramBot = require('node-telegram-bot-api');
const Database = require('./database');

const TOKEN = '8260409057:AAElemEBXkXk0OMLNv7RnXQ_xYpKA3F7M30';
const bot = new TelegramBot(TOKEN, { 
    polling: { 
        params: { 
            timeout: 10 
        } 
    } 
});

const db = new Database();
const userStates = new Map();
const reviewSessions = new Map();

console.log('🚀 Бот запущен!');

// Случайные похвалы за правильные ответы
const praises = [
    "🎉 Отлично! Так держать!",
    "🌟 Браво! Вы настоящий гений!",
    "💫 Потрясающе! Ваша память восхищает!",
    "🔥 Невероятно! Вы на правильном пути!",
    "🚀 Великолепно! Такой прогресс впечатляет!"
];

// Слова поддержки при ошибках
const encouragements = [
    "💪 Почти получилось! Попробуйте еще раз!",
    "🎯 Сложный вопрос! Вы обязательно запомните!",
    "📚 Не переживайте! Повторение - мать учения!",
    "🌟 С каждым разом будет получаться лучше!",
    "🔥 Вы справитесь! Это временная трудность!"
];

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function createProgressBar(percentage) {
    const bars = 10;
    const filledBars = Math.round((percentage / 100) * bars);
    const emptyBars = bars - filledBars;
    return `[${'█'.repeat(filledBars)}${'░'.repeat(emptyBars)}] ${percentage}%`;
}

function calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    // Простая проверка на точное совпадение
    if (str1 === str2) return 1.0;
    
    // Проверка на частичное совпадение
    const words1 = str1.split(' ');
    const words2 = str2.split(' ');
    const matchingWords = words1.filter(word => 
        words2.some(w => w.includes(word) || word.includes(w))
    );
    
    return matchingWords.length / Math.max(words1.length, words2.length);
}

function getRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

// ==================== КОМАНДА /start ====================
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name;
    
    const welcomeText = `🎮 Привет, ${firstName}! Добро пожаловать в *Умные Карточки*!

📚 *Что это?*
Интеллектуальная система повторений с игровыми элементами!

🎯 *Основные команды:*
/add - Добавить новую карточку
/review - Начать тренировку
/stats - Моя статистика
/categories - Мои категории
/achievements - Мои достижения

⚡ *Новые функции:*
• 🎮 Игровая система уровней
• 🏆 Достижения и награды
• 📈 Детальная статистика
• 💡 Подсказки во время тренировки
• 🔥 Серии правильных ответов

*Как работает тренировка:*
1. Я покажу вопрос
2. Вы *пишете ответ* в чат
3. Я проверю и скажу насколько вы были близки
4. За правильные ответы получаете опыт и достижения!

*Начните с команды* /add *чтобы создать первую карточку!* 🚀`;

    bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' });
});

// ==================== КОМАНДА /add ====================
bot.onText(/\/add/, (msg) => {
    const chatId = msg.chat.id;
    userStates.set(chatId, { 
        state: 'waiting_category',
        category: 'Общее'
    });
    
    const categoryKeyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "📝 Общее", callback_data: "category_Общее" },
                    { text: "📚 Учеба", callback_data: "category_Учеба" }
                ],
                [
                    { text: "💼 Работа", callback_data: "category_Работа" },
                    { text: "🌍 Языки", callback_data: "category_Языки" }
                ],
                [
                    { text: "➕ Новая категория", callback_data: "new_category" }
                ]
            ]
        }
    };
    
    bot.sendMessage(chatId, 
        '📝 *Добавление карточки*\n\n' +
        'Сначала выберите категорию:',
        { 
            parse_mode: 'Markdown',
            reply_markup: categoryKeyboard.reply_markup 
        }
    );
});

// ==================== КОМАНДА /review ====================
bot.onText(/\/review/, (msg) => {
    const chatId = msg.chat.id;
    
    db.getDueCards(chatId, (err, cards) => {
        if (err) {
            bot.sendMessage(chatId, '❌ Ошибка при загрузке карточек');
            return;
        }
        
        if (cards.length === 0) {
            bot.sendMessage(chatId, 
                '🎉 *Пока нет карточек для повторения!*\n\n' +
                'Добавьте новые карточки через /add\n' +
                'Или проверьте статистику через /stats',
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        startReviewSession(chatId, cards);
    });
});

// ==================== КОМАНДА /stats ====================
bot.onText(/\/stats/, (msg) => {
    const chatId = msg.chat.id;
    
    db.getStats(chatId, (err, stats) => {
        if (err || !stats) {
            bot.sendMessage(chatId, 
                '📊 *Ваша статистика*\n\n' +
                'Пока нет данных. Начните добавлять карточки через /add',
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        const levelProgress = (stats.experience % 100) || 0;
        const nextLevelExp = 100 - levelProgress;
        
        const statsText = `📊 *Ваша статистика*\n\n` +
                         `🎯 Уровень: *${stats.level}*\n` +
                         `⭐ Опыт: ${stats.experience} (до след. уровня: ${nextLevelExp})\n` +
                         `📚 Всего карточек: *${stats.total_cards}*\n` +
                         `🔄 Всего повторений: *${stats.total_reviews}*\n` +
                         `✅ Правильных ответов: *${stats.correct_answers}*\n` +
                         `🎯 Точность: *${stats.accuracy}%*\n` +
                         `🔥 Текущая серия: *${stats.streak}*\n` +
                         `🏆 Достижений: *${stats.achievements_count}*\n` +
                         `⏰ Ждут повторения: *${stats.due_cards}*`;
        
        // Прогресс-бар уровня
        const progressBar = createProgressBar(levelProgress);
        
        bot.sendMessage(chatId, 
            statsText + `\n\n📈 Прогресс уровня:\n${progressBar}`,
            { parse_mode: 'Markdown' }
        );
    });
});

// ==================== КОМАНДА /categories ====================
bot.onText(/\/categories/, (msg) => {
    const chatId = msg.chat.id;
    
    db.getUserCategories(chatId, (err, categories) => {
        if (err || !categories || categories.length === 0) {
            bot.sendMessage(chatId, 
                '📁 *Мои категории*\n\n' +
                'У вас пока нет категорий. Добавьте первую карточку через /add',
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        let categoriesText = '📁 *Мои категории*\n\n';
        categories.forEach((cat, index) => {
            categoriesText += `${index + 1}. ${cat.category}\n`;
        });
        
        categoriesText += '\n💡 *Совет:* Используйте категории для организации карточек по темам!';
        
        bot.sendMessage(chatId, categoriesText, { parse_mode: 'Markdown' });
    });
});

// ==================== КОМАНДА /achievements ====================
bot.onText(/\/achievements/, (msg) => {
    const chatId = msg.chat.id;
    
    const sql = `SELECT achievement_name, achieved_at FROM achievements WHERE user_id = ? ORDER BY achieved_at`;
    db.db.all(sql, [chatId], (err, achievements) => {
        if (err || !achievements || achievements.length === 0) {
            bot.sendMessage(chatId, 
                '🏆 *Мои достижения*\n\n' +
                'Пока нет достижений. Продолжайте тренироваться чтобы их получить! 💪',
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        let achievementsText = '🏆 *Мои достижения*\n\n';
        achievements.forEach((ach, index) => {
            const date = new Date(ach.achieved_at).toLocaleDateString('ru-RU');
            achievementsText += `${index + 1}. ${ach.achievement_name} - ${date}\n`;
        });
        
        const progress = Math.round((achievements.length / 5) * 100);
        achievementsText += `\n📊 Прогресс: ${progress}% (${achievements.length}/5)`;
        
        bot.sendMessage(chatId, achievementsText, { parse_mode: 'Markdown' });
    });
});

// ==================== КОМАНДА /help ====================
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpText = `🆘 *Помощь по командам*\n\n` +
                   `🎯 *Основные команды:*\n` +
                   `/start - Начало работы\n` +
                   `/add - Добавить новую карточку\n` + 
                   `/review - Начать тренировку\n` +
                   `/stats - Показать статистику\n` +
                   `/categories - Мои категории\n` +
                   `/achievements - Мои достижения\n\n` +
                   `💡 *Как работает тренировка:*\n` +
                   `1. Бот показывает вопрос\n` +
                   `2. Вы пишете ответ в чат\n` +
                   `3. Бот проверяет и показывает результат\n` +
                   `4. За правильные ответы получаете опыт!\n\n` +
                   `❓ *Проблемы?* Перезапустите бота или напишите /start`;

    bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
});

// ==================== СИСТЕМА ТРЕНИРОВКИ ====================
function startReviewSession(chatId, cards) {
    reviewSessions.set(chatId, {
        cards: cards,
        currentIndex: 0,
        correctAnswers: 0
    });
    
    showNextCard(chatId);
}

function showNextCard(chatId) {
    const session = reviewSessions.get(chatId);
    if (!session) return;
    
    if (session.currentIndex >= session.cards.length) {
        finishReviewSession(chatId, session);
        return;
    }
    
    const card = session.cards[session.currentIndex];
    session.currentCard = card;
    
    const helpKeyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "💡 Подсказка", callback_data: `hint_${card.id}` }],
                [{ text: "❌ Не помню", callback_data: `dont_remember_${card.id}` }]
            ]
        }
    };
    
    const progress = `(${session.currentIndex + 1}/${session.cards.length})`;
    
    bot.sendMessage(chatId, 
        `🎯 *Вопрос ${progress}*\n\n` +
        `📁 Категория: ${card.category}\n` +
        `❓ *${card.question}*` +
        `\n\n💭 *Напишите ваш ответ в чат:*`,
        { 
            parse_mode: 'Markdown',
            reply_markup: helpKeyboard.reply_markup 
        }
    );
}

// Обработка текстовых ответов пользователя
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const session = reviewSessions.get(chatId);
    
    if (!session || !session.currentCard || text.startsWith('/')) {
        return;
    }
    
    processUserAnswer(chatId, text, session);
});

function processUserAnswer(chatId, userAnswer, session) {
    const card = session.currentCard;
    const userAnswerClean = userAnswer.trim().toLowerCase();
    const correctAnswerClean = card.answer.trim().toLowerCase();
    
    // Проверяем схожесть ответов
    const similarity = calculateSimilarity(userAnswerClean, correctAnswerClean);
    const isCorrect = similarity >= 0.8;
    
    // Обновляем статистику
    db.updateCardAfterReview(card.id, isCorrect, (err) => {
        if (err) console.error('Error updating card:', err);
    });
    
    db.updateUserStats(chatId, isCorrect, (err) => {
        if (err) console.error('Error updating stats:', err);
    });
    
    // Проверяем достижения
    db.checkAchievements(chatId, (err, newAchievements) => {
        if (newAchievements && newAchievements.length > 0) {
            newAchievements.forEach(achievement => {
                bot.sendMessage(chatId, 
                    `🎉 *Новое достижение!*\n\n` +
                    `🏆 ${achievement}\n\n` +
                    `Поздравляем с получением достижения! 🎊`,
                    { parse_mode: 'Markdown' }
                );
            });
        }
    });
    
    // Показываем результат
    let resultText;
    if (isCorrect) {
        session.correctAnswers++;
        resultText = `${getRandomItem(praises)}\n\n` +
                    `✅ *Правильно!*\n` +
                    `🎯 Ваш ответ: "${userAnswer}"\n` +
                    `⭐ +10 опыта\n` +
                    `🔥 Серия: ${session.correctAnswers} правильных подряд!`;
    } else {
        resultText = `${getRandomItem(encouragements)}\n\n` +
                    `📝 *Правильный ответ:* "${card.answer}"\n` +
                    `🎯 Ваш ответ: "${userAnswer}"\n` +
                    `📊 Схожесть: ${Math.round(similarity * 100)}%\n` +
                    `⭐ +2 опыта за усилия`;
    }
    
    const nextKeyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "➡️ Следующий вопрос", callback_data: "next_question" }]
            ]
        }
    };
    
    bot.sendMessage(chatId, resultText, { 
        parse_mode: 'Markdown',
        reply_markup: nextKeyboard.reply_markup 
    });
}

function finishReviewSession(chatId, session) {
    reviewSessions.delete(chatId);
    
    const accuracy = Math.round((session.correctAnswers / session.cards.length) * 100);
    
    let finishText = `🎊 *Тренировка завершена!*\n\n` +
                   `📊 Результаты:\n` +
                   `• Всего вопросов: ${session.cards.length}\n` +
                   `• Правильных ответов: ${session.correctAnswers}\n` +
                   `• Точность: ${accuracy}%\n\n`;
    
    if (accuracy >= 80) {
        finishText += `🌟 Потрясающий результат! Вы настоящий профи!`;
    } else if (accuracy >= 60) {
        finishText += `💪 Хорошая работа! Продолжайте в том же духе!`;
    } else {
        finishText += `📚 Есть куда расти! Регулярные тренировки помогут улучшить результат!`;
    }
    
    const menuKeyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔄 Еще тренировка", callback_data: "review_again" }],
                [{ text: "📊 Статистика", callback_data: "show_stats" }],
                [{ text: "🏠 Главное меню", callback_data: "main_menu" }]
            ]
        }
    };
    
    bot.sendMessage(chatId, finishText, { 
        parse_mode: 'Markdown',
        reply_markup: menuKeyboard.reply_markup 
    });
}
// ==================== ОБРАБОТКА CALLBACK КНОПОК ====================
bot.on('callback_query', (callbackQuery) => {
    const message = callbackQuery.message;
    const chatId = message.chat.id;
    const data = callbackQuery.data;

    // Обработка выбора категории
    if (data.startsWith('category_')) {
        const category = data.replace('category_', '');
        const userState = userStates.get(chatId);
        
        if (userState && userState.state === 'waiting_category') {
            userState.category = category;
            userState.state = 'waiting_question';
            
            bot.editMessageText(
                `📁 Категория: *${category}*\n\n` +
                `📝 *Введите вопрос:*`,
                {
                    chat_id: chatId,
                    message_id: message.message_id,
                    parse_mode: 'Markdown'
                }
            );
        }
        bot.answerCallbackQuery(callbackQuery.id);
    }
    
    // Создание новой категории
    else if (data === 'new_category') {
        const userState = userStates.get(chatId);
        if (userState) {
            userState.state = 'waiting_new_category';
            
            bot.editMessageText(
                '📁 *Создание новой категории*\n\n' +
                'Введите название для новой категории:',
                {
                    chat_id: chatId,
                    message_id: message.message_id,
                    parse_mode: 'Markdown'
                }
            );
        }
        bot.answerCallbackQuery(callbackQuery.id);
    }
    
    // Подсказка во время тренировки
    else if (data.startsWith('hint_')) {
        const cardId = data.replace('hint_', '');
        const session = reviewSessions.get(chatId);
        
        if (session && session.currentCard && session.currentCard.id == cardId) {
            const answer = session.currentCard.answer;
            const hint = generateHint(answer);
            
            bot.answerCallbackQuery(callbackQuery.id, {
                text: `💡 Подсказка: ${hint}`,
                show_alert: true
            });
        }
    }
    
    // Кнопка "Не помню"
    else if (data.startsWith('dont_remember_')) {
        const cardId = data.replace('dont_remember_', '');
        const session = reviewSessions.get(chatId);
        
        if (session && session.currentCard && session.currentCard.id == cardId) {
            // Обновляем статистику как за неправильный ответ
            db.updateCardAfterReview(session.currentCard.id, false, (err) => {
                if (err) console.error('Error updating card:', err);
            });
            
            db.updateUserStats(chatId, false, (err) => {
                if (err) console.error('Error updating stats:', err);
            });
            
            const resultText = `💡 *Правильный ответ:* "${session.currentCard.answer}"\n\n` +
                             `📚 Не переживайте! Это нормально - иногда забывать.\n` +
                             `⭐ +2 опыта за честность`;
            
            const nextKeyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "➡️ Следующий вопрос", callback_data: "next_question" }]
                    ]
                }
            };
            
            bot.editMessageText(
                resultText,
                {
                    chat_id: chatId,
                    message_id: message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: nextKeyboard.reply_markup
                }
            );
            
            session.currentIndex++;
        }
        bot.answerCallbackQuery(callbackQuery.id);
    }
    
    // Следующий вопрос
    else if (data === 'next_question') {
        const session = reviewSessions.get(chatId);
        if (session) {
            session.currentIndex++;
            showNextCard(chatId);
        }
        bot.answerCallbackQuery(callbackQuery.id);
    }
    
    // Еще тренировка
    else if (data === 'review_again') {
        bot.deleteMessage(chatId, message.message_id);
        db.getDueCards(chatId, (err, cards) => {
            if (err || cards.length === 0) {
                bot.sendMessage(chatId, '🎉 Пока нет карточек для повторения!');
            } else {
                startReviewSession(chatId, cards);
            }
        });
        bot.answerCallbackQuery(callbackQuery.id);
    }
    
    // Показать статистику
    else if (data === 'show_stats') {
        bot.deleteMessage(chatId, message.message_id);
        db.getStats(chatId, (err, stats) => {
            if (!err && stats) {
                const levelProgress = (stats.experience % 100) || 0;
                const statsText = `📊 *Ваша статистика*\n\n` +
                                 `🎯 Уровень: *${stats.level}*\n` +
                                 `⭐ Опыт: ${stats.experience}\n` +
                                 `📚 Всего карточек: *${stats.total_cards}*\n` +
                                 `✅ Точность: *${stats.accuracy}%*\n` +
                                 `🔥 Серия: *${stats.streak}*`;
                
                const progressBar = createProgressBar(levelProgress);
                
                bot.sendMessage(chatId, 
                    statsText + `\n\n📈 Прогресс уровня:\n${progressBar}`,
                    { parse_mode: 'Markdown' }
                );
            }
        });
        bot.answerCallbackQuery(callbackQuery.id);
    }
    
    // Главное меню
    else if (data === 'main_menu') {
        bot.deleteMessage(chatId, message.message_id);
        bot.sendMessage(chatId, 
            '🏠 *Главное меню*\n\n' +
            '/add - Добавить карточку\n' +
            '/review - Тренировка\n' +
            '/stats - Статистика\n' +
            '/categories - Категории\n' +
            '/achievements - Достижения\n' +
            '/help - Помощь',
            { parse_mode: 'Markdown' }
        );
        bot.answerCallbackQuery(callbackQuery.id);
    }
});

// ==================== ОБРАБОТКА ВВОДА ТЕКСТА ====================
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userState = userStates.get(chatId);

    if (!userState || text.startsWith('/')) return;

    // Ввод новой категории
    if (userState.state === 'waiting_new_category') {
        userState.category = text;
        userState.state = 'waiting_question';
        
        bot.sendMessage(chatId, 
            `📁 Категория: *${text}*\n\n` +
            `📝 *Введите вопрос:*`,
            { parse_mode: 'Markdown' }
        );
    }
    
    // Ввод вопроса
    else if (userState.state === 'waiting_question') {
        userState.question = text;
        userState.state = 'waiting_answer';
        
        bot.sendMessage(chatId, '📚 *Теперь введите ответ:*', { parse_mode: 'Markdown' });
    }
    
    // Ввод ответа
else if (userState.state === 'waiting_answer') {
    userState.answer = text;
    
    // Сохраняем карточку
    db.addCard(chatId, {
        question: userState.question,
        answer: userState.answer,
        category: userState.category,
        card_type: 'text'
    }, (err, cardId) => {
        if (err) {
            bot.sendMessage(chatId, '❌ Ошибка при сохранении карточки');
            console.error(err);
        } else {
                const successKeyboard = {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "➕ Добавить еще", callback_data: "add_more" },
                                { text: "🎯 Тренировка", callback_data: "review_now" }
                            ],
                            [
                                { text: "📊 Статистика", callback_data: "show_stats" },
                                { text: "🏠 Главное меню", callback_data: "main_menu" }
                            ]
                        ]
                    }
                };
                
                bot.sendMessage(chatId, 
                    `✅ *Карточка добавлена!*\n\n` +
                    `📁 Категория: ${userState.category}\n` +
                    `❓ Вопрос: ${userState.question}\n` +
                    `📚 Ответ: ${userState.answer}\n\n` +
                    `🎯 Карточка будет ждать повторения!`,
                    { 
                        parse_mode: 'Markdown',
                        reply_markup: successKeyboard.reply_markup 
                    }
                );
            }
        });
        
        userStates.delete(chatId);
    }
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function generateHint(answer) {
    const words = answer.split(' ');
    if (words.length <= 1) {
        // Для коротких ответов показываем первую и последнюю буквы
        if (answer.length <= 3) {
            return answer[0] + '...';
        } else {
            return answer[0] + '...' + answer[answer.length - 1];
        }
    } else {
        // Для длинных ответов показываем первое слово
        return words[0] + '...';
    }
}

// ==================== СИСТЕМА НАПОМИНАНИЙ ====================
function checkDueCards() {
    console.log('🔍 Проверяем карточки для повторения...');
    
    db.getUsersWithDueCards((err, users) => {
        if (err) {
            console.error('Ошибка при проверке карточек:', err);
            return;
        }
        
        users.forEach(user => {
            const userId = user.user_id;
            
            db.getDueCards(userId, (err, cards) => {
                if (!err && cards.length > 0) {
                    bot.sendMessage(userId, 
                        `⏰ *Время повторить карточки!*\n\n` +
                        `У вас ${cards.length} карточек готовых к повторению.\n` +
                        `Напишите /review чтобы начать тренировку! 🎯`,
                        { parse_mode: 'Markdown' }
                    ).catch(err => {
                        if (err.response && err.response.statusCode === 403) {
                            console.log(`Пользователь ${userId} заблокировал бота`);
                        }
                    });
                }
            });
        });
    });
}

// Запускаем проверку каждые 30 минут
setInterval(checkDueCards, 30 * 60 * 1000);

// Первая проверка через 1 минуту после запуска
setTimeout(checkDueCards, 60 * 1000);

console.log('⏰ Система напоминаний активирована!');

// ==================== ТЕСТ БАЗЫ ДАННЫХ ====================
bot.onText(/\/testdb/, (msg) => {
    const chatId = msg.chat.id;
    
    console.log('🔍 Тестируем базу данных...');
    
    // Простая тестовая карточка с next_review = сейчас
    const testSql = `INSERT INTO flashcards (user_id, question, answer, category, next_review) 
                     VALUES (?, ?, ?, ?, datetime('now'))`;
    
    db.db.run(testSql, [chatId, 'Тестовый вопрос', 'Тестовый ответ', 'Тест'], function(err) {
        if (err) {
            bot.sendMessage(chatId, `❌ Ошибка базы: ${err.message}`);
            console.error('DB Error:', err);
        } else {
            bot.sendMessage(chatId, '✅ База данных работает! Карточка сохранена.');
            
            // Проверяем ВСЕ карточки (не только due)
            db.db.all('SELECT * FROM flashcards WHERE user_id = ?', [chatId], (err, cards) => {
                if (err) {
                    bot.sendMessage(chatId, `❌ Ошибка чтения: ${err.message}`);
                } else {
                    bot.sendMessage(chatId, `📊 Всего карточек в базе: ${cards ? cards.length : 0}`);
                    
                    // Проверяем due карточки отдельно
                    db.getDueCards(chatId, (err, dueCards) => {
                        if (err) {
                            bot.sendMessage(chatId, `❌ Ошибка due cards: ${err.message}`);
                        } else {
                            bot.sendMessage(chatId, `⏰ Карточек для повторения: ${dueCards ? dueCards.length : 0}`);
                        }
                    });
                }
            });
        }
    });
});

// ==================== ПРОВЕРКА ТАБЛИЦ ====================
bot.onText(/\/checktables/, (msg) => {
    const chatId = msg.chat.id;
    
    // Проверяем какие таблицы есть в базе
    db.db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
        if (err) {
            bot.sendMessage(chatId, `❌ Ошибка проверки таблиц: ${err.message}`);
        } else {
            let tablesText = '📋 Таблицы в базе:\n';
            tables.forEach(table => {
                tablesText += `• ${table.name}\n`;
            });
            bot.sendMessage(chatId, tablesText);
        }
    });
});

// Обработка текстовых ответов пользователя
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const session = reviewSessions.get(chatId);
    
    // Если есть активная сессия и это не команда - обрабатываем как ответ
    if (session && session.currentCard && !text.startsWith('/')) {
        processUserAnswer(chatId, text, session);
        return;
    }
    
    // Обработка состояний добавления карточки
    const userState = userStates.get(chatId);
    if (!userState || text.startsWith('/')) return;

    // Ввод новой категории
    if (userState.state === 'waiting_new_category') {
        userState.category = text;
        userState.state = 'waiting_question';
        
        bot.sendMessage(chatId, 
            `📁 Категория: *${text}*\n\n` +
            `📝 *Введите вопрос:*`,
            { parse_mode: 'Markdown' }
        );
    }
    
    // Ввод вопроса
    else if (userState.state === 'waiting_question') {
        userState.question = text;
        userState.state = 'waiting_answer';
        
        bot.sendMessage(chatId, '📚 *Теперь введите ответ:*', { parse_mode: 'Markdown' });
    }
    
    // Ввод ответа
    else if (userState.state === 'waiting_answer') {
        userState.answer = text;
        
        // Сохраняем карточку
       db.addCard(chatId, {
    question: userState.question,
    answer: userState.answer,
    category: userState.category,
    card_type: 'text'
}, (err, cardId) => {
            if (err) {
                bot.sendMessage(chatId, '❌ Ошибка при сохранении карточки');
                console.error(err);
            } else {
                const successKeyboard = {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "➕ Добавить еще", callback_data: "add_more" },
                                { text: "🎯 Тренировка", callback_data: "review_now" }
                            ],
                            [
                                { text: "📊 Статистика", callback_data: "show_stats" },
                                { text: "🏠 Главное меню", callback_data: "main_menu" }
                            ]
                        ]
                    }
                };
                
                bot.sendMessage(chatId, 
                    `✅ *Карточка добавлена!*\n\n` +
                    `📁 Категория: ${userState.category}\n` +
                    `❓ Вопрос: ${userState.question}\n` +
                    `📚 Ответ: ${userState.answer}\n\n` +
                    `🎯 Карточка будет ждать повторения!`,
                    { 
                        parse_mode: 'Markdown',
                        reply_markup: successKeyboard.reply_markup 
                    }
                );
            }
        });
        
        userStates.delete(chatId);
    }
});

// ==================== ОТЛАДКА ====================
bot.onText(/\/debug/, (msg) => {
    const chatId = msg.chat.id;
    const session = reviewSessions.get(chatId);
    const userState = userStates.get(chatId);
    
    let debugText = `🐛 *Отладочная информация:*\n\n`;
    debugText += `Активная сессия: ${session ? 'Да' : 'Нет'}\n`;
    if (session) {
        debugText += `Карточек в сессии: ${session.cards.length}\n`;
        debugText += `Текущая карточка: ${session.currentCard ? 'Да' : 'Нет'}\n`;
    }
    debugText += `Состояние пользователя: ${userState ? userState.state : 'Нет'}\n`;
    
    bot.sendMessage(chatId, debugText, { parse_mode: 'Markdown' });
});






