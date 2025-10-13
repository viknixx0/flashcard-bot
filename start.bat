@echo off
chcp 65001 > nul
title Flashcard Bot
cd /d "C:\Users\Professional\Desktop\flashcard-bot"

echo ===============================
echo   🚀 Flashcard Bot Launcher
echo ===============================
echo.
echo Папка: %CD%
echo.

:restart
echo Запускаем бота...
echo.
node bot.js

echo.
echo ===============================
echo Бот остановлен или произошла ошибка
echo.
echo 1 - Перезапустить бота
echo 2 - Открыть командную строку
echo 3 - Выйти
echo.
choice /c 123 /n /m "Выберите действие:"

if errorlevel 3 goto exit
if errorlevel 2 goto cmd
if errorlevel 1 goto restart

:cmd
cmd /k

:exit
echo Выход...
timeout /t 2 > nul