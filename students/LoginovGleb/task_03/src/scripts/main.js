/**
 * Главный файл приложения - управление UI и логикой
 */

import { getWeatherByCity, getCacheInfo, clearCache } from './weatherApi.js';
import { debounce, formatDateTime, kelvinToCelsius } from './utils.js';

// Состояние приложения
const state = {
    currentAbortController: null,
    searchHistory: []
};

// DOM элементы
const elements = {
    citySearch: document.getElementById('citySearch'),
    searchBtn: document.getElementById('searchBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    weatherCards: document.getElementById('weatherCards'),
    cacheInfo: document.getElementById('cacheInfo'),
    cityButtons: document.querySelectorAll('.city-btn')
};

/**
 * Инициализация приложения
 */
function init() {
    // Обработчик поиска по нажатию кнопки (использует кэш)
    elements.searchBtn.addEventListener('click', () => {
        handleSearch(false); // false = использовать кэш, если доступен
    });

    // Обработчик поиска по Enter (использует кэш)
    elements.citySearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch(false); // false = использовать кэш, если доступен
        }
    });

    // Debounced поиск при вводе (БОНУС: автопоиск с задержкой 500мс)
    // Автоматически ищет при наборе города (3+ символов)
    const debouncedSearch = debounce(() => {
        const value = elements.citySearch.value.trim();
        if (value.length >= 3) {
            handleSearch(false); // Использует кэш
        }
    }, 500);
    elements.citySearch.addEventListener('input', debouncedSearch);

    // Обработчик кнопки "Обновить" (ИГНОРИРУЕТ кэш и всегда загружает с сервера)
    elements.refreshBtn.addEventListener('click', () => {
        handleSearch(true); // true = игнорировать кэш и загрузить свежие данные
    });

    // Обработчики кнопок популярных городов (используют кэш)
    elements.cityButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const city = btn.dataset.city;
            elements.citySearch.value = city;
            handleSearch(false); // false = использовать кэш, если доступен
        });
    });

    // Загружаем погоду для первого города при загрузке (используем кэш)
    elements.citySearch.value = 'Moscow';
    handleSearch(false); // false = использовать кэш, если доступен
}

/**
 * Обработчик поиска погоды
 * @param {boolean} ignoreCache - Игнорировать кэш
 */
async function handleSearch(ignoreCache = false) {
    const cityName = elements.citySearch.value.trim();

    if (!cityName) {
        showError('Введите название города');
        return;
    }

    // Отменяем предыдущий запрос, если он есть
    if (state.currentAbortController) {
        state.currentAbortController.abort();
    }

    // Создаем новый контроллер для отмены
    state.currentAbortController = new AbortController();

    // Показываем состояние загрузки
    showLoading();

    try {
        // Запрос погоды
        const weatherData = await getWeatherByCity(cityName, {
            ignoreCache,
            signal: state.currentAbortController.signal
        });

        // Отображаем результат
        displayWeather(weatherData);

        // Показываем информацию о кэше
        displayCacheInfo(cityName, weatherData.fromCache);

        // Добавляем в историю
        addToHistory(cityName);

    } catch (error) {
        if (error.message.includes('отменен')) {
            console.log('Запрос был отменен');
        } else {
            showError(error.message);
        }
    } finally {
        state.currentAbortController = null;
    }
}

/**
 * Отображение состояния загрузки (skeleton)
 */
function showLoading() {
    elements.weatherCards.innerHTML = `
        <div class="weather-card skeleton">
            <div class="skeleton-header"></div>
            <div class="skeleton-temp"></div>
            <div class="skeleton-desc"></div>
            <div class="skeleton-details"></div>
        </div>
    `;
    elements.cacheInfo.textContent = '';
}

/**
 * Отображение ошибки
 */
function showError(message) {
    elements.weatherCards.innerHTML = `
        <div class="error-state">
            <div class="error-icon">⚠️</div>
            <h2>Ошибка</h2>
            <p>${message}</p>
        </div>
    `;
    elements.cacheInfo.textContent = '';
}

/**
 * Отображение данных о погоде
 */
function displayWeather(data) {
    const temp = kelvinToCelsius(data.main.temp);
    const feelsLike = kelvinToCelsius(data.main.feels_like);
    const icon = data.weather[0].icon;
    const iconUrl = `https://openweathermap.org/img/wn/${icon}@4x.png`;

    elements.weatherCards.innerHTML = `
        <div class="weather-card ${data.fromCache ? 'from-cache' : 'fresh'}">
            <div class="card-header">
                <h2>${data.name}, ${data.sys.country}</h2>
                <div class="cache-badge ${data.fromCache ? 'cached' : 'fresh'}">
                    ${data.fromCache ? '💾 Из кэша' : '🌐 Свежие данные'}
                </div>
            </div>
            
            <div class="weather-main">
                <img src="${iconUrl}" alt="${data.weather[0].description}" class="weather-icon">
                <div class="temperature">${temp}°C</div>
            </div>
            
            <div class="weather-description">
                ${data.weather[0].description}
            </div>
            
            <div class="weather-details">
                <div class="detail-item">
                    <span class="detail-label">Ощущается как</span>
                    <span class="detail-value">${feelsLike}°C</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Влажность</span>
                    <span class="detail-value">${data.main.humidity}%</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Давление</span>
                    <span class="detail-value">${data.main.pressure} hPa</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Ветер</span>
                    <span class="detail-value">${data.wind.speed} м/с</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Видимость</span>
                    <span class="detail-value">${(data.visibility / 1000).toFixed(1)} км</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Обновлено</span>
                    <span class="detail-value">${formatDateTime(data.dt)}</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Отображение информации о кэше
 */
function displayCacheInfo(cityName, fromCache) {
    const cacheInfo = getCacheInfo(cityName);

    if (fromCache) {
        // Данные были получены из кэша
        elements.cacheInfo.innerHTML = `
            <div class="cache-status cached">
                💾 Данные из кэша. Актуальны ещё <strong>${cacheInfo.remainingSec} сек</strong>
            </div>
        `;
    } else {
        // Данные были загружены с сервера
        elements.cacheInfo.innerHTML = `
            <div class="cache-status fresh">
                ✨ Свежие данные загружены с сервера. Сохранены в кэш на <strong>60 секунд</strong>
                <br>
                <small>При повторном поиске в течение минуты данные будут взяты из кэша.</small>
            </div>
        `;
    }
}

/**
 * Добавить город в историю поиска
 */
function addToHistory(cityName) {
    if (!state.searchHistory.includes(cityName)) {
        state.searchHistory.unshift(cityName);
        if (state.searchHistory.length > 10) {
            state.searchHistory.pop();
        }
    }
}

/**
 * Функция для принудительного обновления (игнорирование кэша)
 */
window.forceRefresh = function() {
    handleSearch(true);
};

/**
 * Очистка всего кэша (для отладки)
 */
window.clearAllCache = function() {
    clearCache();
    elements.cacheInfo.innerHTML = `
        <div class="cache-status fresh">
            🗑️ Весь кэш очищен
        </div>
    `;
};

// Запуск приложения
init();
