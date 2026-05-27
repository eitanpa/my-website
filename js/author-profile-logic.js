/**
 * author-profile-logic.js - לוגיקת עמוד פרופיל מרצה
 * =====================================================
 * קובץ זה מנהל את עמוד הפרופיל המלא של מרצה (author-profile.html).
 * הדף נטען עם פרמטר ?id=XXX שהוא מזהה המרצה ב-Firestore.
 *
 * סקציות בעמוד:
 * 1. כותרת – תמונה, שם, ביוגרפיה, כפתור מעקב
 * 2. קורסי המרצה – גריד כרטיסיות
 * 3. ביקורות – מאוסף reviews על קורסי המרצה
 * 4. סטטיסטיקות הוראה – מספר קורסים, דירוג ממוצע, עוקבים
 * 5. תגי מומחיות – חילוץ טכנולוגיות מהקורסים
 * 6. מרצים דומים – המלצה על מרצים בתחומים דומים
 *
 * תלויות: Firebase Firestore, firebase-course-service.js (follow/unfollow)
 */

/* ---------- ייבוא תלויות ---------- */
import {
  getDoc,
  doc,
  collection,
  query,
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  followUser,
  unfollowUser,
  isUserFollowing,
} from "./firebase-course-service.js";

/* ---------- חילוץ מזהה המרצה מה-URL ---------- */
const urlParams = new URLSearchParams(window.location.search);
const authorId = urlParams.get("id");

/* ================================================================
   חלק 1: אתחול עמוד הפרופיל
   ================================================================ */

/**
 * initAuthorProfile - פונקציית האתחול הראשית
 * מפעילה את כל שלבי הטעינה של העמוד:
 * 1. שולפת את נתוני המרצה מ-Firestore
 * 2. טוענת את הקורסים שלו
 * 3. מחשבת דירוג ממוצע
 * 4. מרנדרת את כל הסקציות
 * 5. בודקת סטטוס מעקב (אם המשתמש מחובר)
 */
async function initAuthorProfile() {
  if (!authorId) {
    document.body.innerHTML = "<h1>לא נמצא מזהה מרצה</h1>";
    return;
  }

  try {
    /* שליפת נתוני המרצה */
    const authorDoc = await getDoc(doc(window.db, "users", authorId));
    if (!authorDoc.exists()) {
      document.body.innerHTML = "<h1>המרצה לא נמצא</h1>";
      return;
    }

    const author = authorDoc.data();

    /* טעינת הקורסים של המרצה */
    const courses = await loadAuthorCourses(authorId);

    /* חישוב הדירוג הממוצע */
    const rating = await calculateAuthorRating(courses);

    /* רינדור כל הסקציות */
    renderHeader(author, authorId, rating, courses);
    loadAuthorReviews(courses);
    renderTeachingStats(courses, rating, author);
    loadSimilarInstructors(authorId, courses);

    /* בדיקת סטטוס מעקב (אם המשתמש מחובר) */
    onAuthStateChanged(window.auth, async (user) => {
      if (user) {
        const isFollowing = await isUserFollowing(user.uid, authorId);
        updateFollowButton(isFollowing);
      }
    });
  } catch (error) {
    console.error("שגיאה בטעינת הפרופיל:", error);
  } finally {
    if (window.hideLoader) window.hideLoader();
  }
}

/* ================================================================
   חלק 2: חישוב דירוג ממוצע
   ================================================================ */

/**
 * calculateAuthorRating - מחשב דירוג ממוצע מכל הביקורות על קורסי המרצה
 * @param {Array} courses - מערך הקורסים של המרצה
 * @returns {string} ממוצע דירוג (מספר) או "חדש" אם אין ביקורות
 *
 * ⚠️ הערת ביצועים: שולף את כל הביקורות ומסנן בצד הלקוח.
 * באפליקציה גדולה כדאי להשתמש בשאילתת 'in' או Cloud Functions.
 */
async function calculateAuthorRating(courses) {
  if (!courses || courses.length === 0) return "חדש";

  try {
    const courseIds = courses.map((c) => c.id);
    const courseTitles = courses.map((c) => c.title);

    /* שליפת כל הביקורות */
    const reviewsSnap = await getDocs(collection(window.db, "reviews"));

    let totalRating = 0;
    let count = 0;

    reviewsSnap.forEach((doc) => {
      const r = doc.data();
      /* בדיקה אם הביקורת שייכת לאחד הקורסים של המרצה */
      if (
        courseIds.includes(r.courseId) ||
        courseTitles.includes(r.courseTitle)
      ) {
        if (r.rating) {
          totalRating += r.rating;
          count++;
        }
      }
    });

    return count > 0 ? (totalRating / count).toFixed(1) : "חדש";
  } catch (e) {
    console.error("שגיאה בחישוב דירוג:", e);
    return "N/A";
  }
}

/* ================================================================
   חלק 3: רינדור כותרת הפרופיל (Header)
   ================================================================ */

/**
 * renderHeader - מרנדר את אזור הכותרת של הפרופיל
 * @param {Object} author - נתוני המרצה מ-Firestore
 * @param {string} id - מזהה המרצה
 * @param {string} rating - דירוג ממוצע
 * @param {Array} courses - מערך הקורסים
 *
 * כולל: תמונה, שם, התמחות, ביוגרפיה, מספר עוקבים, דירוג, כפתור מעקב
 */
function renderHeader(author, id, rating, courses) {
  const container = document.getElementById("author-profile-header");
  if (!container) return;

  const avatar =
    author.photoURL || "https://cdn-icons-png.flaticon.com/512/149/149071.png";
  const bio = author.bio || "אין מידע זמין.";
  const expertise = author.expertise || "כללי";
  const followers = author.followersCount || 0;

  container.innerHTML = `
        <div class="author-header-content">
            <div class="author-avatar-column">
                <img src="${avatar}" class="author-header-avatar" alt="${author.name}">
                <div class="author-stats">
                    <span class="stat-badge followers">
                        <i class="fas fa-users"></i> עוקבים: <span id="follower-count">${followers}</span>
                    </span>
                    <span class="stat-badge rating">
                        ⭐ דירוג: <strong>${rating}</strong>
                    </span>
                </div>
            </div>
            <div class="author-header-info">
                <h1>${author.name}</h1>
                <p class="author-expertise-text">${expertise}</p>
                <p class="author-bio-text">${bio}</p>

                <button id="profile-follow-btn" class="btn-follow btn-follow-lg" onclick="handleProfileFollow()">
                    טוען...
                </button>
            </div>
        </div>
    `;
}

/* ================================================================
   חלק 4: טעינת קורסי המרצה
   ================================================================ */

/**
 * loadAuthorCourses - שולף ומציג את כל הקורסים של המרצה
 * @param {string} id - מזהה המרצה
 * @returns {Array} מערך הקורסים (משמש גם לחישוב דירוג וביקורות)
 */
async function loadAuthorCourses(id) {
  const grid = document.getElementById("author-courses-grid");
  if (!grid) return;

  grid.innerHTML = '<div class="loading-spinner">טוען קורסים...</div>';

  try {
    const q = query(
      collection(window.db, "courses"),
      where("authorId", "==", id),
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      grid.innerHTML = "<p>למרצה זה אין קורסים עדיין.</p>";
      return [];
    }

    const courses = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    /* רינדור כרטיסיות קורסים */
    grid.innerHTML = courses
      .map(
        (c) => `
        <a href="course.html?id=${c.id}" class="course-card-link" style="text-decoration: none; color: inherit;">
            <div class="course">
                <div class="course-image-wrapper">
                   <img src="${c.image || "https://via.placeholder.com/300?text=No+Image"}" alt="${c.title}" onerror="this.src='https://via.placeholder.com/300?text=No+Image'">
                </div>
                <div class="course-info">
                    <h3>${c.title}</h3>
                    <p>${c.desc || c.description}</p>
                    <span class="btn-fake">לפרטים נוספים</span>
                </div>
            </div>
        </a>
    `,
      )
      .join("");

    return courses;
  } catch (error) {
    console.error("שגיאה בטעינת קורסים:", error);
    grid.innerHTML = "<p>שגיאה בטעינת הקורסים.</p>";
    return [];
  }
}

/* ================================================================
   חלק 5: טעינת ביקורות על קורסי המרצה
   ================================================================ */

/**
 * loadAuthorReviews - שולף ומציג ביקורות רלוונטיות
 * @param {Array} courses - מערך הקורסים (לסינון ביקורות)
 *
 * מציג כל ביקורת עם: שם כותב, תאריך, דירוג, שם קורס, תוכן,
 * ומונים של לייקים, דיסלייקים ותגובות.
 */
async function loadAuthorReviews(courses) {
  const reviewsContainer = document.getElementById("author-reviews-list");
  if (!reviewsContainer) return;

  if (!courses || courses.length === 0) {
    reviewsContainer.innerHTML = "<p>אין ביקורות להצגה כרגע.</p>";
    return;
  }

  try {
    const courseIds = courses.map((c) => c.id);

    /* שליפת כל הביקורות וסינון הרלוונטיות */
    const reviewsSnap = await getDocs(collection(window.db, "reviews"));

    const relevantReviews = [];
    reviewsSnap.forEach((doc) => {
      const data = doc.data();
      if (courseIds.includes(data.courseId)) {
        relevantReviews.push(data);
      }
    });

    if (relevantReviews.length === 0) {
      reviewsContainer.innerHTML = "<p>טרם התקבלו ביקורות על קורסי המרצה.</p>";
      return;
    }

    /* רינדור כרטיסיות ביקורת */
    reviewsContainer.innerHTML = relevantReviews
      .map((r) => {
        const likesCount = (r.likes || []).length;
        const dislikesCount = (r.dislikes || []).length;
        const repliesCount = (r.replies || []).length;

        /* שורת סטטיסטיקות (לייקים, דיסלייקים, תגובות) */
        let statsHtml = "";
        if (likesCount > 0 || dislikesCount > 0 || repliesCount > 0) {
          statsHtml = `
                 <div style="display:flex; gap:15px; margin-top:10px; font-size:12px; color:#888;">
                   ${likesCount > 0 ? `<span><i class="far fa-thumbs-up"></i> ${likesCount}</span>` : ""}
                   ${dislikesCount > 0 ? `<span><i class="far fa-thumbs-down"></i> ${dislikesCount}</span>` : ""}
                   ${repliesCount > 0 ? `<span><i class="far fa-comment"></i> ${repliesCount}</span>` : ""}
                 </div>
               `;
        }

        return `
            <div class="review-card">
                <div class="review-header">
                    <span class="reviewer-name">${r.userName || "משתמש אנונימי"}</span>
                    <span class="review-date">${r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString("he-IL") : "לאחרונה"}</span>
                </div>
                <div class="review-rating">
                    ${"⭐".repeat(r.rating || 5)}
                    <span class="course-badge">${r.courseTitle || "קורס כללי"}</span>
                </div>
                <p class="review-text">${r.comment || ""}</p>
                ${statsHtml}
            </div>
            `;
      })
      .join("");
  } catch (e) {
    console.error("שגיאה בטעינת הביקורות:", e);
    reviewsContainer.innerHTML = "<p>שגיאה בטעינת הביקורות.</p>";
  }
}

/* ================================================================
   חלק 6: סטטיסטיקות הוראה
   ================================================================ */

/**
 * renderTeachingStats - מציג 3 כרטיסיות סטטיסטיקה: קורסים, דירוג, עוקבים
 * @param {Array} courses - מערך הקורסים
 * @param {string} rating - דירוג ממוצע
 * @param {Object} author - נתוני המרצה
 */
function renderTeachingStats(courses, rating, author) {
  const container = document.getElementById("author-teaching-stats");
  if (!container) return;

  const courseCount = courses.length;
  const followersCount = author.followersCount || 0;

  container.innerHTML = `
    <div class="teaching-stat-card">
      <i class="fas fa-book"></i>
      <span class="teaching-stat-number">${courseCount}</span>
      <span class="teaching-stat-label">קורסים</span>
    </div>
    <div class="teaching-stat-card">
      <i class="fas fa-star"></i>
      <span class="teaching-stat-number">${rating}</span>
      <span class="teaching-stat-label">דירוג ממוצע</span>
    </div>
    <div class="teaching-stat-card">
      <i class="fas fa-users"></i>
      <span class="teaching-stat-number">${followersCount}</span>
      <span class="teaching-stat-label">עוקבים</span>
    </div>
  `;
}

/* ================================================================
   חלק 7: תגי מומחיות (Expertise Tags)
   ================================================================ */

/**
 * renderExpertiseTags - חילוץ והצגת טכנולוגיות מתוך הקורסים
 * @param {Array} courses - מערך הקורסים
 *
 * סורק כותרות ותיאורי קורסים ומחפש מונחים טכנולוגיים ידועים.
 * מוסיף גם שמות קטגוריות בעברית.
 */
function renderExpertiseTags(courses) {
  const container = document.getElementById("author-expertise-tags");
  if (!container) return;

  /* רשימת מונחים טכנולוגיים לזיהוי */
  const keywords = new Set();
  const techTerms = [
    "Python", "JavaScript", "React", "Node.js", "Java", "HTML", "CSS",
    "SQL", "Figma", "Photoshop", "UI", "UX", "SEO", "SEM", "PHP",
    "C#", "C++", "Git", "Docker", "AWS", "Firebase", "MongoDB",
    "TypeScript", "Vue", "Angular", "Next.js", "Flutter", "Swift",
  ];

  courses.forEach((course) => {
    const text =
      (course.title || "") +
      " " +
      (course.desc || "") +
      " " +
      (course.description || "");

    /* חיפוש מונחים טכנולוגיים בכותרת ותיאור */
    techTerms.forEach((term) => {
      if (text.toLowerCase().includes(term.toLowerCase())) {
        keywords.add(term);
      }
    });

    /* הוספת שם הקטגוריה בעברית */
    if (course.category) {
      const catNames = {
        programming: "תכנות",
        design: "עיצוב",
        marketing: "שיווק",
        business: "עסקים",
        other: "כללי",
      };
      keywords.add(catNames[course.category] || course.category);
    }
  });

  if (keywords.size === 0) {
    container.style.display = "none";
    return;
  }

  container.innerHTML = `
    <h3>תחומי מומחיות</h3>
    <div class="expertise-tags-list">
      ${Array.from(keywords)
        .map((kw) => `<span class="expertise-tag">${kw}</span>`)
        .join("")}
    </div>
  `;
}

/* ================================================================
   חלק 8: מרצים דומים (Similar Instructors)
   ================================================================ */

/**
 * loadSimilarInstructors - מציג מרצים בעלי קורסים בקטגוריות דומות
 * @param {string} currentAuthorId - מזהה המרצה הנוכחי (לסינון)
 * @param {Array} currentCourses - קורסי המרצה הנוכחי (לזיהוי קטגוריות)
 *
 * אלגוריתם:
 * 1. איסוף הקטגוריות של המרצה הנוכחי
 * 2. סריקת כל הקורסים למציאת מרצים אחרים
 * 3. ניקוד התאמה (matchScore) – כמה קורסים באותה קטגוריה
 * 4. מיון לפי ניקוד התאמה, אח"כ לפי מספר קורסים
 * 5. הצגת 3 המובילים
 */
async function loadSimilarInstructors(currentAuthorId, currentCourses) {
  const container = document.getElementById("similar-instructors");
  if (!container) return;

  try {
    /* איסוף קטגוריות המרצה הנוכחי */
    const currentCategories = new Set();
    currentCourses.forEach((c) => {
      if (c.category) currentCategories.add(c.category);
    });

    /* סריקת כל הקורסים למציאת מרצים אחרים */
    const allCoursesSnap = await getDocs(collection(window.db, "courses"));
    const otherAuthors = {};

    allCoursesSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.authorId && data.authorId !== currentAuthorId) {
        if (!otherAuthors[data.authorId]) {
          otherAuthors[data.authorId] = {
            id: data.authorId,
            name: data.authorName || "מרצה",
            courseCount: 0,
            matchScore: 0,  // ניקוד התאמה – קטגוריות משותפות
          };
        }
        otherAuthors[data.authorId].courseCount++;
        /* הגדלת ניקוד התאמה עבור קטגוריה משותפת */
        if (data.category && currentCategories.has(data.category)) {
          otherAuthors[data.authorId].matchScore++;
        }
      }
    });

    /* מיון: קודם לפי ניקוד התאמה, אח"כ לפי מספר קורסים */
    const similar = Object.values(otherAuthors)
      .sort(
        (a, b) => b.matchScore - a.matchScore || b.courseCount - a.courseCount,
      )
      .slice(0, 3);

    if (similar.length === 0) {
      container.innerHTML = "<p>אין מרצים דומים להצגה.</p>";
      return;
    }

    /* שליפת תמונות פרופיל של המרצים הדומים */
    for (const author of similar) {
      try {
        const userDoc = await getDoc(doc(window.db, "users", author.id));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          author.image =
            userData.photoURL ||
            "https://cdn-icons-png.flaticon.com/512/149/149071.png";
          author.expertise = userData.expertise || "";
        }
      } catch (e) {
        /* דילוג */
      }
    }

    /* רינדור כרטיסיות מרצים דומים */
    container.innerHTML = similar
      .map(
        (inst) => `
      <a href="author-profile.html?id=${inst.id}" class="similar-instructor-card">
        <img src="${inst.image || "https://cdn-icons-png.flaticon.com/512/149/149071.png"}" alt="${inst.name}" class="similar-instructor-avatar" />
        <h4>${inst.name}</h4>
        <span class="similar-instructor-meta">${inst.expertise || "מרצה"}</span>
        <span class="similar-instructor-courses">${inst.courseCount} קורסים</span>
      </a>
    `,
      )
      .join("");
  } catch (e) {
    console.error("שגיאה בטעינת מרצים דומים:", e);
    container.innerHTML = "<p>שגיאה בטעינת מרצים דומים.</p>";
  }
}

/* ================================================================
   חלק 9: מעקב / הפסקת מעקב
   ================================================================ */

/**
 * handleProfileFollow - מטפל בלחיצה על כפתור "עקוב" / "הפסק מעקב"
 * פונקציה גלובלית (window) שזמינה מ-HTML onclick.
 * מעדכנת את הכפתור ומונה העוקבים בזמן אמת.
 */
window.handleProfileFollow = async function () {
  const btn = document.getElementById("profile-follow-btn");
  if (!btn) return;

  const currentUser = window.auth.currentUser;
  if (!currentUser) {
    alert("עליך להתחבר כדי לעקוב.");
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const authorId = urlParams.get("id");
  if (!authorId) return;

  const isFollowing = btn.classList.contains("following");
  const followersEl = document.getElementById("follower-count");
  let count = 0;
  if (followersEl) {
    count = parseInt(followersEl.innerText) || 0;
  }

  /* נעילת הכפתור למניעת לחיצה כפולה */
  btn.disabled = true;

  try {
    if (isFollowing) {
      /* הפסקת מעקב */
      await unfollowUser(currentUser.uid, authorId);
      updateFollowButton(false);
      if (followersEl) followersEl.innerText = Math.max(0, count - 1);
    } else {
      /* תחילת מעקב */
      await followUser(currentUser.uid, authorId);
      updateFollowButton(true);
      if (followersEl) followersEl.innerText = count + 1;
    }
  } catch (e) {
    console.error("שגיאה בפעולת מעקב:", e);
    alert("שגיאה בביצוע הפעולה: " + e.message);
  } finally {
    btn.disabled = false;
  }
};

/**
 * updateFollowButton - מעדכן את מראה כפתור המעקב
 * @param {boolean} isFollowing - true = עוקב, false = לא עוקב
 */
function updateFollowButton(isFollowing) {
  const btn = document.getElementById("profile-follow-btn");
  if (!btn) return;

  if (isFollowing) {
    btn.innerText = "✓ במעקב";
    btn.classList.add("following");
    btn.style.backgroundColor = "#e2e6ea";
    btn.style.color = "#333";
  } else {
    btn.innerText = "+ עקוב";
    btn.classList.remove("following");
    btn.style.backgroundColor = "#1691fd";
    btn.style.color = "white";
  }
}

/* ================================================================
   חלק 10: אתחול הדף
   ================================================================ */
document.addEventListener("DOMContentLoaded", () => {
  /* ממתין שה-DB יהיה מוכן (מאותחל ב-auth.js) */
  const checkDB = setInterval(() => {
    if (window.db) {
      clearInterval(checkDB);
      initAuthorProfile();
    }
  }, 100);
});
