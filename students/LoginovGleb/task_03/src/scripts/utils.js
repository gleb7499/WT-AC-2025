/**
 * Утилиты для работы с HTTP запросами, кэшем и обработкой событий
 */

/**
 * Класс для управления кэшем с TTL (time-to-live)
 */
export class CacheWithTTL {
    constructor(ttlMs = 60000) { // По умолчанию 1 минута
        this.cache = new Map();
        this.ttlMs = ttlMs;
    }

    /**
     * Сохранить значение в кэш
     */
    set(key, value) {
        const expiresAt = Date.now() + this.ttlMs;
        this.cache.set(key, { value, expiresAt });
    }

    /**
     * Получить значение из кэша (null если истек TTL или не найдено)
     */
    get(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;

        if (Date.now() > cached.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return cached.value;
    }

    /**
     * Проверить, есть ли валидное значение в кэше
     */
    has(key) {
        return this.get(key) !== null;
    }

    /**
     * Очистить весь кэш
     */
    clear() {
        this.cache.clear();
    }

    /**
     * Получить информацию о кэше для ключа
     */
    getCacheInfo(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;

        const now = Date.now();
        const isExpired = now > cached.expiresAt;
        const remainingMs = isExpired ? 0 : cached.expiresAt - now;

        return {
            isExpired,
            remainingMs,
            remainingSec: Math.ceil(remainingMs / 1000)
        };
    }
}

/**
 * Fetch с повторными попытками, таймаутом и отменой
 * @param {string} url - URL для запроса
 * @param {Object} options - Опции запроса
 * @param {number} options.retries - Количество повторных попыток (по умолчанию 2)
 * @param {number} options.backoffMs - Начальная задержка между попытками (по умолчанию 500)
 * @param {number} options.timeoutMs - Таймаут запроса в мс (по умолчанию 5000)
 * @param {AbortSignal} options.signal - Сигнал для отмены запроса
 * @returns {Promise<any>} - Распарсенный JSON ответ
 */
export async function fetchWithRetry(url, {
    retries = 2,
    backoffMs = 500,
    timeoutMs = 5000,
    signal = null
} = {}) {
    let attempt = 0;
    let lastError;

    while (attempt <= retries) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        // Комбинируем сигналы: внешний и для таймаута
        const combinedSignal = signal 
            ? combineAbortSignals(signal, controller.signal)
            : controller.signal;

        try {
            const response = await fetch(url, { signal: combinedSignal });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            lastError = error;

            // Если запрос был отменен извне, не повторяем
            if (signal?.aborted) {
                throw new Error('Запрос был отменен');
            }

            // Если это таймаут или сетевая ошибка и есть еще попытки
            if (attempt < retries) {
                const delay = backoffMs * Math.pow(2, attempt);
                console.warn(`Попытка ${attempt + 1} не удалась. Повтор через ${delay}мс...`);
                await sleep(delay);
                attempt++;
            } else {
                break;
            }
        }
    }

    throw new Error(`Не удалось выполнить запрос после ${retries + 1} попыток: ${lastError.message}`);
}

/**
 * Комбинирует несколько AbortSignal в один
 */
function combineAbortSignals(...signals) {
    const controller = new AbortController();
    
    for (const signal of signals) {
        if (signal.aborted) {
            controller.abort();
            return controller.signal;
        }
        signal.addEventListener('abort', () => controller.abort());
    }
    
    return controller.signal;
}

/**
 * Debounce функция - откладывает выполнение
 * @param {Function} fn - Функция для вызова
 * @param {number} ms - Задержка в миллисекундах
 * @returns {Function} - Debounced функция
 */
export function debounce(fn, ms = 300) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), ms);
    };
}

/**
 * Промис с задержкой
 * @param {number} ms - Время задержки в миллисекундах
 * @returns {Promise<void>}
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Форматирование даты и времени
 */
export function formatDateTime(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Преобразование температуры из Кельвинов в Цельсии
 */
export function kelvinToCelsius(kelvin) {
    return Math.round(kelvin - 273.15);
}
