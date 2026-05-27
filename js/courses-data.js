/**
 * courses-data.js - נתוני קורסים ולוגיקת תצוגה
 * ================================================
 * קובץ זה הוא הליבה של מערכת הקורסים.
 * הוא אחראי על:
 * 1. שליפת כל הקורסים מ-Firebase ושמירתם ב-window.allCourses
 * 2. יצירת כרטיסיית קורס (HTML) עם פופאפ מרצה
 * 3. סינון קורסים לפי חיפוש טקסט וקטגוריה
 * 4. מילוי דינמי של הקורסים בדף הבית, דף כל הקורסים, ודרופדאון הניווט
 *
 * הקובץ נטען כ-module בכל דף שמציג קורסים.
 * מגדיר פונקציות גלובליות (window) שזמינות מ-HTML:
 * - createCourseCard, filterCourses, setCategoryFilter, toggleAuthorPopup
 */

/* ---------- ייבוא שירות הקורסים ---------- */
import { getAllCourses } from "./firebase-course-service.js";

/** מערך גלובלי שמכיל את כל הקורסים מ-Firebase */
window.allCourses = [];

/* ================================================================
   חלק 1: יצירת כרטיסיית קורס (Course Card)
   ================================================================ */

/**
 * createCourseCard - בונה HTML של כרטיסיית קורס בודדת
 * @param {Object} course - אובייקט הקורס מ-Firestore
 * @returns {string} מחרוזת HTML של הכרטיסייה
 *
 * הכרטיסייה כוללת:
 * - תמונת קורס + כותרת + תיאור + קישור לדף הקורס
 * - אייקון מרצה (badge) בפינה – לחיצה עליו פותחת פופאפ
 * - פופאפ מרצה עם תמונה, שם, וקישור לפרופיל המלא
 */
window.createCourseCard = function (course) {
  /* קישור לדף הקורס – לפי מזהה, או fallback */
  const link = course.id ? `course.html?id=${course.id}` : course.link || "#";
  const authorName = course.authorName || "מרצה";
  const authorImage =
    course.authorImage ||
    "https://cdn-icons-png.flaticon.com/512/149/149071.png";
  const authorId = course.authorId || "";

  /* מזהה ייחודי לפופאפ המרצה */
  const popupId = `popup-${course.id || Math.random().toString(36).substr(2, 9)}`;

  return `
        <div class="course-card-wrapper" style="position: relative;">
            <!-- קישור לכרטיסיית הקורס -->
            <a href="${link}" class="course-card-link">
                <div class="course">
                    <div class="course-image-wrapper">
                        <img src="${course.image}" alt="${course.title}" onerror="this.src='https://via.placeholder.com/300?text=No+Image'">
                    </div>
                    <div class="course-info">
                        <h3>${course.title}</h3>
                        <p>${course.desc || course.description}</p>
                        <span class="btn-fake">לפרטים נוספים</span>
                    </div>
                </div>
            </a>
            
            <!-- אייקון המרצה (Badge) – לחיצה פותחת פופאפ -->
            <div class="course-author-badge" onclick="event.preventDefault(); toggleAuthorPopup('${popupId}')" title="${authorName}">
                <img src="${authorImage}" alt="${authorName}">
            </div>

            <!-- פופאפ המרצה – נפתח מעל הכרטיסייה -->
            <div id="${popupId}" class="author-popup">
                ${authorId ? `<a href="author-profile.html?id=${authorId}"><img src="${authorImage}" class="popup-avatar" style="width: 50px; height: 50px; border-radius: 50%; margin: 0 auto; display: block; cursor: pointer;" title="לפרופיל המלא"></a>` : `<img src="${authorImage}" style="width: 50px; height: 50px; border-radius: 50%; margin: 0 auto; display: block;">`}
                <h4>${authorName}</h4>
                <p>מרצה בקורס זה</p>
                <div style="margin-top: 10px;">
                </div>
                </div>
            </div>
        </div>
    `;
};

/* ================================================================
   חלק 2: ניהול פופאפ מרצה
   ================================================================ */

/**
 * toggleAuthorPopup - פותח/סוגר פופאפ מרצה בלחיצה על ה-badge
 * @param {string} popupId - מזהה ה-DOM של הפופאפ
 *
 * הלוגיקה:
 * 1. סוגר את כל הפופאפים האחרים הפתוחים
 * 2. מחליף מצב (toggle) של הפופאפ הנוכחי
 * 3. מרים את z-index של הכרטיסייה כדי שהפופאפ יופיע מעל
 * 4. מוסיף מאזין לסגירה בלחיצה מחוץ לאזור הפופאפ
 */
window.toggleAuthorPopup = function (popupId) {
  const popup = document.getElementById(popupId);
  if (!popup) return;

  /* סגירת כל הפופאפים האחרים */
  document.querySelectorAll(".author-popup.active").forEach((p) => {
    if (p.id !== popupId) p.classList.remove("active");
  });
  document.querySelectorAll(".course-card-wrapper").forEach((wrapper) => {
    wrapper.style.zIndex = "1";
  });

  /* החלפת מצב הפופאפ הנוכחי */
  popup.classList.toggle("active");

  /* הרמת z-index של הכרטיסייה כדי שהפופאפ יופיע מעל שאר הכרטיסיות */
  if (popup.classList.contains("active")) {
    const parentWrapper = popup.closest(".course-card-wrapper");
    if (parentWrapper) {
      parentWrapper.style.zIndex = "99";
    }
  }

  /* מאזין לסגירה בלחיצה מחוץ לפופאפ */
  if (popup.classList.contains("active")) {
    setTimeout(() => {
      document.addEventListener("click", window.closePopupsOutside);
    }, 0);
  }
};

/**
 * closePopupsOutside - סוגר את כל הפופאפים בלחיצה מחוץ לאזור שלהם
 * @param {Event} e - אירוע הלחיצה
 */
window.closePopupsOutside = function (e) {
  if (
    !e.target.closest(".author-popup") &&
    !e.target.closest(".course-author-badge")
  ) {
    document
      .querySelectorAll(".author-popup.active")
      .forEach((p) => p.classList.remove("active"));
    document.querySelectorAll(".course-card-wrapper").forEach((wrapper) => {
      wrapper.style.zIndex = "1";
    });
    document.removeEventListener("click", window.closePopupsOutside);
  }
};

/* ================================================================
   חלק 3: סינון וקטגוריות
   ================================================================ */

/** הקטגוריה הנוכחית לסינון (ברירת מחדל: הכל) */
window.currentCategory = "all";

/**
 * מפת מילות מפתח לכל קטגוריה
 * משמשת כגיבוי לקורסים ישנים שאין להם שדה category מפורש.
 * הסינון חיפושי מתבצע על כותרת + תיאור הקורס.
 */
const categoryKeywords = {
  programming: [
    "python", "javascript", "java", "react", "node", "תכנות", "פיתוח",
    "קוד", "web", "אתר", "fullstack", "frontend", "backend", "sql",
    "html", "css", "c#", "c++", "php", "api",
  ],
  design: [
    "עיצוב", "design", "figma", "photoshop", "ui", "ux", "גרפי",
    "אילוסטרייטור", "illustrator", "canva", "לוגו",
  ],
  marketing: [
    "שיווק", "marketing", "seo", "sem", "פרסום", "דיגיטלי",
    "רשתות חברתיות", "social", "google ads", "תוכן", "קופירייטינג",
  ],
  business: [
    "עסקים", "ניהול", "business", "management", "פרויקטים", "אסטרטגיה",
    "יזמות", "כלכלה", "חשבונאות", "מנהיגות", "מכירות",
  ],
};

/** שמות הקטגוריות בעברית – לכותרת הסקציה */
const categoryNames = {
  all: "כל הקורסים שלנו",
  programming: "קורסי תכנות ופיתוח",
  design: "קורסי עיצוב גרפי",
  marketing: "קורסי שיווק דיגיטלי",
  business: "קורסי עסקים וניהול",
};

/**
 * setCategoryFilter - מגדיר את הקטגוריה הפעילה ומסנן
 * @param {string} category - מפתח הקטגוריה (all/programming/design/marketing/business)
 * @param {HTMLElement} btn - כפתור הצ'יפ שנלחץ (לסימון כ-active)
 */
window.setCategoryFilter = function (category, btn) {
  window.currentCategory = category;

  /* עדכון הצ'יפ הפעיל */
  document
    .querySelectorAll(".cat-chip")
    .forEach((c) => c.classList.remove("active"));
  if (btn) btn.classList.add("active");

  /* עדכון כותרת הסקציה */
  const titleEl = document.getElementById("courses-section-title");
  if (titleEl)
    titleEl.textContent = categoryNames[category] || "כל הקורסים שלנו";

  filterCourses();
};

/**
 * filterCourses - מסנן את הקורסים לפי קטגוריה + חיפוש טקסט
 * פונקציה גלובלית (window) – נקראת מ-HTML (onkeyup בשורת חיפוש)
 * ומ-setCategoryFilter.
 *
 * סדר הסינון:
 * 1. קודם לפי קטגוריה (אם לא "all")
 * 2. אחר כך לפי טקסט חיפוש חופשי (אם הוזן)
 */
window.filterCourses = function () {
  const searchInput = document.getElementById("courseSearch");
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";
  const category = window.currentCategory || "all";

  let filtered = window.allCourses;

  /* סינון לפי קטגוריה */
  if (category !== "all") {
    filtered = filtered.filter((course) => {
      /* ראשוני: שימוש בשדה category מ-Firestore */
      if (course.category) {
        return course.category === category;
      }
      /* גיבוי לקורסים ישנים: חיפוש מילות מפתח בכותרת ותיאור */
      if (categoryKeywords[category]) {
        const text = (
          (course.title || "") +
          " " +
          (course.desc || "") +
          " " +
          (course.description || "")
        ).toLowerCase();
        return categoryKeywords[category].some((kw) => text.includes(kw));
      }
      return false;
    });
  }

  /* סינון לפי טקסט חיפוש (על גבי הסינון הקטגורי) */
  if (searchTerm) {
    filtered = filtered.filter(
      (course) =>
        (course.title && course.title.toLowerCase().includes(searchTerm)) ||
        (course.desc && course.desc.toLowerCase().includes(searchTerm)) ||
        (course.description &&
          course.description.toLowerCase().includes(searchTerm)),
    );
  }

  /* רינדור התוצאות */
  const coursesGrid = document.getElementById("all-courses-grid");
  if (coursesGrid) {
    if (filtered.length === 0) {
      coursesGrid.innerHTML = `<p style="text-align:center; width:100%; grid-column: 1/-1;">לא נמצאו קורסים בקטגוריה זו.</p>`;
    } else {
      coursesGrid.innerHTML = filtered
        .map((course) => createCourseCard(course))
        .join("");
    }
  }
};

/* ================================================================
   חלק 4: אתחול הדף
   ================================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    /* שליפת כל הקורסים מ-Firebase */
    window.allCourses = await getAllCourses();
  } catch (error) {
    console.error("שגיאה בטעינת הקורסים:", error);
  }

  /* --- מילוי דרופדאון הקורסים ב-Navbar (בכל דף) --- */
  const dropdownContainer = document.getElementById("nav-dropdown-list");
  if (dropdownContainer) {
    dropdownContainer.innerHTML = window.allCourses
      .map(
        (course) =>
          `<a href="${course.id ? `course.html?id=${course.id}` : "#"}">${course.title}</a>`,
      )
      .join("");
  }

  /* --- מילוי דף הבית (main.html) – 4 קורסים ראשונים --- */
  const mainGrid = document.getElementById("main-courses-grid");
  if (mainGrid) {
    const featured = window.allCourses.slice(0, 4);
    if (featured.length === 0) {
      mainGrid.innerHTML = `<p style="text-align:center; width:100%">אין קורסים זמינים כרגע.</p>`;
    } else {
      mainGrid.innerHTML = featured
        .map((course) => createCourseCard(course))
        .join("");
    }
  }

  /* --- מילוי דף "כל הקורסים" (all-courses.html) --- */
  const allGrid = document.getElementById("all-courses-grid");
  if (allGrid) {
    /* בדיקה אם יש פרמטר קטגוריה ב-URL (למשל ?category=Programming) */
    const urlParams = new URLSearchParams(window.location.search);
    const categoryParam = urlParams.get("category");

    if (categoryParam && categoryParam !== "all") {
      /* הפעלת הצ'יפ המתאים */
      const chips = document.querySelectorAll(".cat-chip");
      chips.forEach((chip) => {
        chip.classList.remove("active");
        if (
          chip.onclick &&
          chip.onclick.toString().includes(`'${categoryParam}'`)
        ) {
          chip.classList.add("active");
        }
      });

      /* סינון לפי הקטגוריה מה-URL */
      const matchingChip = document.querySelector(
        `.cat-chip[onclick*="'${categoryParam}'"]`,
      );
      if (matchingChip) {
        window.setCategoryFilter(categoryParam, matchingChip);
      } else {
        window.currentCategory = categoryParam;
        filterCourses();
      }
    } else {
      /* אין קטגוריה – הצגת כל הקורסים */
      if (window.allCourses.length === 0) {
        allGrid.innerHTML = `<p style="text-align:center; width:100%">אין קורסים זמינים כרגע.</p>`;
      } else {
        allGrid.innerHTML = window.allCourses
          .map((course) => createCourseCard(course))
          .join("");
      }
    }
  }

  /* הסתרת מסך הטעינה */
  if (window.hideLoader) {
    window.hideLoader();
  }
});
