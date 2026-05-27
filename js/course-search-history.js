/**
 * course-search-history.js - היסטוריית חיפוש קורסים
 * ===================================================
 * קובץ זה מנהל את היסטוריית החיפוש של המשתמש בעמוד "כל הקורסים".
 * ההיסטוריה נשמרת באופן מקומי בדפדפן (localStorage) ומוצגת
 * כתפריט נפתח (Dropdown) ברגע שהמשתמש לוחץ על תיבת החיפוש.
 *
 * תכונות עיקריות:
 * - שמירת עד 5 חיפושים אחרונים
 * - הסרת כפילויות (אם מחפשים אותו מונח שוב, הוא עולה לראש הרשימה)
 * - לחיצה על פריט מההיסטוריה ממלאת את תיבת החיפוש ומפעילה סינון
 * - כפתור "מחק היסטוריית חיפוש" לניקוי כל ההיסטוריה
 */

document.addEventListener('DOMContentLoaded', () => {
    /* חיפוש אלמנט תיבת החיפוש – אם לא קיים, הסקריפט לא רץ */
    const input = document.getElementById('courseSearch');
    if (!input) return;

    /* ---------- בניית אלמנט ה-Dropdown ---------- */
    const dropdown = document.createElement('div');
    dropdown.className = 'search-history-dropdown';
    /* מצרף את ה-Dropdown כילד של אלמנט האב של תיבת החיפוש
       (ה-CSS כבר מגדיר position: relative ל-.search-container) */
    input.parentNode.appendChild(dropdown);

    /* ---------- קבועים ---------- */
    const STORAGE_KEY = 'courseSearchHistory';  // מפתח השמירה ב-localStorage
    const MAX_HISTORY = 5;                     // מספר מקסימלי של פריטים בהיסטוריה

    /**
     * getHistory - שולף את מערך ההיסטוריה מ-localStorage
     * @returns {string[]} מערך של מונחי חיפוש, או מערך ריק אם אין
     */
    function getHistory() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch(e) {
            return [];
        }
    }

    /**
     * saveToHistory - שומר מונח חיפוש חדש בהיסטוריה
     * @param {string} term - מונח החיפוש לשמירה
     * המונח החדש מוכנס לראש הרשימה. אם הוא כבר קיים – הוא מוסר מהמיקום הישן.
     * הרשימה נחתכת ל-MAX_HISTORY פריטים.
     */
    function saveToHistory(term) {
        term = term.trim();
        if (!term) return;

        let history = getHistory();
        /* הסרת המונח מההיסטוריה אם כבר קיים (למניעת כפילויות) */
        history = history.filter(t => t.toLowerCase() !== term.toLowerCase());
        /* הכנסת המונח החדש לראש הרשימה */
        history.unshift(term);
        
        /* חיתוך למספר המקסימלי */
        if (history.length > MAX_HISTORY) {
            history = history.slice(0, MAX_HISTORY);
        }
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    }

    /**
     * renderHistory - מרנדר את רשימת ההיסטוריה בתוך ה-Dropdown
     * יוצר אלמנט div לכל פריט עם אייקון שעון ואת מונח החיפוש.
     * בסוף הרשימה מוסיף כפתור "מחק היסטוריה".
     */
    function renderHistory() {
        const history = getHistory();
        dropdown.innerHTML = '';
        
        /* אם אין היסטוריה – סוגר את ה-Dropdown */
        if (history.length === 0) {
            dropdown.classList.remove('active');
            return;
        }

        /* יצירת שורה לכל מונח חיפוש */
        history.forEach(term => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `<span class="history-icon">🕒</span> <span>${term}</span>`;
            
            /* לחיצה על פריט – ממלאת את תיבת החיפוש ומפעילה סינון */
            item.addEventListener('mousedown', (e) => {
                /* mousedown מתרחש לפני blur, כך שהלחיצה תתפוס */
                e.preventDefault();
                input.value = term;
                dropdown.classList.remove('active');
                
                /* הפעלת פונקציית הסינון הגלובלית */
                if (typeof window.filterCourses === 'function') {
                    window.filterCourses();
                } else {
                    /* גיבוי – שולח אירוע keyup ידנית אם הפונקציה לא זמינה */
                    const ev = new KeyboardEvent('keyup');
                    input.dispatchEvent(ev);
                }
            });
            dropdown.appendChild(item);
        });

        /* כפתור מחיקת היסטוריה – מופיע בתחתית הרשימה */
        const clearBtn = document.createElement('div');
        clearBtn.className = 'history-clear-btn';
        clearBtn.innerText = 'מחק היסטוריית חיפוש';
        clearBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            localStorage.removeItem(STORAGE_KEY);
            dropdown.classList.remove('active');
            input.focus();
        });
        dropdown.appendChild(clearBtn);
        
        /* הצגת ה-Dropdown */
        dropdown.classList.add('active');
    }

    /* ---------- אירועים (Event Listeners) ---------- */

    /* פוקוס על תיבת החיפוש – פותח את ההיסטוריה */
    input.addEventListener('focus', () => {
        renderHistory();
    });

    /* יציאה מתיבת החיפוש (blur) – סוגר את ההיסטוריה ושומר את המונח */
    input.addEventListener('blur', () => {
        dropdown.classList.remove('active');
        saveToHistory(input.value);
    });

    /* לחיצה על Enter – שומר את המונח וסוגר את ה-Dropdown */
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            saveToHistory(input.value);
            dropdown.classList.remove('active');
            input.blur();
        }
    });
});
