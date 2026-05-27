/**
 * loader.js - מסך טעינה גלובלי (Loader/Splash Screen)
 * =====================================================
 * קובץ זה אחראי על הצגת אנימציית טעינה (ספינר + לוגו) ברגע שהדף נפתח.
 * הוא רץ ראשון בסדר הסקריפטים כדי שהמשתמש יראה מיד מסך טעינה
 * עד שכל התוכן והסקריפטים יסיימו להיטען.
 *
 * שים לב: ה-CSS מוטמע ישירות בתוך ה-HTML של הלואדר (inline)
 * כדי שלא יצטרך לחכות לטעינת קובץ style.css חיצוני.
 */

/* ---------- יצירת ה-HTML של מסך הטעינה ---------- */
const loaderHTML = `
<div id="global-loader">
    <div class="loader-content">
        <div class="edu-spinner"></div>
        <div class="loader-logo"><span>Edu</span>com</div>
    </div>
</div>
<style>
    /* מסך הטעינה – שכבה קבועה שמכסה את כל המסך */
    #global-loader {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background-color: #ffffff; display: flex; justify-content: center;
        align-items: center; z-index: 9999; transition: opacity 0.6s ease;
    }
    /* ספינר מסתובב – עיגול עם גבולות צבעוניים */
    .edu-spinner {
        width: 50px; height: 50px; border: 5px solid #f3f3f3;
        border-top: 5px solid #1691fd; border-right: 5px solid #ebab0c;
        border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 15px;
    }
    /* לוגו הטקסט – "Edu" בכחול ו-"com" בצהוב */
    .loader-logo { font-size: 24px; font-weight: bold; color: #ebab0c; font-family: sans-serif; }
    .loader-logo span { color: #1691fd; }
    /* אנימציית סיבוב הספינר */
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    /* מחלקת הסתרה – מופעלת כשהטעינה מסתיימת */
    .loader-hidden { opacity: 0; visibility: hidden; }
</style>
`;

/* ---------- הזרקה מיידית של מסך הטעינה לתחילת ה-body ---------- */
document.body.insertAdjacentHTML("afterbegin", loaderHTML);

/**
 * hideLoader – פונקציה גלובלית להסתרת מסך הטעינה
 * נקראת אוטומטית לאחר 3 שניות, או ידנית מתוך סקריפטים אחרים
 * (למשל אחרי שכל הקורסים נטענו מ-Firebase).
 */
window.hideLoader = function () {
  const loader = document.getElementById("global-loader");
  if (loader && !loader.classList.contains("loader-hidden")) {
    loader.classList.add("loader-hidden");
    document.body.classList.add("content-loaded");
  }
};

/**
 * גיבוי אוטומטי (Fallback) – אם אף סקריפט לא הסתיר את הלואדר ידנית,
 * הוא ייעלם מעצמו אחרי 3 שניות מרגע שהדף סיים להיטען (אירוע "load").
 * זה מונע מצב של מסך טעינה אינסופי במקרה של שגיאה.
 */
window.addEventListener("load", () => {
  setTimeout(() => {
    window.hideLoader();
  }, 3000);
});
