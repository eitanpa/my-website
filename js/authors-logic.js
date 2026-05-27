/**
 * authors-logic.js - לוגיקת עמוד המרצים
 * ========================================
 * קובץ זה מנהל את עמוד "המרצים המובילים" (authors.html).
 *
 * תכונות:
 * 1. טעינת כל המרצים (role: "lecturer") מ-Firestore עם סטטיסטיקות
 * 2. חישוב מספר קורסים ודירוג ממוצע לכל מרצה
 * 3. סינון לפי טקסט חיפוש וקטגוריה (תכנות, עיצוב, שיווק, עסקים)
 * 4. מיון לפי דירוג או מספר קורסים
 * 5. מעקב/הפסקת מעקב אחר מרצים (Follow/Unfollow)
 * 6. כרטיסיות מרצה מתרחבות בלחיצה עם מידע נוסף
 *
 * אוספי Firestore: users (מרצים), courses (קורסים), reviews (ביקורות)
 */

/* ---------- ייבוא תלויות ---------- */
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDoc,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { followUser, unfollowUser } from "./firebase-course-service.js";

/* ---------- משתנים גלובליים ---------- */
let currentCategory = "all";       // הקטגוריה הנוכחית לסינון
window.followedAuthors = [];       // רשימת מזהי מרצים שהמשתמש עוקב אחריהם
window.allAuthors = [];            // כל המרצים שנטענו מהשרת

/* ================================================================
   חלק 1: טעינת נתונים מ-Firestore
   ================================================================ */

/**
 * loadData - טוען את כל המרצים עם סטטיסטיקות (קורסים + דירוג)
 *
 * שלבי העבודה:
 * 1. שולף את כל המשתמשים עם role === "lecturer"
 * 2. שולף את כל הקורסים וכל הביקורות
 * 3. מחשב לכל מרצה: מספר קורסים + ממוצע דירוג
 * 4. שומר ב-window.allAuthors ומפעיל סינון ראשוני
 */
async function loadData() {
  const grid = document.getElementById("authors-grid");
  if (grid) grid.innerHTML = '<div class="loading-spinner">טוען מרצים...</div>';

  try {
    /* שליפת כל המרצים מאוסף users */
    const usersRef = collection(window.db, "users");
    const qLecturers = query(usersRef, where("role", "==", "lecturer"));
    const lecturersSnap = await getDocs(qLecturers);

    const lecturers = [];

    /* שליפת כל הקורסים והביקורות (לצורך חישוב סטטיסטיקות) */
    const coursesSnap = await getDocs(collection(window.db, "courses"));
    const reviewsSnap = await getDocs(collection(window.db, "reviews"));

    const allCourses = coursesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const allReviews = reviewsSnap.docs.map((d) => d.data());

    /* עיבוד הנתונים עבור כל מרצה */
    lecturersSnap.forEach((doc) => {
      const userData = doc.data();
      const lecturerId = doc.id;

      /* מציאת הקורסים של המרצה */
      const lecturerCourses = allCourses.filter(
        (c) => c.authorId === lecturerId,
      );
      const coursesCount = lecturerCourses.length;

      /* חישוב ממוצע דירוג מכל הביקורות על קורסי המרצה */
      let totalRating = 0;
      let reviewCount = 0;

      lecturerCourses.forEach((course) => {
        const courseReviews = allReviews.filter(
          (r) => r.courseId === course.id || r.courseTitle === course.title,
        );

        courseReviews.forEach((r) => {
          totalRating += r.rating || 0;
          reviewCount++;
        });
      });

      const avgRating =
        reviewCount > 0 ? (totalRating / reviewCount).toFixed(1) : "חדש";

      /* בניית אובייקט המרצה */
      lecturers.push({
        id: lecturerId,
        name: userData.name || "מרצה ללא שם",
        image:
          userData.photoURL ||
          "https://cdn-icons-png.flaticon.com/512/149/149071.png",
        expertise: userData.expertise || "כללי",
        bio: userData.bio || "לא הוזן מידע נוסף.",
        coursesCount: coursesCount,
        rating: avgRating,
        topics: userData.expertise ? [userData.expertise] : [],
      });
    });

    window.allAuthors = lecturers;
    filterAuthors(); // רינדור ראשוני
  } catch (error) {
    console.error("שגיאה בטעינת המרצים:", error);
    if (grid) grid.innerHTML = '<p class="error-msg">שגיאה בטעינת הנתונים</p>';
  }
}

/* ================================================================
   חלק 2: רינדור כרטיסיות מרצים
   ================================================================ */

/**
 * renderAuthors - מרנדר את רשימת המרצים לתוך הגריד
 * @param {Array} authorsList - מערך מרצים מסונן/ממוין להצגה
 *
 * כל כרטיסייה מכילה:
 * - תמונה, שם, התמחות, ביוגרפיה
 * - חלק מתרחב (בלחיצה): מספר קורסים, כפתור מעקב, קישור לפרופיל
 */
function renderAuthors(authorsList) {
  const grid = document.getElementById("authors-grid");
  if (!grid) return;

  if (authorsList.length === 0) {
    grid.innerHTML = "<p>לא נמצאו מרצים מתאימים לסינון זה.</p>";
    return;
  }

  grid.innerHTML = authorsList
    .map((author) => {
      const isFollowing = window.followedAuthors.includes(author.id);

      return `
        <div class="author-card" onclick="this.classList.toggle('active')">
            <div class="author-main">
                <img src="${author.image}" class="author-avatar" alt="${author.name}">
                <div class="author-details">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h3>${author.name}</h3>
                        <span class="rating-badge">⭐ ${author.rating}</span>
                    </div>
                    <p class="author-expertise"><strong>${author.expertise}</strong></p>
                    <p class="author-bio">${author.bio}</p>
                </div>
            </div>
            <!-- חלק מתרחב – נראה בלחיצה על הכרטיסייה -->
            <div class="author-expandable">
                <div class="expand-content">
                    <div class="author-meta-info">
                        <p>📚 <strong>${author.coursesCount} קורסים</strong></p>
                    </div>
                    <div class="author-actions">
                        <button class="btn-follow ${isFollowing ? "following" : ""}" 
                                onclick="toggleFollow(event, '${author.id}')">
                            ${isFollowing ? "✓ במעקב" : "מעקב +"}
                        </button>
                        <a href="author-profile.html?id=${author.id}" class="btn-view-profile" onclick="event.stopPropagation();">פרופיל מלא</a>
                    </div>
                </div>
            </div>
        </div>`;
    })
    .join("");
}

/* ================================================================
   חלק 3: סינון ומיון
   ================================================================ */

/**
 * filterAuthors - מסנן וממיין את רשימת המרצים
 * פונקציה גלובלית (window) כדי שתהיה זמינה מ-HTML (onkeyup, onchange).
 *
 * סינונים:
 * - חיפוש טקסטואלי (שם או התמחות)
 * - סינון לפי קטגוריה (תכנות, עיצוב, שיווק, עסקים)
 *
 * מיונים:
 * - popularity: לפי דירוג (הגבוה ביותר קודם)
 * - courses: לפי מספר קורסים (הגבוה ביותר קודם)
 */
window.filterAuthors = function () {
  const searchTerm =
    document.getElementById("authorSearch")?.value.toLowerCase() || "";
  const sortBy = document.getElementById("sortFilter")?.value || "default";

  let filtered = window.allAuthors.filter((author) => {
    /* סינון לפי חיפוש טקסט */
    const matchesSearch =
      author.name.toLowerCase().includes(searchTerm) ||
      (author.expertise && author.expertise.toLowerCase().includes(searchTerm));

    /* סינון לפי קטגוריה */
    const matchesTopic =
      currentCategory === "all" ||
      (author.expertise &&
        author.expertise.toLowerCase() === currentCategory.toLowerCase()) ||
      (author.topics &&
        author.topics.some(
          (t) => t.toLowerCase() === currentCategory.toLowerCase(),
        ));

    return matchesSearch && matchesTopic;
  });

  /* מיון לפי הבחירה */
  if (sortBy === "popularity") {
    filtered.sort((a, b) => {
      const rateA = a.rating === "חדש" ? 0 : parseFloat(a.rating);
      const rateB = b.rating === "חדש" ? 0 : parseFloat(b.rating);
      return rateB - rateA;
    });
  } else if (sortBy === "courses") {
    filtered.sort((a, b) => b.coursesCount - a.coursesCount);
  }

  renderAuthors(filtered);
};

/* ================================================================
   חלק 4: מעקב / הפסקת מעקב (Follow / Unfollow)
   ================================================================ */

/**
 * toggleFollow - מחליף מצב מעקב אחרי מרצה
 * @param {Event} event - אירוע הלחיצה (נעצר כדי לא לפתוח את הכרטיסייה)
 * @param {string} authorId - מזהה המרצה
 */
window.toggleFollow = async function (event, authorId) {
  event.stopPropagation();

  if (!window.auth?.currentUser) {
    alert("עליך להתחבר כדי לעקוב אחר מרצים");
    return;
  }

  const btn = event.currentTarget;
  const originalText = btn.innerHTML;
  const currentUserId = window.auth.currentUser.uid;

  /* נעילת הכפתור בזמן העיבוד */
  btn.disabled = true;
  btn.innerHTML = "<span>טוען...</span>";
  btn.style.opacity = "0.7";
  btn.style.cursor = "not-allowed";

  try {
    const isFollowing = window.followedAuthors.includes(authorId);

    if (isFollowing) {
      /* הפסקת מעקב */
      await unfollowUser(currentUserId, authorId);
      window.followedAuthors = window.followedAuthors.filter(
        (id) => id !== authorId,
      );
    } else {
      /* תחילת מעקב */
      await followUser(currentUserId, authorId);
      window.followedAuthors.push(authorId);
    }

    /* רענון התצוגה */
    window.filterAuthors();
  } catch (e) {
    console.error("שגיאה בעדכון מצב מעקב:", e);
    alert("חלה שגיאה בעדכון המעקב.");
    btn.disabled = false;
    btn.innerHTML = originalText;
    btn.style.opacity = "1";
    btn.style.cursor = "pointer";
  }
};

/* ================================================================
   חלק 5: בחירת קטגוריה (צ'יפים)
   ================================================================ */

/**
 * setTopic - מגדיר את הקטגוריה הפעילה לסינון
 * @param {string} topic - שם הקטגוריה (all/programming/design/marketing/business)
 * @param {HTMLElement} element - הכפתור שנלחץ (לסימון כ-active)
 */
window.setTopic = function (topic, element) {
  currentCategory = topic;
  /* הסרת active מכל הצ'יפים */
  const topicContainer = document.getElementById("topicChips");
  if (topicContainer) {
    topicContainer
      .querySelectorAll(".chip")
      .forEach((btn) => btn.classList.remove("active"));
  }
  /* סימון הצ'יפ שנלחץ */
  if (element) element.classList.add("active");
  filterAuthors();
};

/* ================================================================
   חלק 6: אתחול הדף
   ================================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  /* טעינת הנתונים – ממתין שה-DB יהיה מוכן */
  if (window.db) {
    loadData();
  } else {
    const checkDB = setInterval(() => {
      if (window.db) {
        clearInterval(checkDB);
        loadData();
      }
    }, 100);
  }

  /* טעינת נתוני מעקב של המשתמש המחובר (לסימון כפתורי "במעקב") */
  if (window.auth) {
    onAuthStateChanged(window.auth, async (user) => {
      if (user && window.db) {
        try {
          const userDoc = await getDoc(doc(window.db, "users", user.uid));
          if (userDoc.exists()) {
            window.followedAuthors = userDoc.data().followedAuthors || [];
            filterAuthors(); // רינדור מחדש עם סטטוס מעקב מעודכן
          }
        } catch (error) {
          console.error("שגיאה בטעינת נתוני מעקב:", error);
        }
      }
    });
  }
});
