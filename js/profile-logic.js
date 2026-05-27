/**
 * profile-logic.js - לוגיקת עמוד הפרופיל האישי
 * ================================================
 * קובץ זה מנהל את עמוד הפרופיל של המשתמש המחובר.
 *
 * תכונות:
 * 1. הצגת הקורסים שלי (שנרכשו / שנוצרו ע"י המשתמש)
 * 2. הצגת קורסים מועדפים (Wishlist)
 * 3. הצגת קורסים מומלצים (שעדיין לא נרכשו)
 * 4. הצגת מרצים שעוקבים אחריהם + אפשרות הסרת מעקב
 * 5. עריכת פרופיל (שם, תמונה, ביוגרפיה, התמחות)
 * 6. איפוס סיסמה
 *
 * תלויות:
 * - Firebase Auth (הזדהות)
 * - Firebase Firestore (נתוני משתמש, קורסים)
 * - firebase-course-service.js (פונקציית unfollowUser)
 * - courses-data.js (הפונקציה הגלובלית createCourseCard)
 */

/* ---------- ייבוא תלויות Firebase ---------- */
import {
  getAuth,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

import {
  getDoc,
  doc,
  updateDoc,
  arrayRemove,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import { unfollowUser } from "./firebase-course-service.js";

const auth = getAuth();

/* ================================================================
   חלק 1: הצגת קורסים (הקורסים שלי / מועדפים / מומלצים)
   ================================================================ */

/**
 * displayCourses - טוען ומציג את שלושת רשתות הקורסים בפרופיל
 * @param {Object} user - אובייקט המשתמש המחובר מ-Firebase Auth
 *
 * הפונקציה:
 * 1. שולפת נתוני משתמש מ-Firestore (רכישות, מועדפים, תפקיד)
 * 2. מסננת קורסים רלוונטיים מ-window.allCourses
 * 3. מרנדרת כרטיסיות קורס עם הפונקציה הגלובלית createCourseCard
 */
async function displayCourses(user) {
  const myGrid = document.getElementById("my-courses-grid");
  const wishlistGrid = document.getElementById("wishlist-courses-grid");
  const recGrid = document.getElementById("recommended-courses-grid");
  const courses = window.allCourses || [];
  const createCard = window.createCourseCard;

  /* ממתין שהקורסים ייטענו מ-courses-data.js */
  if (!createCard || courses.length === 0) {
    setTimeout(() => displayCourses(user), 200);
    return;
  }

  try {
    /* שליפת נתוני המשתמש מ-Firestore */
    const userDocRef = doc(window.db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);
    let userData = {};
    if (userDoc.exists()) {
      userData = userDoc.data();
    }

    const purchasedIds = userData.purchasedCourses || []; // מזהי קורסים שנרכשו
    const wishlistIds = userData.wishlist || [];           // מזהי קורסים מועדפים
    const isOwner = userData.role === "owner";             // האם בעל האתר

    /* --- 1. הקורסים שלי (רכישות + קורסים שהמשתמש יצר) --- */
    const myCourses = courses.filter((course) => {
      if (isOwner) return true; // בעלים רואה הכל
      return purchasedIds.includes(course.id) || course.authorId === user.uid;
    });

    if (myGrid) {
      if (myCourses.length > 0) {
        myGrid.innerHTML = myCourses.map((c) => createCard(c)).join("");
      } else {
        myGrid.innerHTML =
          '<div class="empty-state-card"><i class="fas fa-box-open empty-state-icon"></i><h4>עדיין לא רכשת קורסים</h4><p>מצא את הקורס הבא שלך מתוך המגוון שלנו</p><a href="all-courses.html" class="btn-empty-state">לקורסים &larr;</a></div>';
      }
    }

    /* --- 2. קורסים מועדפים (Wishlist) --- */
    if (wishlistGrid) {
      const wishlistedCourses = courses.filter((course) =>
        wishlistIds.includes(course.id),
      );
      if (wishlistedCourses.length > 0) {
        wishlistGrid.innerHTML = wishlistedCourses
          .map((c) => createCard(c))
          .join("");
      } else {
        wishlistGrid.innerHTML =
          '<div class="empty-state-card"><i class="far fa-heart empty-state-icon"></i><h4>אין קורסים מועדפים</h4><p>לחץ על סמל הלב בקורסים כדי לשמור אותם כאן</p><a href="all-courses.html" class="btn-empty-state">לקורסים &larr;</a></div>';
      }
    }

    /* --- 3. קורסים מומלצים (קורסים שעדיין לא נרכשו ולא נוצרו ע"י המשתמש) --- */
    if (recGrid) {
      const recommendations = courses
        .filter((c) => !purchasedIds.includes(c.id) && c.authorId !== user.uid)
        .slice(0, 4); // עד 4 המלצות
      if (recommendations.length > 0) {
        recGrid.innerHTML = recommendations.map((c) => createCard(c)).join("");
      } else {
        /* הסתרת האזור אם אין המלצות */
        document.getElementById(
          "recommended-courses-grid",
        ).parentElement.style.display = "none";
      }
    }
  } catch (err) {
    console.error("שגיאה בטעינת קורסי המשתמש:", err);
  }
}

/* ================================================================
   חלק 2: מרצים שעוקבים אחריהם
   ================================================================ */

/**
 * loadFollowedAuthors - טוען ומציג את המרצים שהמשתמש עוקב אחריהם
 * @param {Object} user - אובייקט המשתמש המחובר
 *
 * הפונקציה:
 * 1. קוראת את רשימת followedAuthors מנתוני המשתמש
 * 2. שולפת פרטי כל מרצה מאוסף users
 * 3. מרנדרת כרטיסיות מרצה עם אפשרות הסרת מעקב
 */
async function loadFollowedAuthors(user) {
  const grid = document.getElementById("followed-authors-grid");
  if (!grid) return;

  try {
    /* ודא שמסד הנתונים מוכן */
    if (!window.db) {
      console.log("ממתין ל-DB...");
      setTimeout(() => loadFollowedAuthors(user), 500);
      return;
    }

    /* שליפת נתוני המשתמש */
    const userDocRef = doc(window.db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);

    /* בדיקה שיש מרצים שעוקבים אחריהם */
    if (
      !userDoc.exists() ||
      !userDoc.data().followedAuthors ||
      userDoc.data().followedAuthors.length === 0
    ) {
      grid.innerHTML =
        '<div class="empty-state-card"><i class="fas fa-user-plus empty-state-icon"></i><h4>עדיין לא עקבת אחרי מרצים</h4><p>גלה מרצים מובילים והתעדכן בתכנים שלהם</p><a href="authors.html" class="btn-empty-state">לעמוד המרצים &larr;</a></div>';
      return;
    }

    const followedIds = userDoc.data().followedAuthors;

    /* שליפת פרטי כל מרצה מ-Firestore */
    const authors = [];
    for (const authorId of followedIds) {
      try {
        const authorDoc = await getDoc(doc(window.db, "users", authorId));
        if (authorDoc.exists()) {
          authors.push({ id: authorDoc.id, ...authorDoc.data() });
        }
      } catch (err) {
        console.error(`שגיאה בטעינת מרצה ${authorId}:`, err);
      }
    }

    /* אם לא נמצאו מרצים (נמחקו?) */
    if (authors.length === 0) {
      grid.innerHTML =
        '<div class="empty-state-card"><i class="fas fa-user-plus empty-state-icon"></i><h4>עדיין לא עקבת אחרי מרצים</h4><p>גלה מרצים מובילים והתעדכן בתכנים שלהם</p><a href="authors.html" class="btn-empty-state">לעמוד המרצים &larr;</a></div>';
      return;
    }

    /* רינדור כרטיסיות מרצים */
    grid.innerHTML = authors
      .map(
        (author) => `
            <div class="author-card-profile clickable-card" id="card-${author.id}" 
                 onclick="window.location.href='author-profile.html?id=${author.id}'">
                
                <img src="${author.photoURL || "https://cdn-icons-png.flaticon.com/512/149/149071.png"}" class="author-avatar-profile" alt="${author.name}">
                
                <div class="author-info-profile">
                    <h4>${author.name}</h4>
                    <p>${author.expertise || "כללי"}</p>
                    
                    <button class="remove-follow-btn" onclick="event.stopPropagation(); unfollowFromProfile('${author.id}')">
                        <i class="fas fa-user-minus"></i> הסר מעקב
                    </button>
                </div>
            </div>
        `,
      )
      .join("");
  } catch (error) {
    console.error("שגיאה ב-loadFollowedAuthors:", error);
  }
}

/* ================================================================
   חלק 3: ניהול מצב משתמש (הזדהות)
   ================================================================ */

/**
 * מאזין למצב ההזדהות של Firebase Auth.
 * כשמשתמש מחובר – ממלא את פרטי הפרופיל וטוען קורסים ומרצים.
 * כשלא מחובר – מפנה לעמוד ההתחברות.
 */
onAuthStateChanged(auth, async (user) => {
  if (user) {
    /* מילוי שדות פרופיל בסיסיים */
    if (document.getElementById("profile-email")) {
      document.getElementById("profile-email").innerText = user.email;
    }
    const nameInput = document.getElementById("update-name");
    const photoInput = document.getElementById("update-photo-url");

    if (nameInput) nameInput.value = user.displayName || "";
    if (photoInput) photoInput.value = user.photoURL || "";

    /* עדכון תמונת הפרופיל */
    const avatarImg = document.getElementById("profile-page-avatar");
    if (avatarImg && user.photoURL) {
      avatarImg.src = user.photoURL;
    }

    /* בדיקת תפקיד וטעינת שדות מרצה (ביוגרפיה, התמחות) */
    try {
      const userDocSnap = await getDoc(doc(window.db, "users", user.uid));
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();

        /* אם המשתמש הוא מרצה – חשיפת שדות נוספים */
        if (userData.role === "lecturer") {
          const lecturerFields = document.getElementById("lecturer-fields");
          if (lecturerFields) lecturerFields.style.display = "block";

          const bioInput = document.getElementById("update-bio");
          const expertiseInput = document.getElementById("update-expertise");
          if (bioInput) bioInput.value = userData.bio || "";
          if (expertiseInput) expertiseInput.value = userData.expertise || "";
        }
      }
    } catch (error) {
      console.error("שגיאה בשליפת נתוני משתמש:", error);
    }

    /* טעינת הקורסים והמרצים שעוקבים */
    displayCourses(user);
    loadFollowedAuthors(user);
  } else {
    /* משתמש לא מחובר – הפניה לעמוד התחברות */
    if (!window.location.href.includes("auth.html")) {
      window.location.href = "auth.html";
    }
  }
});

/* ================================================================
   חלק 4: שמירת שינויי פרופיל
   ================================================================ */

/**
 * מאזין ללחיצה על כפתור "שמור" בעמוד הפרופיל.
 * מעדכן את:
 * 1. Firebase Auth – שם תצוגה ותמונת פרופיל
 * 2. Firestore (אוסף users) – שם, תמונה, ביוגרפיה, התמחות
 */
document
  .getElementById("save-profile-btn")
  ?.addEventListener("click", async () => {
    const newName = document.getElementById("update-name").value;
    const newPhoto = document.getElementById("update-photo-url").value;
    const newBio = document.getElementById("update-bio")?.value;
    const newExpertise = document.getElementById("update-expertise")?.value;

    const statusMsg = document.getElementById("update-status");
    statusMsg.innerText = "שומר...";
    statusMsg.style.color = "blue";

    try {
      /* עדכון פרופיל בסיסי ב-Firebase Auth */
      await updateProfile(auth.currentUser, {
        displayName: newName,
        photoURL: newPhoto,
      });

      /* עדכון מסמך המשתמש ב-Firestore */
      const userRef = doc(window.db, "users", auth.currentUser.uid);

      const updateData = {
        name: newName,
        photoURL: newPhoto,
      };

      /* הוספת שדות מרצה אם רלוונטיים */
      if (newBio !== undefined) updateData.bio = newBio;
      if (newExpertise !== undefined) updateData.expertise = newExpertise;

      await updateDoc(userRef, updateData);

      statusMsg.innerText = "הפרופיל עודכן בהצלחה!";
      statusMsg.style.color = "green";
      /* רענון הדף אחרי שנייה להצגת השינויים */
      setTimeout(() => location.reload(), 1000);
    } catch (error) {
      console.error("שגיאה בעדכון פרופיל:", error);
      statusMsg.innerText = "שגיאה בעדכון: " + error.message;
      statusMsg.style.color = "red";
    }
  });

/* ================================================================
   חלק 5: איפוס סיסמה
   ================================================================ */

/**
 * שולח אימייל לאיפוס סיסמה לכתובת המייל של המשתמש המחובר.
 */
document
  .getElementById("reset-password-btn")
  ?.addEventListener("click", async () => {
    try {
      await sendPasswordResetEmail(auth, auth.currentUser.email);
      alert("נשלח אימייל לאיפוס סיסמה.");
    } catch (error) {
      alert("שגיאה בשליחת האימייל.");
    }
  });

/* ================================================================
   חלק 6: הסרת מעקב מתוך עמוד הפרופיל
   ================================================================ */

/**
 * unfollowFromProfile - מסיר מעקב אחרי מרצה ומוחק את הכרטיסייה מהתצוגה
 * @param {string} authorId - מזהה המרצה שרוצים להפסיק לעקוב אחריו
 */
window.unfollowFromProfile = async function (authorId) {
  if (!confirm("להפסיק לעקוב?")) return;
  try {
    await unfollowUser(auth.currentUser.uid, authorId);
    /* הסרת הכרטיסייה מה-DOM מיידית (ללא רענון) */
    document.getElementById(`card-${authorId}`)?.remove();

    /* אם לא נשארו כרטיסיות – הצגת הודעת "אין מרצים" */
    const grid = document.getElementById("followed-authors-grid");
    if (grid && grid.children.length === 0) {
      grid.innerHTML =
        '<div class="empty-state-card"><i class="fas fa-user-plus empty-state-icon"></i><h4>עדיין לא עקבת אחרי מרצים</h4><p>גלה מרצים מובילים והתעדכן בתכנים שלהם</p><a href="authors.html" class="btn-empty-state">לעמוד המרצים &larr;</a></div>';
    }
  } catch (e) {
    console.error(e);
    alert("שגיאה בהסרת המעקב");
  }
};
