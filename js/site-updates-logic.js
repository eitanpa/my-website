/**
 * site-updates-logic.js - לוגיקת עמוד עדכוני אתר
 * =================================================
 * קובץ זה מנהל את עמוד "עדכוני האתר" (Site Updates).
 * הוא מאפשר:
 * 1. הצגת כל העדכונים שפורסמו (ממוינים מהחדש לישן)
 * 2. פרסום עדכון חדש (רק למנהל/בעלים – role: "owner")
 * 3. שליחת התראה גלובלית לכל המשתמשים על העדכון החדש
 *
 * אוסף Firestore: site_updates (כותרת, תוכן, מחבר, תאריך)
 */

/* ---------- ייבוא תלויות ---------- */
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { notifyAllUsers } from "./notification-service.js";

/* ---------- אתחול Firebase ---------- */
const auth = getAuth();
const db = getFirestore();

/* ================================================================
   אתחול הדף – מתחיל כשה-DOM מוכן
   ================================================================ */
document.addEventListener("DOMContentLoaded", () => {
  /* ---------- אלמנטי DOM ---------- */
  const postsGrid = document.getElementById("posts-grid");           // רשת העדכונים
  const addPostContainer = document.getElementById("add-post-container"); // כפתור "הוסף עדכון" (רק למנהל)
  const addPostModal = document.getElementById("add-post-modal");    // חלון הפרסום
  const btnOpenModal = document.getElementById("btn-open-modal");    // כפתור פתיחת החלון
  const btnCloseModal = document.getElementById("btn-close-modal");  // כפתור סגירת החלון
  const btnPublishPost = document.getElementById("btn-publish-post"); // כפתור פרסום

  let currentUser = null;  // המשתמש המחובר
  let isOwner = false;     // האם למשתמש יש הרשאת מנהל

  /* ---------- בדיקת מצב הזדהות ---------- */
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      try {
        /* בדיקה האם המשתמש הוא בעל האתר (owner) */
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().role === "owner") {
          isOwner = true;
          addPostContainer.style.display = "block"; // חשיפת כפתור "הוסף עדכון"
        }
      } catch (e) {
        console.error("שגיאה בבדיקת תפקיד:", e);
      }
    }
    /* טעינת העדכונים – גם אם המשתמש לא מחובר (תוכן ציבורי) */
    loadPosts();
  });

  /* ================================================================
     loadPosts - טעינת והצגת כל עדכוני האתר
     ================================================================ */
  async function loadPosts() {
    try {
      /* שאילתה: כל העדכונים ממוינים מהחדש לישן */
      const q = query(
        collection(db, "site_updates"),
        orderBy("createdAt", "desc"),
      );
      const snapshot = await getDocs(q);

      /* מצב ריק – אין עדכונים */
      if (snapshot.empty) {
        postsGrid.innerHTML = `
          <div style="text-align: center; padding: 40px; color: #888;">
            <i class="fas fa-bullhorn fa-3x" style="color: #ddd; margin-bottom: 15px;"></i>
            <p>אין עדכונים עדיין. חזרו בקרוב!</p>
          </div>
        `;
        return;
      }

      /* בניית ה-HTML לכל עדכון */
      let html = "";
      snapshot.forEach((doc) => {
        const data = doc.data();
        /* המרת חותמת הזמן לפורמט קריא */
        const timeStr = data.createdAt?.toDate
          ? data.createdAt
              .toDate()
              .toLocaleDateString("he-IL", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
          : "לאחרונה";

        html += `
          <div class="post-card" style="animation: fadeIn 0.5s ease-in;">
            <div class="post-header">
               <h2 class="post-title">${data.title}</h2>
               <span class="post-date">${timeStr}</span>
            </div>
            <div class="post-content">${data.content}</div>
          </div>
        `;
      });
      postsGrid.innerHTML = html;
    } catch (error) {
      console.error("שגיאה בטעינת העדכונים:", error);
      postsGrid.innerHTML = `<div style="text-align: center; color: red;">שגיאה בטעינת העדכונים.</div>`;
    }
  }

  /* ================================================================
     ניהול חלון הפרסום (Modal)
     ================================================================ */

  /* פתיחת החלון */
  if (btnOpenModal)
    btnOpenModal.addEventListener(
      "click",
      () => (addPostModal.style.display = "flex"),
    );

  /* סגירת החלון */
  if (btnCloseModal)
    btnCloseModal.addEventListener(
      "click",
      () => (addPostModal.style.display = "none"),
    );

  /* ================================================================
     פרסום עדכון חדש
     ================================================================
     רק משתמש עם תפקיד "owner" יכול לפרסם.
     התהליך:
     1. שמירת העדכון באוסף site_updates ב-Firestore
     2. שליחת התראה גלובלית לכל המשתמשים הרשומים
     3. סגירת החלון ורענון הרשימה
  */
  if (btnPublishPost) {
    btnPublishPost.addEventListener("click", async () => {
      if (!isOwner) return;

      /* קריאת הקלט מהטופס */
      const titleInput = document.getElementById("post-title").value.trim();
      const contentInput = document.getElementById("post-content").value.trim();
      const notifSummary = document
        .getElementById("post-notif-summary")
        .value.trim();

      /* ולידציה – כותרת ותוכן חובה */
      if (!titleInput || !contentInput) {
        alert("נא למלא כותרת ותוכן.");
        return;
      }

      /* נעילת הכפתור למניעת לחיצה כפולה */
      btnPublishPost.disabled = true;
      btnPublishPost.innerText = "מפרסם...";

      try {
        /* שלב 1: שמירת העדכון ב-Firestore */
        await addDoc(collection(db, "site_updates"), {
          title: titleInput,
          content: contentInput,
          authorId: currentUser.uid,
          createdAt: new Date(),
        });

        /* שלב 2: שליחת התראה גלובלית לכל המשתמשים */
        const notificationData = {
          title: titleInput,
          summary: notifSummary, // תקציר ספציפי להתראה
        };
        await notifyAllUsers(
          "site_update",
          notificationData,
          "site-updates.html",
        );

        /* שלב 3: סגירת החלון ואיפוס הטופס */
        addPostModal.style.display = "none";
        document.getElementById("post-title").value = "";
        document.getElementById("post-content").value = "";
        document.getElementById("post-notif-summary").value = "";

        /* רענון רשימת העדכונים */
        await loadPosts();
        alert("העדכון פורסם בהצלחה. כל המשתמשים קיבלו התראה.");
      } catch (error) {
        console.error("שגיאה בפרסום העדכון:", error);
        alert("שגיאה בפרסום העדכון.");
      } finally {
        /* שחרור הכפתור */
        btnPublishPost.disabled = false;
        btnPublishPost.innerText = "פרסם עדכון";
      }
    });
  }
});

