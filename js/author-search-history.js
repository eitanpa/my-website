/**
 * author-search-history.js - היסטוריית חיפוש מרצים
 * ==================================================
 * קובץ זה מנהל את היסטוריית החיפוש של המשתמש בעמוד "המרצים שלנו".
 * הלוגיקה זהה ל-course-search-history.js, אך עם מפתח LocalStorage
 * נפרד ('authorSearchHistory') ופונקציית סינון שונה (filterAuthors).
 *
 * תכונות עיקריות:
 * - שמירת עד 5 חיפושים אחרונים בנפרד מחיפושי הקורסים
 * - תפריט Dropdown שנפתח בלחיצה על תיבת חיפוש המרצים
 * - לחיצה על פריט מחזירה את מונח החיפוש ומסננת את רשימת המרצים
 */

document.addEventListener('DOMContentLoaded', () => {
    /* חיפוש אלמנט תיבת חיפוש המרצים – אם לא קיים, הסקריפט לא רץ */
    const input = document.getElementById('authorSearch');
    if (!input) return;

    /* ---------- בניית אלמנט ה-Dropdown ---------- */
    const dropdown = document.createElement('div');
    dropdown.className = 'search-history-dropdown';
    /* מצרף את ה-Dropdown תחת אלמנט ה-.search-wrapper */
    input.parentNode.appendChild(dropdown);

    /* ---------- קבועים ---------- */
    const STORAGE_KEY = 'authorSearchHistory';  // מפתח ייחודי (שונה מחיפוש קורסים)
    const MAX_HISTORY = 5;                     // מספר מקסימלי של פריטים

    /**
     * getHistory - שולף את מערך ההיסטוריה של חיפוש מרצים מ-localStorage
     * @returns {string[]} מערך של מונחי חיפוש
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
     * @param {string} term - המונח לשמירה
     */
    function saveToHistory(term) {
        term = term.trim();
        if (!term) return;

        let history = getHistory();
        /* הסרת כפילויות */
        history = history.filter(t => t.toLowerCase() !== term.toLowerCase());
        /* הכנסה לראש הרשימה */
        history.unshift(term);
        
        if (history.length > MAX_HISTORY) {
            history = history.slice(0, MAX_HISTORY);
        }
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    }

    /**
     * renderHistory - מרנדר את רשימת ההיסטוריה בתוך ה-Dropdown
     */
    function renderHistory() {
        const history = getHistory();
        dropdown.innerHTML = '';
        
        if (history.length === 0) {
            dropdown.classList.remove('active');
            return;
        }

        /* יצירת שורה לכל מונח חיפוש */
        history.forEach(term => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `<span class="history-icon">🕒</span> <span>${term}</span>`;
            
            /* לחיצה על פריט – ממלאת את שורת החיפוש ומסננת מרצים */
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                input.value = term;
                dropdown.classList.remove('active');
                
                /* הפעלת פונקציית סינון המרצים */
                if (typeof window.filterAuthors === 'function') {
                    window.filterAuthors();
                } else {
                    /* גיבוי – שולח אירוע keyup ידנית */
                    const ev = new KeyboardEvent('keyup');
                    input.dispatchEvent(ev);
                }
            });
            dropdown.appendChild(item);
        });

        /* כפתור מחיקת ההיסטוריה */
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
        
        dropdown.classList.add('active');
    }

    /* ---------- אירועים (Event Listeners) ---------- */

    /* פוקוס – פותח את ההיסטוריה */
    input.addEventListener('focus', () => {
        renderHistory();
    });

    /* יציאה מפוקוס – סוגר ושומר */
    input.addEventListener('blur', () => {
        dropdown.classList.remove('active');
        saveToHistory(input.value);
    });

    /* לחיצה על Enter – שומר וסוגר */
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            saveToHistory(input.value);
            dropdown.classList.remove('active');
            input.blur();
        }
    });
});
