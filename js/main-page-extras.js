/**
 * main-page-extras.js - תכנים דינמיים לדף הבית
 * ================================================
 * קובץ זה אחראי על טעינת שני אזורים דינמיים בדף הבית (main.html):
 * 1. רצועת "המרצים המובילים" – מציגה את 4 המרצים עם הכי הרבה קורסים
 * 2. קרוסלת "מה התלמידים אומרים" – מציגה עד 6 ביקורות באקראי (דירוג 4+)
 *
 * בנוסף, הקובץ מסתיר את באנר ה-CTA ("הצטרפו!") אם המשתמש כבר מחובר.
 *
 * תלויות: Firebase Firestore (אוספים: courses, reviews, users)
 */

/* ---------- ייבוא פונקציות Firestore ---------- */
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

/**
 * waitForDb - ממתין עד שמסד הנתונים (window.db) יהיה מוכן
 * הקובץ auth.js מאתחל את ה-DB, אבל הוא עשוי לרוץ אחרי סקריפט זה.
 * לכן בודקים כל 100ms עד שה-DB זמין.
 * @returns {Promise<Firestore>} הבטחה שמתמלאת עם מופע ה-DB
 */
function waitForDb() {
  return new Promise((resolve) => {
    if (window.db) return resolve(window.db);
    const interval = setInterval(() => {
      if (window.db) {
        clearInterval(interval);
        resolve(window.db);
      }
    }, 100);
  });
}

/* ================================================================
   חלק 1: המרצים המובילים (Top Instructors)
   ================================================================ */

/**
 * loadTopInstructors - טוען ומציג את 4 המרצים עם הכי הרבה קורסים
 *
 * שלבי העבודה:
 * 1. שולף את כל הקורסים מ-Firestore
 * 2. בונה מפה (authorMap) שסופרת כמה קורסים לכל מרצה
 * 3. שולף פרטי פרופיל (תמונה, התמחות) מאוסף users
 * 4. ממיין לפי מספר קורסים (יורד) ולוקח את 4 הראשונים
 * 5. מרנדר כרטיסיות מרצים ב-HTML
 */
async function loadTopInstructors() {
  const container = document.getElementById("top-instructors-strip");
  if (!container) return;

  try {
    const db = await waitForDb();

    /* שלב 1: שליפת כל הקורסים וספירה לכל מרצה */
    const coursesSnap = await getDocs(collection(db, "courses"));
    const authorMap = {}; // מפה: authorId -> { courseCount, name, ... }

    coursesSnap.forEach((doc) => {
      const data = doc.data();
      if (data.authorId) {
        if (!authorMap[data.authorId]) {
          authorMap[data.authorId] = {
            id: data.authorId,
            name: data.authorName || "מרצה",
            courseCount: 0,
          };
        }
        authorMap[data.authorId].courseCount++;
      }
    });

    /* בדיקה שיש מרצים להצגה */
    const authorIds = Object.keys(authorMap);
    if (authorIds.length === 0) {
      container.innerHTML = "<p>אין מרצים להצגה כרגע.</p>";
      return;
    }

    /* שלב 2: שליפת פרטי פרופיל מאוסף users (תמונה, התמחות) */
    for (const aid of authorIds) {
      try {
        const { getDoc, doc: docRef } =
          await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
        const userDoc = await getDoc(docRef(db, "users", aid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          authorMap[aid].image =
            userData.photoURL ||
            "https://cdn-icons-png.flaticon.com/512/149/149071.png";
          authorMap[aid].expertise = userData.expertise || "";
          authorMap[aid].followersCount = userData.followersCount || 0;
        }
      } catch (e) {
        /* דילוג שקט אם המשתמש לא נמצא */
      }
    }

    /* שלב 3: מיון לפי מספר קורסים ובחירת 4 המובילים */
    const topInstructors = Object.values(authorMap)
      .sort((a, b) => b.courseCount - a.courseCount)
      .slice(0, 4);

    /* שלב 4: רינדור כרטיסיות מרצים */
    container.innerHTML = topInstructors
      .map(
        (inst) => `
      <a href="author-profile.html?id=${inst.id}" class="instructor-card">
        <img src="${inst.image || "https://cdn-icons-png.flaticon.com/512/149/149071.png"}" alt="${inst.name}" class="instructor-avatar" />
        <h4 class="instructor-name">${inst.name}</h4>
        <span class="instructor-expertise">${inst.expertise || "מרצה"}</span>
        <span class="instructor-meta">${inst.courseCount} קורסים</span>
      </a>
    `,
      )
      .join("");
  } catch (error) {
    console.error("שגיאה בטעינת המרצים המובילים:", error);
    container.innerHTML = "<p>שגיאה בטעינת המרצים.</p>";
  }
}

/* ================================================================
   חלק 2: המלצות תלמידים (Testimonials)
   ================================================================ */

/**
 * loadTestimonials - טוען ומציג ביקורות חיוביות (דירוג 4+) בקרוסלה
 *
 * שלבי העבודה:
 * 1. שולף את כל הביקורות מ-Firestore
 * 2. מסנן רק ביקורות עם דירוג 4+ שיש להן תוכן טקסטי
 * 3. מערבב את הרשימה באקראי ולוקח עד 6
 * 4. מרנדר כרטיסיות ביקורת ב-HTML
 */
async function loadTestimonials() {
  const container = document.getElementById("testimonials-carousel");
  if (!container) return;

  try {
    const db = await waitForDb();

    /* שליפת כל הביקורות */
    const reviewsSnap = await getDocs(collection(db, "reviews"));

    /* סינון: רק ביקורות עם דירוג 4+ ותוכן */
    const reviews = [];
    reviewsSnap.forEach((doc) => {
      const data = doc.data();
      if (data.rating && data.rating >= 4 && data.comment) {
        reviews.push(data);
      }
    });

    if (reviews.length === 0) {
      container.innerHTML = "<p>אין המלצות להצגה כרגע.</p>";
      return;
    }

    /* ערבוב אקראי ובחירת עד 6 ביקורות */
    const shuffled = reviews.sort(() => 0.5 - Math.random()).slice(0, 6);

    /* רינדור כרטיסיות ביקורת */
    container.innerHTML = shuffled
      .map(
        (r) => `
      <div class="testimonial-card">
        <div class="testimonial-quote">"</div>
        <p class="testimonial-text">${r.comment}</p>
        <div class="testimonial-footer">
          <span class="testimonial-name">${r.userName || "תלמיד/ה"}</span>
          <span class="testimonial-course">${r.courseTitle || ""}</span>
        </div>
        <div class="testimonial-stars">${"⭐".repeat(r.rating || 5)}</div>
      </div>
    `,
      )
      .join("");
  } catch (error) {
    console.error("שגיאה בטעינת ההמלצות:", error);
    container.innerHTML = "<p>שגיאה בטעינת ההמלצות.</p>";
  }
}

/* ================================================================
   חלק 3: אתחול הדף
   ================================================================ */
document.addEventListener("DOMContentLoaded", () => {
  /* השהייה קצרה כדי לתת ל-auth.js לאתחל את ה-DB */
  setTimeout(() => {
    /* טעינת שני אזורי התוכן הדינמיים */
    loadTopInstructors();
    loadTestimonials();

    /* הסתרת באנר ה-CTA ("הצטרפו!") אם המשתמש כבר מחובר */
    const ctaBanner = document.querySelector(".cta-banner");
    if (ctaBanner) {
      /* בדיקה מחזורית – ממתין עד שמערכת ההזדהות (auth) תהיה מוכנה */
      const checkAuth = setInterval(() => {
        if (window.auth) {
          clearInterval(checkAuth);
          /* ייבוא דינמי של מאזין מצב הזדהות */
          import("https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js").then(
            ({ onAuthStateChanged }) => {
              onAuthStateChanged(window.auth, (user) => {
                if (user) {
                  /* משתמש מחובר – מסתיר את הבאנר כי הוא כבר רשום */
                  ctaBanner.style.display = "none";
                }
              });
            },
          );
        }
      }, 200);
    }
  }, 500);
});
